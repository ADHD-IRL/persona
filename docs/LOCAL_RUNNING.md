# Running locally on this machine

The application was started and verified on October 14, 2026.

- App: http://localhost:3000
- Native PostgreSQL: 127.0.0.1:55432, version 17.11
- Database, binaries, and logs: `%LOCALAPPDATA%\AgentDebate-local`
- AI: MITRE AIP, default model `gpt-oss-120b`
- AIP streaming, tool calls, and usage reporting were verified live.
- The provided key and generated database password are stored in ignored `.env`; neither is part of Git.

Open the app and create your account. Temporary smoke-test accounts and records were removed.

The setup uses the managed Windows certificate store (`--use-system-ca`) and keeps PostgreSQL data outside OneDrive. PostgreSQL and Node run as local processes; no Windows service was installed and ports bind to loopback.

## Start again

From this repository in PowerShell, after any stopped processes:

```powershell
./scripts/start-native-local.ps1 -RepositoryPath .
```

This script uses the already downloaded PostgreSQL binaries and existing database. The native setup expects the current `.env` database URL on port 55432. The server loads `.env` and applies pending migrations on startup.

To stop the application, inspect the Node PID recorded in `%LOCALAPPDATA%\AgentDebate-local\app.pid`, confirm that it is this app's process, and stop that process. Stop the database with:

```powershell
& "$env:LOCALAPPDATA/AgentDebate-local/postgres/pgsql/bin/pg_ctl.exe" stop -D "$env:LOCALAPPDATA/AgentDebate-local/postgres-data" -m fast -w
```

Application output is in `app.stdout.log` and `app.stderr.log`; PostgreSQL output is in `postgres.log` in the same local runtime directory. The database data directory is `postgres-data` and survives application shutdown.

## Verification performed

The local health endpoint reported PostgreSQL ready. A temporary account successfully signed up, created a workspace, and wrote a scenario, an agent, and a panel session to native PostgreSQL. An authenticated request through the running Node server completed an AIP stream and returned OK. The test account and its workspace were removed afterward.

Model discovery, direct text generation, streaming, tool-call output, and usage were verified with the supplied AIP key. Tool support is enabled for the verified default model. Other selected models need their own capability checks. Docker deployment remains untested; this machine is running the native setup.
