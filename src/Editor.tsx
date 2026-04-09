import {
  useState, useEffect, useRef, useMemo, useCallback,
} from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bold, Italic, Underline, Highlighter,
  Undo2, Redo2, Trash2, Mic, MicOff,
  Copy, Check, RefreshCw, Sparkles, Menu, ChevronDown, Clock, Target, Brain
} from 'lucide-react';
import {
  StyledSegment, HighlightColor,
  emptySegment, toPlainText, segmentsToHtml,
  domToSegments, applyStyleToRange, applyCorrections, mergeSegments,
  transferStylesToParaphrase, segmentsToClipboardHtml,
} from './richText';

/* ─── Gemini ──────────────────────────────────────────── */
const genAI = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

/* ─── Numeric preservation ────────────────────────────── */
function extractNumericTokens(text: string): string[] {
  const matches = text.match(/[$£€¥]?\d[\d,]*(\.\d+)?[$£€¥%]?/g) ?? [];
  return [...new Set(matches)];
}
function numericHint(text: string): string {
  const tokens = extractNumericTokens(text);
  if (!tokens.length) return '';
  return ` CRITICAL: Preserve ALL numbers EXACTLY as-is — never convert to words. Numbers present: ${tokens.slice(0,15).join(', ')}.`;
}

/* ─── Types ───────────────────────────────────────────── */
interface Issue {
  orig: string; fix: string;
  cat: 'spelling' | 'grammar' | 'punctuation' | 'style';
  msg: string; offset: number;
}
interface AnalysisResult {
  issues: Issue[]; score: number; tone: string; formality: number;
}
interface ParaphraseSets {
  empathetic: StyledSegment[]; resolution: StyledSegment[]; deescalation: StyledSegment[];
  actionable: StyledSegment[]; persuasive: StyledSegment[]; professional: StyledSegment[];
}

const PARAPHRASE_MODES = [
  { key: 'empathetic',     label: 'EMPATHETIC',     emoji: '💙' },
  { key: 'resolution',     label: 'RESOLUTION',     emoji: '✅' },
  { key: 'deescalation',   label: 'DE-ESCALATION',  emoji: '🛡️' },
  { key: 'actionable',     label: 'ACTIONABLE',     emoji: '📋' },
  { key: 'persuasive',     label: 'PERSUASIVE',     emoji: '📈' },
  { key: 'professional',   label: 'PROFESSIONAL',   emoji: '💼' },
] as const;

const HIGHLIGHT_COLORS: { key: HighlightColor; label: string; css: string }[] = [
  { key: 'yellow', label: 'Yellow', css: '#FFF59D' },
  { key: 'green',  label: 'Green',  css: '#C8E6C9' },
  { key: 'blue',   label: 'Blue',   css: '#BBDEFB' },
  { key: 'pink',   label: 'Pink',   css: '#F8BBD9' },
];

/* ─── DOM helpers ─────────────────────────────────────── */
function domOffsetToPlain(container: HTMLElement, targetNode: Node, nodeOffset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  try { range.setEnd(targetNode, nodeOffset); } catch { return 0; }
  return range.toString().length;
}

function getSelectionOffsets(container: HTMLElement): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const start = domOffsetToPlain(container, range.startContainer, range.startOffset);
  const end   = domOffsetToPlain(container, range.endContainer, range.endOffset);
  return [start, end];
}

function offsetToNodeOffset(container: HTMLElement, targetOffset: number): { node: Node; offset: number } | null {
  let remaining = targetOffset;
  function walk(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (remaining <= len) return { node, offset: remaining };
      remaining -= len;
      return null;
    }
    for (const child of Array.from(node.childNodes)) {
      const r = walk(child);
      if (r) return r;
    }
    return null;
  }
  return walk(container) ?? { node: container, offset: container.childNodes.length };
}

/* ─── Component ───────────────────────────────────────── */
interface EditorProps {
  onNavigateHome: () => void;
}

export default function Editor({ onNavigateHome }: EditorProps) {
  // Core State
  const [segments, setSegments] = useState<StyledSegment[]>([emptySegment()]);

  /* Analysis */
  const [analysis,    setAnalysis]    = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  /* Fix */
  const [isFixing, setIsFixing] = useState(false);
  const [hasFixed, setHasFixed] = useState(false);
  const lastFixedRef = useRef('');

  /* Paraphrase */
  const [paraphraseSets,     setParaphraseSets]     = useState<ParaphraseSets | null>(null);
  const [isParaphrasing,     setIsParaphrasing]     = useState(false);
  const [copiedKey,          setCopiedKey]          = useState<string | null>(null);

  /* UI */
  const [statusMsg,      setStatusMsg]      = useState('');
  const [formalityLevel, setFormalityLevel] = useState(50);
  const [language,       setLanguage]       = useState('English (US)');
  const [showHistory,    setShowHistory]    = useState(false);
  const [historyItems,   setHistoryItems]   = useState<{ text: string; time: string }[]>(() => {
    try { const s = localStorage.getItem('wr_history'); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  /* Toolbar state */
  const [activeBold,      setActiveBold]      = useState(false);
  const [activeItalic,    setActiveItalic]    = useState(false);
  const [activeUnderline, setActiveUnderline] = useState(false);
  const [showHlPicker,    setShowHlPicker]    = useState(false);
  const [activeHl,        setActiveHl]        = useState<HighlightColor>(null);

  /* Speech */
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  /* Sentiment, ELI5 & Global Model */
  const [aiModel, setAiModel] = useState('gemini-3.1-flash-lite-preview');
  const [customerMessage, setCustomerMessage] = useState('');
  const [sentimentResult, setSentimentResult] = useState<{ emotion: string; frustration: number; recommendedTone: string; explanation: string } | null>(null);
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false);
  const [showSentimentPanel, setShowSentimentPanel] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);

  /* Refs */
  const editorRef     = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSel      = useRef<{ start: number; end: number } | null>(null);
  const undoStack     = useRef<StyledSegment[][]>([]);
  const redoStack     = useRef<StyledSegment[][]>([]);
  const rateLimitUntil= useRef<number>(0);

  /* Derived */
  const plainText = useMemo(() => toPlainText(segments), [segments]);
  const wordCount = useMemo(() => plainText.trim() ? plainText.trim().split(/\s+/).length : 0, [plainText]);
  const charCount = plainText.length;
  const errorCount = analysis?.issues.length ?? 0;
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  /* ── Render HTML ─────────────────────────────────────── */
  const renderedHtml = useMemo(
    () => segmentsToHtml(segments, analysis?.issues ?? []),
    [segments, analysis],
  );

  const lastHtmlRef = useRef('');
  useEffect(() => {
    if (!editorRef.current) return;
    if (renderedHtml === lastHtmlRef.current) return;
    lastHtmlRef.current = renderedHtml;
    const offsets = getSelectionOffsets(editorRef.current);
    editorRef.current.innerHTML = renderedHtml;
    if (offsets) restoreCaretAt(editorRef.current, offsets[0], offsets[1]);
  }, [renderedHtml]);

  function restoreCaretAt(container: HTMLElement, startOff: number, endOff: number) {
    const sel = window.getSelection();
    if (!sel) return;
    try {
      const s = offsetToNodeOffset(container, startOff);
      const e = offsetToNodeOffset(container, endOff);
      if (!s || !e) return;
      const range = document.createRange();
      range.setStart(s.node, s.offset);
      range.setEnd(e.node, e.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch { /* ignore */ }
  }

  /* ── Undo / Redo ─────────────────────────────────────── */
  const pushUndo = useCallback((prev: StyledSegment[]) => {
    undoStack.current = [...undoStack.current, prev].slice(-80);
    redoStack.current = [];
  }, []);

  const undo = () => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    redoStack.current = [segments, ...redoStack.current].slice(0, 80);
    undoStack.current = undoStack.current.slice(0, -1);
    setSegments(prev);
  };

  const redo = () => {
    if (!redoStack.current.length) return;
    const next = redoStack.current[0];
    undoStack.current = [...undoStack.current, segments].slice(-80);
    redoStack.current = redoStack.current.slice(1);
    setSegments(next);
  };

  /* ── Input / Paste ───────────────────────────────────── */
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const newSegs = domToSegments(editorRef.current);
    setSegments(prev => { pushUndo(prev); return newSegs; });
    if (hasFixed && toPlainText(domToSegments(editorRef.current)) !== lastFixedRef.current) setHasFixed(false);
  }, [hasFixed, pushUndo]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html  = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    if (!html && !plain) return;
    let pastedSegs: StyledSegment[] = [];
    if (html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('script,style').forEach(el => el.remove());
      pastedSegs = domToSegments(tmp);
    } else {
      pastedSegs = [{ text: plain, bold: false, italic: false, underline: false, highlight: null }];
    }
    if (!editorRef.current) return;
    const offsets = getSelectionOffsets(editorRef.current);
    const insertAt  = offsets ? offsets[0] : charCount;
    const deleteLen = offsets ? offsets[1] - offsets[0] : 0;

    setSegments(prev => {
      pushUndo(prev);
      type CE = { char: string } & Omit<StyledSegment, 'text'>;
      const chars: CE[] = [];
      for (const seg of prev) {
        const s = { bold: seg.bold, italic: seg.italic, underline: seg.underline, highlight: seg.highlight };
        for (const ch of seg.text) chars.push({ char: ch, ...s });
      }
      const insertChars: CE[] = [];
      for (const seg of pastedSegs) {
        const s = { bold: seg.bold, italic: seg.italic, underline: seg.underline, highlight: seg.highlight };
        for (const ch of seg.text) insertChars.push({ char: ch, ...s });
      }
      chars.splice(insertAt, deleteLen, ...insertChars);
      const newSegs: StyledSegment[] = [];
      for (const e of chars) {
        const { char, ...style } = e;
        const last = newSegs[newSegs.length - 1];
        if (last && last.bold === style.bold && last.italic === style.italic &&
            last.underline === style.underline && last.highlight === style.highlight) {
          last.text += char;
        } else { newSegs.push({ text: char, ...style }); }
      }
      return mergeSegments(newSegs.length ? newSegs : [emptySegment()]);
    });
  }, [charCount, pushUndo]);

  /* ── Analysis ────────────────────────────────────────── */
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (Date.now() > rateLimitUntil.current) analyzeText(plainText);
    }, 4000);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [plainText]);

  const analyzeText = async (content: string) => {
    if (content.length < 5) { setAnalysis(null); setStatusMsg(''); return; }
    setIsAnalyzing(true);
    try {
      const response = await genAI.models.generateContent({
        model: aiModel,
        contents: [{ role: 'user', parts: [{ text: `Analyze this text: "${content}"` }] }],
        config: {
          systemInstruction: `You are a professional editor. Analyze for spelling, grammar, punctuation, and style issues. Return JSON: issues (array of {orig, fix, cat, msg}), score (0-100), tone (string), formality (0-100). cat must be one of: spelling, grammar, punctuation, style.${numericHint(content)} Return only JSON.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              issues: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { orig:{type:Type.STRING}, fix:{type:Type.STRING}, cat:{type:Type.STRING}, msg:{type:Type.STRING} }, required:['orig','fix','cat','msg'] } },
              score: { type: Type.NUMBER }, tone: { type: Type.STRING }, formality: { type: Type.NUMBER },
            },
            required: ['issues','score','tone','formality'],
          },
        },
      });
      const data = JSON.parse(response.text || '{}') as AnalysisResult;
      const usedRanges: [number,number][] = [];
      const withOffsets = data.issues.map(iss => {
        let from = 0, offset = -1;
        while (from < content.length) {
          const idx = content.indexOf(iss.orig, from);
          if (idx === -1) break;
          const overlaps = usedRanges.some(([s,e]) => idx < e && idx + iss.orig.length > s);
          if (!overlaps) { offset = idx; usedRanges.push([idx, idx + iss.orig.length]); break; }
          from = idx + 1;
        }
        return { ...iss, offset };
      }).filter(i => i.offset !== -1);
      setAnalysis({ ...data, issues: withOffsets });
      if (data.formality !== undefined) setFormalityLevel(data.formality);
      const t = new Date().toLocaleTimeString();
      setStatusMsg(`${t} · ${withOffsets.length} ${withOffsets.length === 1 ? 'issue' : 'issues'} found`);
    } catch (err: any) {
      console.error('Analysis error:', err);
      if (err?.status === 429 || err?.message?.includes('429')) {
        rateLimitUntil.current = Date.now() + 60000;
        setStatusMsg('Rate limit — pausing analysis for 60s');
      } else {
        setStatusMsg('Analysis failed — check connection');
      }
    } finally { setIsAnalyzing(false); }
  };

  /* ── Fix All ─────────────────────────────────────────── */
  const fixAll = async () => {
    if (isFixing || hasFixed || plainText.length < 5) return;
    if (Date.now() < rateLimitUntil.current) {
       setStatusMsg('Rate limit active — please wait a moment');
       return;
    }
    
    setIsFixing(true); setStatusMsg('Fixing & paraphrasing…');
    setIsParaphrasing(true); // Show loading in paraphrase cards too

    try {
      const hint = numericHint(plainText);
      const response = await genAI.models.generateContent({
        model: aiModel,
        contents: [{ role: 'user', parts: [{ text: `Original text: "${plainText}"` }] }],
        config: {
          systemInstruction: `You are a professional editor. Perform three tasks:
1. Fix all spelling, grammar, and style errors. Output correctedText as a single clean paragraph — do NOT insert extra newlines, line breaks, or split sentences onto separate lines. Keep it as continuous flowing prose.
2. List exact word-level changes as {orig, fix} pairs.
3. Provide 6 BPO paraphrased variations: empathetic (apologize/deep understanding), resolution (highly direct/fast), deescalation (calm/neutral to soothe angry customer), actionable (easy-to-follow steps), persuasive (friendly up-sell/retain), professional (standard BPO polite). Each variation must be a single clean paragraph with no duplicate adjacent words (never repeat the same word twice in a row).
${hint}
Return ONLY as JSON with keys: correctedText, diffs (array of {orig, fix}), paraphrases (object with keys: empathetic, resolution, deescalation, actionable, persuasive, professional).`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              correctedText: { type: Type.STRING },
              diffs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { orig: { type: Type.STRING }, fix: { type: Type.STRING } }, required: ['orig', 'fix'] } },
              paraphrases: {
                type: Type.OBJECT,
                properties: {
                  empathetic: { type: Type.STRING }, resolution: { type: Type.STRING }, deescalation: { type: Type.STRING },
                  actionable: { type: Type.STRING }, persuasive: { type: Type.STRING }, professional: { type: Type.STRING },
                },
                required: ['empathetic', 'resolution', 'deescalation', 'actionable', 'persuasive', 'professional'],
              },
            },
            required: ['correctedText', 'diffs', 'paraphrases'],
          },
        },
      });

      const data = JSON.parse(response.text || '{}');
      // Normalize correctedText: collapse stray newlines/extra whitespace that
      // cause the "scattered word spacing" bug in the contenteditable editor.
      const rawCorrected: string = data.correctedText ?? '';
      const correctedText = rawCorrected
        .replace(/\r\n|\r/g, '\n')           // normalize line endings
        .replace(/\n{3,}/g, '\n\n')          // max two consecutive newlines
        .replace(/[ \t]+\n/g, '\n')          // strip trailing spaces before newline
        .replace(/\n[ \t]+/g, '\n')          // strip leading spaces after newline
        .trim();
      const diffs = data.diffs;
      // Normalize each paraphrase string the same way
      const rawParaphrases: Record<string, string> = data.paraphrases ?? {};
      const paraphrases: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParaphrases)) {
        paraphrases[k] = (v as string)
          .replace(/\r\n|\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          // Fix Bug 2: collapse duplicate adjacent words (e.g. "details details")
          .replace(/\b(\w+)\s+\1\b/gi, '$1')
          .trim();
      }

      pushUndo(segments);
      
      // Calculate offsets for diffs
      const diffsWithOffsets: Array<{ orig: string; fix: string; offset: number }> = [];
      let from = 0;
      for (const d of diffs) {
        const off = plainText.indexOf(d.orig, from);
        if (off !== -1) { 
          diffsWithOffsets.push({ ...d, offset: off }); 
          from = off + d.orig.length; 
        }
      }

      // If word-level diffs failed or are empty, fallback to full replacement
      let finalSegs = segments;
      if (diffsWithOffsets.length === 0 && correctedText !== plainText) {
        finalSegs = transferStylesToParaphrase(segments, correctedText);
        setSegments(finalSegs);
      } else {
        finalSegs = applyCorrections(segments, diffsWithOffsets);
        setSegments(finalSegs);
      }

      lastFixedRef.current = correctedText;
      setHasFixed(true); 
      setAnalysis(null);
      
      const styledParaphrases: any = {};
      for (const [k, v] of Object.entries(paraphrases)) {
        styledParaphrases[k] = transferStylesToParaphrase(finalSegs, v as string);
      }
      setParaphraseSets(styledParaphrases as ParaphraseSets);
      
      setStatusMsg('Text corrected & variations generated ✓');
      
      setHistoryItems(prev => {
        const updated = [{ text: correctedText, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50);
        try { localStorage.setItem('wr_history', JSON.stringify(updated)); } catch {}
        return updated;
      });
    } catch (err: any) {
      console.error('Fix error:', err);
      if (err?.status === 429 || err?.message?.includes('429')) {
        rateLimitUntil.current = Date.now() + 60000;
        setStatusMsg('Rate limit reached — please wait 60s');
      } else {
        setStatusMsg('Error during fix — try again');
      }
    } finally { 
      setIsFixing(false); 
      setIsParaphrasing(false);
    }
  };

  /* ── Paraphrase ──────────────────────────────────────── */
  const generateParaphraseSets = async (content: string) => {
    setIsParaphrasing(true);
    const hint = numericHint(content);
    try {
      const response = await genAI.models.generateContent({
        model: aiModel,
        contents: [{ role:'user', parts:[{ text:`Provide 6 BPO paraphrased variations in JSON with keys: empathetic, resolution, deescalation, actionable, persuasive, professional.${hint} Text: "${content}"` }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              empathetic:{type:Type.STRING}, resolution:{type:Type.STRING}, deescalation:{type:Type.STRING},
              actionable:{type:Type.STRING}, persuasive:{type:Type.STRING}, professional:{type:Type.STRING},
            },
            required: ['empathetic','resolution','deescalation','actionable','persuasive','professional'],
          },
        },
      });
      const rawParaphrases = JSON.parse(response.text || '{}');
      const styledParaphrases: any = {};
      for (const [k, v] of Object.entries(rawParaphrases)) {
        const normalized = (v as string)
          .replace(/\r\n|\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          // Fix duplicate adjacent words (e.g. "details details" → "details")
          .replace(/\b(\w+)\s+\1\b/gi, '$1')
          .trim();
        styledParaphrases[k] = transferStylesToParaphrase(segments, normalized);
      }
      setParaphraseSets(styledParaphrases as ParaphraseSets);
    } catch (err) { console.error('Paraphrase error:', err);
    } finally { setIsParaphrasing(false); }
  };

  /* ── Make Friendly ───────────────────────────────────── */
  const makeFriendly = async () => {
    if (plainText.length < 5 || isFixing) return;
    setIsFixing(true);
    try {
      const hint = numericHint(plainText);
      const r = await genAI.models.generateContent({
        model: aiModel,
        contents: [{ role:'user', parts:[{ text:`Rewrite to be warm and friendly, same meaning. Return ONLY the rewritten text.${hint}\n\n${plainText}` }] }],
      });
      const friendly = r.text?.trim() || plainText;
      pushUndo(segments);
      setSegments([{ text: friendly, bold: false, italic: false, underline: false, highlight: null }]);
    } catch (err) { console.error('Make friendly error:', err);
    } finally { setIsFixing(false); }
  };

  /* ── ELI5 Simplifier ─────────────────────────────────── */
  const simplifyELI5 = async () => {
    if (plainText.length < 5 || isSimplifying || isFixing) return;
    setIsSimplifying(true); setIsFixing(true);
    try {
      const hint = numericHint(plainText);
      const r = await genAI.models.generateContent({
        model: aiModel,
        contents: [{ role:'user', parts:[{ text:`Rewrite this text using "Explain Like I'm 5" principles. Remove all jargon, use a simple and polite metaphor if helpful, and make it incredibly easy for a non-technical customer to understand without losing the core technical message. Return ONLY the rewritten text.${hint}\n\n${plainText}` }] }],
      });
      const eli5 = r.text?.trim() || plainText;
      pushUndo(segments);
      setSegments([{ text: eli5, bold: false, italic: false, underline: false, highlight: null }]);
    } catch (err) { console.error('ELI5 error:', err);
    } finally { setIsSimplifying(false); setIsFixing(false); }
  };

  /* ── Customer Sentiment ──────────────────────────────── */
  const analyzeCustomerSentiment = async () => {
    if (customerMessage.trim().length < 5) return;
    setIsAnalyzingSentiment(true);
    try {
      const r = await genAI.models.generateContent({
        model: aiModel,
        contents: [{ role:'user', parts:[{ text:`Analyze this incoming customer message: "${customerMessage}"` }] }],
        config: {
          systemInstruction: `You are a BPO Customer Sentiment Analyzer.
Determine the customer's core emotion, their frustration level (0-100), and a 1-sentence analytical explanation of why they are feeling this way based closely on the text.
Recommend exactly ONE of these 6 BPO Paraphrase Tones to strategically handle this customer: EMPATHETIC, RESOLUTION, DE-ESCALATION, ACTIONABLE, PERSUASIVE, or PROFESSIONAL. Your recommendation must steer the agent well.
Return ONLY JSON.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              emotion: { type: Type.STRING },
              frustration: { type: Type.NUMBER },
              recommendedTone: { type: Type.STRING },
              explanation: { type: Type.STRING },
            },
            required: ['emotion','frustration','recommendedTone','explanation'],
          },
        },
      });
      setSentimentResult(JSON.parse(r.text || '{}'));
    } catch (err) { console.error('Sentiment error:', err); }
    finally { setIsAnalyzingSentiment(false); }
  };

  /* ── Clear ───────────────────────────────────────────── */
  const clearText = () => {
    pushUndo(segments);
    setSegments([emptySegment()]);
    setAnalysis(null); setParaphraseSets(null);
    setHasFixed(false); lastFixedRef.current = '';
    setStatusMsg('');
    setTimeout(() => editorRef.current?.focus(), 0);
  };

  /* ── Copy ────────────────────────────────────────────── */
  const copyToClipboard = async (segs: StyledSegment[], key: string) => {
    const plainText = toPlainText(segs);
    const htmlText = segmentsToClipboardHtml(segs);
    
    let ok = false;
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlText], { type: 'text/html' });
        const item = new window.ClipboardItem({ 'text/plain': textBlob, 'text/html': htmlBlob });
        await navigator.clipboard.write([item]);
        ok = true;
      } catch {}
    }
    if (!ok && navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(plainText); ok = true; } catch {}
    }
    if (!ok) {
      try {
        const div = document.createElement('div');
        div.innerHTML = htmlText;
        div.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(div);
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(div);
        sel?.removeAllRanges();
        sel?.addRange(range);
        ok = document.execCommand('copy');
        sel?.removeAllRanges();
        document.body.removeChild(div);
      } catch {}
    }
    if (ok) { setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000); }
  };

  /* ── Formatting ──────────────────────────────────────── */
  const applyStyle = useCallback((
    key: keyof Omit<StyledSegment, 'text'>,
    value: boolean | HighlightColor,
  ) => {
    if (!editorRef.current) return;
    const offsets = getSelectionOffsets(editorRef.current);
    if (!offsets) return;
    const [start, end] = offsets;
    if (start === end) return;
    setSegments(prev => { pushUndo(prev); return applyStyleToRange(prev, start, end, key, value); });
    savedSel.current = { start, end };
  }, [pushUndo]);

  useEffect(() => {
    if (savedSel.current && editorRef.current) {
      restoreCaretAt(editorRef.current, savedSel.current.start, savedSel.current.end);
      savedSel.current = null;
    }
  });

  const handleSelectionChange = useCallback(() => {
    if (!editorRef.current) return;
    const offsets = getSelectionOffsets(editorRef.current);
    if (!offsets || offsets[0] === offsets[1]) {
      setActiveBold(false); setActiveItalic(false); setActiveUnderline(false); setActiveHl(null);
      return;
    }
    const [start, end] = offsets;
    let hasBold = false, hasItalic = false, hasUnderline = false;
    let hlColor: HighlightColor = null;
    let cursor = 0;
    for (const seg of segments) {
      const segEnd = cursor + seg.text.length;
      if (segEnd > start && cursor < end) {
        if (seg.bold)      hasBold      = true;
        if (seg.italic)    hasItalic    = true;
        if (seg.underline) hasUnderline = true;
        if (seg.highlight) hlColor = seg.highlight;
      }
      cursor += seg.text.length;
    }
    setActiveBold(hasBold); setActiveItalic(hasItalic);
    setActiveUnderline(hasUnderline); setActiveHl(hlColor);
  }, [segments]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  /* ── Speech ──────────────────────────────────────────── */
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    recognitionRef.current = new SR();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.onresult = (event: any) => {
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
      }
      if (final) {
        setSegments(prev => {
          pushUndo(prev);
          return mergeSegments([...prev, { text: final, bold: false, italic: false, underline: false, highlight: null }]);
        });
      }
    };
    recognitionRef.current.onend  = () => setIsRecording(false);
    recognitionRef.current.onerror = () => setIsRecording(false);
  }, [pushUndo]);

  const toggleRecording = () => {
    if (!recognitionRef.current) { alert('Speech recognition not supported.'); return; }
    if (isRecording) recognitionRef.current.stop();
    else { recognitionRef.current.start(); setIsRecording(true); }
  };

  /* ── Keyboard shortcuts ──────────────────────────────── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    if (mod && e.key === 'b') { e.preventDefault(); applyStyle('bold', !activeBold); }
    if (mod && e.key === 'i') { e.preventDefault(); applyStyle('italic', !activeItalic); }
    if (mod && e.key === 'u') { e.preventDefault(); applyStyle('underline', !activeUnderline); }
  };

  /* ── Derived UI ──────────────────────────────────────── */
  const issuesByType = useMemo(() => {
    if (!analysis) return {} as Record<string, number>;
    return analysis.issues.reduce((acc, iss) => { acc[iss.cat] = (acc[iss.cat] || 0) + 1; return acc; }, {} as Record<string, number>);
  }, [analysis]);

  const toneLabel = analysis?.tone || '';
  const toneEmoji = useMemo(() => {
    const t = toneLabel.toLowerCase();
    if (t.includes('professional') || t.includes('formal')) return '💼';
    if (t.includes('casual') || t.includes('friendly'))    return '😊';
    if (t.includes('neutral'))                             return '😐';
    if (t.includes('urgent') || t.includes('direct'))     return '⚡';
    return '📝';
  }, [toneLabel]);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="app-root">

      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <button className="icon-btn-ghost" aria-label="Home" onClick={onNavigateHome} title="Return to Home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
          <div className="wr-logo-mark">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
              <rect width="100" height="100" rx="18" fill="var(--accent-gold)" opacity="0.15"/>
              <path d="M50 8 L60 44 L92 50 L60 56 L50 92 L40 56 L8 50 L40 44Z" stroke="var(--accent-gold)" strokeWidth="3" fill="none"/>
              <text x="50" y="56" textAnchor="middle" fontFamily="Spectral,serif" fontWeight="600" fontSize="26" fill="var(--accent-gold)">WR</text>
            </svg>
          </div>
          <h1 className="app-title">WriteRight <span>AI</span></h1>
          <div className="model-badge" style={{ padding: '0 8px 0 0' }}>
            <Sparkles size={11} style={{ marginLeft: '8px' }}/>
            <select 
              value={aiModel} 
              onChange={e => setAiModel(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', outline: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              <option value="gemini-2.5-flash" style={{ color: 'black' }}>Gemini 2.5 Flash</option>
              <option value="gemini-3.1-flash-lite-preview" style={{ color: 'black' }}>Gemini 3.1 Flash Lite</option>
              <option value="gemini-3.1-pro-preview" style={{ color: 'black' }}>Gemini 3.1 Pro</option>
            </select>
          </div>
        </div>
        <div className="header-right">
          <div className="stat-pill">Words: <strong>{wordCount}</strong></div>
          <div className="stat-pill">Chars: <strong>{charCount}</strong></div>
          {errorCount > 0 && <div className="stat-pill stat-error">Errors: <strong>{errorCount}</strong></div>}
          <div className="lang-select-wrapper">
            <select className="lang-select" value={language} onChange={e => setLanguage(e.target.value)}>
              <option>English (US)</option><option>English (UK)</option>
              <option>Spanish</option><option>French</option>
            </select>
            <ChevronDown size={11} className="lang-chevron" />
          </div>
          <button className={`history-btn${showHistory ? ' history-btn--active' : ''}`} onClick={() => setShowHistory(v => !v)}>
            <Clock size={13} /><span>History ({historyItems.length})</span>
          </button>
        </div>
      </header>

      {/* TONE BAR */}
      <AnimatePresence>
        {plainText.length >= 5 && (
          <motion.div key="tone-bar" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}} className="tone-bar">
            <div className="tone-info">
              <div className="tone-main">
                <span className="tone-icon">{toneEmoji}</span>
                <div>
                  <div className="tone-label">Tone: <strong>{toneLabel || 'Analyzing…'}</strong></div>
                  {toneLabel && <div className="tone-desc">The tone is {toneLabel.toLowerCase()}, appropriate for this context.</div>}
                </div>
              </div>
              {analysis?.issues.find(i => i.cat === 'style') && (
                <div className="tone-suggestion"><span>⚡</span><span>{analysis.issues.find(i => i.cat === 'style')!.msg}</span></div>
              )}
            </div>
            <div className="tone-controls">
              <div className="formality-slider-group">
                <span className="formality-label">Casual</span>
                <input type="range" min="0" max="100" step="1" value={formalityLevel} onChange={e => setFormalityLevel(Number(e.target.value))} className="formality-slider" />
                <span className="formality-label">Formal</span>
              </div>
              <button className="make-friendly-btn eli5-btn" onClick={simplifyELI5} disabled={isFixing || plainText.length < 5} title="Explain Like I'm 5">
                <Brain size={14}/> Simplify (ELI5)
              </button>
              <button className="make-friendly-btn" onClick={makeFriendly} disabled={isFixing || plainText.length < 5}>
                😊 Make Friendly
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN */}
      <main className="main-content">

        {/* LEFT — Editor */}
        <motion.div initial={{opacity:0,x:-24}} animate={{opacity:1,x:0}} transition={{duration:0.3}} className="editor-panel">

          {/* Toolbar */}
          <div className="editor-toolbar">
            <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.97}} onClick={fixAll}
              disabled={hasFixed||isFixing||plainText.length<5}
              className={`fix-btn${hasFixed?' fix-btn--fixed':''}${isFixing?' fix-btn--loading':''}`}>
              {isFixing ? <><RefreshCw size={14} className="spin"/> Fixing…</> : hasFixed ? <><span>✅</span> Fixed!</> : <><span className="fix-btn-star">✳</span> FIX ALL ERRORS</>}
            </motion.button>
            <div className="toolbar-actions">
              <button className="tool-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={15}/></button>
              <button className="tool-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"><Redo2 size={15}/></button>
              <button className={`tool-btn${showSentimentPanel?' tool-btn--active':''}`} onClick={() => setShowSentimentPanel(v=>!v)} title="Customer Sentiment">
                <Target size={15}/>
              </button>
              <button className={`tool-btn${isRecording?' tool-btn--active':''}`} onClick={toggleRecording} title="Voice input">
                {isRecording ? <MicOff size={15}/> : <Mic size={15}/>}
              </button>
              <button className="tool-btn tool-btn--danger" onClick={clearText} disabled={!plainText} title="Clear"><Trash2 size={15}/></button>
            </div>
          </div>

          {/* Rich Format Bar */}
          <div className="rich-format-bar">
            <span className="rich-format-label">Style:</span>
            <button className={`rich-btn${activeBold?' rich-btn--active':''}`}
              onMouseDown={e=>{e.preventDefault(); applyStyle('bold', !activeBold);}} title="Bold (Ctrl+B)">
              <Bold size={12}/><span>Bold</span>
            </button>
            <button className={`rich-btn${activeItalic?' rich-btn--active':''}`}
              onMouseDown={e=>{e.preventDefault(); applyStyle('italic', !activeItalic);}} title="Italic (Ctrl+I)">
              <Italic size={12}/><span>Italic</span>
            </button>
            <button className={`rich-btn${activeUnderline?' rich-btn--active':''}`}
              onMouseDown={e=>{e.preventDefault(); applyStyle('underline', !activeUnderline);}} title="Underline (Ctrl+U)">
              <Underline size={12}/><span>Underline</span>
            </button>
            {/* Multi-color highlight picker */}
            <div className="relative" style={{position:'relative'}}>
              <button className={`rich-btn${activeHl?' rich-btn--active':''}`}
                style={activeHl ? {background: HIGHLIGHT_COLORS.find(c=>c.key===activeHl)?.css, borderColor: 'rgba(0,0,0,0.2)'} : {}}
                onMouseDown={e=>{e.preventDefault(); setShowHlPicker(v=>!v);}} title="Highlight">
                <Highlighter size={12}/><span>Highlight</span>
              </button>
              <AnimatePresence>
                {showHlPicker && (
                  <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}}
                    className="hl-picker" onMouseLeave={()=>setShowHlPicker(false)}>
                    <button className="hl-picker-none" onMouseDown={e=>{e.preventDefault(); applyStyle('highlight', null); setShowHlPicker(false);}}>✕</button>
                    {HIGHLIGHT_COLORS.map(c => (
                      <button key={c.key} title={c.label} style={{background:c.css}}
                        className="hl-picker-swatch"
                        onMouseDown={e=>{e.preventDefault(); applyStyle('highlight', c.key); setShowHlPicker(false);}}/>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span className="rich-format-hint">Ctrl+B · Ctrl+I · Ctrl+U</span>
          </div>

          {/* Customer Sentiment Panel */}
          <AnimatePresence>
            {showSentimentPanel && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="sentiment-drawer" style={{ overflow: 'hidden' }}>
                <div className="sentiment-panel">
                  <div className="sentiment-input-area">
                    <label>Incoming Customer Context</label>
                    <textarea 
                      placeholder="Paste the customer's exact email or chat here to analyze frustration and formulate a strategy..." 
                      value={customerMessage} 
                      onChange={e => setCustomerMessage(e.target.value)}
                    />
                    <button className="sentiment-analyze-btn" onClick={analyzeCustomerSentiment} disabled={isAnalyzingSentiment || customerMessage.trim().length < 5}>
                      {isAnalyzingSentiment ? <><RefreshCw size={12} className="spin" /> Analyzing...</> : 'Analyze Priority'}
                    </button>
                  </div>
                  {sentimentResult && (
                    <div className="sentiment-results">
                       <div className="sentiment-stat">
                         <span>Frustration</span>
                         <strong style={{color: sentimentResult.frustration > 70 ? 'var(--accent-red)' : 'var(--accent-gold)'}}>{sentimentResult.frustration}%</strong>
                       </div>
                       <div className="sentiment-stat">
                         <span>Emotion</span>
                         <strong>{sentimentResult.emotion}</strong>
                       </div>
                       <div className="sentiment-action">
                         <div className="sentiment-reason">{sentimentResult.explanation}</div>
                         <div className="sentiment-recommend">Use Tone: <strong>{sentimentResult.recommendedTone}</strong></div>
                       </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Editor area */}
          <div className="editor-area">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              className="editor-contenteditable"
              data-placeholder="Type or paste your text here — bold, italic, underline, and highlights are preserved during correction"
              spellCheck={false}
            />
          </div>

          {/* Status bar */}
          <div className="status-bar">
            {isAnalyzing
              ? <><RefreshCw size={11} className="spin" style={{color:'var(--panel-text-muted)'}}/><span className="status-time">Analyzing…</span></>
              : statusMsg
                ? <><span className="status-checked">CHECKED</span><span className="status-dot">·</span><span className="status-time">{statusMsg}</span>
                    {Object.entries(issuesByType).map(([cat, count]) => (
                      <span key={cat} className={`issue-tag issue-tag--${cat}`}>{count} {cat}</span>
                    ))}</>
                : <span className="status-ready">READY TO ANALYZE</span>
            }
          </div>

          {/* Format bar */}
          <div className="format-bar">
            <button className="fmt-btn" onClick={()=>{
              if(!editorRef.current) return;
              const sel = window.getSelection(); if(!sel||sel.rangeCount===0) return;
              document.execCommand('insertText', false, '—');
            }} title="Em dash">—</button>
            <button className="fmt-btn" onClick={()=>{
              if(!editorRef.current) return;
              document.execCommand('insertText', false, '…');
            }} title="Ellipsis">…</button>
            <button className={`fmt-btn fmt-btn--fix${hasFixed?' fmt-btn--fixed':''}`} onClick={fixAll}
              disabled={hasFixed||isFixing||plainText.length<5}>
              {hasFixed?'✅ Fixed':isFixing?'…':'FIX ALL'}
            </button>
          </div>
        </motion.div>

        {/* RIGHT — Paraphrase */}
        <motion.div initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} transition={{duration:0.3}} className="paraphrase-panel">
          <div className="paraphrase-title"><span className="paraphrase-title-text">PARAPHRASE</span></div>
          <div className="paraphrase-grid">
            {PARAPHRASE_MODES.map(({key, label, emoji}) => {
              const segs = paraphraseSets?.[key as keyof ParaphraseSets];
              const html = segs ? segmentsToHtml(segs, []) : '';
              const hasContent = !!segs;
              return (
                <motion.div key={key} whileHover={{y:-2}} transition={{duration:0.12}}
                  className={`para-card${key==='professional'?' para-card--highlighted':''}`}>
                  <div className="para-card-header">
                    <div className="para-card-title"><span className="para-emoji">{emoji}</span><span>{label}</span></div>
                    {hasContent && <button className="para-copy-btn" onClick={()=>copyToClipboard(segs!,key)} title="Copy">
                      {copiedKey===key?<Check size={12}/>:<Copy size={12}/>}
                    </button>}
                  </div>
                  <div className="para-card-body">
                    {isParaphrasing
                      ? <div className="para-loading"><RefreshCw size={13} className="spin"/> Generating…</div>
                      : hasContent
                        ? <p className="para-text" dangerouslySetInnerHTML={{ __html: html }}></p>
                        : <p className="para-placeholder">Variation will appear here…</p>}
                  </div>
                  {hasContent && <button className="para-use-btn" onClick={()=>{
                    pushUndo(segments);
                    setSegments(segs!);
                  }}>Use →</button>}
                </motion.div>
              );
            })}
          </div>
          <div className="paraphrase-footer">
            <div className="para-tone-chip"><span>{toneEmoji}</span><span className="para-tone-name">{toneLabel||'Neutral'}</span></div>
            <div className="para-word-count">{wordCount} WORDS · {charCount} CHARS</div>
            <button className="refresh-btn" onClick={()=>plainText.length>=5&&generateParaphraseSets(plainText)}
              disabled={isParaphrasing||plainText.length<5} title="Regenerate">
              <RefreshCw size={12} className={isParaphrasing?'spin':''}/> Refresh
            </button>
          </div>
        </motion.div>
      </main>

      {/* HISTORY SIDEBAR */}
      <AnimatePresence>
        {showHistory && (
          <motion.div key="history" initial={{opacity:0,x:300}} animate={{opacity:1,x:0}} exit={{opacity:0,x:300}} transition={{duration:0.25}} className="history-panel">
            <div className="history-header">
              <span>History</span>
              <button onClick={()=>setShowHistory(false)}>✕</button>
            </div>
            {historyItems.length===0
              ? <div className="history-empty">No history yet. Fix some text to see it here.</div>
              : historyItems.map((item,i) => (
                <div key={i} className="history-item" onClick={()=>{
                  pushUndo(segments);
                  setSegments([{ text: item.text, bold: false, italic: false, underline: false, highlight: null }]);
                  setShowHistory(false);
                }}>
                  <div className="history-item-time">{item.time}</div>
                  <div className="history-item-text">{item.text.slice(0,80)}{item.text.length>80?'…':''}</div>
                </div>
              ))
            }
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
