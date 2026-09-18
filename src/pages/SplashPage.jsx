import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ChevronRight, Shield, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const FEATURES = ['Expert Agent Panels', 'Two-Round Analysis', 'Live Debate Room', 'Decision Briefs', 'Threat Mapping'];

const INPUT_STYLE = {
  width: '100%', padding: '10px 12px', borderRadius: 6, boxSizing: 'border-box',
  backgroundColor: 'rgba(10,18,28,0.85)', border: '1px solid rgba(42,63,90,0.9)',
  color: '#E8EDF5', fontSize: 13, outline: 'none', fontFamily: 'inherit',
};

const LABEL_STYLE = {
  display: 'block', fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace',
  fontWeight: 700, letterSpacing: '0.12em', color: '#546E7A', marginBottom: 6,
};

function AuthenticatedPanel({ user, signOut }) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); } catch {}
    setSigningOut(false);
  };

  return (
    <>
      {/* Greeting */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#E8EDF5', marginBottom: 8, lineHeight: 1.3 }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 12.5, color: '#546E7A', lineHeight: 1.7, wordBreak: 'break-all' }}>
          {user?.email}
        </p>
      </div>

      {/* Continue button */}
      <button
        onClick={() => navigate('/sessions')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '13px 16px', borderRadius: 6, border: 'none', marginBottom: 12,
          backgroundColor: '#F0A500', color: '#0D1B2A',
          fontSize: 12, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.1em', cursor: 'pointer', transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <ArrowRight style={{ width: 14, height: 14 }} />
        ENTER WORKSPACE
      </button>

      <button
        onClick={() => navigate('/sessions')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '10px 16px', borderRadius: 6, border: 'none', marginBottom: 28,
          backgroundColor: 'rgba(255,255,255,0.05)', outline: '1px solid rgba(42,63,90,0.7)',
          color: '#C8D4E4', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background-color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.09)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
      >
        Go to Dashboard
      </button>

      <button
        onClick={handleSignOut}
        disabled={signingOut}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 12, color: '#546E7A', width: '100%', textAlign: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#E8EDF5'}
        onMouseLeave={e => e.currentTarget.style.color = '#546E7A'}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </>
  );
}

function LoginPanel() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn({ email, password });
      navigate('/sessions');
    } catch (err) {
      setError(err.message || 'Sign in failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#E8EDF5', marginBottom: 8, lineHeight: 1.3 }}>
          Sign in to your workspace
        </h1>
        <p style={{ fontSize: 12.5, color: '#546E7A', lineHeight: 1.7 }}>
          Run structured two-round threat assessments with expert AI analyst panels.
        </p>
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16,
          padding: '10px 12px', borderRadius: 6, fontSize: 12,
          backgroundColor: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.35)',
          color: '#E07060',
        }}>
          <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
        <div>
          <label style={LABEL_STYLE}>EMAIL</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="operator@example.com"
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>PASSWORD</label>
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={INPUT_STYLE}
          />
        </div>
        <button
          type="submit" disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '11px 16px', borderRadius: 6, border: 'none',
            backgroundColor: '#F0A500', color: '#0D1B2A',
            fontSize: 12, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.1em', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.65 : 1, transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => !loading && (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => !loading && (e.currentTarget.style.opacity = '1')}
        >
          {loading ? (
            <><Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> AUTHENTICATING...</>
          ) : (
            <><ChevronRight style={{ width: 13, height: 13 }} /> ACCESS PLATFORM</>
          )}
        </button>
      </form>

      <p style={{ fontSize: 12, color: '#546E7A', textAlign: 'center', marginBottom: 32 }}>
        No account?{' '}
        <Link to="/signup" style={{ color: '#F0A500', textDecoration: 'none', fontWeight: 600 }}>
          Request access →
        </Link>
      </p>
    </>
  );
}

export default function SplashPage() {
  const { isAuthenticated, user, signOut } = useAuth();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: '#0D1B2A', position: 'relative' }}>

      {/* Mobile background */}
      <div className="md:hidden" style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url(/splash-hero.jpg)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        filter: 'brightness(0.25)',
      }} />

      {/* Left: Hero panel (desktop) */}
      <div className="hidden md:block" style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden', backgroundColor: '#060e17' }}>
        <img
          src="/splash-hero.jpg"
          alt="AgentDebate — Structured Multi-Agent Risk Assessment"
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(transparent 25%, rgba(10,18,28,0.7) 80%, rgba(10,18,28,0.97) 100%)',
        }} />
        <div style={{ position: 'absolute', bottom: 28, left: 40 }}>
          <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)' }}>
            ANALYZE AND SURFACE RISK · INFORM CRITICAL DECISIONS
          </p>
        </div>
      </div>

      {/* Right: Auth panel */}
      <div
        className="mx-auto md:mx-0"
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 440, flexShrink: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '48px 40px',
          backgroundColor: 'rgba(10,18,28,0.97)',
          borderLeft: '1px solid rgba(42,63,90,0.4)',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Shield style={{ width: 22, height: 22, color: '#F0A500', flexShrink: 0 }} />
            <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: '#F0A500', letterSpacing: '0.14em' }}>
              AGENTDEBATE
            </span>
          </div>
          <p style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', color: 'rgba(138,155,181,0.7)' }}>
            Structured Multi-Agent Risk Assessment
          </p>
        </div>

        {isAuthenticated
          ? <AuthenticatedPanel user={user} signOut={signOut} />
          : <LoginPanel />
        }

        {/* Capability pills */}
        <div style={{ paddingTop: 24, borderTop: '1px solid rgba(42,63,90,0.4)', marginTop: isAuthenticated ? 32 : 0 }}>
          <p style={{ fontSize: 8.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.18em', color: 'rgba(84,110,122,0.7)', marginBottom: 10 }}>
            PLATFORM CAPABILITIES
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {FEATURES.map(f => (
              <span key={f} style={{
                fontSize: 9, padding: '3px 8px', borderRadius: 3,
                fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em',
                backgroundColor: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.18)',
                color: 'rgba(240,165,0,0.6)',
              }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
