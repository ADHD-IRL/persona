// @ts-check
// R-N12 — MCP server assembly and the Node HTTP handler.
//
// Stateless Streamable HTTP: every POST gets a fresh McpServer and transport,
// so the function needs no session store and any instance can serve any
// request. GET (server-initiated SSE) is not offered.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { resolveBearer, requireScope } from './auth.js';
import { createRateLimiter } from './ratelimit.js';
import { buildTools } from './tools.js';

export const SERVER_INFO = { name: 'agentdebate-bench', version: '0.1.0' };

// Audit lines carry the key label, tool and a trimmed view of the arguments.
// They never include persona text.
function summarizeArgs(args) {
  const out = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = typeof v === 'string' && v.length > 80 ? `${v.slice(0, 77)}...` : v;
  }
  return out;
}

const defaultLog = (event) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

/**
 * @param {{ repo: any, ctx: { keyHash: string, label: string, scopes: string[] }, log?: (e: any) => void }} deps
 */
export function createMcpServer({ repo, ctx, log = defaultLog }) {
  const server = new McpServer(SERVER_INFO);
  for (const tool of buildTools(repo)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      async (args) => {
        const started = Date.now();
        try {
          requireScope(ctx, tool.scope);
          const result = await tool.handler(args ?? {}, ctx);
          log({ type: 'mcp_tool', key: ctx.label, tool: tool.name, args: summarizeArgs(args), ok: true, ms: Date.now() - started });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log({ type: 'mcp_tool', key: ctx.label, tool: tool.name, args: summarizeArgs(args), ok: false, error: message, ms: Date.now() - started });
          return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
        }
      }
    );
  }
  return server;
}

function jsonRpcError(res, status, code, message, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } }));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve(undefined);
      try { resolve(JSON.parse(text)); } catch { reject(new SyntaxError('Request body is not valid JSON')); }
    });
    req.on('error', reject);
  });
}

/**
 * Build a Node (req, res) handler. Vercel calls this directly; tests mount it
 * on a loopback http server.
 * @param {{ repo: any, keyRing: Map<string, { label: string }>, limiter?: ReturnType<typeof createRateLimiter>, log?: (e: any) => void }} deps
 */
export function createHttpHandler({ repo, keyRing, limiter = createRateLimiter(), log = defaultLog }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return jsonRpcError(res, 405, -32000, 'Method not allowed: this MCP endpoint is stateless and accepts POST only', { allow: 'POST' });
    }

    const ctx = resolveBearer(req.headers?.authorization, keyRing);
    if (!ctx) {
      log({ type: 'mcp_auth', ok: false, reason: req.headers?.authorization ? 'invalid key' : 'missing key' });
      return jsonRpcError(res, 401, -32001, 'Unauthorized: missing or invalid API key', { 'www-authenticate': 'Bearer realm="agentdebate-bench"' });
    }

    try {
      limiter.check(ctx.keyHash);
    } catch (err) {
      return jsonRpcError(res, 429, -32002, err instanceof Error ? err.message : String(err));
    }

    let body;
    try {
      body = req.body !== undefined ? req.body : await readJsonBody(req);
    } catch (err) {
      return jsonRpcError(res, 400, -32700, err instanceof Error ? err.message : String(err));
    }

    const server = createMcpServer({ repo, ctx, log });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };
}
