import { createContext, useState, useContext, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest } from './apiClient.js';
import { createWorkspaceDb } from './localDb.js';
import { setWorkspaceApiKey, clearApiCredentials, setProviderConfig } from './apiCredentials.js';
import { setKnowledgeRetriever } from './llm';
import { retrieveKnowledge } from './knowledge';
const WorkspaceContext = createContext(null);
const WORKSPACE_KEY = 'agd_last_workspace';

export const WorkspaceProvider = ({ children }) => {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState(null);
  const [llmConfig, setLLMConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const userId = user?.id;
  const activate = (ws, config) => {
    if (config) { setLLMConfig(config); setProviderConfig(config); }
    setWorkspace(ws);
    setWorkspaceApiKey(ws.anthropic_api_key, ws.id);
    try { localStorage.setItem(WORKSPACE_KEY, ws.id); } catch { /* optional preference */ }
  };
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    clearApiCredentials(); setWorkspace(null); setError(null); setIsLoading(true);
    let preferred = '';
    try { preferred = localStorage.getItem(WORKSPACE_KEY) || ''; } catch { /* optional preference */ }
    apiRequest(`/api/workspaces/current?${new URLSearchParams({ preferred })}`, { signal: controller.signal })
      .then(async ws => {
        const config = await apiRequest('/api/llm/config?' + new URLSearchParams({ workspace_id: ws.id }), { signal: controller.signal });
        if (generation.current === current) activate(ws, config);
      })
      .catch(err => { if (generation.current === current) setError(err.message); })
      .finally(() => { if (generation.current === current) setIsLoading(false); });
    return () => { generation.current++; controller.abort(); clearApiCredentials(); };
  }, [userId, attempt]);
  const refreshWorkspace = async () => {
    if (!workspace) return;
    const current = generation.current;
    const ws = await apiRequest(`/api/workspaces/${workspace.id}`);
    if (current === generation.current) activate(ws);
  };
  const db = useMemo(() => workspace ? createWorkspaceDb(workspace.id) : null, [workspace?.id]);
  useEffect(() => () => db?.dispose(), [db]);
  useEffect(() => {
    setKnowledgeRetriever(db ? (query, k) => retrieveKnowledge(db, query, k) : null);
    return () => setKnowledgeRetriever(null);
  }, [db]);
  return <WorkspaceContext.Provider value={{ workspace, llmConfig, db, isLoading, error, retryWorkspace: () => setAttempt(value => value + 1), localUserId: userId, refreshWorkspace }}>{children}</WorkspaceContext.Provider>;
};
export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return context;
};
