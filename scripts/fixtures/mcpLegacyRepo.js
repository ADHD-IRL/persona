// @ts-check
// R-N12 — read-only data access for the MCP tools.
//
// Every query is scoped to one workspace. The Supabase client here runs with
// the service role (RLS is bypassed), so the workspace filter in `base()` is
// the access boundary. Nothing in this file writes.
import { fetchAllRows } from '../../src/lib/pageAll.js';

const SEARCH_COLUMNS = ['name', 'discipline', 'persona_description', 'red_team_focus', 'professional_background'];

/**
 * Build the PostgREST `.or()` filter for a free-text search. The term is
 * double-quoted so commas and parentheses stay literal, and characters that
 * would break the quoting or act as wildcards are removed first.
 * @param {string} query
 */
export function buildSearchOr(query) {
  const term = String(query).replace(/["*\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const value = `"*${term}*"`;
  return SEARCH_COLUMNS.map((c) => `${c}.ilike.${value}`).join(',');
}

function unwrap(table, result) {
  if (result.error) throw new Error(`Supabase ${table} query failed: ${result.error.message}`);
  return result.data;
}

/**
 * @param {{ supabase: any, workspaceId: string }} deps
 */
export function createRepo({ supabase, workspaceId }) {
  if (!workspaceId) throw new Error('createRepo requires a workspaceId');
  /** @type {Promise<any[]> | null} */
  let domainsCache = null;

  function listDomains() {
    domainsCache ??= fetchAllRows(() =>
      supabase.from('domains').select('id, name, description, color').eq('workspace_id', workspaceId).order('name')
    );
    return domainsCache;
  }

  async function resolveDomainId(name) {
    const target = String(name).trim().toLowerCase();
    const d = (await listDomains()).find((x) => String(x.name).toLowerCase() === target);
    if (!d) throw new Error(`No domain named "${name}" in this workspace. Use list_domains to see the available names.`);
    return d.id;
  }

  /**
   * Resolve filter names to ids. Kept separate from base() because Supabase
   * builders are thenables: awaiting a function that returns one would run
   * the query early. base() must stay synchronous and never be awaited.
   */
  async function prepare({ domain, role_type, expertise_level, tags } = {}) {
    return { domainId: domain ? await resolveDomainId(domain) : undefined, role_type, expertise_level, tags };
  }

  /** Base agents query with the workspace boundary and optional filters applied. Synchronous. */
  function base({ domainId, role_type, expertise_level, tags, count } = {}) {
    let q = supabase.from('agents').select('*', count ? { count: 'exact' } : undefined).eq('workspace_id', workspaceId);
    if (domainId) q = q.eq('domain_id', domainId);
    if (role_type) q = q.eq('role_type', role_type);
    if (expertise_level) q = q.eq('expertise_level', expertise_level);
    if (tags?.length) q = q.contains('tags', tags);
    return q;
  }

  return {
    listDomains,

    async domainCounts() {
      const rows = await fetchAllRows(() => supabase.from('agents').select('domain_id').eq('workspace_id', workspaceId));
      /** @type {Record<string, number>} */
      const counts = {};
      for (const r of rows) counts[r.domain_id] = (counts[r.domain_id] || 0) + 1;
      return counts;
    },

    async listAgents({ domain, role_type, expertise_level, limit = 50, offset = 0 } = {}) {
      const f = await prepare({ domain, role_type, expertise_level });
      const result = await base({ ...f, count: true }).order('name').range(offset, offset + limit - 1);
      const rows = unwrap('agents', result) ?? [];
      return { rows, total: result.count ?? rows.length };
    },

    async searchAgents({ query, domain, role_type, tags, limit = 10 } = {}) {
      const f = await prepare({ domain, role_type, tags });
      return unwrap('agents', await base(f).or(buildSearchOr(query)).order('name').limit(limit)) ?? [];
    },

    async getAgentById(id) {
      return unwrap('agents', await base().eq('id', id).maybeSingle());
    },

    async getAgentByName(name) {
      // ilike with no wildcards is a case-insensitive equality match.
      const pattern = String(name).replace(/[%_\\]/g, ' ').trim();
      return unwrap('agents', await base().ilike('name', pattern).maybeSingle());
    },
  };
}
