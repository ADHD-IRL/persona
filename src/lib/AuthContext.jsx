import { createContext, useState, useContext, useEffect } from 'react';
import { apiRequest } from './apiClient.js';
import { clearApiCredentials } from './apiCredentials.js';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const acceptUser = next => { clearApiCredentials(); setUser(next); setError(null); };
  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    apiRequest('/api/auth/session', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { clearApiCredentials(); setUser(data.user); setError(null); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const signUp = async ({ email, password, displayName }) => {
    const data = await apiRequest('/api/auth/signup', { method: 'POST', body: { email, password, displayName } });
    acceptUser(data.user); return data;
  };
  const signIn = async ({ email, password }) => {
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } });
    acceptUser(data.user); return data;
  };
  const signOut = async () => { await apiRequest('/api/auth/logout', { method: 'POST' }); acceptUser(null); };
  return <AuthContext.Provider value={{ user, session: user ? { user } : null, isLoading, isAuthenticated: !!user, error, retryAuth: () => setAttempt(value => value + 1), signUp, signIn, signOut }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
