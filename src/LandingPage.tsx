import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Zap, ShieldCheck, PenTool, CheckCircle2 } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-page)',
        color: 'var(--panel-text)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Background Glows */}
      <div 
        className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(232, 196, 66, 0.08) 0%, transparent 60%)' }}
      ></div>
      <div 
        className="absolute bottom-[-20%] right-[10%] w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(90, 168, 112, 0.05) 0%, transparent 60%)' }}
      ></div>

      {/* Navigation */}
      <nav className="flex justify-between items-center px-8 py-6 max-w-[1400px] w-full mx-auto relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-[12px] bg-[rgba(232,196,66,0.15)] border border-[rgba(232,196,66,0.3)]">
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
              <path d="M50 8 L60 44 L92 50 L60 56 L50 92 L40 56 L8 50 L40 44Z" stroke="var(--accent-gold)" strokeWidth="4" fill="none"/>
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
            WriteRight <span style={{ color: 'var(--accent-gold)' }}>AI</span>
          </span>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            className="hidden md:block text-[0.95rem] font-medium transition-colors hover:text-white"
            style={{ color: 'var(--panel-text-muted)' }}
          >
            Features
          </button>
          <button 
            className="hidden md:block text-[0.95rem] font-medium transition-colors hover:text-white"
            style={{ color: 'var(--panel-text-muted)' }}
          >
            Pricing
          </button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onGetStarted}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-[#1C2E26] shadow-lg"
            style={{ backgroundColor: 'var(--accent-gold)' }}
          >
            Open Editor <ArrowRight size={16} />
          </motion.button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-24 relative z-10">
        <div className="max-w-[800px] w-full text-center flex flex-col items-center space-y-8">
          
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{ 
              backgroundColor: 'rgba(232, 196, 66, 0.1)', 
              color: 'var(--accent-gold)',
              border: '1px solid rgba(232, 196, 66, 0.2)' 
            }}
          >
            <Sparkles size={14} /> Powered by Gemini 2.0 Flash
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-semibold leading-[1.15] tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--panel-text)' }}
          >
            Write with <span style={{ color: 'var(--accent-gold)' }}>Clarity</span>.<br/> Edit with <span style={{ color: 'var(--accent-gold)' }}>Confidence</span>.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl max-w-[600px] leading-relaxed"
            style={{ color: 'var(--panel-text-muted)' }}
          >
            Your intelligent writing assistant that catches errors, refines tone, and generates perfect paraphrases—all in real-time.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-4 mt-4"
          >
            <motion.button 
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={onGetStarted}
              className="flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-lg shadow-xl"
              style={{ 
                backgroundColor: 'var(--panel-cream-bg)', 
                color: 'var(--bg-page)',
              }}
            >
              Start Writing Free <ArrowRight size={20} />
            </motion.button>
          </motion.div>

        </div>

        {/* Feature Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1100px] w-full mt-24"
        >
          {/* Feature 1 */}
          <div 
            className="flex flex-col p-8 rounded-2xl border"
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              borderColor: 'var(--card-border)',
              boxShadow: 'var(--shadow-panel)'
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6" style={{ backgroundColor: 'rgba(90, 168, 112, 0.15)' }}>
              <Zap size={24} style={{ color: 'var(--accent-green)' }} />
            </div>
            <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Instant Fixes</h3>
            <p className="text-sm leading-relaxed opacity-80">
              Detect and fix grammar, spelling, and punctuation instantly. One click resolves all document errors.
            </p>
          </div>

          {/* Feature 2 */}
          <div 
            className="flex flex-col p-8 rounded-2xl border relative overflow-hidden"
            style={{ 
              backgroundColor: 'var(--panel-dark-bg)', 
              borderColor: 'var(--card-gold-border)',
              boxShadow: '0 0 0 1px rgba(232, 196, 66, 0.15)'
            }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[rgba(232,196,66,0.05)] rounded-bl-full pointer-events-none"></div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-[rgba(232,196,66,0.15)]">
              <Sparkles size={24} style={{ color: 'var(--accent-gold)' }} />
            </div>
            <h3 className="text-xl font-bold mb-3 text-[var(--accent-gold)]" style={{ fontFamily: 'var(--font-display)' }}>Smart Paraphrasing</h3>
            <p className="text-sm leading-relaxed opacity-90">
              Need to sound more professional? Or more casual? Get 6 distinct variations of your text in seconds.
            </p>
          </div>

          {/* Feature 3 */}
          <div 
            className="flex flex-col p-8 rounded-2xl border"
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              borderColor: 'var(--card-border)',
              boxShadow: 'var(--shadow-panel)'
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-[rgba(80,144,212,0.15)]">
              <ShieldCheck size={24} style={{ color: '#5090D4' }} />
            </div>
            <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Secure & Private</h3>
            <p className="text-sm leading-relaxed opacity-80">
              Your text is never stored. Powered directly by Google Gemini API ensuring top-tier reliability and privacy.
            </p>
          </div>
        </motion.div>
        
        {/* Trust Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="mt-16 flex items-center gap-6 text-sm opacity-60"
        >
          <div className="flex items-center gap-2"><CheckCircle2 size={16} /> No credit card required</div>
          <div className="hidden sm:block w-1 h-1 rounded-full bg-current"></div>
          <div className="flex items-center gap-2"><CheckCircle2 size={16} /> Works right in your browser</div>
        </motion.div>

      </main>
    </div>
  );
}
