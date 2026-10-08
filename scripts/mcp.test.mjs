// R-N12 — read-only MCP endpoint over the agent bench.
// Run: node scripts/mcp.test.mjs
// Offline: no Supabase, no model calls. The repo is faked in memory and the
// HTTP handler is exercised end to end over a loopback server.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { KEY_PREFIX, hashKey, generateKey, parseKeyRing, resolveBearer } from '../api/_mcp/auth.js';
import { createRateLimiter } from '../api/_mcp/ratelimit.js';
import { createRepo, buildSearchOr } from '../api/_mcp/repo.js';
import { buildTools } from '../api/_mcp/tools.js';
import { createHttpHandler } from '../api/_mcp/server.js';
import { EXPORT_FORMAT, EXPORT_VERSION } from '../src/lib/agentExport.js';

// ---------------------------------------------------------------- fixtures
const WS = '00000000-0000-4000-8000-000000000001';
const DOMAINS = [
  { id: 'd1', name: 'Quantum, Photonics and Semiconductor Research', description: 'Academic, lab and research catalog · Engineering' },
  { id: 'd2', name: 'Research Finance and Cost Accounting', description: 'Academic, lab and research catalog · Governance' },
];
const AGENTS = [
  { id: 'a1', workspace_id: WS, domain_id: 'd1', name: 'Quantum Research Program Lead', discipline: 'Quantum Research Leadership', role_type: 'sme', expertise_level: 'Principal', reasoning_style: 'Analytical', severity_default: 'MEDIUM', persona_description: 'Leads a quantum research program.', professional_background: 'Seventeen years in quantum science.', red_team_focus: 'Hunts for single cryogenic resources.', tags: ['quantum', 'leadership'], vector_human: 35, vector_technical: 90, vector_physical: 40, vector_futures: 65, domain_expertise: { quantum: 10 }, expertise_boundaries: { strong: ['x'] }, created_by: 'u1', created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z' },
  { id: 'a2', workspace_id: WS, domain_id: 'd1', name: 'Cryogenic Dependency Failure Analyst', discipline: 'Cryogenic Dependency Analysis', role_type: 'challenger', expertise_level: 'Mid-Level', reasoning_style: 'Analytical', severity_default: 'HIGH', persona_description: 'Shows how much research stops when the cold does, including quantum labs.', professional_background: 'Nine years in research infrastructure.', red_team_focus: 'Hunts for cryogenic systems without backup power.', tags: ['cryogenics', 'dependency'], vector_human: 30, vector_technical: 85, vector_physical: 60, vector_futures: 40 },
  { id: 'a3', workspace_id: WS, domain_id: 'd2', name: 'Grant Budget Manager', discipline: 'Grant Budget Management', role_type: 'sme', expertise_level: 'Mid-Level', reasoning_style: 'Systematic', severity_default: 'MEDIUM', persona_description: 'Manages the budgets of individual awards.', professional_background: 'Nine years in grant budget management.', red_team_focus: 'Hunts for burn rates heading to deficit.', tags: ['budgets', 'grants'], vector_human: 50, vector_technical: 50, vector_physical: 15, vector_futures: 30 },
];

// In-memory repo with the same surface as api/_mcp/repo.js.
function fakeRepo({ domains = DOMAINS, agents = AGENTS } = {}) {
  const byDomainName = (name) => domains.find((d) => d.name.toLowerCase() === String(name).toLowerCase());
  const filt = (rows, { domain, role_type, expertise_level, tags } = {}) => rows.filter((a) => {
    if (domain) { const d = byDomainName(domain); if (!d || a.domain_id !== d.id) return false; }
    if (role_type && a.role_type !== role_type) return false;
    if (expertise_level && a.expertise_level !== expertise_level) return false;
    if (tags?.length && !tags.every((t) => (a.tags || []).includes(t))) return false;
    return true;
  });
  return {
    async listDomains() { return domains.map((d) => ({ ...d })); },
    async domainCounts() { const m = {}; for (const a of agents) m[a.domain_id] = (m[a.domain_id] || 0) + 1; return m; },
    async listAgents({ limit = 50, offset = 0, ...f } = {}) { const rows = filt(agents, f); return { rows: rows.slice(offset, offset + limit), total: rows.length }; },
    async searchAgents({ query, limit = 10, ...f } = {}) {
      const q = query.toLowerCase();
      const hit = (a) => ['name', 'discipline', 'persona_description', 'red_team_focus'].some((k) => (a[k] || '').toLowerCase().includes(q)) || (a.tags || []).some((t) => t.toLowerCase().includes(q));
      return filt(agents, f).filter(hit).slice(0, limit);
    },
    async getAgentById(id) { return agents.find((a) => a.id === id) || null; },
    async getAgentByName(name) { return agents.find((a) => a.name.toLowerCase() === name.toLowerCase()) || null; },
  };
}

const toolByName = (tools, name) => tools.find((t) => t.name === name);
const ctx = { keyHash: 'k', label: 'test', scopes: ['read'] };

// ------------------------------------------------------------------- auth
test('keys are prefixed, hashed with sha256, and only the hash is kept', () => {
  const { key, keyHash } = generateKey();
  assert.ok(key.startsWith(KEY_PREFIX));
  assert.equal(keyHash, hashKey(key));
  assert.match(keyHash, /^[0-9a-f]{64}$/);
});

test('key ring parses hash[:label] entries and rejects malformed hashes', () => {
  const { keyHash: h1 } = generateKey();
  const { keyHash: h2 } = generateKey();
  const ring = parseKeyRing(` ${h1}:claude-desktop , ${h2} ,, `);
  assert.equal(ring.size, 2);
  assert.equal(ring.get(h1).label, 'claude-desktop');
  assert.equal(ring.get(h2).label, h2.slice(0, 8));
  assert.throws(() => parseKeyRing('nothex:label'), /MCP_API_KEYS entry 1/);
  assert.equal(parseKeyRing('').size, 0);
});

test('bearer resolution fails closed on missing, wrong-prefix and unknown keys', () => {
  const { key, keyHash } = generateKey();
  const ring = parseKeyRing(`${keyHash}:me`);
  assert.deepEqual(resolveBearer(`Bearer ${key}`, ring), { keyHash, label: 'me', scopes: ['read'] });
  assert.deepEqual(resolveBearer(`bearer ${key}`, ring), { keyHash, label: 'me', scopes: ['read'] });
  assert.equal(resolveBearer(undefined, ring), null);
  assert.equal(resolveBearer(`Bearer sme_live_${key.slice(KEY_PREFIX.length)}`, ring), null);
  assert.equal(resolveBearer(`Bearer ${generateKey().key}`, ring), null);
  assert.equal(resolveBearer(key, ring), null);
});

// -------------------------------------------------------------- rate limit
test('rate limiter is a fixed window per key and resets', () => {
  let t = 0;
  const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
  limiter.check('k1'); limiter.check('k1');
  assert.throws(() => limiter.check('k1'), /Rate limit exceeded: 2 requests per 1s/);
  limiter.check('k2'); // other key unaffected
  t = 1001;
  limiter.check('k1'); // window rolled
});

// -------------------------------------------------------------------- repo
test('repo scopes every query to the workspace and builds PostgREST filters', async () => {
  const calls = [];
  const builder = (table) => {
    const q = { table, ops: [] };
    const rec = (op) => (...a) => { q.ops.push([op, ...a]); return q; };
    for (const op of ['select', 'eq', 'or', 'contains', 'order', 'range', 'limit', 'ilike']) q[op] = rec(op);
    q.maybeSingle = () => { q.ops.push(['maybeSingle']); return Promise.resolve({ data: null, error: null }); };
    q.then = (resolve) => { calls.push(q); return resolve({ data: [], error: null }); };
    return q;
  };
  const supabase = { from: builder };
  const repo = createRepo({ supabase, workspaceId: WS });
  await repo.searchAgents({ query: 'quantum, (cold)', role_type: 'challenger', tags: ['cryogenics'], limit: 7 });
  const q = calls.at(-1);
  assert.equal(q.table, 'agents');
  assert.ok(q.ops.some(([op, k, v]) => op === 'eq' && k === 'workspace_id' && v === WS), 'workspace scoped');
  assert.ok(q.ops.some(([op, k, v]) => op === 'eq' && k === 'role_type' && v === 'challenger'));
  assert.ok(q.ops.some(([op, k, v]) => op === 'contains' && k === 'tags' && v[0] === 'cryogenics'));
  assert.ok(q.ops.some(([op, n]) => op === 'limit' && n === 7));
  const or = q.ops.find(([op]) => op === 'or')[1];
  assert.match(or, /name\.ilike\."\*quantum, \(cold\)\*"/, 'term is quoted so commas and parens are literal');
  assert.match(or, /discipline\.ilike\./);
  assert.match(or, /persona_description\.ilike\./);
});

test('search OR string strips quotes and wildcards from user input', () => {
  const s = buildSearchOr('say "hi" *there*');
  assert.ok(!s.includes('""'), 'no raw double quotes survive');
  assert.match(s, /\."\*say hi there\*"/);
});

// ------------------------------------------------------------------- tools
test('five read-only tools are exposed', () => {
  const tools = buildTools(fakeRepo());
  assert.deepEqual(tools.map((t) => t.name).sort(), ['export_agents', 'get_agent', 'list_agents', 'list_domains', 'search_agents']);
  for (const t of tools) assert.equal(t.scope, 'read');
});

test('list_domains returns agent counts per domain', async () => {
  const r = await toolByName(buildTools(fakeRepo()), 'list_domains').handler({}, ctx);
  assert.equal(r.count, 2);
  const q = r.domains.find((d) => d.name.startsWith('Quantum'));
  assert.equal(q.agent_count, 2);
  assert.equal(r.domains.find((d) => d.name.startsWith('Research Finance')).agent_count, 1);
});

test('list_agents returns compact summaries with domain names and paging info', async () => {
  const r = await toolByName(buildTools(fakeRepo()), 'list_agents').handler({ domain: 'Quantum, Photonics and Semiconductor Research', limit: 1, offset: 1 }, ctx);
  assert.equal(r.total, 2);
  assert.equal(r.count, 1);
  assert.equal(r.offset, 1);
  const a = r.agents[0];
  assert.equal(a.name, 'Cryogenic Dependency Failure Analyst');
  assert.equal(a.domain, 'Quantum, Photonics and Semiconductor Research');
  assert.equal(a.role_type, 'challenger');
  assert.ok(!('persona_description' in a), 'summaries omit long text');
  assert.ok(!('workspace_id' in a));
});

test('search_agents ranks name hits above body hits and labels the match', async () => {
  const r = await toolByName(buildTools(fakeRepo()), 'search_agents').handler({ query: 'quantum' }, ctx);
  assert.equal(r.count, 2);
  assert.equal(r.agents[0].name, 'Quantum Research Program Lead');
  assert.equal(r.agents[0].matched_on, 'name');
  assert.equal(r.agents[1].matched_on, 'persona_description');
});

test('search_agents requires a non-blank query', async () => {
  await assert.rejects(() => toolByName(buildTools(fakeRepo()), 'search_agents').handler({ query: '   ' }, ctx), /query/);
});

test('get_agent returns the full persona by id or name, with id and domain, and says why on a miss', async () => {
  const get = toolByName(buildTools(fakeRepo()), 'get_agent');
  const byId = await get.handler({ id: 'a1' }, ctx);
  assert.equal(byId.agent.id, 'a1');
  assert.equal(byId.agent.domain, 'Quantum, Photonics and Semiconductor Research');
  assert.equal(byId.agent.professional_background, 'Seventeen years in quantum science.');
  assert.deepEqual(byId.agent.domain_expertise, { quantum: 10 });
  assert.ok(!('workspace_id' in byId.agent) && !('created_by' in byId.agent));
  const byName = await get.handler({ name: 'grant budget manager' }, ctx);
  assert.equal(byName.agent.id, 'a3');
  await assert.rejects(() => get.handler({ name: 'Nobody' }, ctx), /No agent named "Nobody"/);
  await assert.rejects(() => get.handler({}, ctx), /id or name/);
});

test('export_agents emits the agentdebate.personas payload with no ids or workspace refs', async () => {
  const r = await toolByName(buildTools(fakeRepo()), 'export_agents').handler({ domain: 'Quantum, Photonics and Semiconductor Research' }, ctx);
  assert.equal(r.format, EXPORT_FORMAT);
  assert.equal(r.version, EXPORT_VERSION);
  assert.equal(r.count, 2);
  assert.ok(r.exported_at);
  for (const p of r.personas) {
    assert.equal(p.domain, 'Quantum, Photonics and Semiconductor Research');
    for (const k of ['id', 'workspace_id', 'domain_id', 'created_by', 'created_at', 'updated_at']) assert.ok(!(k in p), `${k} leaked`);
  }
});

// -------------------------------------------------------- HTTP end to end
async function withServer(handlerOpts, fn) {
  const handler = createHttpHandler(handlerOpts);
  const server = http.createServer((req, res) => { handler(req, res).catch((e) => { res.statusCode = 500; res.end(String(e)); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/mcp`;
  try { await fn(url); } finally { await new Promise((r) => server.close(r)); }
}
const rpc = (url, key, body, method = 'POST') => fetch(url, {
  method,
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(key ? { authorization: `Bearer ${key}` } : {}) },
  body: method === 'POST' ? JSON.stringify(body) : undefined,
});
const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } };

test('HTTP: valid key can initialize, list tools and call a tool; invalid key and GET are refused', async () => {
  const { key, keyHash } = generateKey();
  const logs = [];
  await withServer({ repo: fakeRepo(), keyRing: parseKeyRing(`${keyHash}:test`), log: (e) => logs.push(e) }, async (url) => {
    const r1 = await rpc(url, key, init);
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.equal(j1.result.serverInfo.name, 'agentdebate-bench');

    const r2 = await rpc(url, key, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const j2 = await r2.json();
    assert.equal(j2.result.tools.length, 5);

    const r3 = await rpc(url, key, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_agents', arguments: { query: 'cryogenic' } } });
    const j3 = await r3.json();
    assert.equal(j3.result.isError, undefined);
    const payload = JSON.parse(j3.result.content[0].text);
    assert.equal(payload.agents[0].name, 'Cryogenic Dependency Failure Analyst');
    assert.ok(logs.some((e) => e.tool === 'search_agents' && e.key === 'test'), 'tool call audited with key label');

    const r4 = await rpc(url, key, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_agent', arguments: { name: 'Nobody' } } });
    const j4 = await r4.json();
    assert.equal(j4.result.isError, true);
    assert.match(j4.result.content[0].text, /No agent named "Nobody"/);

    const bad = await rpc(url, generateKey().key, init);
    assert.equal(bad.status, 401);
    const none = await rpc(url, null, init);
    assert.equal(none.status, 401);
    const get = await rpc(url, key, null, 'GET');
    assert.equal(get.status, 405);
  });
});

test('HTTP: rate limit surfaces as 429 with a JSON-RPC error', async () => {
  const { key, keyHash } = generateKey();
  const limiter = createRateLimiter({ max: 1, windowMs: 60000 });
  await withServer({ repo: fakeRepo(), keyRing: parseKeyRing(keyHash), limiter, log: () => {} }, async (url) => {
    assert.equal((await rpc(url, key, init)).status, 200);
    const r = await rpc(url, key, init);
    assert.equal(r.status, 429);
    const j = await r.json();
    assert.match(j.error.message, /Rate limit exceeded/);
  });
});
