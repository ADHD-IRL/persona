import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputStyle = { backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' };
  const handleSubmit = async event => {
    event.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError(''); setLoading(true);
    try { await signUp({ email, password, displayName }); navigate('/session-tracker'); }
    catch (err) { setError(err.message || 'Sign up failed.'); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8" style={{ color: 'var(--wr-amber)' }}>
          <Shield className="w-6 h-6" /><span className="text-xl font-bold font-mono">AgentDebate</span>
        </div>
        <div data-ui="surface" className="rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <h1 className="text-base font-bold mb-1" style={{ color: 'var(--wr-text-primary)' }}>Create account</h1>
          <p className="text-xs mb-5" style={{ color: 'var(--wr-text-muted)' }}>Your local analysis library will be created automatically.</p>
          {error && <div className="flex items-start gap-2 mb-4 text-xs" style={{ color: '#C0392B' }} role="alert"><AlertCircle className="w-4 h-4" />{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="signup-name" className="block text-xs mb-1" style={{ color: 'var(--wr-text-muted)' }}>Name</label>
              <input id="signup-name" type="text" required maxLength={200} autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} className="w-full px-3 py-2 rounded text-sm" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="signup-email" className="block text-xs mb-1" style={{ color: 'var(--wr-text-muted)' }}>Email</label>
              <input id="signup-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full px-3 py-2 rounded text-sm" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="signup-password" className="block text-xs mb-1" style={{ color: 'var(--wr-text-muted)' }}>Password</label>
              <input id="signup-password" type="password" required minLength={8} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="8+ characters" className="w-full px-3 py-2 rounded text-sm" style={inputStyle} />
            </div>
            <button data-ui="action" type="submit" disabled={loading} className="w-full py-2 rounded text-sm font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--wr-amber)', color: '#0D1B2A' }}>
              {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Creating account...</span> : 'Create account'}
            </button>
          </form>
          <p className="text-center text-xs mt-5" style={{ color: 'var(--wr-text-muted)' }}>Already have an account? <Link data-ui="action" to="/" style={{ color: 'var(--wr-amber)' }}>Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
