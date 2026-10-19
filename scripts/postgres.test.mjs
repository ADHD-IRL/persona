import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../server/migrate.js';
import { createApp } from '../server/app.js';
import { TABLES, loadColumns, entityOperation } from '../server/entities.js';
import { createPostgresRepo } from '../server/mcpRepo.js';
import { createWorkspaceDb } from '../src/lib/localDb.js';

// PGlite runs the PostgreSQL engine in-process. Serialize its single connection
// so the real Node handler can exercise the same transaction/pool contract.
function postgresPool(db) {
  let waiting = Promise.resolve();
  async function connect() {
    const previous = waiting;
    let release;
    waiting = new Promise(resolve => { release = resolve; });
    await previous;
    return {
      query: (sql, params) => params === undefined && sql.includes(';') ? db.exec(sql).then(results => results.at(-1)) : db.query(sql, params),
      release,
    };
  }
  return { connect, async query(sql, params) { const client = await connect(); try { return await client.query(sql, params); } finally { client.release(); } } };
}

test('standalone PostgreSQL schema and Node application', { timeout: 60000 }, async t => {
  const db = new PGlite();
  const pool = postgresPool(db);
  const temporary = await mkdtemp(join(tmpdir(), 'agentdebate-postgres-'));
  let server;
  try {
    await t.test('fresh migration applies and replay is a no-op', async () => {
      await migrate(pool);
      await migrate(pool);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM local_schema_migrations')).rows[0].count, 3);
      const columns = await loadColumns(pool);
      for (const table of Object.values(TABLES)) assert.ok(columns[table], `missing ${table}`);
      assert.ok(columns.agents.has('expertise_boundaries'));
      assert.ok(columns.session_agents.has('round2_likelihood'));
      assert.ok(columns.session_participants.has('cell'));
      assert.equal(columns.agents.has('is_library_sme'), false);
    });
    await t.test('migration checksum changes are rejected without destroying the schema', async () => {
      const original = await readFile(new URL('../db/migrations/001_local_postgres.sql', import.meta.url), 'utf8');
      await writeFile(join(temporary, '001_local_postgres.sql'), original + '\n-- changed\n');
      await assert.rejects(migrate(pool, pathToFileURL(temporary + '/')), /Applied migration changed/);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM local_users')).rows[0].count, 0);
    });
    await writeFile(join(temporary, 'index.html'), '<html><body>local app</body></html>');
    await writeFile(join(temporary, 'app.js'), 'console.log("asset");');
    const forwarded = [];
    server = createApp({ pool, dist: temporary, fetchUpstream: async (url, options) => {
      forwarded.push({ url, options });
      return new Response('data: {"type":"message_stop"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { cookie, method = 'GET', body, headers = {} } = {}) {
      const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
      return { response, status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json() };
    }
    let a, b, wsA, wsB, domain;
    await t.test('signup creates account, session, profile, and workspace atomically', async () => {
      a = await request('/api/auth/signup', { method: 'POST', body: { email: 'a@example.test', password: 'long-password-a', displayName: 'Alice' } });
      b = await request('/api/auth/signup', { method: 'POST', body: { email: 'b@example.test', password: 'long-password-b', displayName: 'Bob' } });
      assert.equal(a.status, 201); assert.equal(b.status, 201);
      assert.ok(a.response.headers.get('set-cookie').includes('HttpOnly'));
      assert.ok(!('password_hash' in a.data.user));
      wsA = (await request('/api/workspaces/current', { cookie: a.cookie })).data;
      wsB = (await request('/api/workspaces/current', { cookie: b.cookie })).data;
      assert.notEqual(wsA.id, wsB.id);
      assert.equal((await request('/api/auth/session', { cookie: a.cookie })).data.user.id, a.data.user.id);
      const stored = (await pool.query('SELECT password_hash FROM local_users WHERE id=$1', [a.data.user.id])).rows[0].password_hash;
      assert.ok(stored.startsWith('scrypt:')); assert.ok(!stored.includes('long-password'));
    });
    await t.test('login checks password and duplicate signup rolls back', async () => {
      assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'a@example.test', password: 'incorrect-password' } })).status, 401);
      assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'A@example.test', password: 'long-password-a' } })).status, 200);
      assert.equal((await request('/api/auth/signup', { method: 'POST', body: { email: 'a@example.test', password: 'long-password-a', displayName: 'Duplicate' } })).status, 409);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM workspaces')).rows[0].count, 2);
    });
    const path = (entity, workspace, id = '') => `/api/data/${entity}${id ? '/' + id : ''}?workspace_id=${workspace}`;
    await t.test('CRUD enforces workspace boundaries and JSON/array round trips', async () => {
      const result = await request(path('Domain', wsA.id), { cookie: a.cookie, method: 'POST', body: { name: 'Engineering' } });
      assert.equal(result.status, 201); domain = result.data;
      const agent = await request(path('Agent', wsA.id), { cookie: a.cookie, method: 'POST', body: { name: 'Systems SME', discipline: 'Engineering', domain_id: domain.id, tags: ['systems'], expertise_boundaries: { strong: ['systems'], weak: [] } } });
      assert.equal(agent.status, 201);
      assert.deepEqual(agent.data.tags, ['systems']); assert.deepEqual(agent.data.expertise_boundaries, { strong: ['systems'], weak: [] });
      assert.equal((await request(path('Domain', wsA.id), { cookie: b.cookie })).status, 403);
      assert.equal((await request(path('Domain', wsB.id, domain.id), { cookie: b.cookie })).status, 404);
      assert.equal((await request(path('Agent', wsB.id), { cookie: b.cookie, method: 'POST', body: { name: 'Intruder', discipline: 'Test', domain_id: domain.id } })).status, 400);
      assert.equal((await request(path('Domain', wsA.id, domain.id), { cookie: a.cookie, method: 'PATCH', body: { workspace_id: wsB.id } })).status, 400);
      assert.equal((await request(path('Domain', wsA.id, domain.id), { cookie: a.cookie, method: 'PATCH', body: { description: 'Updated' } })).data.description, 'Updated');
    });
    await t.test('viewer cannot write, analyst cannot perform admin deletes', async () => {
      await pool.query("INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,'viewer')", [wsA.id, b.data.user.id]);
      assert.equal((await request(path('Domain', wsA.id), { cookie: b.cookie })).status, 200);
      assert.equal((await request(path('Domain', wsA.id), { cookie: b.cookie, method: 'POST', body: { name: 'Blocked' } })).status, 403);
      assert.equal((await request(`/api/workspaces/${wsA.id}`, { cookie: b.cookie, method: 'PATCH', body: { anthropic_api_key: 'key' } })).status, 403);
      await pool.query("UPDATE workspace_members SET role='analyst' WHERE workspace_id=$1 AND user_id=$2", [wsA.id, b.data.user.id]);
      assert.equal((await request(path('Domain', wsA.id, domain.id), { cookie: b.cookie, method: 'DELETE' })).status, 403);
      assert.equal((await request(path('Domain', wsA.id, domain.id), { cookie: b.cookie, method: 'PATCH', body: { description: 'Analyst update' } })).status, 200);
    });
    await t.test('database RLS hides other workspaces even without an explicit WHERE', async () => {
      await pool.query('BEGIN');
      try {
        await pool.query('SET LOCAL ROLE agentdebate_app');
        await pool.query("SELECT set_config('app.workspace_id',$1,true),set_config('app.member_role','viewer',true)", [wsB.id]);
        assert.equal((await pool.query('SELECT * FROM domains')).rows.length, 0);
        await assert.rejects(pool.query('INSERT INTO domains (workspace_id,name) VALUES ($1,$2)', [wsA.id, 'forbidden']), /row-level security/);
      } finally { await pool.query('ROLLBACK'); }
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM domains')).rows[0].count, 1);
    });
    await t.test('query identifiers, paging, and payload fields are validated', async () => {
      assert.equal((await request(path('local_users', wsA.id), { cookie: a.cookie })).status, 404);
      assert.equal((await request(path('Domain', wsA.id) + '&sort=' + encodeURIComponent(JSON.stringify('name;DROP TABLE domains')), { cookie: a.cookie })).status, 400);
      assert.equal((await request(path('Domain', wsA.id) + '&limit=-1', { cookie: a.cookie })).status, 400);
      assert.equal((await request(path('Domain', wsA.id), { cookie: a.cookie, method: 'POST', body: { name: 'Test', unknown_column: 'bad' } })).status, 400);
      assert.equal((await request(path('Domain', wsA.id), { cookie: a.cookie, method: 'POST', body: { name: 'Test', id: domain.id } })).status, 400);
    });
    await t.test('all workspace entity tables can be queried with the standalone schema', async () => {
      const columns = await loadColumns(pool);
      for (const entity of Object.keys(TABLES)) assert.ok(Array.isArray(await entityOperation({ pool, columns, userId: a.data.user.id, workspaceId: wsA.id, entity, method: 'GET' })));
    });
    await t.test('browser data adapter pages beyond 500 rows and performs CRUD', async inner => {
      await pool.query("INSERT INTO scenarios (workspace_id,name) SELECT $1,'Scenario ' || n FROM generate_series(1,501) n", [wsA.id]);
      const originalFetch = globalThis.fetch;
      inner.mock.method(globalThis, 'fetch', (url, options = {}) => originalFetch(new URL(url, base), { ...options, headers: { ...options.headers, Cookie: a.cookie } }));
      const client = createWorkspaceDb(wsA.id);
      assert.equal((await client.Scenario.list('name')).length, 501);
      assert.equal((await client.Scenario.list('name', 3)).length, 3);
      const record = await client.Domain.create({ name: 'Adapter test' });
      assert.equal((await client.Domain.filter({ name: 'Adapter test' })).length, 1);
      assert.equal((await client.Domain.update(record.id, { name: 'Updated adapter test' })).name, 'Updated adapter test');
      await client.Domain.delete(record.id);
      assert.equal(await client.Domain.get(record.id), null);
      client.dispose();
    });
    await t.test('same-origin protections and authenticated AI streaming', async () => {
      assert.equal((await request('/api/auth/login', { method: 'POST', headers: { Origin: 'https://untrusted.test' }, body: { email: 'a@example.test', password: 'long-password-a' } })).status, 403);
      assert.equal((await request('/api/anthropic', { method: 'POST', body: { messages: [] } })).status, 401);
      assert.equal((await request('/api/anthropic', { cookie: a.cookie, method: 'POST', headers: { 'x-workspace-id': wsB.id, 'x-api-key': 'test-key' }, body: { messages: [] } })).status, 403);
      const response = await fetch(base + '/api/anthropic', { method: 'POST', headers: { Cookie: a.cookie, 'x-api-key': 'test-key', 'x-workspace-id': wsA.id, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [], stream: true }) });
      assert.equal(response.status, 200); assert.ok((await response.text()).includes('message_stop'));
      assert.equal(forwarded[0].options.headers['x-api-key'], 'test-key');
    });
    await t.test('SSE subscriptions require workspace membership', async () => {
      const controller = new AbortController();
      const response = await fetch(base + `/api/events?workspace_id=${wsA.id}`, { headers: { Cookie: a.cookie }, signal: controller.signal });
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      await reader.read();
      await request(path('Domain', wsA.id), { cookie: a.cookie, method: 'POST', body: { name: 'SSE test' } });
      assert.ok(new TextDecoder().decode((await reader.read()).value).includes('INSERT'));
      controller.abort(); reader.releaseLock();
      assert.equal((await request(`/api/events?workspace_id=${wsB.id}`, { cookie: a.cookie })).status, 403);
    });
    await t.test('MCP PostgreSQL adapter returns the configured workspace only', async () => {
      const repoA = createPostgresRepo(pool, wsA.id);
      const repoB = createPostgresRepo(pool, wsB.id);
      assert.equal((await repoA.listAgents()).total, 1);
      assert.equal((await repoB.listAgents()).total, 0);
      assert.equal((await repoA.searchAgents({ query: 'Systems' })).length, 1);
      assert.equal((await repoA.searchAgents({ query: '%' })).length, 0);
    });
    await t.test('static frontend serves root, deep links, and actual assets', async () => {
      assert.equal((await fetch(base + '/')).status, 200);
      assert.ok((await (await fetch(base + '/sessions/example')).text()).includes('local app'));
      assert.equal((await fetch(base + '/app.js')).headers.get('content-type'), 'text/javascript');
      assert.equal((await fetch(base + '/missing.js')).status, 404);
    });
    await t.test('logout revokes the server session immediately', async () => {
      assert.equal((await request('/api/auth/logout', { cookie: a.cookie, method: 'POST' })).status, 200);
      assert.equal((await request('/api/auth/session', { cookie: a.cookie })).data.user, null);
      assert.equal((await request(path('Domain', wsA.id), { cookie: a.cookie })).status, 401);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await db.close();
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep) && basename(temporary).startsWith('agentdebate-postgres-'));
    await rm(temporary, { recursive: true, force: true });
  }
});
