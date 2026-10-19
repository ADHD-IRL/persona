import { createVerificationService } from './verificationService.js';
import { createRiskService } from './riskService.js';
import { createAnalysisService } from './analysisService.js';
import { providerConfig, createLLMProvider } from './llmProvider.js';
import { once } from 'node:events';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TABLES, httpError, uuid, loadColumns, entityOperation, withWorkspace } from './entities.js';
import { hashPassword, verifyPassword, newToken, hashToken, sessionToken, sessionCookie, validateCredentials } from './auth.js';

const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
export function createApp({ pool, dist = resolve('dist'), fetchUpstream = fetch, secureCookies = false, origins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'], mcpHandler = null, llmConfig = providerConfig() }) {
  const llmProvider = createLLMProvider(llmConfig, fetchUpstream);
  const analysisRoute = createAnalysisService(pool, llmConfig);
  const riskRoute = createRiskService(pool);
  const verificationRoute = createVerificationService(pool, llmProvider);
  const subscribers = new Set();
  const attempts = new Map();
  let columnsPromise;
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const rateLimit = key => {
    const now = Date.now();
    for (const [k, entry] of attempts) if (entry.until < now) attempts.delete(k);
    const entry = attempts.get(key) ?? { count: 0, until: now + 60000 };
    attempts.set(key, entry);
    if (++entry.count > 20) throw httpError(429, 'Too many requests. Try again in a minute.');
  };
  async function body(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) throw httpError(413, 'Request is too large.');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch { throw httpError(400, 'Invalid JSON request.'); }
  }
  async function currentUser(req) {
    const token = sessionToken(req);
    if (!token) return null;
    const { rows } = await pool.query('SELECT u.id,u.email,p.display_name FROM local_sessions s JOIN local_users u ON u.id=s.user_id JOIN profiles p ON p.id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()', [hashToken(token)]);
    return rows[0] ?? null;
  }
  async function startSession(client, userId, res) {
    const token = newToken();
    await client.query('DELETE FROM local_sessions WHERE expires_at<=now()');
    await client.query("INSERT INTO local_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '7 days')", [hashToken(token), userId]);
    res.setHeader('Set-Cookie', sessionCookie(token, secureCookies));
  }
  function publish(workspaceId, table, eventType, row) {
    for (const sub of subscribers) if (sub.workspaceId === workspaceId) {
      // Recheck permission before delivering even a record identifier.
      sub.pending = sub.pending.then(async () => {
        if (sub.closed) return;
        if (!(await currentUser(sub.req)) || !(await pool.query('SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspaceId, sub.userId])).rows.length) { sub.res.end(); return; }
        if (!sub.res.write(`data: ${JSON.stringify({ table, eventType, new: eventType === 'DELETE' ? {} : { id: row.id }, old: eventType === 'DELETE' ? { id: row.id } : {} })}\n\n`)) sub.res.end();
      }).catch(() => sub.res.end());
    }
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin && !origins.includes(req.headers.origin)) throw httpError(403, 'Request origin is not allowed.');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw httpError(403, 'Cross-site requests are not allowed.');
      }
      if (url.pathname === '/api/health') {
        await pool.query('SELECT 1');
        return json(res, 200, { status: 'ok', database: 'postgresql' });
      }
      if (url.pathname === '/api/mcp') {
        if (!mcpHandler) throw httpError(503, 'MCP is not configured.');
        return await mcpHandler(req, res);
      }
      if (['/api/auth/signup', '/api/auth/login'].includes(url.pathname) && req.method === 'POST') {
        rateLimit(req.socket.remoteAddress);
        const input = await body(req);
        const email = validateCredentials(input);
        const signup = url.pathname.endsWith('signup');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          let user;
          if (signup) {
            if (typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 200) throw httpError(400, 'Enter your name.');
            const passwordHash = await hashPassword(input.password);
            const result = await client.query('INSERT INTO local_users (email,password_hash) VALUES ($1,$2) RETURNING id,email', [email, passwordHash]);
            user = { ...result.rows[0], display_name: input.displayName.trim() };
            await client.query('INSERT INTO profiles (id,display_name) VALUES ($1,$2)', [user.id, user.display_name]);
            const workspace = await client.query("INSERT INTO workspaces (name,owner_id) VALUES ('My Workspace',$1) RETURNING id", [user.id]);
            await client.query("INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,'admin')", [workspace.rows[0].id, user.id]);
          } else {
            const result = await client.query('SELECT u.id,u.email,u.password_hash,p.display_name FROM local_users u JOIN profiles p ON p.id=u.id WHERE email=$1', [email]);
            const candidate = result.rows[0];
            // Run the same KDF for absent accounts to avoid a fast email lookup oracle.
            const valid = await verifyPassword(input.password, candidate?.password_hash || `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
            if (!candidate || !valid) throw httpError(401, 'Email or password is incorrect.');
            user = { id: candidate.id, email: candidate.email, display_name: candidate.display_name };
          }
          await startSession(client, user.id, res);
          await client.query('COMMIT');
          return json(res, signup ? 201 : 200, { user });
        } catch (error) {
          await client.query('ROLLBACK');
          res.removeHeader('Set-Cookie');
          if (error.code === '23505') throw httpError(409, 'An account with this email already exists.');
          throw error;
        } finally { client.release(); }
      }
      if (url.pathname === '/api/auth/session' && req.method === 'GET') return json(res, 200, { user: await currentUser(req) });
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        const token = sessionToken(req);
        if (token) await pool.query('DELETE FROM local_sessions WHERE token_hash=$1', [hashToken(token)]);
        res.setHeader('Set-Cookie', `agd_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookies ? '; Secure' : ''}`);
        return json(res, 200, { ok: true });
      }
      if (url.pathname.startsWith('/api/')) {
        const user = await currentUser(req);
        if (!user) throw httpError(401, 'Sign in to continue.');
        if (url.pathname === '/api/workspaces/current' && req.method === 'GET') {
          const { rows } = await pool.query('SELECT w.*,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.created_at,w.id', [user.id]);
          const workspace = rows.find(w => w.id === url.searchParams.get('preferred')) ?? rows[0];
          if (!workspace) throw httpError(404, 'No workspace membership is available.');
          return json(res, 200, workspace);
        }
        const workspaceRoute = /^\/api\/workspaces\/([^/]+)$/.exec(url.pathname);
        if (workspaceRoute) {
          const workspaceId = uuid(workspaceRoute[1]);
          const membership = await pool.query('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspaceId, user.id]);
          if (!membership.rows.length) throw httpError(403, 'Workspace access denied.');
          if (req.method === 'GET') {
            const { rows } = await pool.query('SELECT * FROM workspaces WHERE id=$1', [workspaceId]);
            return json(res, 200, rows[0]);
          }
          if (req.method !== 'PATCH') throw httpError(405, 'Method not allowed.');
          if (membership.rows[0].role !== 'admin') throw httpError(403, 'Only workspace admins can change settings.');
          const input = await body(req);
          if (Object.keys(input).some(key => key !== 'anthropic_api_key') || typeof input.anthropic_api_key !== 'string' || input.anthropic_api_key.length > 512) throw httpError(400, 'Invalid workspace settings.');
          const { rows } = await pool.query('UPDATE workspaces SET anthropic_api_key=$1 WHERE id=$2 RETURNING *', [input.anthropic_api_key.trim(), workspaceId]);
          return json(res, 200, rows[0]);
        }
        if (url.pathname === '/api/events' && req.method === 'GET') {
          const workspaceId = url.searchParams.get('workspace_id');
          await withWorkspace(pool, user.id, workspaceId, false, async () => {});
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.write(': connected\n\n');
          const sub = { req, res, userId: user.id, workspaceId, pending: Promise.resolve(), closed: false };
          subscribers.add(sub);
          const heartbeat = setInterval(async () => {
            try {
              if (!(await currentUser(req)) || !(await pool.query('SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspaceId, user.id])).rows.length) res.end();
              else res.write(': heartbeat\n\n');
            } catch { res.end(); }
          }, 20000);
          heartbeat.unref();
          res.on('close', () => { sub.closed = true; clearInterval(heartbeat); subscribers.delete(sub); });
          return;
        }
        if(url.pathname.startsWith('/api/verification/') && req.method==='POST') rateLimit('verification:'+user.id);
        const verificationResponse = await verificationRoute(req,user,url,body);
        if(verificationResponse) return json(res,verificationResponse.status,verificationResponse.data);
        const riskResponse = await riskRoute(req, user, url, body);
        if (riskResponse) return json(res, riskResponse.status, riskResponse.data);
        const analysisResponse = await analysisRoute(req, user, url, body);
        if (analysisResponse) return json(res, analysisResponse.status, analysisResponse.data);
        const dataRoute = /^\/api\/data\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);
        if (dataRoute) {
          const [, entity, id] = dataRoute;
          const workspaceId = url.searchParams.get('workspace_id');
          columnsPromise ??= loadColumns(pool).catch(error => { columnsPromise = null; throw error; });
          let filters = {}, sort;
          try {
            filters = JSON.parse(url.searchParams.get('filters') || '{}');
            sort = JSON.parse(url.searchParams.get('sort') || 'null');
          } catch { throw httpError(400, 'Invalid query options.'); }
          if (!filters || Array.isArray(filters) || typeof filters !== 'object') throw httpError(400, 'Invalid filters.');
          const result = await entityOperation({ pool, columns: await columnsPromise, userId: user.id, workspaceId, entity, id, method: req.method, filters, sort, limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset') || 0, payload: ['POST', 'PATCH'].includes(req.method) ? await body(req) : {} });
          if (req.method !== 'GET') publish(workspaceId, TABLES[entity], req.method === 'POST' ? 'INSERT' : req.method === 'PATCH' ? 'UPDATE' : 'DELETE', result);
          return json(res, req.method === 'POST' ? 201 : 200, result);
        }
        if (['/api/llm/config', '/api/llm/models'].includes(url.pathname) && req.method === 'GET') {
          await withWorkspace(pool, user.id, url.searchParams.get('workspace_id'), false, async () => {});
          if (url.pathname.endsWith('/config')) return json(res, 200, llmProvider.config);
          rateLimit('models:' + user.id);
          if (llmConfig.provider !== 'mitre_aip') return json(res, 200, { models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'] });
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);
          res.on('close', () => controller.abort());
          try { return json(res, 200, { models: await llmProvider.listModels(controller.signal) }); }
          catch (error) { if (controller.signal.aborted && !res.destroyed) throw httpError(504, 'Model discovery timed out.'); throw error; }
          finally { clearTimeout(timer); }
        }
        if (['/api/llm/messages', '/api/anthropic'].includes(url.pathname) && req.method === 'POST') {
          rateLimit('ai:' + user.id);
          await withWorkspace(pool, user.id, req.headers['x-workspace-id'], false, async () => {});
          const input = await body(req);
          if (!input || Array.isArray(input) || typeof input !== 'object') throw httpError(400, 'Expected a model request object.');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 600000);
          res.on('close', () => controller.abort());
          try {
            if (llmConfig.provider === 'mitre_aip') {
              if (!input.stream) return json(res, 200, await llmProvider.complete(input, controller.signal));
              const iterator = llmProvider.stream(input, controller.signal);
              try {
                const first = await iterator.next();
                res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
                if (!first.done) res.write('data: ' + JSON.stringify(first.value) + '\n\n');
                for await (const event of iterator) {
                  if (!res.write('data: ' + JSON.stringify(event) + '\n\n')) await once(res, 'drain', { signal: controller.signal });
                }
                res.end();
              } catch (error) {
                if (!res.headersSent) throw error;
                if (!res.destroyed && !res.writableEnded) {
                  res.write('data: ' + JSON.stringify({ type: 'error', error: { message: controller.signal.aborted ? 'Model request cancelled or timed out.' : error.message } }) + '\n\n');
                  res.end();
                }
              } finally { await iterator.return?.(); }
              return;
            }
            const key = req.headers['x-api-key'];
            if (!key || key.length > 512) throw httpError(400, 'Configure your Anthropic API key in Settings.');
            const upstream = await fetchUpstream('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(input), signal: controller.signal });
            res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
            if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
            else res.end();
          } catch (error) {
            if (controller.signal.aborted && !res.destroyed && !res.headersSent) throw httpError(504, 'Model request timed out.');
            throw error;
          } finally { clearTimeout(timer); }
          return;
        }
        throw httpError(404, 'API endpoint not found.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw httpError(405, 'Method not allowed.');
      const requested = decodeURIComponent(url.pathname);
      const file = resolve(dist, requested === '/' ? 'index.html' : `.${requested}`);
      if (!file.startsWith(resolve(dist) + sep)) throw httpError(404, 'File not found.');
      let target = file;
      try { if (!(await stat(target)).isFile()) throw new Error('not a file'); }
      catch {
        if (extname(requested)) throw httpError(404, 'File not found.');
        target = resolve(dist, 'index.html');
      }
      let data;
      try { data = await readFile(target); }
      catch { throw httpError(503, 'Build the frontend with npm run build before serving the application.'); }
      res.writeHead(200, { 'Content-Type': contentTypes[extname(target)] || 'application/octet-stream', 'Cache-Control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error.status || (['23503', '23514', '22P02', '23502'].includes(error.code) ? 400 : error.code === '23505' ? 409 : 500);
      if (status === 500) console.error('Server request failed:', error.code || error.name);
      json(res, status, { error: status === 500 ? 'Server error. Check the database connection and server logs.' : error.message });
    }
  });
  server.on('close', () => { for (const sub of subscribers) sub.res.end(); });
  return server;
}
