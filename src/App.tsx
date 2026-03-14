import { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  PenLine, 
  CheckCircle2, 
  Sparkles, 
  Type as TypeIcon, 
  BarChart3, 
  MessageSquare,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Mic,
  MicOff,
  Copy,
  Check
} from 'lucide-react';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface Issue {
  orig: string;
  fix: string;
  cat: 'spelling' | 'grammar' | 'style';
  msg: string;
  offset: number;
}

interface AnalysisResult {
  issues: Issue[];
  score: number;
  tone: string;
  formality: number; // 0-100
}

interface ParaphraseSets {
  formal: string;
  casual: string;
  friendly: string;
  professional: string;
}

export default function App() {
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [hasFixed, setHasFixed] = useState(false);
  const lastFixedText = useRef('');
  const [paraphraseSets, setParaphraseSets] = useState<ParaphraseSets | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready to analyze');
  
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const hlLayerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  const wordCount = useMemo(() => text.trim() ? text.trim().split(/\s+/).length : 0, [text]);
  const charCount = text.length;

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setText(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + finalTranscript);
        }
      };

      recognitionRef.current.onend = () => setIsRecording(false);
      recognitionRef.current.onerror = () => setIsRecording(false);
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const analyzeText = async (content: string) => {
    if (content.length < 5) {
      setAnalysis(null);
      setStatus('Ready to analyze');
      return;
    }

    setIsAnalyzing(true);
    setStatus('Analyzing...');

    try {
      const response = await genAI.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{ role: 'user', parts: [{ text: `Analyze this text: "${content}"` }] }],
        config: {
          systemInstruction: "You are a professional editor. Analyze the provided text for spelling, grammar, and style issues. Return a JSON object with: 'issues' (array of {orig, fix, cat, msg}), 'score' (0-100), 'tone' (string), and 'formality' (0-100). 'cat' must be one of 'spelling', 'grammar', or 'style'. Only return the JSON.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    orig: { type: Type.STRING },
                    fix: { type: Type.STRING },
                    cat: { type: Type.STRING, enum: ['spelling', 'grammar', 'style'] },
                    msg: { type: Type.STRING }
                  },
                  required: ['orig', 'fix', 'cat', 'msg']
                }
              },
              score: { type: Type.NUMBER },
              tone: { type: Type.STRING },
              formality: { type: Type.NUMBER }
            },
            required: ['issues', 'score', 'tone', 'formality']
          }
        }
      });

      const data = JSON.parse(response.text || '{}') as AnalysisResult;
      const issuesWithOffsets = data.issues.map(issue => ({
        ...issue,
        offset: content.indexOf(issue.orig)
      })).filter(issue => issue.offset !== -1);

      setAnalysis({ ...data, issues: issuesWithOffsets });
      setStatus(`Last checked: ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('Analysis error:', error);
      setStatus('Error during analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      analyzeText(text);
    }, 800);
    
    // Reset "fixed" state when text changes from the last fixed version
    if (hasFixed && text !== lastFixedText.current) {
      setHasFixed(false);
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [text]);

  const handleScroll = () => {
    if (editorRef.current && hlLayerRef.current) {
      hlLayerRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  const fixAll = async () => {
    if (isFixing || hasFixed || text.length < 5) return;
    
    setIsFixing(true);
    setStatus('Fixing errors...');

    try {
      // Use lite model for fast rewrite
      const response = await genAI.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{ role: 'user', parts: [{ text: `Rewrite this text correctly, fixing all spelling, grammar, and style issues. Return ONLY the corrected text:\n\n${text}` }] }]
      });

      const correctedText = response.text || text;
      setText(correctedText);
      lastFixedText.current = correctedText;
      setHasFixed(true);
      setAnalysis(null);
      setStatus('Text corrected');

      // Generate paraphrase sets
      generateParaphraseSets(correctedText);
    } catch (error) {
      console.error('Fix error:', error);
      setStatus('Error during fix');
    } finally {
      setIsFixing(false);
    }
  };

  const generateParaphraseSets = async (content: string) => {
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{ role: 'user', parts: [{ text: `Provide 4 paraphrased versions of this text in JSON format with keys: 'formal', 'casual', 'friendly', 'professional'. Text: "${content}"` }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              formal: { type: Type.STRING },
              casual: { type: Type.STRING },
              friendly: { type: Type.STRING },
              professional: { type: Type.STRING }
            },
            required: ['formal', 'casual', 'friendly', 'professional']
          }
        }
      });
      const sets = JSON.parse(response.text || '{}') as ParaphraseSets;
      setParaphraseSets(sets);
    } catch (error) {
      console.error('Paraphrase sets error:', error);
    }
  };

  const copyToClipboard = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const clearText = () => {
    setText('');
    setAnalysis(null);
    setParaphraseSets(null);
    setHasFixed(false);
    lastFixedText.current = '';
    setStatus('Ready to analyze');
  };

  const highlightedHtml = useMemo(() => {
    if (!analysis || analysis.issues.length === 0) return text;
    let html = text;
    const sorted = [...analysis.issues].sort((a, b) => b.offset - a.offset);
    sorted.forEach(iss => {
      const before = html.slice(0, iss.offset);
      const target = html.slice(iss.offset, iss.offset + iss.orig.length);
      const after = html.slice(iss.offset + iss.orig.length);
      html = `${before}<span class="err-word ${iss.cat}">${target}</span>${after}`;
    });
    return html + (html.endsWith('\n') ? ' ' : '');
  }, [text, analysis]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-8"
    >
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        
        {/* Left Column: Editor Container */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-[#B2EBF2] rounded-[40px] p-6 flex flex-col border-4 border-[#80DEEA] shadow-2xl relative"
        >
          {/* Top Controls */}
          <div className="flex items-center justify-center gap-6 mb-6">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fixAll}
              disabled={hasFixed || isFixing || text.length < 5}
              className="bg-[#82B1FF] rounded-full px-10 py-3 border-2 border-black flex items-center gap-3 font-black text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-blue-800 text-2xl">✳</span>
              {isFixing ? 'FIXING...' : hasFixed ? 'FIXED!' : 'FIX ALL ERRORS'}
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleRecording}
              className={`w-16 h-16 rounded-full flex items-center justify-center border-4 border-[#80DEEA] shadow-lg transition-all ${
                isRecording ? 'bg-red-400 text-white animate-pulse' : 'bg-white text-black'
              }`}
            >
              {isRecording ? <Mic size={32} /> : <MicOff size={32} />}
            </motion.button>
          </div>

          {/* Editor Area */}
          <div className="flex-1 bg-[#E0F7FA] rounded-[30px] p-8 border-4 border-[#80DEEA] relative overflow-hidden">
            <div 
              ref={hlLayerRef}
              className="absolute inset-0 p-8 text-3xl font-bold leading-relaxed text-transparent z-0 whitespace-pre-wrap break-words pointer-events-none overflow-hidden"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
            <textarea
              ref={editorRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onScroll={handleScroll}
              className="relative w-full h-full bg-transparent border-none focus:ring-0 resize-none z-10 text-3xl font-bold text-slate-700 placeholder:text-slate-400/50 leading-relaxed transition-colors"
              placeholder="Type or paste your text here"
              spellCheck={false}
            />
            
            {text && (
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={clearText}
                className="absolute bottom-6 right-6 p-3 bg-white/80 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded-2xl transition-all z-20 border-2 border-slate-200"
              >
                <Trash2 size={24} />
              </motion.button>
            )}
          </div>

          {/* Status Badge */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-white rounded-full border-2 border-[#80DEEA] text-[10px] font-bold uppercase tracking-widest text-slate-500 shadow-sm">
            {status}
          </div>
        </motion.div>

        {/* Right Column: Paraphrase Container */}
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-[#69F0AE] rounded-[40px] p-6 flex flex-col border-4 border-[#4DB6AC] shadow-2xl"
        >
          {/* Header */}
          <div className="flex justify-center mb-8">
            <div className="bg-[#26C6DA] rounded-full px-16 py-3 border-2 border-black font-black text-2xl tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              PARAPHRASE
            </div>
          </div>

          {/* Paraphrase Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1">
            {['formal', 'casual', 'friendly', 'professional'].map((type) => {
              const val = paraphraseSets ? paraphraseSets[type as keyof ParaphraseSets] : '';
              return (
                <motion.div 
                  key={type}
                  whileHover={{ y: -5 }}
                  className="bg-[#4DD0E1] rounded-[25px] p-5 border-4 border-[#0097A7] flex flex-col shadow-lg relative group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-black uppercase tracking-tighter text-slate-800">{type}</span>
                    {val && (
                      <button 
                        onClick={() => copyToClipboard(val, type)}
                        className="p-2 bg-white/50 rounded-xl hover:bg-white transition-colors border-2 border-[#0097A7]"
                      >
                        {copiedKey === type ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <p className="text-base font-bold text-slate-800 leading-snug">
                      {val || <span className="opacity-30 italic">Variation will appear here...</span>}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Tone Info Footer */}
          <div className="mt-6 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={20} className="text-slate-700" />
              <span className="text-sm font-black uppercase">{analysis?.tone || 'Neutral'}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-xs font-black">{wordCount} WORDS</div>
              <div className="text-xs font-black">{charCount} CHARS</div>
            </div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}

