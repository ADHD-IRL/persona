# Local PostgreSQL and Node implementation

Updated October 14, 2026. The initial local-Supabase proposal has been replaced with standalone PostgreSQL and a Node HTTP server, as requested.

## Implemented

- Checksummed local schema migrations in `db/migrations`, derived from the existing application tables through panel mode. Supabase-specific auth functions, publications, and policies are replaced by local account/session tables and workspace RLS.
- `server/index.js` starts a pooled PostgreSQL connection, applies pending migrations, and hosts the frontend and API together.
- Local signup/sign-in/logout use scrypt and database-backed HttpOnly session cookies. Signup creates the profile, workspace, and membership atomically.
- Entity APIs retain CRUD, sorting, pagination, JSON/array values, and subscriptions. Authenticated workspace membership and role checks run before queries under a restricted PostgreSQL role. Forced RLS provides a second workspace boundary.
- Authenticated streaming Anthropic proxy and a PostgreSQL adapter for optional read-only MCP tools.
- Frontend Auth/Workspace contexts and data adapters now call the Node API. Supabase client and Vercel endpoints are removed from runtime source. Hosted Google signup and email confirmation are removed from the local signup flow.
- Dockerfile, PostgreSQL/application Compose services, and `.env.example`. PostgreSQL data persists in a named volume; exposed ports bind to loopback.
- Integration tests exercise the PostgreSQL engine with PGlite, including migrations, authentication, tenant access, roles, JSON values, SSE, proxy streaming, MCP queries, static hosting, and the browser data adapter.

## Local setup

Follow [README.md](../README.md). Install/start PostgreSQL or Docker, copy `.env.example` to `.env`, and set the database password and URL. Run `npm run db:migrate` and `npm run server:dev` for the backend and `npm run dev` for the frontend, or build/start the production server. `docker compose up --build -d` runs both services.

Docker and native PostgreSQL were not available on PATH during implementation. The PostgreSQL-engine integration suite and Node HTTP tests were run, but the Docker deployment still needs a smoke test on a machine with Docker. No production data or Supabase identities have been imported.

## MITRE LLM integration implemented

The server-side AIP adapter now supports bearer authentication, model discovery, streaming text, non-streaming tool calls, completion/error normalization, and usage reporting. Settings tests candidate models without persisting them and does not expose the server's AIP key. See [MITRE AIP setup](MITRE_AIP_SETUP.md).

Live AIP access still requires a server key, accessible model IDs, network/VPN reachability, and certificate trust verification. No live calls were made during implementation. Existing cloud data import, mail-based password recovery, enterprise SSO, and LAN/HTTPS deployment configuration remain separate work items.
