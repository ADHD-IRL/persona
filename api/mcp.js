// R-N12 — Vercel Node function: read-only MCP endpoint over the agent bench.
//
// POST https://<deployment>/api/mcp  with  Authorization: Bearer adb_live_...
//
// Server environment (set in Vercel, never in the browser bundle):
//   SUPABASE_URL                 project URL (falls back to VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    service role key — read-only use, scoped by workspace in code
//   MCP_WORKSPACE_ID             the workspace whose bench is served
//   MCP_API_KEYS                 comma-separated sha256 hashes, "hash[:label]" (see scripts/mcp-key.mjs)
import { createClient } from '@supabase/supabase-js';
import { createHttpHandler } from './_mcp/server.js';
import { parseKeyRing } from './_mcp/auth.js';
import { createRepo } from './_mcp/repo.js';

export const config = { maxDuration: 60 };

let cached = null;

function boot() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const missing = ['SUPABASE_SERVICE_ROLE_KEY', 'MCP_WORKSPACE_ID', 'MCP_API_KEYS'].filter((k) => !process.env[k]);
  if (!url) missing.unshift('SUPABASE_URL');
  if (missing.length) {
    throw new Error(`MCP endpoint is not configured: missing ${missing.join(', ')}`);
  }
  const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createHttpHandler({
    repo: createRepo({ supabase, workspaceId: process.env.MCP_WORKSPACE_ID }),
    keyRing: parseKeyRing(process.env.MCP_API_KEYS),
  });
}

export default async function handler(req, res) {
  try {
    cached ??= boot();
  } catch (err) {
    // Configuration errors name the missing variable so the fix is obvious
    // from the response alone; nothing secret is echoed.
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32003, message: err.message } }));
  }
  return cached(req, res);
}
