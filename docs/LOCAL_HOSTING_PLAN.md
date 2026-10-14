# AgentDebate-local: local database and hosting plan

Prepared October 14, 2026. This repository preserves AgentDebate history and includes the reviewed fixes. It has no Git remote configured. The original repository is unchanged by the copy operation. Runtime secrets, installed dependencies, and build output are not copied.

## Proposed architecture

Keep React/Vite and PostgreSQL. Run Supabase locally to retain the existing authentication, PostgREST database API, row-level security, and Realtime integration. A plain PostgreSQL or SQLite replacement would also require replacing those services and rewriting authentication and data access.

For development, use the Supabase CLI with Docker and Vite. For a persistent locally hosted installation, use the supported Supabase Docker Compose stack, a Node application server, and a reverse proxy serving the built frontend. The CLI development stack and persistent self-hosted stack are separate deployment targets.

Browser → local application server → Anthropic (AI requests)

Browser → local Supabase gateway → Auth / PostgREST / Realtime → PostgreSQL

Data is stored locally, but selected analysis context still leaves the machine when Anthropic is called. Fully offline AI is a separate phase requiring a provider abstraction and a compatible local model server. Wikipedia retrieval also needs an offline alternative or disabling.

## Current machine and repository

- Git, Node, and npm are available.
- Docker and Supabase CLI were not found on PATH. Check installation availability before setting up services.
- Database definitions are in `supabase/migrations/000_full_schema.sql` through `018_panel_mode.sql`.
- There is no `supabase/config.toml` yet.
- `src/lib/supabase.js` uses build-time `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `vite.config.js` proxies `/api/anthropic` during development.
- `api/anthropic.js` assumes the Vercel Edge request/response interface. `api/mcp.js` uses the Node HTTP interface. A normal static server does not execute either endpoint.
- The copied `.mcp.json` is disabled in this repository to avoid reusing cloud project connections. Configure local tooling explicitly after the local stack exists.
- Baseline copied from the reviewed source: 62 Node tests pass; lint and production builds pass. Dependencies must be installed separately in this new checkout.

## Phase 1 — reproducible local development

1. Install/enable Docker Desktop with the required Windows virtualization support. Install a pinned Supabase CLI as a development dependency. Inspect its `--help` before using commands.
2. Initialize local Supabase configuration with the CLI, preserving the existing migration files. Use a project identifier specific to AgentDebate-local. Bind development services to loopback.
3. Audit the migration sequence against a fresh local database. The consolidated `000` duplicates much of `001`–`010`; validate ordering, repeatability, helper functions, publication setup, and the retired library migration before deciding how to package the local bootstrap. Do not edit upstream migration history as a shortcut.
4. Configure local email/password signup, email confirmation behavior, redirects to the local frontend, and local test mail delivery. Keep Google OAuth optional.
5. Start the local stack, obtain its generated local URL and public client key, and place them in ignored `.env.local`. Start Vite. Do not reuse cloud credentials.
6. Create fresh local accounts and a workspace. Load sample data instead of copying production data automatically.

Acceptance: signup/sign-in work; the initial workspace is created once; queries use the local endpoint; two workspaces cannot read each other's data; viewer/admin permissions behave correctly; stopping the database produces a visible retry screen; Realtime messages arrive.

## Phase 2 — local hosting independent of Vercel

1. Add a Node HTTP server that serves `dist/`, supports SPA history fallback, and mounts the AI proxy. Adapt the Edge handler to standard Node requests while preserving streamed responses, errors, cancellation, request limits, and timeouts.
2. Mount the existing read-only MCP handler if needed. Configure its server-only service role key and workspace/key restrictions. Keep MCP optional for ordinary application use.
3. Add container build files, pinned service versions, health checks, and a Compose deployment using the official self-hosted Supabase configuration. Store database data in persistent volumes and secrets outside Git.
4. Choose localhost-only or trusted-LAN access. Use a reverse proxy with HTTPS for multi-user LAN access. Configure Auth site/redirect URLs and Realtime WebSocket proxying for that hostname. Frontend URLs must be reachable by the browser; Docker service names are for container-to-container traffic.
5. Build the frontend with the chosen local public endpoint and client key. Provide documented start, stop, backup, and restore commands. Vite preview is only a preview tool, not the permanent application host.

Acceptance: opening a nested session URL works; streamed AI text arrives incrementally; a failed AI request does not create a completed assessment; local data survives restart; MCP denies invalid keys; services use local database endpoints.

## Phase 3 — operations and optional import

1. Verify database backups by restoring into a separate disposable local instance, including the identity references used by profiles and workspaces.
2. Decide whether any cloud data should be imported. Review identity migration and workspace ownership separately from ordinary table data. Do not copy production credentials into the new installation by default.
3. Run `npm run verify`, add local integration tests for Auth/RLS/Realtime and the Node hosting adapter, and document the deployment environment.
4. Decide where workspace Anthropic secrets should live for local hosting. The current application exposes each workspace key to its members; server-only secret storage is a potential improvement requiring an authenticated AI endpoint.

## Decisions for implementation

The initial plan assumes local Supabase and cloud Anthropic, with localhost-only access during development. Before persistent hosting, choose the host machine, localhost versus LAN access, whether existing cloud records must be imported, and whether AI must also run offline.

## References

- [Supabase local development](https://supabase.com/docs/guides/local-development)
- [Supabase self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)

These instructions are a plan, not a completed local deployment. No database instance has been created or migrated yet.
