import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { supabaseDb } from '@/lib/supabaseDb';
import { useAuth } from '@/lib/AuthContext';
import { setWorkspaceApiKey, setKnowledgeRetriever } from '@/lib/llm';
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

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setWorkspace(null);
      setIsLoading(false);
      return;
    }
    initWorkspace(user.id);
  }, [isAuthenticated, user]);

  const initWorkspace = async (userId) => {
    setIsLoading(true);
    try {
      // Ensure profile row exists (trigger may not have fired for older accounts)
      await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

      // Load workspaces the user is a member of
      const { data: members } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', userId);

      if (members?.length > 0) {
        const ids = members.map(m => m.workspace_id);
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('*')
          .in('id', ids);

        const persistedId = localStorage.getItem(WORKSPACE_KEY);
        const ws = workspaces?.find(w => w.id === persistedId) ?? workspaces?.[0];

        if (ws) {
          activateWorkspace(ws);
          return;
        }
      }

      // Check if user owns a workspace but has no member record (broken state)
      const { data: ownedWorkspaces } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', userId);

      if (ownedWorkspaces?.length > 0) {
        const ws = ownedWorkspaces[0];
        // Repair the missing member record
        const { error: memberErr } = await supabase.from('workspace_members').insert({
          workspace_id: ws.id,
          user_id: userId,
          role: 'admin',
        });
        if (!memberErr) {
          activateWorkspace(ws);
          return;
        }
      }

      // No workspace — create one automatically
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .insert({ name: 'My Workspace', owner_id: userId })
        .select()
        .single();

      if (wsErr || !ws) {
        console.error('Failed to create workspace:', wsErr);
        return;
      }

      const { error: memberErr } = await supabase.from('workspace_members').insert({
        workspace_id: ws.id,
        user_id: userId,
        role: 'admin',
      });

      if (memberErr) {
        console.error('Failed to add user to workspace_members:', memberErr);
        // Workspace exists but user isn't a member — cannot proceed safely
        return;
      }

      activateWorkspace(ws);
    } catch (err) {
      console.error('Workspace init failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const activateWorkspace = (ws) => {
    setWorkspace(ws);
    localStorage.setItem(WORKSPACE_KEY, ws.id);
    // Make the workspace API key available to llm.js
    if (ws.anthropic_api_key) {
      setWorkspaceApiKey(ws.anthropic_api_key);
    }
  };

  const refreshWorkspace = async () => {
    if (!workspace) return;
    const { data } = await supabase.from('workspaces').select('*').eq('id', workspace.id).single();
    if (data) activateWorkspace(data);
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
