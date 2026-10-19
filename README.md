# AgentDebate-local

Multi-agent risk analysis with a React frontend, a local Node server, and standalone PostgreSQL. Supabase and Vercel are no longer runtime dependencies. The original database migrations are retained as schema history in `supabase/migrations`; the local migration is in `db/migrations`.

## Requirements

- Node.js 22 or newer and npm
- PostgreSQL 17, installed directly or run with Docker Compose
- A MITRE AIP API key, or an Anthropic key when that server provider is selected

MITRE AIP is supported through a server-side OpenAI-compatible adapter. See [MITRE AIP setup](docs/MITRE_AIP_SETUP.md) for credentials, model selection, tool capabilities, and certificate configuration. The server selects either MITRE AIP or Anthropic; database/application hosting remains local, while analysis context is sent to that configured provider.

## Running on this Windows machine

The app is running natively at [localhost:3000](http://localhost:3000), with PostgreSQL 17.11 on port 55432 and verified MITRE AIP access. See [local runtime instructions](docs/LOCAL_RUNNING.md) for restart and log locations.

## Run with Docker

Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`. Use a URL-safe password and update `DATABASE_URL` to match if you will also run Node outside Docker.

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Open [the application](http://localhost:3000). The Node server applies pending local migrations on startup. Create a local account; signup immediately signs you in and creates your workspace in one transaction. For MITRE AIP, configure the server key in `.env`, then refresh models and test the connection in Settings. For Anthropic, add the workspace key in Settings.

The database and app ports bind to `127.0.0.1`. PostgreSQL data lives in the `postgres_data` volume. `docker compose down` stops the services while retaining that volume. Removing the volume deletes local data.

## Develop locally

Start PostgreSQL with `docker compose up -d db`, or use an existing PostgreSQL installation and set `DATABASE_URL` in `.env`. The server's database user needs schema/role creation privileges for migrations. Application record queries switch to the restricted `agentdebate_app` role inside each transaction, where forced row-level security enforces the active workspace and member role.

```powershell
npm ci
npm run db:migrate
npm run server:dev
```

In a second terminal run `npm run dev` and open [Vite](http://localhost:5173). Vite forwards `/api` to the Node server on port 3000. For normal local hosting, run `npm run build` followed by `npm start`; Node serves the built application and its API together.

No frontend database credentials or cloud project URLs are needed. The server URL is same-origin. A server/database failure presents a retry screen.

## Authentication and access

Local email/password accounts use scrypt password hashes and random, hashed, expiring session tokens. Browser sessions use HttpOnly, SameSite cookies. Google OAuth and email confirmation from the previous hosted setup are removed from signup. Mail-based recovery and enterprise SSO are not configured in this local version.

Workspace reads require membership; analysts and admins can create/update records, and administrative deletes retain the original role restrictions. References to agents, sessions, scenarios, chains, and documents are checked against the active workspace. Pagination and typed JSON/array values are retained.

Workspace Anthropic keys remain shared with workspace members, matching the current product behavior; only admins can change them. The authenticated Node proxy streams provider output and cancels requests when the client disconnects. The MITRE AIP provider uses server-only credentials, authenticated model discovery, and the same workspace authorization boundary.

## Database lifecycle

`npm run db:migrate` applies the ordered, checksummed SQL files in `db/migrations` in one transaction. It runs again safely and rejects changed files that were already applied. New database changes belong in new migration files. Do not run the old Supabase migrations against the standalone database.

This migration creates a fresh local database. It does not copy cloud data or Supabase Auth identities. Importing existing data needs an explicit export and account/ownership mapping; that is separate from changing the application backend.

Back up the database using `pg_dump` or `docker compose exec -T db pg_dump -U agentdebate -d agentdebate`. Restore into a separate database and run migration checks before relying on a backup. For LAN hosting, configure an HTTPS reverse proxy, set `APP_ORIGIN`, enable secure cookies, and deliberately change the loopback port bindings.

## Verification

```powershell
npm run verify
```

Tests include actual PostgreSQL engine checks through PGlite: schema migration/replay, cookie authentication, workspace isolation, role restrictions, JSON values, cross-workspace references, and the Node HTTP endpoints. PGlite is a test dependency; production uses PostgreSQL through `pg`.

Optional read-only MCP access uses `MCP_WORKSPACE_ID` and `MCP_API_KEYS` on the Node server. Generate bearer keys with `node scripts/mcp-key.mjs`; the PostgreSQL MCP adapter scopes every query to the configured local workspace. Cloud MCP tooling remains disabled in `.mcp.json`.

