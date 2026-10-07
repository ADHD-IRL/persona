# AgentDebate bench as an MCP server (R-N12)

`POST /api/mcp` serves the agent bench read-only to any MCP client over
Streamable HTTP. It runs as a Vercel Node function next to the app and reads
the same Supabase project the app uses, scoped to one workspace.

## Tools

| Tool | What it returns |
|---|---|
| `list_domains` | Domain names with agent counts. Domain names are the filter values for the other tools. |
| `list_agents` | Compact summaries (id, name, discipline, role type, level, style, severity, tags, domain), paged, filterable by domain, role type and expertise level. |
| `search_agents` | Free-text search over name, discipline, tags, red-team focus and persona text; ranked, with the field that matched. |
| `get_agent` | One full persona by id or exact name: all persona-bearing columns, plus `id` and `domain`. |
| `export_agents` | The portable `agentdebate.personas` v1 payload (same shape as the in-app Export button), optionally filtered by domain and role type. No ids or workspace references. |

Role types: `sme` is a blue-team expert, `challenger` is a red-team reviewer,
`moderator` is reserved.

## Server configuration

Set these in the Vercel project (Settings → Environment Variables). None of
them may appear in the browser bundle, so do not prefix them with `VITE_`.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL. Falls back to `VITE_SUPABASE_URL` if unset. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. The function only reads, and every query carries the workspace filter; this key is still privileged and must never be exposed. |
| `MCP_WORKSPACE_ID` | The workspace whose bench is served. |
| `MCP_API_KEYS` | Comma-separated client key hashes, each `sha256hex[:label]`. |

A missing variable produces a 500 whose message names it.

## Issuing a client key

```bash
node scripts/mcp-key.mjs claude-desktop
```

This prints the plaintext key once (`adb_live_...`) for the client, and the
`hash:label` entry to append to `MCP_API_KEYS`. Only the hash lives on the
server. To revoke a key, remove its entry and redeploy.

## Connecting a client

Claude Code:

```bash
claude mcp add --transport http agentdebate https://<deployment>/api/mcp --header "Authorization: Bearer adb_live_..."
```

Any client that speaks MCP Streamable HTTP works the same way: POST JSON-RPC
to the URL with the bearer header. The endpoint is stateless, so no session id
is issued and `GET` (server-initiated streaming) is not offered.

## Limits and behaviour

- Read-only. Nothing in `api/_mcp/` writes to the database.
- Workspace scoping is the access boundary: the function uses the service
  role, so RLS does not apply; `repo.js` adds `workspace_id = MCP_WORKSPACE_ID`
  to every query.
- Rate limit: 120 requests per minute per key, per function instance, in
  memory. Exceeding it returns HTTP 429 with a JSON-RPC error.
- Audit: every tool call logs one JSON line to the Vercel function logs with
  the key label, tool name, trimmed arguments and outcome. Persona text is
  never logged.
- Search is pattern matching over text columns (no full-text index). It is
  adequate for a bench of a few thousand agents; semantic search would need a
  vector extension and is out of scope here.
- `export_agents` caps at 500 personas per call; export one domain at a time
  for the whole bench.

## Tests

```bash
node scripts/mcp.test.mjs
```

Offline. Fakes the repo in memory and drives the real HTTP handler over a
loopback server through initialize, tools/list and tools/call, including the
401, 405 and 429 paths.
