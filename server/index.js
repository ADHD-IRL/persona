import { startAnalysisQueue } from './analysisQueue.js';
import { providerConfig } from './llmProvider.js';
import pg from 'pg';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { createPostgresRepo } from './mcpRepo.js';
import { createHttpHandler } from '../api/_mcp/server.js';
import { parseKeyRing } from '../api/_mcp/auth.js';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env. See README.md for local PostgreSQL setup.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
pool.on('error', error => console.error('PostgreSQL connection error:', error.code || error.name));
await migrate(pool);
const stopAnalysisQueue = await startAnalysisQueue(pool);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const origins = [process.env.APP_ORIGIN || `http://localhost:${port}`, `http://127.0.0.1:${port}`];
if (process.env.NODE_ENV !== 'production') origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
const mcpHandler = process.env.MCP_WORKSPACE_ID && process.env.MCP_API_KEYS
  ? createHttpHandler({ repo: createPostgresRepo(pool, process.env.MCP_WORKSPACE_ID), keyRing: parseKeyRing(process.env.MCP_API_KEYS) }) : null;
const server = createApp({ pool, dist: resolve('dist'), secureCookies: process.env.COOKIE_SECURE === 'true', origins, mcpHandler, llmConfig: providerConfig(process.env) });
server.listen(port, host, () => console.log(`AgentDebate-local listening at http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await stopAnalysisQueue();
  server.close(async () => { await pool.end(); process.exit(0); });
  server.closeAllConnections();
});
