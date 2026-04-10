import { motion } from 'motion/react';
import {
  ArrowRight, Sparkles, Zap, ShieldCheck,
  CheckCircle2, Search, Brain, GraduationCap,
  Check, X,
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

// ─── Scroll helper ────────────────────────────────────────────────────────────
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// ─── Feature data ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <Zap size={26} />,
    color: 'var(--accent-green)',
    bg: 'rgba(90,168,112,0.15)',
    title: 'Instant Fixes',
    desc: 'One click sweeps grammar, spelling, and punctuation errors out of your document in seconds.',
  },
  {
    icon: <Sparkles size={26} />,
    color: 'var(--accent-gold)',
    bg: 'rgba(232,196,66,0.15)',
    title: 'Smart Paraphrasing',
    desc: 'Generate 6 context-aware tone variations — Formal, Casual, Empathetic, Professional, and more.',
    highlight: true,
  },
  {
    icon: <Brain size={26} />,
    color: 'var(--accent-amber)',
    bg: 'rgba(212,144,58,0.15)',
    title: 'Semantic Humanizer',
    desc: 'Strip the robotic cadence from AI-generated text and introduce natural sentence variance.',
  },
  {
    icon: <GraduationCap size={26} />,
    color: '#5090D4',
    bg: 'rgba(80,144,212,0.15)',
    title: 'AI Writing Coach',
    desc: 'Get a holistic grade (A–D) and targeted improvement notes on structure, clarity, and style.',
  },
  {
    icon: <ShieldCheck size={26} />,
    color: 'var(--accent-red)',
    bg: 'rgba(224,90,74,0.15)',
    title: 'Originality Checker',
    desc: 'Flag overused idioms, clichés, and template phrasing before you publish.',
  },
  {
    icon: <Search size={26} />,
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    title: 'AI Content Detector',
    desc: 'Instantly analyse text to determine whether it was written by a human or an LLM.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-page)',
        color: 'var(--panel-text)',
        fontFamily: 'var(--font-body)',
        overflowX: 'hidden',
      }}
    >
      {/* ── NAV ────────────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: 'rgba(28,46,38,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--card-border)',
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 2rem',
            height: 68,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <button
            onClick={() => scrollTo('hero')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--panel-text)' }}
          >
            <div
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: 'rgba(232,196,66,0.15)',
                border: '1px solid rgba(232,196,66,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
                <path d="M50 8 L60 44 L92 50 L60 56 L50 92 L40 56 L8 50 L40 44Z"
                  stroke="var(--accent-gold)" strokeWidth="5" fill="none" />
              </svg>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600 }}>
              WriteRight <span style={{ color: 'var(--accent-gold)' }}>AI</span>
            </span>
          </button>

          {/* Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <button
              onClick={() => scrollTo('features')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--panel-text-muted)', fontSize: '0.95rem', fontWeight: 500 }}
            >
              Features
            </button>
            <button
              onClick={() => scrollTo('pricing')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--panel-text-muted)', fontSize: '0.95rem', fontWeight: 500 }}
            >
              Pricing
            </button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onGetStarted}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0.5rem 1.25rem',
                borderRadius: 10,
                backgroundColor: 'var(--accent-gold)',
                color: '#1C2E26',
                fontWeight: 700,
                fontSize: '0.9rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(232,196,66,0.3)',
              }}
            >
              Launch Editor <ArrowRight size={15} />
            </motion.button>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section
        id="hero"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '120px 2rem 80px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow blobs */}
        <div style={{
          position: 'absolute', top: '-10%', right: '-5%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,196,66,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', left: '-5%',
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(90,168,112,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 820, width: '100%', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 16px',
              borderRadius: 999,
              backgroundColor: 'rgba(232,196,66,0.1)',
              border: '1px solid rgba(232,196,66,0.25)',
              color: 'var(--accent-gold)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              marginBottom: '2rem',
            }}
          >
            <Sparkles size={13} /> Powered by Gemini 2.0 Flash
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.8rem, 7vw, 5.5rem)',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'var(--panel-text)',
              marginBottom: '1.5rem',
            }}
          >
            Write with{' '}
            <span style={{ color: 'var(--accent-gold)' }}>Clarity.</span>
            <br />
            Edit with{' '}
            <span style={{ color: 'var(--accent-gold)' }}>Confidence.</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{
              fontSize: '1.15rem',
              lineHeight: 1.7,
              color: 'var(--panel-text-muted)',
              maxWidth: 620,
              margin: '0 auto 2.5rem',
            }}
          >
            Your intelligent AI writing suite. Fix errors instantly, humanize robotic
            text, perfect your tone, and get expert coaching — all in real time.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.3 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
          >
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={onGetStarted}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 12,
                padding: '1rem 2.5rem',
                borderRadius: 14,
                backgroundColor: 'var(--panel-cream-bg)',
                color: '#1C2E26',
                fontWeight: 700,
                fontSize: '1.1rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 8px 40px rgba(232,196,66,0.25)',
              }}
            >
              Start Writing Free <ArrowRight size={20} />
            </motion.button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', color: 'var(--panel-text-muted)', fontSize: '0.85rem', opacity: 0.75 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> No credit card required
              </span>
              <span>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Works right in your browser
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section
        id="features"
        style={{
          padding: '100px 2rem',
          backgroundColor: 'rgba(0,0,0,0.15)',
          borderTop: '1px solid var(--card-border)',
          borderBottom: '1px solid var(--card-border)',
        }}
      >
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          {/* Section heading */}
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              fontWeight: 700,
              marginBottom: '1rem',
              color: 'var(--panel-text)',
            }}>
              The Ultimate AI Writing Arsenal
            </h2>
            <p style={{
              color: 'var(--panel-text-muted)',
              fontSize: '1.05rem',
              lineHeight: 1.6,
              maxWidth: 580,
              margin: '0 auto',
            }}>
              Everything you need to write flawless, natural, highly engaging content.
            </p>
          </div>

          {/* Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.5rem',
          }}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                whileHover={{ y: -4 }}
                style={{
                  padding: '2rem',
                  borderRadius: 20,
                  backgroundColor: f.highlight ? 'var(--panel-dark-bg)' : 'var(--card-bg)',
                  border: `1px solid ${f.highlight ? 'var(--card-gold-border)' : 'var(--card-border)'}`,
                  boxShadow: f.highlight ? '0 0 30px rgba(232,196,66,0.08)' : 'none',
                  transition: 'box-shadow 0.2s',
                  cursor: 'default',
                }}
              >
                <div style={{
                  width: 50, height: 50,
                  borderRadius: 12,
                  backgroundColor: f.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: f.color,
                  marginBottom: '1.25rem',
                }}>
                  {f.icon}
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  color: f.highlight ? 'var(--accent-gold)' : 'var(--panel-text)',
                  marginBottom: '0.6rem',
                }}>
                  {f.title}
                </h3>
                <p style={{
                  fontSize: '0.95rem',
                  lineHeight: 1.65,
                  color: 'var(--panel-text-muted)',
                }}>
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section
        id="pricing"
        style={{ padding: '100px 2rem' }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Section heading */}
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              fontWeight: 700,
              marginBottom: '1rem',
              color: 'var(--panel-text)',
            }}>
              Simple, Transparent Pricing
            </h2>
            <p style={{
              color: 'var(--panel-text-muted)',
              fontSize: '1.05rem',
              lineHeight: 1.6,
              maxWidth: 500,
              margin: '0 auto',
            }}>
              Choose the plan that fits your writing workflow.
            </p>
          </div>

          {/* Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '2rem',
            alignItems: 'stretch',
          }}>
            {/* Free */}
            <div style={{
              padding: '2.5rem',
              borderRadius: 24,
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Core Editor
              </div>
              <div style={{ color: 'var(--panel-text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Perfect for quick revisions.
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', fontWeight: 800, marginBottom: '2rem', letterSpacing: '-0.03em' }}>
                $0 <span style={{ fontSize: '1rem', fontWeight: 400, opacity: 0.5 }}>/mo</span>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '2.5rem', flex: 1 }}>
                {['Instant Grammar Fixes', 'Basic Paraphrasing Engine', 'Browser-Based Export'].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.95rem', color: 'var(--panel-text)' }}>
                    <Check size={17} style={{ color: 'var(--accent-green)', flexShrink: 0 }} /> {item}
                  </li>
                ))}
                {['Semantic Humanizer', 'AI Content Detector'].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.95rem', color: 'var(--panel-text-muted)', opacity: 0.45 }}>
                    <X size={17} style={{ flexShrink: 0 }} /> <span style={{ textDecoration: 'line-through' }}>{item}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onGetStarted}
                style={{
                  width: '100%', padding: '0.9rem',
                  borderRadius: 12, fontWeight: 700, fontSize: '0.95rem',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'var(--panel-text)',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Launch Free Editor
              </button>
            </div>

            {/* Pro */}
            <div style={{
              padding: '2.5rem',
              borderRadius: 24,
              backgroundColor: 'var(--panel-dark-bg)',
              border: '1px solid var(--card-gold-border)',
              boxShadow: '0 0 60px rgba(232,196,66,0.12)',
              display: 'flex', flexDirection: 'column',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Most popular ribbon */}
              <div style={{
                position: 'absolute', top: 0, right: 0,
                backgroundColor: 'var(--accent-gold)',
                color: '#1C2E26',
                fontSize: '0.72rem', fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '6px 18px',
                borderBottomLeftRadius: 12,
              }}>
                Most Popular
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.4rem' }}>
                <Sparkles size={18} style={{ color: 'var(--accent-gold)' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                  Pro Suite
                </div>
              </div>
              <div style={{ color: 'var(--accent-gold)', fontSize: '0.9rem', opacity: 0.75, marginBottom: '2rem' }}>
                Everything you need to dominate text generation.
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', fontWeight: 800, marginBottom: '2rem', letterSpacing: '-0.03em', color: 'var(--panel-text)' }}>
                ₱200 <span style={{ fontSize: '1rem', fontWeight: 400, opacity: 0.5 }}>/mo</span>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '2.5rem', flex: 1 }}>
                {['Everything in Free', 'Semantic Humanizer', 'AI Writing Coach', 'AI Content Detector', 'Unlimited Priority Access'].map((item, i) => (
                  <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.95rem', color: 'var(--panel-text)', fontWeight: i === 0 ? 700 : 400 }}>
                    <Check size={17} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} /> {item}
                  </li>
                ))}
              </ul>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onGetStarted}
                style={{
                  width: '100%', padding: '0.9rem',
                  borderRadius: 12, fontWeight: 700, fontSize: '0.95rem',
                  backgroundColor: 'var(--accent-gold)',
                  color: '#1C2E26',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(232,196,66,0.35)',
                }}
              >
                Upgrade to Pro
              </motion.button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--card-border)',
        padding: '2rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--panel-text-muted)',
        opacity: 0.5,
      }}>
        © 2026 WriteRight AI. All rights reserved.
      </footer>
    </div>
  );
}
