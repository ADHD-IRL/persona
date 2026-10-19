import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn({ email, password });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Sign in failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <Shield className="w-6 h-6" style={{ color: 'var(--wr-amber)' }} />
          <span className="text-xl font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
            AgentDebate
          </span>
        </div>

        <div data-ui="surface" className="rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <h1 className="text-base font-bold mb-1" style={{ color: 'var(--wr-text-primary)' }}>Sign in</h1>
          <p className="text-xs mb-5" style={{ color: 'var(--wr-text-muted)' }}>
            Access your local analysis and assessments.
          </p>

          {error && (
            <div data-ui="surface" className="flex items-start gap-2 mb-4 p-3 rounded text-xs" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: '#C0392B' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--wr-text-muted)' }}>Email</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 rounded text-sm"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)', outline: 'none' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--wr-text-muted)' }}>Password</label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded text-sm"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)', outline: 'none' }}
              />
            </div>
            <button data-ui="action"
              type="submit" disabled={loading}
              className="w-full py-2 rounded text-sm font-bold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--wr-amber)', color: '#0D1B2A' }}>
              {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</span> : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs mt-5" style={{ color: 'var(--wr-text-muted)' }}>
            No account?{' '}
            <Link data-ui="action" to="/signup" className="font-medium" style={{ color: 'var(--wr-amber)' }}>
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
