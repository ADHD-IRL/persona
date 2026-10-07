// @ts-check
// R-N12 — the five read-only MCP tools over the agent bench.
//
// Tools take a repo (see repo.js) so they can be tested against an in-memory
// fake. Persona shaping reuses the app's export module so the MCP and the
// in-app JSON export agree on what a persona looks like.
import { z } from 'zod';
import { toPersona, buildPersonaExport } from '../../src/lib/agentExport.js';

export const ROLE_TYPES = ['sme', 'challenger', 'moderator'];
export const EXPERTISE_LEVELS = ['Junior', 'Mid-Level', 'Senior', 'Principal', 'World-Class'];

const SUMMARY_FIELDS = ['id', 'name', 'discipline', 'role_type', 'expertise_level', 'reasoning_style', 'severity_default', 'tags'];

// Fields a search can match on, in ranking order (first hit wins the label).
const MATCH_FIELDS = [
  ['name', 3], ['discipline', 2], ['tags', 2],
  ['red_team_focus', 1], ['persona_description', 1], ['professional_background', 1],
];

function summary(agent, domainNameById) {
  const out = {};
  for (const f of SUMMARY_FIELDS) if (agent[f] != null) out[f] = agent[f];
  out.domain = domainNameById[agent.domain_id] ?? null;
  return out;
}

function matchInfo(agent, query) {
  const q = query.toLowerCase();
  for (const [field, score] of MATCH_FIELDS) {
    const v = agent[field];
    const hit = Array.isArray(v) ? v.some((t) => String(t).toLowerCase().includes(q)) : String(v ?? '').toLowerCase().includes(q);
    if (hit) return { score, field };
  }
  return { score: 0, field: null };
}

async function domainMap(repo) {
  return Object.fromEntries((await repo.listDomains()).map((d) => [d.id, d.name]));
}

/** @param {any} repo */
export function buildTools(repo) {
  return [
    {
      name: 'list_domains',
      description: 'List the expert domains in the AgentDebate bench with the number of agents in each. Domain names are the values accepted by the other tools.',
      scope: 'read',
      schema: {},
      async handler() {
        const [domains, counts] = await Promise.all([repo.listDomains(), repo.domainCounts()]);
        const out = domains
          .map((d) => ({ id: d.id, name: d.name, description: d.description ?? null, agent_count: counts[d.id] || 0 }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return { count: out.length, domains: out };
      },
    },
    {
      name: 'list_agents',
      description: 'Page through agents as compact summaries (no persona text). Filter by domain name, role type (sme = blue team expert, challenger = red team) or expertise level. Use get_agent for the full persona.',
      scope: 'read',
      schema: {
        domain: z.string().optional().describe('Exact domain name from list_domains'),
        role_type: z.enum(ROLE_TYPES).optional(),
        expertise_level: z.enum(EXPERTISE_LEVELS).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      },
      async handler({ domain, role_type, expertise_level, limit = 50, offset = 0 } = {}) {
        const [names, { rows, total }] = await Promise.all([
          domainMap(repo),
          repo.listAgents({ domain, role_type, expertise_level, limit, offset }),
        ]);
        return { total, count: rows.length, offset, agents: rows.map((a) => summary(a, names)) };
      },
    },
    {
      name: 'search_agents',
      description: 'Free-text search over agent names, disciplines, tags, red-team focus and persona text. Returns ranked summaries with the field that matched. Use this to find the right expert before fetching the full persona.',
      scope: 'read',
      schema: {
        query: z.string().describe('Words or a phrase, e.g. "cold chain" or "insider threat"'),
        domain: z.string().optional().describe('Restrict to one domain name'),
        role_type: z.enum(ROLE_TYPES).optional(),
        tags: z.array(z.string()).optional().describe('Require all of these tags'),
        limit: z.number().int().min(1).max(50).default(10),
      },
      async handler({ query, domain, role_type, tags, limit = 10 } = {}) {
        const q = String(query ?? '').trim();
        if (!q) throw new Error('query must not be blank');
        const [names, rows] = await Promise.all([
          domainMap(repo),
          repo.searchAgents({ query: q, domain, role_type, tags, limit: Math.min(limit * 4, 200) }),
        ]);
        const ranked = rows
          .map((a) => ({ a, m: matchInfo(a, q) }))
          .sort((x, y) => y.m.score - x.m.score || String(x.a.name).localeCompare(String(y.a.name)))
          .slice(0, limit)
          .map(({ a, m }) => ({ ...summary(a, names), matched_on: m.field }));
        return { query: q, count: ranked.length, agents: ranked };
      },
    },
    {
      name: 'get_agent',
      description: 'Fetch one agent\'s full persona by id or exact name: background, biases, red-team focus, expertise boundaries, tradecraft, risk posture, debate behaviour and coverage vectors.',
      scope: 'read',
      schema: {
        id: z.string().optional().describe('Agent id'),
        name: z.string().optional().describe('Exact agent name (case-insensitive)'),
      },
      async handler({ id, name } = {}) {
        if (!id && !name) throw new Error('Provide an id or name');
        const [names, agent] = await Promise.all([
          domainMap(repo),
          id ? repo.getAgentById(id) : repo.getAgentByName(name),
        ]);
        if (!agent) {
          throw new Error(id
            ? `No agent with id "${id}" in this workspace`
            : `No agent named "${name}" in this workspace. Try search_agents to find the exact name.`);
        }
        return { agent: { id: agent.id, ...toPersona(agent, names) } };
      },
    },
    {
      name: 'export_agents',
      description: 'Export personas as the portable agentdebate.personas JSON payload (no ids or workspace references), optionally filtered by domain and role type. Export one domain at a time for large benches.',
      scope: 'read',
      schema: {
        domain: z.string().optional().describe('Exact domain name from list_domains'),
        role_type: z.enum(ROLE_TYPES).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      },
      async handler({ domain, role_type, limit = 200 } = {}) {
        const [domains, { rows }] = await Promise.all([
          repo.listDomains(),
          repo.listAgents({ domain, role_type, limit, offset: 0 }),
        ]);
        return buildPersonaExport(rows, domains);
      },
    },
  ];
}
