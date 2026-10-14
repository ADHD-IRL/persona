import React, { createContext, useState, useContext, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { supabaseDb } from '@/lib/supabaseDb';
import { useAuth } from '@/lib/AuthContext';
import { setKnowledgeRetriever } from '@/lib/llm';
import { setWorkspaceApiKey, clearApiCredentials } from './apiCredentials.js';
import { loadWorkspace } from './workspaceLifecycle.js';
import { retrieveKnowledge } from '@/lib/knowledge';

const WorkspaceContext = createContext(null);
const WORKSPACE_KEY = 'agd_last_workspace';

function scopedEntity(entity, workspaceId, userId, { noCreatedBy = false } = {}) {
  const byPayload = noCreatedBy ? {} : { created_by: userId };
  return {
    list:      (sort, limit) => entity.filter({ workspace_id: workspaceId }, sort, limit),
    filter:    (filters = {}, sort, limit) => entity.filter({ ...filters, workspace_id: workspaceId }, sort, limit),
    create:    (data) => entity.create({ ...data, workspace_id: workspaceId, ...byPayload }),
    update:    (id, data) => entity.update(id, data),
    delete:    (id) => entity.delete(id),
    get:       (id) => entity.get(id),
    subscribe: (cb) => entity.subscribe(cb),
  };
}

export const WorkspaceProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [workspace, setWorkspace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const userId = user?.id;

  const activateWorkspace = useCallback((ws) => {
    setWorkspace(ws);
    try { localStorage.setItem(WORKSPACE_KEY, ws.id); } catch { /* optional preference */ }
    setWorkspaceApiKey(ws.anthropic_api_key);
  }, []);

  useEffect(() => {
    const current = ++generation.current;
    const isCurrent = () => generation.current === current;
    clearApiCredentials();
    setWorkspace(null);
    setError(null);
    setIsLoading(true);
    if (!isAuthenticated || !userId) {
      setIsLoading(false);
      return;
    }
    let preferredId;
    try { preferredId = localStorage.getItem(WORKSPACE_KEY); } catch { /* optional preference */ }
    loadWorkspace(supabase, userId, preferredId, isCurrent)
      .then(ws => { if (isCurrent()) activateWorkspace(ws); })
      .catch(err => { if (isCurrent()) setError(err.message || 'Unable to load your workspace.'); })
      .finally(() => { if (isCurrent()) setIsLoading(false); });
    return () => {
      generation.current++;
      clearApiCredentials();
    };
  }, [isAuthenticated, userId, attempt, activateWorkspace]);

  const retryWorkspace = () => setAttempt(value => value + 1);

  const refreshWorkspace = async () => {
    if (!workspace) return;
    const current = generation.current;
    const { data, error: refreshError } = await supabase.from('workspaces').select('*').eq('id', workspace.id).single();
    if (generation.current !== current) return;
    if (refreshError) throw refreshError;
    if (!data) throw new Error('Unable to refresh your workspace.');
    activateWorkspace(data);
  };

  const db = useMemo(() => {
    if (!workspace || !user) return null;
    const e = supabaseDb.entities;
    return {
      Agent:            scopedEntity(e.Agent, workspace.id, user.id),
      Session:          scopedEntity(e.Session, workspace.id, user.id),
      SessionAgent:     scopedEntity(e.SessionAgent, workspace.id, user.id, { noCreatedBy: true }),
      Scenario:         scopedEntity(e.Scenario, workspace.id, user.id),
      Domain:           scopedEntity(e.Domain, workspace.id, user.id),
      Threat:           scopedEntity(e.Threat, workspace.id, user.id),
      Chain:            scopedEntity(e.Chain, workspace.id, user.id),
      SessionSynthesis: scopedEntity(e.SessionSynthesis, workspace.id, user.id, { noCreatedBy: true }),
      SessionMessage:   scopedEntity(e.SessionMessage, workspace.id, user.id, { noCreatedBy: true }),
      SessionSource:    scopedEntity(e.SessionSource, workspace.id, user.id, { noCreatedBy: true }),
      SessionParticipant: scopedEntity(e.SessionParticipant, workspace.id, user.id, { noCreatedBy: true }),
      AppConfig:        scopedEntity(e.AppConfig, workspace.id, user.id),
      Mitigation:          scopedEntity(e.Mitigation, workspace.id, user.id, { noCreatedBy: true }),
      Decision:            scopedEntity(e.Decision, workspace.id, user.id, { noCreatedBy: true }),
      DecisionOption:      scopedEntity(e.DecisionOption, workspace.id, user.id, { noCreatedBy: true }),
      DecisionAssumption:  scopedEntity(e.DecisionAssumption, workspace.id, user.id, { noCreatedBy: true }),
      KnowledgeDocument:   scopedEntity(e.KnowledgeDocument, workspace.id, user.id, { noCreatedBy: true }),
      KnowledgeChunk:      scopedEntity(e.KnowledgeChunk, workspace.id, user.id, { noCreatedBy: true }),
    };
  }, [workspace, user]);

  // Wire the org-knowledge retriever for the live-debate search tool
  useEffect(() => {
    if (!db) { setKnowledgeRetriever(null); return; }
    setKnowledgeRetriever((query, k) => retrieveKnowledge(db, query, k));
    return () => setKnowledgeRetriever(null);
  }, [db]);

  return (
    <WorkspaceContext.Provider value={{
      workspace,
      db,
      isLoading,
      error,
      retryWorkspace,
      localUserId: user?.id,
      refreshWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
};
