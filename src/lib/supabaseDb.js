import { supabase } from '@/lib/supabase';
import { fetchAllRows } from './pageAll.js';

const TABLE = {
  Agent:            'agents',
  Domain:           'domains',
  Scenario:         'scenarios',
  Threat:           'threats',
  Chain:            'chains',
  Session:          'sessions',
  SessionAgent:     'session_agents',
  SessionSynthesis: 'session_syntheses',
  SessionMessage:   'session_messages',
  SessionSource:    'session_sources',
  SessionParticipant: 'session_participants',
  AppConfig:        'app_configs',
  Workspace:        'workspaces',
  WorkspaceMember:  'workspace_members',
  Mitigation:       'mitigations',
  Decision:            'decisions',
  DecisionOption:      'decision_options',
  DecisionAssumption:  'decision_assumptions',
  KnowledgeDocument:   'knowledge_documents',
  KnowledgeChunk:      'knowledge_chunks',
};

function applySort(query, sort) {
  if (!sort) return query.order('created_at', { ascending: true });
  if (typeof sort === 'string') {
    const desc = sort.startsWith('-');
    return query.order(desc ? sort.slice(1) : sort, { ascending: !desc });
  }
  const { field, order } = Array.isArray(sort)
    ? { field: sort[0], order: sort[1] || 'asc' }
    : sort;
  return query.order(field, { ascending: order === 'asc' });
}

function makeEntity(entityName) {
  const table = TABLE[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);

  return {
    // list/filter page past PostgREST's 1,000-row cap (R-N11); a caller's
    // explicit limit still means "at most this many".
    list: async (sort, limit) =>
      fetchAllRows(() => applySort(supabase.from(table).select('*'), sort), { limit: limit || undefined }),

    filter: async (filters = {}, sort, limit) =>
      fetchAllRows(() => applySort(supabase.from(table).select('*').match(filters), sort), { limit: limit || undefined }),

    get: async (id) => {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) return null;
      return data;
    },

    create: async (payload) => {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    update: async (id, payload) => {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { id };
    },

    subscribe: (cb) => {
      const channel = supabase
        .channel(`${table}_changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, cb)
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}

export const supabaseDb = {
  entities: Object.fromEntries(
    Object.keys(TABLE).map(name => [name, makeEntity(name)])
  ),
};
