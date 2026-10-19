import { apiRequest } from './apiClient.js';
const ENTITIES = ['Agent', 'Domain', 'Scenario', 'Threat', 'Chain', 'Session', 'SessionAgent', 'SessionSynthesis', 'SessionMessage', 'SessionSource', 'SessionParticipant', 'AppConfig', 'Mitigation', 'Decision', 'DecisionOption', 'DecisionAssumption', 'KnowledgeDocument', 'KnowledgeChunk'];
const TABLE_NAMES = ['agents', 'domains', 'scenarios', 'threats', 'chains', 'sessions', 'session_agents', 'session_syntheses', 'session_messages', 'session_sources', 'session_participants', 'app_configs', 'mitigations', 'decisions', 'decision_options', 'decision_assumptions', 'knowledge_documents', 'knowledge_chunks'];
export function createWorkspaceDb(workspaceId) {
  const streams = new Set();
  const db = Object.fromEntries(ENTITIES.map(entity => {
    const path = (id = '', query = {}) => `/api/data/${entity}${id ? `/${encodeURIComponent(id)}` : ''}?${new URLSearchParams({ ...query, workspace_id: workspaceId })}`;
    async function list(filters = {}, sort, limit) {
      const rows = [];
      if (limit != null && (!Number.isInteger(limit) || limit < 1)) throw new Error('Limit must be a positive integer.');
      while (limit == null || rows.length < limit) {
        const count = Math.min(500, limit == null ? 500 : limit - rows.length);
        const page = await apiRequest(path('', { filters: JSON.stringify(filters), sort: JSON.stringify(sort ?? null), limit: count, offset: rows.length }));
        rows.push(...page);
        if (page.length < count) break;
      }
      return rows;
    }
    return [entity, {
      list: (sort, limit) => list({}, sort, limit),
      filter: (filters = {}, sort, limit) => list(filters, sort, limit),
      get: async id => { try { return await apiRequest(path(id)); } catch (error) { if (error.status === 404) return null; throw error; } },
      create: data => apiRequest(path(), { method: 'POST', body: data }),
      update: (id, data) => apiRequest(path(id), { method: 'PATCH', body: data }),
      delete: id => apiRequest(path(id), { method: 'DELETE' }),
      subscribe: callback => {
        const events = new EventSource(`/api/events?${new URLSearchParams({ workspace_id: workspaceId })}`);
        streams.add(events);
        events.onmessage = event => {
          const payload = JSON.parse(event.data);
          if (payload.table === TABLE_NAMES[ENTITIES.indexOf(entity)]) callback(payload);
        };
        return () => { events.close(); streams.delete(events); };
      },
    }];
  }));
  // Context teardown closes outstanding subscriptions on workspace/sign-out changes.
  Object.defineProperty(db, 'dispose', { value: () => { for (const stream of streams) stream.close(); streams.clear(); } });
  return db;
}
