import pg from 'pg';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { migrate } from '../server/migrate.js';
import { startAnalysisQueue } from '../server/analysisQueue.js';
import { createAnalysisService, workspaceDb } from '../server/analysisService.js';
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const name = `agentdebate_workflow_qa_${Date.now()}`;
let pool, stop;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.DATABASE_URL); url.pathname = '/' + name;
  pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
  await migrate(pool);
  const user = (await pool.query("INSERT INTO local_users(email,password_hash) VALUES ('qa@local.test','unused') RETURNING id")).rows[0];
  await pool.query("INSERT INTO profiles(id,display_name) VALUES ($1,'Workflow QA')", [user.id]);
  const workspace = (await pool.query("INSERT INTO workspaces(name,owner_id) VALUES ('Isolated QA',$1) RETURNING id", [user.id])).rows[0];
  await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'admin')", [workspace.id, user.id]);
  const db = await workspaceDb(pool, user.id, workspace.id);
  const scenario = await db.Scenario.create({ name: 'QA recovery', context_document: 'A test recovery exercise is planned.' });
  const agents = [];
  for (let i = 0; i < 3; i++) agents.push(await db.Agent.create({ name: `QA expert ${i}`, discipline: 'Recovery' }));
  const route = createAnalysisService(pool, { provider: 'mitre_aip', defaultModel: 'test-model' });
  const input = { mode: 'risk', question: 'Can recovery succeed?', scenario_id: scenario.id, agent_ids: agents.map(a => a.id) };
  const result = await route({ method: 'POST' }, user, new URL(`http://local/api/analyses?workspace_id=${workspace.id}`), async () => input);
  const factory = id => new Worker(new URL('../server/analysisWorker.js', import.meta.url), { workerData: { analysisJobId: id }, execArgv: ['--import', new URL('./fixtures/workflow-provider.mjs', import.meta.url).href], env: { ...process.env, DATABASE_URL: url.toString(), LLM_PROVIDER: 'mitre_aip', MITRE_AIP_MODEL: 'test-model', MITRE_AIP_API_KEY: 'test-only-placeholder' } });
  stop = await startAnalysisQueue(pool, factory);
  // Stop during execution, then start a new dispatcher against persisted state.
  await new Promise(resolve => setTimeout(resolve, 400));
  await stop(); stop = null;
  await new Promise(resolve => setTimeout(resolve, 150));
  const stopped = (await pool.query('SELECT status FROM analysis_jobs WHERE id=$1', [result.data.id])).rows[0];
  assert.equal(stopped.status, 'queued');
  stop = await startAnalysisQueue(pool, factory);
  const deadline = Date.now() + 30000;
  let row;
  while (Date.now() < deadline) {
    row = (await pool.query('SELECT * FROM analysis_jobs WHERE id=$1', [result.data.id])).rows[0];
    if (['failed', 'complete'].includes(row.status)) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(row.status, 'complete', row.error || 'Timed out');
  assert.equal(row.result.brief.actions.length, 1);
  assert.equal((await db.Session.list()).length, 1);
  const findings = await db.Threat.filter({ analysis_job_id: row.id });
  assert.equal(findings.length, row.result.brief.findings.length);
  assert.ok(findings.every(f => f.review_status === 'needs_review' && f.source_key));
  console.log('Native PostgreSQL queue and real worker passed: interrupted shutdown, automatic restart, both rounds, synthesis, and saved brief. Provider calls were mocked.');
} finally {
  if (stop) await stop();
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
