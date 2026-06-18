import {
  useState, useEffect, useRef, useMemo, useCallback,
} from 'react';
import type * as React from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bold, Italic, Underline, Highlighter,
  Undo2, Redo2, Trash2, Mic, MicOff,
  Copy, Check, RefreshCw, Sparkles, Menu, ChevronDown, Clock, Download,
  Eye, ShieldCheck, GraduationCap, UserCheck, Lightbulb, CheckCircle2, X
} from 'lucide-react';
import {
  StyledSegment, HighlightColor,
  emptySegment, toPlainText, segmentsToHtml,
  domToSegments, applyStyleToRange, applyCorrections, mergeSegments,
} from './richText';
import LandingPage from './LandingPage';

/* ─── Gemini ──────────────────────────────────────────── */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const HAS_API_KEY = GEMINI_API_KEY.trim().length > 0;
const HYBRID_MODEL = 'gemini-3.1-flash-lite';
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
interface WritingInsight {
  type: 'tone' | 'clarity' | 'grammar' | 'style';
  message: string;
  suggestion: string;
}
interface AnalysisResult {
  issues: Issue[]; tone: string; formality: number;
  insights: WritingInsight[];
}
interface ParaphraseSets {
  standard: string; formal: string; casual: string;
  simple: string; fluent: string; professional: string;
}
type ParaphraseStyle = keyof ParaphraseSets;

interface DetectorResult {
  aiProbability: number;
  humanProbability: number;
  verdict: 'likely-ai' | 'likely-human' | 'mixed' | 'uncertain';
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  highlightedPhrases: string[];
}

interface PlagiarismResult {
  originalityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  flaggedPhrases: Array<{
    phrase: string;
    reason: string;
    type: 'common-expression' | 'generic-template' | 'known-quote';
  }>;
  suggestions: string[];
  summary: string;
}

interface HumanizerResult {
  humanized: string;
  changesCount: number;
  techniquesSummary: string;
}

interface CoachResult {
  overallAssessment: string;
  overallGrade: 'A' | 'B' | 'C' | 'D';
  strengths: string[];
  improvements: Array<{
    area: 'structure' | 'clarity' | 'engagement' | 'voice' | 'conciseness' | 'flow';
    issue: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  quickTip: string;
  targetAudience: string;
}

const PARAPHRASE_MODES = [
  { key: 'standard',     label: 'STANDARD',     emoji: '📝', desc: 'Neutral tone, balanced language' },
  { key: 'formal',       label: 'FORMAL',        emoji: '📌', desc: 'Professional, business-appropriate tone' },
  { key: 'professional', label: 'PROFESSIONAL',  emoji: '💼', desc: 'Corporate, official language' },
  { key: 'casual',       label: 'CASUAL',        emoji: '😊', desc: 'Friendly, conversational tone' },
  { key: 'simple',       label: 'SIMPLE',        emoji: '💡', desc: 'Easy-to-understand, simplified language' },
  { key: 'fluent',       label: 'FLUENT',        emoji: '⚡', desc: 'Natural flow, eloquent phrasing' },
] as const;

const HIGHLIGHT_COLORS: { key: HighlightColor; label: string; css: string }[] = [
  { key: 'yellow', label: 'Yellow', css: '#FFF59D' },
  { key: 'green',  label: 'Green',  css: '#C8E6C9' },
  { key: 'blue',   label: 'Blue',   css: '#BBDEFB' },
  { key: 'pink',   label: 'Pink',   css: '#F8BBD9' },
];

const COMMON_FIXES: Array<{ pattern: RegExp; fix: string; cat: Issue['cat']; msg: string }> = [
  { pattern: /\bteh\b/gi, fix: 'the', cat: 'spelling', msg: 'Common typo: use "the".' },
  { pattern: /\badn\b/gi, fix: 'and', cat: 'spelling', msg: 'Common typo: use "and".' },
  { pattern: /\brecieve\b/gi, fix: 'receive', cat: 'spelling', msg: 'Use "receive".' },
  { pattern: /\bseperate\b/gi, fix: 'separate', cat: 'spelling', msg: 'Use "separate".' },
  { pattern: /\bdefinately\b/gi, fix: 'definitely', cat: 'spelling', msg: 'Use "definitely".' },
  { pattern: /\boccured\b/gi, fix: 'occurred', cat: 'spelling', msg: 'Use "occurred".' },
  { pattern: /\bwich\b/gi, fix: 'which', cat: 'spelling', msg: 'Use "which".' },
  { pattern: /\bcant\b/gi, fix: "can't", cat: 'grammar', msg: 'Use the contraction with an apostrophe.' },
  { pattern: /\bdont\b/gi, fix: "don't", cat: 'grammar', msg: 'Use the contraction with an apostrophe.' },
  { pattern: /\bwont\b/gi, fix: "won't", cat: 'grammar', msg: 'Use the contraction with an apostrophe.' },
  { pattern: /\bim\b/gi, fix: "I'm", cat: 'grammar', msg: 'Capitalize and punctuate "I\'m".' },
  { pattern: /\bi\b/g, fix: 'I', cat: 'grammar', msg: 'Capitalize the pronoun "I".' },
  { pattern: / {2,}/g, fix: ' ', cat: 'punctuation', msg: 'Use a single space.' },
  { pattern: /\s+([,.;:!?])/g, fix: '$1', cat: 'punctuation', msg: 'Remove the space before punctuation.' },
  { pattern: /([,.;:!?])([A-Za-z])/g, fix: '$1 $2', cat: 'punctuation', msg: 'Add a space after punctuation.' },
  { pattern: /\b(\w+)\s+\1\b/gi, fix: '$1', cat: 'style', msg: 'Remove repeated adjacent words.' },
];

function preserveCase(original: string, replacement: string): string {
  if (original.toUpperCase() === original) return replacement.toUpperCase();
  if (original[0]?.toUpperCase() === original[0]) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function getRuleReplacement(
  original: string,
  rule: { pattern: RegExp; fix: string },
): string {
  const replaced = original.replace(rule.pattern, rule.fix);
  return rule.fix.includes('$') ? replaced : preserveCase(original, replaced);
}

function normalizePastedPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\n+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function getLocalIssues(content: string): Array<Issue & { offset: number }> {
  const issues: Array<Issue & { offset: number }> = [];
  const seen = new Set<string>();

  for (const rule of COMMON_FIXES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of content.matchAll(regex)) {
      const orig = match[0];
      const offset = match.index ?? -1;
      if (offset < 0) continue;
      const fix = getRuleReplacement(orig, rule);
      if (fix === orig) continue;
      const key = `${offset}:${orig}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ orig, fix, cat: rule.cat, msg: rule.msg, offset });
    }
  }

  return issues.sort((a, b) => a.offset - b.offset).slice(0, 80);
}

function buildLocalAnalysis(content: string): AnalysisResult {
  const issues = getLocalIssues(content);
  const sentenceCount = Math.max(1, content.split(/[.!?]+/).filter(Boolean).length);
  const words = content.trim().split(/\s+/).filter(Boolean);
  const avgSentenceLength = words.length / sentenceCount;
  const formality = /\b(please|kindly|regarding|sincerely|therefore|however)\b/i.test(content) ? 72 : 45;
  const tone = formality > 65 ? 'Professional' : /\bthanks|thank you|happy to|glad\b/i.test(content) ? 'Friendly' : 'Neutral';
  const insights: WritingInsight[] = [];
  if (avgSentenceLength > 28) {
    insights.push({
      type: 'clarity',
      message: 'Some sentences are running long.',
      suggestion: 'Split longer sentences so each idea lands cleanly.',
    });
  }
  if (issues.length > 0) {
    insights.push({
      type: 'grammar',
      message: `${issues.length} local grammar or spelling ${issues.length === 1 ? 'issue' : 'issues'} found.`,
      suggestion: 'Review the underlined text and apply the suggested corrections.',
    });
  }
  return { issues, tone, formality, insights };
}

function applyLocalFixes(content: string): string {
  return COMMON_FIXES.reduce((text, rule) => (
    text.replace(rule.pattern, match => getRuleReplacement(match, rule))
  ), content).replace(/\n{3,}/g, '\n\n').trim();
}

function localParaphrases(content: string): ParaphraseSets {
  const cleaned = applyLocalFixes(content);
  const lowerLead = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return {
    standard: cleaned,
    formal: `Please note that ${lowerLead}`,
    casual: `Here is the idea: ${lowerLead}`,
    simple: cleaned.replace(/\butilize\b/gi, 'use').replace(/\bapproximately\b/gi, 'about'),
    fluent: cleaned.replace(/\s+/g, ' ').trim(),
    professional: `Thank you for your attention. ${cleaned}`,
  };
}

function localDetector(content: string): DetectorResult {
  const markers = ['it is important to note', 'in conclusion', 'furthermore', 'moreover', 'this highlights', 'delve'];
  const hits = markers.filter(marker => content.toLowerCase().includes(marker));
  const aiProbability = Math.min(86, 25 + hits.length * 14 + (content.split(/[.!?]/).filter(s => s.trim().length > 120).length * 8));
  return {
    aiProbability,
    humanProbability: 100 - aiProbability,
    verdict: aiProbability > 65 ? 'likely-ai' : aiProbability < 40 ? 'likely-human' : 'mixed',
    confidence: hits.length >= 3 ? 'medium' : 'low',
    signals: hits.length ? hits.map(hit => `Uses "${hit}"`).slice(0, 4) : ['No strong AI markers found', 'Heuristic offline estimate only'],
    highlightedPhrases: hits.slice(0, 5),
  };
}

function localOriginality(content: string): PlagiarismResult {
  const common = ['at the end of the day', 'think outside the box', 'game changer', 'in conclusion', 'it is important to note'];
  const flaggedPhrases = common
    .filter(phrase => content.toLowerCase().includes(phrase))
    .map(phrase => ({ phrase, reason: 'This phrase is widely used and may sound generic.', type: 'common-expression' as const }));
  const riskLevel: PlagiarismResult['riskLevel'] = flaggedPhrases.length > 3 ? 'high' : flaggedPhrases.length > 0 ? 'medium' : 'low';
  return {
    originalityScore: Math.max(55, 96 - flaggedPhrases.length * 12),
    riskLevel,
    flaggedPhrases,
    suggestions: flaggedPhrases.length ? ['Replace generic phrases with specific details.', 'Add concrete examples or personal context.'] : ['Add specific examples to make the writing more distinctive.'],
    summary: 'Offline originality mode checks generic phrases only; it does not compare against external databases.',
  };
}

function localCoach(content: string): CoachResult {
  const words = content.trim().split(/\s+/).filter(Boolean);
  const issues = getLocalIssues(content);
  const longSentences = content.split(/[.!?]/).filter(sentence => sentence.trim().split(/\s+/).length > 28).length;
  const grade: CoachResult['overallGrade'] = issues.length === 0 && longSentences === 0 ? 'A' : issues.length < 4 ? 'B' : 'C';
  return {
    overallAssessment: `Offline review found ${issues.length} local writing issue${issues.length === 1 ? '' : 's'} across ${words.length} words.`,
    overallGrade: grade,
    strengths: ['Clear enough for a quick local review', words.length > 80 ? 'Enough detail to assess structure' : 'Concise and easy to scan'],
    improvements: [
      { area: 'clarity', issue: issues[0]?.msg ?? 'Some sentences may benefit from sharper wording.', suggestion: 'Apply the local fixes, then read once for flow.', priority: issues.length ? 'high' : 'low' },
      { area: 'flow', issue: longSentences ? 'Some sentences are long.' : 'Transitions can be strengthened.', suggestion: 'Split long sentences and add natural transitions.', priority: longSentences ? 'medium' : 'low' },
    ],
    quickTip: 'Use concrete details where the text feels generic.',
    targetAudience: 'General readers',
  };
}

function localHumanize(content: string): HumanizerResult {
  const humanized = applyLocalFixes(content)
    .replace(/\bIt is important to note that\b/gi, 'The key thing is')
    .replace(/\bIn conclusion,\s*/gi, 'Overall, ')
    .replace(/\bFurthermore,\s*/gi, 'Also, ')
    .replace(/\butilize\b/gi, 'use');
  return {
    humanized,
    changesCount: humanized === content ? 0 : 1,
    techniquesSummary: 'Applied offline cleanup and replaced a few formal stock phrases.',
  };
}

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
export default function App() {
  /* Document */
  const [showLanding, setShowLanding] = useState(true);
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
  const [activeParaphraseStyle, setActiveParaphraseStyle] = useState<ParaphraseStyle | null>(null);

  /* View Toggle */
  const originalTextRef = useRef('');
  const [viewMode, setViewMode] = useState<'original' | 'rewritten'>('rewritten');

  /* New AI Features */
  const [detectorResult, setDetectorResult] = useState<DetectorResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showDetector, setShowDetector] = useState(false);

  const [plagiarismResult, setPlagiarismResult] = useState<PlagiarismResult | null>(null);
  const [isCheckingPlag, setIsCheckingPlag] = useState(false);
  const [showPlagiarism, setShowPlagiarism] = useState(false);

  const [isHumanizing, setIsHumanizing] = useState(false);
  const [humanizerResult, setHumanizerResult] = useState<HumanizerResult | null>(null);
  const [showHumanizerInfo, setShowHumanizerInfo] = useState(false);

  const [coachResult, setCoachResult] = useState<CoachResult | null>(null);
  const [isCoaching, setIsCoaching] = useState(false);
  const [showCoach, setShowCoach] = useState(false);

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

  /* Refs */
  const editorRef     = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSel      = useRef<{ start: number; end: number } | null>(null);
  const undoStack     = useRef<StyledSegment[][]>([]);
  const redoStack     = useRef<StyledSegment[][]>([]);

  /* Derived */
  const plainText = useMemo(() => toPlainText(segments), [segments]);
  const wordCount = useMemo(() => plainText.trim() ? plainText.trim().split(/\s+/).length : 0, [plainText]);
  const charCount = plainText.length;
  const errorCount = analysis?.issues.length ?? 0;
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  /* ── Render HTML ─────────────────────────────────────── */
  const renderedHtml = useMemo(() => {
    if (viewMode === 'original') return originalTextRef.current.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    if (isFixing) {
       const words = plainText.split(/(\s+)/);
       return words.map((word, i) => {
         if (word.trim() === '') return word;
         const delay = (i * 0.05) % 2;
         return `<span class="scanning-word" style="animation-delay: ${delay}s">${word.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
       }).join('').replace(/\n/g, '<br>');
    }
    return segmentsToHtml(segments, analysis?.issues ?? []);
  }, [segments, analysis, viewMode, isFixing, plainText]);

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
    if (hasFixed && toPlainText(domToSegments(editorRef.current)) !== lastFixedRef.current) {
      setHasFixed(false);
      setViewMode('rewritten');
    }
  }, [hasFixed, pushUndo]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pastedText = normalizePastedPlainText(e.clipboardData.getData('text/plain'));
    if (!pastedText) return;
    const pastedSegs: StyledSegment[] = [{
      text: pastedText,
      bold: false,
      italic: false,
      underline: false,
      highlight: null,
    }];
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
    analyzeText(plainText);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void analyzeWithHaiku(plainText);
    }, 500);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [plainText]);

  const analyzeText = (content: string) => {
    if (content.length < 5) { setAnalysis(null); setStatusMsg(''); return; }
    try {
      const data = buildLocalAnalysis(content);
      setAnalysis(data);
      if (data.formality !== undefined) setFormalityLevel(data.formality);
      const t = new Date().toLocaleTimeString();
      setStatusMsg(`${t} - offline check - ${data.issues.length} ${data.issues.length === 1 ? 'issue' : 'issues'} found`);
    } catch (err) {
      console.error('Analysis error:', err);
      setStatusMsg('Offline analysis failed');
    }
  };

  const locateIssueOffsets = (issues: Array<Omit<Issue, 'offset'> | Issue>, content: string): Issue[] => {
    const usedRanges: [number, number][] = [];
    return issues
      .map(iss => {
        if ('offset' in iss && iss.offset >= 0) return iss as Issue;
        let from = 0;
        let offset = -1;
        while (from < content.length) {
          const idx = content.indexOf(iss.orig, from);
          if (idx === -1) break;
          const overlaps = usedRanges.some(([start, end]) => idx < end && idx + iss.orig.length > start);
          if (!overlaps) {
            offset = idx;
            usedRanges.push([idx, idx + iss.orig.length]);
            break;
          }
          from = idx + 1;
        }
        return { ...iss, offset } as Issue;
      })
      .filter(iss => iss.offset >= 0);
  };

  const mergeIssues = (localIssues: Issue[], remoteIssues: Issue[]): Issue[] => {
    const seen = new Set(localIssues.map(issue => `${issue.offset}:${issue.orig.toLowerCase()}`));
    return [
      ...localIssues,
      ...remoteIssues.filter(issue => {
        const key = `${issue.offset}:${issue.orig.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    ].sort((a, b) => a.offset - b.offset).slice(0, 80);
  };

  const analyzeWithHaiku = async (content: string) => {
    if (content.length < 5) return;
    setIsAnalyzing(true);
    try {
      const local = buildLocalAnalysis(content);
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: content,
        }),
      });
      if (response.status === 503) return;
      if (!response.ok) throw new Error(`Haiku analysis failed: ${response.status}`);
      const remote = await response.json() as Partial<AnalysisResult>;
      const remoteIssues = locateIssueOffsets((remote.issues ?? []) as Issue[], content);
      const merged: AnalysisResult = {
        issues: mergeIssues(local.issues, remoteIssues),
        tone: remote.tone || local.tone,
        formality: Number(remote.formality ?? local.formality),
        insights: [...local.insights, ...(remote.insights ?? [])].slice(0, 6),
      };
      setAnalysis(merged);
      setFormalityLevel(merged.formality);
      const t = new Date().toLocaleTimeString();
      setStatusMsg(`${t} - Haiku live check - ${merged.issues.length} ${merged.issues.length === 1 ? 'issue' : 'issues'} found`);
    } catch (err) {
      console.error('Haiku analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /* ── Fix All ─────────────────────────────────────────── */
  const fixAll = async () => {
    if (isFixing || plainText.length < 5) return;
    originalTextRef.current = plainText;
    setIsFixing(true); setStatusMsg(HAS_API_KEY ? 'Fixing with low-cost AI...' : 'Applying offline fixes...');
    try {
      if (!HAS_API_KEY) {
        const localDiffs = getLocalIssues(plainText).map(({ orig, fix, offset }) => ({ orig, fix, offset }));
        const correctedSegs = localDiffs.length ? applyCorrections(segments, localDiffs) : segments;
        const finalText = toPlainText(correctedSegs);
        const changed = finalText !== plainText;
        if (!changed) {
          setHasFixed(false);
          setStatusMsg('No offline fixes needed');
          return;
        }
        pushUndo(segments);
        setSegments(correctedSegs);
        lastFixedRef.current = finalText;
        setHasFixed(true); setAnalysis(null);
        setStatusMsg('Offline fixes applied');
        setHistoryItems(prev => {
          const updated = [{ text: finalText, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50);
          try { localStorage.setItem('wr_history', JSON.stringify(updated)); } catch {}
          return updated;
        });
        return;
      }

      const hint = numericHint(plainText);
      const r1 = await genAI.models.generateContent({
        model: HYBRID_MODEL,
        contents: [{ role:'user', parts:[{ text:`Fix all errors. Return ONLY corrected text.${hint}\n\n${plainText}` }] }],
      });
      const corrected = r1.text?.trim() || plainText;

      const r2 = await genAI.models.generateContent({
        model: HYBRID_MODEL,
        contents: [{ role:'user', parts:[{ text:`Compare original and corrected text. List exact word-level changes as JSON array of {orig, fix}. Original: "${plainText}" Corrected: "${corrected}"` }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { orig:{type:Type.STRING}, fix:{type:Type.STRING} }, required:['orig','fix'] } },
        },
      });

      let diffs: Array<{ orig: string; fix: string; offset: number }> = [];
      try {
        const raw = JSON.parse(r2.text || '[]') as Array<{ orig: string; fix: string }>;
        let from = 0;
        for (const d of raw) {
          const off = plainText.indexOf(d.orig, from);
          if (off !== -1) { diffs.push({ ...d, offset: off }); from = off + d.orig.length; }
        }
      } catch {
        diffs = [];
      }

      pushUndo(segments);
      const correctedSegs = diffs.length ? applyCorrections(segments, diffs) : [{ ...(segments[0] ?? emptySegment()), text: corrected }];
      setSegments(correctedSegs);
      const finalText = toPlainText(correctedSegs);
      lastFixedRef.current = finalText;
      const changed = finalText !== plainText;
      setHasFixed(changed);
      setAnalysis(null);
      setStatusMsg(changed ? 'Text corrected with low-cost AI' : 'No fixes needed');
      setHistoryItems(prev => {
        const updated = [{ text: finalText, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50);
        try { localStorage.setItem('wr_history', JSON.stringify(updated)); } catch {}
        return updated;
      });
    } catch (err) {
      console.error('Fix error:', err);
      const corrected = applyLocalFixes(plainText);
      const changed = corrected !== plainText;
      if (changed) {
        pushUndo(segments);
        setSegments([{ ...(segments[0] ?? emptySegment()), text: corrected }]);
      }
      lastFixedRef.current = corrected;
      setHasFixed(changed);
      setAnalysis(null);
      setStatusMsg(changed ? 'API unavailable - offline fixes applied' : 'API unavailable - no offline fixes needed');
    } finally { setIsFixing(false); }
  };

  /* ── Paraphrase ──────────────────────────────────────── */
  const generateParaphrase = async (content: string, style: ParaphraseStyle) => {
    if (content.length < 5) return;
    setIsParaphrasing(true);
    setActiveParaphraseStyle(style);
    try {
      const mode = PARAPHRASE_MODES.find(item => item.key === style);
      const response = await fetch('/api/paraphrase', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: content,
          style,
          tone: mode?.desc ?? style,
        }),
      });
      if (!response.ok) throw new Error(`OpenAI paraphrase failed: ${response.status}`);
      const parsed = await response.json() as { paraphrasedText?: string };
      const value = (parsed.paraphrasedText ?? '').trim();
      if (!value) throw new Error('OpenAI returned an empty paraphrase');
      setParaphraseSets(prev => ({ ...(prev ?? localParaphrases(content)), [style]: value }));
      setStatusMsg(`${mode?.label ?? style.toUpperCase()} paraphrase ready`);
    } catch (err) {
      console.error('Paraphrase error:', err);
      const fallback = localParaphrases(content)[style];
      setParaphraseSets(prev => ({ ...(prev ?? localParaphrases(content)), [style]: fallback }));
      setStatusMsg('OpenAI unavailable - offline paraphrase generated');
    } finally {
      setIsParaphrasing(false);
      setActiveParaphraseStyle(null);
    }
  };

  /* ── Make Friendly ───────────────────────────────────── */
  const makeFriendly = async () => {
    if (plainText.length < 5 || isFixing) return;
    setIsFixing(true);
    try {
      if (!HAS_API_KEY) {
        const friendly = localParaphrases(plainText).casual;
        pushUndo(segments);
        setSegments([{ text: friendly, bold: false, italic: false, underline: false, highlight: null }]);
        setStatusMsg('Offline friendly rewrite applied');
        return;
      }

      const hint = numericHint(plainText);
      const r = await genAI.models.generateContent({
        model: HYBRID_MODEL,
        contents: [{ role:'user', parts:[{ text:`Rewrite to be warm and friendly, same meaning. Return ONLY the rewritten text.${hint}\n\n${plainText}` }] }],
      });
      const friendly = r.text?.trim() || plainText;
      pushUndo(segments);
      setSegments([{ text: friendly, bold: false, italic: false, underline: false, highlight: null }]);
    } catch (err) {
      console.error('Make friendly error:', err);
      const friendly = localParaphrases(plainText).casual;
      pushUndo(segments);
      setSegments([{ text: friendly, bold: false, italic: false, underline: false, highlight: null }]);
      setStatusMsg('API unavailable - offline friendly rewrite applied');
    } finally { setIsFixing(false); }
  };

  /* ── AI Features ─────────────────────────────────────── */
  const runAiDetector = async () => {
    if (plainText.length < 50 || isDetecting) return;
    setIsDetecting(true);
    setShowDetector(true);
    try {
      if (!HAS_API_KEY) {
        setDetectorResult(localDetector(plainText));
        setStatusMsg('Offline AI detector estimate ready');
        return;
      }

      const response = await genAI.models.generateContent({
        model: HYBRID_MODEL,
        contents: [{
          role: 'user',
          parts: [{ text: `Analyze this text and determine if it was written by AI or a human. Look for overly uniform sentence length, lack of personal voice, generic transitions, unnaturally perfect grammar, absence of colloquialisms, overly structured paragraphs. Text: "${plainText}"` }]
        }],
        config: {
          systemInstruction: `You are an AI content detector. Analyze the provided text and return a JSON object. verdict must be exactly one of: 'likely-ai', 'likely-human', 'mixed', 'uncertain'. confidence must be exactly one of: 'high','medium','low'. Return only valid JSON.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiProbability: { type: Type.NUMBER }, humanProbability: { type: Type.NUMBER }, verdict: { type: Type.STRING }, confidence: { type: Type.STRING },
              signals: { type: Type.ARRAY, items: { type: Type.STRING } }, highlightedPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['aiProbability','humanProbability','verdict','confidence','signals','highlightedPhrases'],
          },
        },
      });
      setDetectorResult(JSON.parse(response.text || '{}') as DetectorResult);
    } catch (err) {
      console.error('AI detector error:', err);
      setDetectorResult(localDetector(plainText));
      setStatusMsg('API unavailable - offline detector estimate ready');
    } finally { setIsDetecting(false); }
  };

  const runPlagiarismCheck = async () => {
    if (plainText.length < 50 || isCheckingPlag) return;
    setIsCheckingPlag(true);
    setShowPlagiarism(true);
    try {
      if (!HAS_API_KEY) {
        setPlagiarismResult(localOriginality(plainText));
        setStatusMsg('Offline originality estimate ready');
        return;
      }

      const response = await genAI.models.generateContent({
        model: HYBRID_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Analyze this text for originality. Flag phrases that sound like well-known quotes, generic templates, or overly common expressions. Text: "${plainText}"` }] }],
        config: {
          systemInstruction: `You are an originality analyzer. Detect phrases that lack originality. riskLevel must be exactly: 'low', 'medium', or 'high'. type must be one of: 'common-expression', 'generic-template', 'known-quote'. Return only valid JSON.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              originalityScore: { type: Type.NUMBER }, riskLevel: { type: Type.STRING },
              flaggedPhrases: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { phrase: { type: Type.STRING }, reason: { type: Type.STRING }, type: { type: Type.STRING } }, required: ['phrase','reason','type'] } },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }, summary: { type: Type.STRING },
            },
            required: ['originalityScore','riskLevel','flaggedPhrases','suggestions','summary'],
          },
        },
      });
      setPlagiarismResult(JSON.parse(response.text || '{}') as PlagiarismResult);
    } catch (err) {
      console.error('Plagiarism check error:', err);
      setPlagiarismResult(localOriginality(plainText));
      setStatusMsg('API unavailable - offline originality estimate ready');
    } finally { setIsCheckingPlag(false); }
  };

  const humanizeText = async () => {
    if (plainText.length < 20 || isHumanizing || isFixing) return;
    setIsHumanizing(true);
    try {
      if (!HAS_API_KEY) {
        const data = localHumanize(plainText);
        pushUndo(segments);
        setSegments([{ text: data.humanized, bold: false, italic: false, underline: false, highlight: null }]);
        setHumanizerResult(data);
        setShowHumanizerInfo(true);
        setHasFixed(false); lastFixedRef.current = ''; setAnalysis(null); setParaphraseSets(null);
        setStatusMsg('Offline humanizer applied');
        setTimeout(() => setShowHumanizerInfo(false), 5000);
        return;
      }

      const hint = numericHint(plainText);
      const response = await genAI.models.generateContent({
        model: HYBRID_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Rewrite this text to sound authentically human-written. Vary sentence lengths, use natural transitions, preserve facts exactly. ${hint} Return JSON with: humanized, changesCount, techniquesSummary. Text to humanize: "${plainText}"` }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: { type: Type.OBJECT, properties: { humanized: { type: Type.STRING }, changesCount: { type: Type.NUMBER }, techniquesSummary: { type: Type.STRING } }, required: ['humanized','changesCount','techniquesSummary'] },
        },
      });
      const data = JSON.parse(response.text || '{}') as HumanizerResult;
      if (data.humanized) {
        pushUndo(segments);
        setSegments([{ text: data.humanized, bold: false, italic: false, underline: false, highlight: null }]);
        setHumanizerResult(data);
        setShowHumanizerInfo(true);
        setHasFixed(false); lastFixedRef.current = ''; setAnalysis(null); setParaphraseSets(null);
        setStatusMsg('Text humanized with low-cost AI');
        setTimeout(() => setShowHumanizerInfo(false), 5000);
      }
    } catch (err) {
      console.error('Humanizer error:', err);
      const data = localHumanize(plainText);
      pushUndo(segments);
      setSegments([{ text: data.humanized, bold: false, italic: false, underline: false, highlight: null }]);
      setHumanizerResult(data);
      setShowHumanizerInfo(true);
      setStatusMsg('API unavailable - offline humanizer applied');
    } finally { setIsHumanizing(false); }
  };

  const runWritingCoach = async () => {
    if (plainText.length < 80 || isCoaching) return;
    setIsCoaching(true);
    setShowCoach(true);
    try {
      if (!HAS_API_KEY) {
        setCoachResult(localCoach(plainText));
        setStatusMsg('Offline writing coach ready');
        return;
      }

      const response = await genAI.models.generateContent({
        model: HYBRID_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Act as a professional writing coach and editor. Give detailed, honest, constructive feedback on this text. Text: "${plainText}"` }] }],
        config: {
          systemInstruction: `You are a professional writing coach. overallGrade must be exactly: 'A', 'B', 'C', or 'D'. improvements area must be one of: 'structure', 'clarity', 'engagement', 'voice', 'conciseness', 'flow'. priority must be: 'high', 'medium', or 'low'. Return only valid JSON.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallAssessment: { type: Type.STRING }, overallGrade: { type: Type.STRING }, strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              improvements: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { area: { type: Type.STRING }, issue: { type: Type.STRING }, suggestion: { type: Type.STRING }, priority: { type: Type.STRING } }, required: ['area','issue','suggestion','priority'] } },
              quickTip: { type: Type.STRING }, targetAudience: { type: Type.STRING },
            },
            required: ['overallAssessment','overallGrade','strengths','improvements','quickTip','targetAudience'],
          },
        },
      });
      setCoachResult(JSON.parse(response.text || '{}') as CoachResult);
    } catch (err) {
      console.error('Writing coach error:', err);
      setCoachResult(localCoach(plainText));
      setStatusMsg('API unavailable - offline writing coach ready');
    } finally { setIsCoaching(false); }
  };

  /* ── Clear ───────────────────────────────────────────── */
  const clearText = () => {
    pushUndo(segments);
    setSegments([emptySegment()]);
    setAnalysis(null); setParaphraseSets(null);
    setHasFixed(false); lastFixedRef.current = '';
    setViewMode('rewritten');
    originalTextRef.current = '';
    setStatusMsg('');
    setTimeout(() => editorRef.current?.focus(), 0);
  };

  /* ── Download ────────────────────────────────────────── */
  const handleDownload = () => {
    const textToDownload = viewMode === 'original' ? originalTextRef.current : plainText;
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'writeright-export.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Copy ────────────────────────────────────────────── */
  const copyToClipboard = async (val: string, key: string) => {
    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(val); ok = true; } catch {}
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea'); ta.value = val;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy'); document.body.removeChild(ta);
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

  const toneStyleClass = useMemo(() => {
    const t = toneLabel.toLowerCase();
    if (t.includes('professional') || t.includes('formal')) return 'para-tone-chip--formal';
    if (t.includes('casual') || t.includes('friendly')) return 'para-tone-chip--casual';
    if (t.includes('urgent') || t.includes('direct')) return 'para-tone-chip--urgent';
    return 'para-tone-chip--neutral';
  }, [toneLabel]);

  /* ── Render ──────────────────────────────────────────── */
  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} />;
  }

  return (
    <div className="app-root">

      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <button
            className="icon-btn-ghost"
            aria-label="Go to home page"
            title="Home"
            onClick={() => setShowLanding(true)}
          >
            <Menu size={18} />
          </button>
          <div className="wr-logo-mark">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
              <rect width="100" height="100" rx="18" fill="var(--accent-gold)" opacity="0.15"/>
              <path d="M50 8 L60 44 L92 50 L60 56 L50 92 L40 56 L8 50 L40 44Z" stroke="var(--accent-gold)" strokeWidth="3" fill="none"/>
              <text x="50" y="56" textAnchor="middle" fontFamily="Spectral,serif" fontWeight="600" fontSize="26" fill="var(--accent-gold)">WR</text>
            </svg>
          </div>
          <h1 className="app-title">Voice <span>WriteRight</span></h1>
          <div className="model-badge"><Sparkles size={11} /><span>{HAS_API_KEY ? 'Hybrid Flash-Lite' : 'Offline Mode'}</span></div>
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
              <button className="make-friendly-btn humanize-btn" onClick={humanizeText} disabled={isFixing || plainText.length < 20 || isHumanizing}>
                {isHumanizing ? <><RefreshCw size={14} className="spin"/> Humanizing…</> : <><UserCheck size={14} style={{ display: 'inline-block', verticalAlign: 'text-bottom' }}/> Humanize</>}
              </button>
              <button className="make-friendly-btn" onClick={makeFriendly} disabled={isFixing || plainText.length < 5}>
                😊 Make Friendly
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showHumanizerInfo && humanizerResult && (
          <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="humanizer-toast">
            <CheckCircle2 size={13} style={{display:'inline-block',verticalAlign:'text-bottom',marginRight:'4px'}}/>
            <strong>Humanized</strong> — {humanizerResult.changesCount} changes made. {humanizerResult.techniquesSummary}
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
              disabled={isFixing||plainText.length<5}
              className={`fix-btn${hasFixed?' fix-btn--fixed':''}${isFixing?' fix-btn--loading':''}`}>
              {isFixing ? <><RefreshCw size={14} className="spin"/> Fixing…</> : hasFixed ? <><span>✅</span> CHECK AGAIN</> : <><span className="fix-btn-star">✳</span> FIX ALL ERRORS</>}
            </motion.button>
            <div className="toolbar-actions">
              <button className="tool-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={15}/></button>
              <button className="tool-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"><Redo2 size={15}/></button>
              <button className={`tool-btn${isRecording?' tool-btn--active':''}`} onClick={toggleRecording} title="Voice input">
                {isRecording ? <MicOff size={15}/> : <Mic size={15}/>}
              </button>
              <button className="tool-btn" onClick={runAiDetector} disabled={isDetecting || plainText.length < 50} title="AI Detector"><Eye size={15}/></button>
              <button className="tool-btn" onClick={runPlagiarismCheck} disabled={isCheckingPlag || plainText.length < 50} title="Originality Check"><ShieldCheck size={15}/></button>
              <button className="tool-btn" onClick={runWritingCoach} disabled={isCoaching || plainText.length < 80} title="Writing Coach"><GraduationCap size={15}/></button>
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

          {/* View Toggle */}
          {hasFixed && (
            <div className="view-toggle-bar">
              <button 
                className={`view-tab ${viewMode === 'original' ? 'view-tab--active' : ''}`}
                onClick={() => setViewMode('original')}
              >Original</button>
              <button 
                className={`view-tab ${viewMode === 'rewritten' ? 'view-tab--active' : ''}`}
                onClick={() => setViewMode('rewritten')}
              >Rewritten</button>
            </div>
          )}

          {/* Editor area */}
          <div className={`editor-area ${viewMode === 'original' ? 'editor-area--original' : ''}`}>
            <div
              ref={editorRef}
              contentEditable={!isFixing}
              suppressContentEditableWarning
              onInput={handleInput}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              className="editor-contenteditable"
              data-placeholder="Type or paste your text here — bold, italic, underline, and highlights are preserved during correction"
              spellCheck={false}
            />
          </div>

          {/* Paraphrase */}
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.3}} className="paraphrase-panel">
            <div className="paraphrase-title">
              <span className="paraphrase-title-text">PARAPHRASE</span>
              <button className="paraphrase-main-btn" disabled={isParaphrasing || plainText.length < 5} onClick={() => generateParaphrase(plainText, 'standard')}>
                {isParaphrasing ? <RefreshCw size={14} className="spin"/> : <Sparkles size={14}/>}
                Paraphrase Text
              </button>
            </div>
            <div className="paraphrase-grid">
              {PARAPHRASE_MODES.map(({key, label, emoji, desc}) => {
                const val = paraphraseSets?.[key] ?? '';
                const isLoadingStyle = isParaphrasing && activeParaphraseStyle === key;
                return (
                  <motion.div key={key} whileHover={{y:-2}} transition={{duration:0.12}}
                    className={`para-card${key==='professional'?' para-card--highlighted':''}`}>
                    <div className="para-card-header">
                      <button
                        className="para-style-btn"
                        onClick={() => generateParaphrase(plainText, key)}
                        disabled={isParaphrasing || plainText.length < 5}
                        title={desc}
                      >
                        <span className="para-emoji">{emoji}</span><span>{label}</span>
                      </button>
                      {val && <button className="para-copy-btn" onClick={()=>copyToClipboard(val,key)} title="Copy">
                        {copiedKey===key?<Check size={12}/>:<Copy size={12}/>}
                      </button>}
                    </div>
                    <p className="para-style-desc">{desc}</p>
                    <div className="para-card-body">
                      {isLoadingStyle
                        ? <div className="para-loading"><RefreshCw size={13} className="spin"/> Generating...</div>
                        : val
                          ? <p className="para-text">{val}</p>
                          : <p className="para-placeholder">Click this style to generate a paraphrase.</p>}
                    </div>
                    {val && <button className="para-use-btn" onClick={()=>{
                      pushUndo(segments);
                      setSegments([{ text: val, bold: false, italic: false, underline: false, highlight: null }]);
                    }}>Use -&gt;</button>}
                  </motion.div>
                );
              })}
            </div>
            <div className="paraphrase-footer">
              <div className={`para-tone-chip ${toneStyleClass}`}><span>{toneEmoji}</span><span className="para-tone-name">{toneLabel||'Neutral'}</span></div>
              <div className="para-word-count">{wordCount} WORDS - {charCount} CHARS</div>
            </div>
          </motion.div>

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

          {(analysis?.issues.length || analysis?.insights.length) ? (
            <div className="suggestions-panel">
              <div className="suggestions-header">
                <span>Suggestions</span>
                <small>Offline grammar + live insights when configured</small>
              </div>
              <div className="suggestions-list">
                {analysis.issues.slice(0, 4).map((issue, index) => (
                  <div key={`${issue.offset}-${issue.orig}-${index}`} className={`suggestion-item suggestion-item--${issue.cat}`}>
                    <div className="suggestion-meta">{issue.cat}</div>
                    <div className="suggestion-copy">
                      <strong>{issue.orig}</strong>
                      <span>{issue.msg} Try: {issue.fix}</span>
                    </div>
                  </div>
                ))}
                {analysis.insights.slice(0, 4).map((insight, index) => (
                  <div key={`${insight.type}-${index}`} className={`suggestion-item suggestion-item--${insight.type}`}>
                    <div className="suggestion-meta">{insight.type}</div>
                    <div className="suggestion-copy">
                      <strong>{insight.message}</strong>
                      <span>{insight.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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
            <button className="fmt-btn" onClick={handleDownload} title="Download .txt" disabled={plainText.length < 5}>
              <Download size={13} style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px' }} /> Download
            </button>
            <button className={`fmt-btn fmt-btn--fix${hasFixed?' fmt-btn--fixed':''}`} onClick={fixAll}
              disabled={isFixing||plainText.length<5}>
              {isFixing?'…':hasFixed?'CHECK AGAIN':'FIX ALL'}
            </button>
          </div>
        </motion.div>

      </main>

      {/* FEATURE PANELS */}
      <div className="feature-panels">
        <AnimatePresence>
          {/* Detector */}
          {showDetector && (
            <motion.div key="detector" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}} className="detector-panel">
              <div className="feature-panel-header">
                <span>🔍 AI Content Detector</span>
                <button className="icon-btn-ghost" onClick={() => setShowDetector(false)}>✕</button>
              </div>
              {isDetecting ? <div className="para-loading"><RefreshCw size={13} className="spin"/> Analyzing…</div> : detectorResult && (
                <div className="feature-panel-content">
                  <div className="feature-panel-left">
                    <div className="detector-gauge" style={{ background: `conic-gradient(var(--accent-red) 0% ${detectorResult.aiProbability}%, var(--card-border) ${detectorResult.aiProbability}% 100%)` }}>
                      <span>{detectorResult.aiProbability}%</span>
                    </div>
                    <div className="detector-verdict" style={{ background: detectorResult.verdict === 'likely-ai' ? 'var(--accent-red)' : detectorResult.verdict === 'likely-human' ? 'var(--accent-green)' : detectorResult.verdict === 'mixed' ? 'var(--accent-amber)' : 'var(--panel-text-muted)' }}>{detectorResult.verdict.replace('-', ' ')}</div>
                    <div style={{fontSize:'0.75rem',color:'var(--panel-text-muted)'}}>Confidence: {detectorResult.confidence}</div>
                  </div>
                  <div className="feature-panel-right">
                    <div style={{fontSize:'0.85rem',fontWeight:600}}>Why we think this:</div>
                    <ul className="detector-signals">
                      {detectorResult.signals.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                    <div style={{fontSize:'0.85rem',fontWeight:600, marginTop:'0.5rem'}}>AI-like phrases detected:</div>
                    <div className="detector-phrases">
                      {detectorResult.highlightedPhrases.map((p, i) => <div key={i} className="detector-phrase-pill">{p}</div>)}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Plagiarism */}
          {showPlagiarism && (
            <motion.div key="plagiarism" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}} className="plagiarism-panel">
              <div className="feature-panel-header">
                <span>🛡 Originality Check <span className="plag-disclaimer">{HAS_API_KEY ? 'Hybrid AI analysis, not a database scan.' : 'Offline phrase check, not a database scan.'} For academic submission, use a dedicated service.</span></span>
                <button className="icon-btn-ghost" onClick={() => setShowPlagiarism(false)}>✕</button>
              </div>
              {isCheckingPlag ? <div className="para-loading"><RefreshCw size={13} className="spin"/> Analyzing…</div> : plagiarismResult && (
                <div className="feature-panel-content">
                  <div className="feature-panel-left">
                    <div className="plag-score-circle" style={{ background: `conic-gradient(var(--accent-green) 0% ${plagiarismResult.originalityScore}%, var(--card-border) ${plagiarismResult.originalityScore}% 100%)` }}>
                      <span>{plagiarismResult.originalityScore}</span>
                    </div>
                    <div className="detector-verdict" style={{ background: plagiarismResult.riskLevel === 'high' ? 'var(--accent-red)' : plagiarismResult.riskLevel === 'medium' ? 'var(--accent-amber)' : 'var(--accent-green)' }}>Risk: {plagiarismResult.riskLevel}</div>
                  </div>
                  <div className="feature-panel-right">
                    <p style={{fontSize:'0.9rem', color:'var(--panel-text-muted)'}}>{plagiarismResult.summary}</p>
                    <div style={{fontSize:'0.85rem',fontWeight:600, marginTop:'0.5rem'}}>Flagged phrases:</div>
                    {plagiarismResult.flaggedPhrases.map((f, i) => (
                      <div key={i} className="plag-flagged-card">
                        <span className="plag-type-badge">{f.type.replace('-', ' ')}</span>
                        <strong>"{f.phrase}"</strong>
                        <span style={{color:'var(--panel-text-muted)', fontSize:'0.85rem'}}>{f.reason}</span>
                      </div>
                    ))}
                    <div style={{fontSize:'0.85rem',fontWeight:600, marginTop:'0.5rem'}}>Tips to improve:</div>
                    <ul className="detector-signals">
                      {plagiarismResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Coach */}
          {showCoach && (
            <motion.div key="coach" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}} className="coach-panel">
              <div className="feature-panel-header">
                <span>🎓 Writing Coach</span>
                <button className="icon-btn-ghost" onClick={() => setShowCoach(false)}>✕</button>
              </div>
              {isCoaching ? <div className="para-loading"><RefreshCw size={13} className="spin"/> Reviewing…</div> : coachResult && (
                <div className="feature-panel-content" style={{flexDirection: 'column'}}>
                  <div className="feature-panel-content" style={{borderBottom: '1px solid var(--card-border)', paddingBottom:'1.5rem'}}>
                    <div className="feature-panel-left">
                      <div className="coach-grade-circle" style={{ background: coachResult.overallGrade === 'A' ? 'var(--accent-green)' : coachResult.overallGrade === 'B' ? 'var(--accent-gold)' : coachResult.overallGrade === 'C' ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
                        <span style={{color:'#1C2E26'}}>{coachResult.overallGrade}</span>
                      </div>
                    </div>
                    <div className="feature-panel-right">
                      <p style={{fontSize:'0.95rem'}}>{coachResult.overallAssessment}</p>
                      <div style={{fontSize:'0.8rem', color:'var(--panel-text-muted)'}}>Target audience: {coachResult.targetAudience}</div>
                      <div style={{fontSize:'0.85rem',fontWeight:600, marginTop:'0.5rem'}}>⭐ Strengths:</div>
                      {coachResult.strengths.map((s, i) => <div key={i} className="coach-strength-item"><CheckCircle2 size={14} style={{color:'var(--accent-green)'}}/><span>{s}</span></div>)}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.85rem',fontWeight:600, marginBottom:'0.75rem'}}>Areas to Improve:</div>
                    <div style={{display:'flex', flexDirection:'column', gap:'0.75rem'}}>
                      {coachResult.improvements.map((imp, i) => (
                        <div key={i} className="coach-improvement" style={{borderLeftColor: imp.priority === 'high' ? 'var(--accent-red)' : imp.priority === 'medium' ? 'var(--accent-amber)' : 'var(--panel-text-muted)'}}>
                          <div className="coach-priority-header">
                            <span className="coach-priority-badge" style={{background: imp.priority === 'high' ? 'var(--accent-red)' : imp.priority === 'medium' ? 'var(--accent-amber)' : 'var(--panel-text-muted)'}}>{imp.priority}</span>
                            <span className="coach-area-label">{imp.area}</span>
                          </div>
                          <strong style={{fontSize:'0.85rem'}}>Issue: {imp.issue}</strong>
                          <span style={{color:'var(--panel-text-muted)', fontSize:'0.85rem'}}>→ {imp.suggestion}</span>
                        </div>
                      ))}
                    </div>
                    <div className="coach-quicktip">
                      <Lightbulb size={20} style={{color:'var(--accent-gold)', flexShrink:0}}/>
                      <span style={{fontSize:'0.9rem'}}><strong>Quick Win:</strong> {coachResult.quickTip}</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
