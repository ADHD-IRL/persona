import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../server/migrate.js';
import { createAnalysisService, buildSnapshot, fingerprint, workspaceDb } from '../server/analysisService.js';
import { executeAnalysis } from '../server/analysisWorker.js';
import { readiness, recommendPanel, optionInputs, validateBrief } from '../src/lib/analysisWorkflow.js';
import { setServerTransport } from '../src/lib/llm.js';

const agents = [1, 2, 3].map(i => ({ id: `agent-${i}`, name: `Expert ${i}`, discipline: `Discipline ${i}`, persona_description: 'Infrastructure resilience', severity_default: 'MEDIUM' }));
const brief = { headline: 'Verify recovery assumptions', findings: [{ title: 'Recovery needs testing', impact: 'Availability is uncertain', basis: 'MODEL_INFERENCE', references: [] }], disagreements: [], revisit: ['Measure recovery time'], actions: [{ title: 'Run a recovery exercise', completion_criteria: 'Record observed recovery time', evidence_ids: ['scenario'] }] };
test('panel suggestions diversify disciplines and readiness rejects ambiguous comparisons', () => {
  const panel = recommendPanel([...agents, { ...agents[0], id: 'duplicate', name: 'Other' }], 'Infrastructure');
  assert.equal(new Set(panel.slice(0, 3).map(a => a.discipline)).size, 3);
  const checks = readiness({ mode: 'compare', question: 'Choose', scenario: { context_document: 'Details' }, agents, decision: {}, options: [{ name: 'A' }, { name: 'A' }] });
  assert.ok(checks.errors.some(e => e.includes('acceptance')));
  assert.ok(checks.errors.some(e => e.includes('distinct')));
});
test('option reuse invalidates changed criteria, persona, model, knowledge and assumptions but not other options', () => {
  const base = { decision: { acceptance_criteria: '24 hours' }, agents, model: 'model-a', knowledge: [], assumptions: [], options: [{ id: 'a' }, { id: 'b' }] };
  const hash = fingerprint(optionInputs(base, base.options[0]));
  assert.equal(hash, fingerprint(optionInputs({ ...base, options: [{ id: 'a' }, { id: 'c' }] }, base.options[0])));
  for (const patch of [{ model: 'b' }, { decision: { acceptance_criteria: '1 hour' } }, { agents: [{ ...agents[0], persona_description: 'Changed' }] }, { knowledge: [{ content: 'New fact' }] }, { assumptions: [{ text: 'Changed' }] }]) assert.notEqual(hash, fingerprint(optionInputs({ ...base, ...patch }, base.options[0])));
});
test('brief validation rejects fabricated references and downgrades unsupported supplied evidence', () => {
  const evidence = [{ id: 's', kind: 'supplied', text: 'The recovery exercise took six hours.' }];
  const result = validateBrief({ ...brief, findings: [{ title: 'x', basis: 'SUPPLIED_EVIDENCE', references: [{ id: 's', quote: 'Fabricated recovery result' }, { id: 'unknown', quote: 'The recovery exercise took six hours.' }] }, { title: 'y', basis: 'SUPPLIED_EVIDENCE', references: [{ id: 's', quote: 'The recovery exercise took six hours.' }] }] }, evidence);
  assert.equal(result.findings[0].basis, 'MODEL_INFERENCE');
  assert.equal(result.findings[0].references.length, 0);
  assert.equal(result.findings[1].basis, 'SUPPLIED_EVIDENCE');
});
test('runner resumes a failed round, preserves finished work and reuses unchanged evidence', async () => {
  let count = 0, fail = true;
  setServerTransport(async () => { count++; if (fail && count === 2) throw new Error('Interrupted'); return 'Recovery assessment.\nSEVERITY: MEDIUM\nCONFIDENCE: 60\nLIKELIHOOD: 3\nIMPACT: 3'; });
  const tables = {}, db = {};
  for (const entity of ['Session', 'SessionAgent', 'SessionSynthesis', 'Chain', 'Threat', 'AppConfig']) {
    tables[entity] = [];
    db[entity] = {
      get: async id => { const r = tables[entity].find(r => r.id === id); if (!r) throw new Error('Missing'); return r; },
      create: async data => { const row = { ...data, id: `${entity}-${tables[entity].length}` }; tables[entity].push(row); return row; },
      update: async (id, data) => Object.assign(await db[entity].get(id), data),
      filter: async fields => tables[entity].filter(r => Object.entries(fields).every(([k, v]) => r[k] === v)),
    };
  }
  const snapshot = { question: 'Assess recovery', mode: 'risk', constraints: 'One day', scenario: { id: 's', context_document: 'Infrastructure recovery exercise' }, agents, assumptions: [], threats: [], knowledge: [], options: [], decision: null, model: 'model' };
  const job = { id: 'job-1', snapshot, checkpoints: {} };
  const save = async patch => Object.assign(job, structuredClone(patch));
  try {
    await assert.rejects(executeAnalysis({ job, db, save, complete: async () => JSON.stringify(brief) }), /Interrupted/);
    assert.equal(tables.Session.length, 1);
    assert.ok(tables.SessionAgent[0].round1_assessment);
    fail = false;
    const before = count;
    let verified=0;
    const result = await executeAnalysis({ job, db, save, verify: async sessionId => { verified++; assert.ok(tables.Threat.some(t=>t.session_id===sessionId)); assert.equal(job.progress.stage,'verification'); }, complete: async () => JSON.stringify(brief) });
    assert.equal(verified,1);
    assert.equal(count - before, 6); // two remaining R1, three R2, one synthesis
    assert.equal(tables.Session.length, 1);
    assert.equal(job.status, 'complete');
    const next = { ...job, id: 'job-2', checkpoints: {} };
    const calls = count;
    const reused = await executeAnalysis({ job: next, db, save: async patch => Object.assign(next, patch), previous: [job], complete: async () => JSON.stringify(brief) });
    assert.equal(count, calls);
    assert.equal(reused.sessions[0].reused, true);
    assert.equal(result.brief.actions.length, 1);
    const savedFindingCount = tables.Threat.length;
    await executeAnalysis({ job, db, save, complete: async () => { throw new Error('A saved brief must not be regenerated during persistence retries'); } });
    assert.equal(tables.Threat.length, savedFindingCount, 'resuming saved findings must not duplicate them');
    tables.SessionAgent[0].round2_rebuttal = 'Changed after completion';
    const third = { ...job, id: 'job-3', checkpoints: {} };
    await executeAnalysis({ job: third, db, save: async patch => Object.assign(third, patch), previous: [job], complete: async () => JSON.stringify(brief) });
    assert.equal(tables.Session.length, 2, 'edited evidence must be regenerated');
  } finally { setServerTransport(null); }
});

function pgPool(engine) {
  let queue = Promise.resolve();
  return {
    async connect() { const prior = queue; let release; queue = new Promise(r => { release = r; }); await prior; return { query: (sql, args) => args === undefined && sql.includes(';') ? engine.exec(sql).then(r => r.at(-1)) : engine.query(sql, args), release }; },
    async query(sql, args) { const client = await this.connect(); try { return await client.query(sql, args); } finally { client.release(); } },
  };
}
test('PostgreSQL jobs enforce membership, read-only roles, deduplication, freshness, resume and action idempotency', { timeout: 60000 }, async () => {
  const engine = new PGlite(), pool = pgPool(engine);
  try {
    await migrate(pool);
    const user = (await pool.query("INSERT INTO local_users(email,password_hash) VALUES ('owner@test','unused') RETURNING id")).rows[0];
    const outsider = (await pool.query("INSERT INTO local_users(email,password_hash) VALUES ('other@test','unused') RETURNING id")).rows[0];
    await pool.query("INSERT INTO profiles(id,display_name) VALUES ($1,'Owner'),($2,'Viewer')", [user.id, outsider.id]);
    const workspace = (await pool.query("INSERT INTO workspaces(name,owner_id) VALUES ('Test',$1) RETURNING id", [user.id])).rows[0];
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'admin')", [workspace.id, user.id]);
    const db = await workspaceDb(pool, user.id, workspace.id);
    const scenario = await db.Scenario.create({ name: 'Recovery', context_document: 'Recovery exercise results pending' });
    const panel = [];
    for (const a of agents) panel.push(await db.Agent.create({ name: a.name, discipline: a.discipline }));
    const input = { mode: 'risk', question: 'Can we recover?', scenario_id: scenario.id, agent_ids: panel.map(a => a.id) };
    const service = createAnalysisService(pool, { provider: 'mitre_aip', defaultModel: 'model' });
    const call = (method, suffix = '', body = {}, actor = user) => service({ method }, actor, new URL(`http://local/api/analyses${suffix}?workspace_id=${workspace.id}`), async () => body);
    await assert.rejects(call('POST', '', input, outsider), /permission/);
    const created = (await call('POST', '', input)).data;
    assert.equal(created.status, 'queued');
    assert.equal((await call('POST', '', input)).data.id, created.id);
    await assert.rejects(call('GET', `/${created.id}`, {}, outsider), /permission/);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'viewer')", [workspace.id, outsider.id]);
    assert.equal((await call('GET', `/${created.id}`, {}, outsider)).data.id, created.id);
    const statusOnly=(await service({method:'GET'},outsider,new URL('http://local/api/analyses/'+created.id+'?workspace_id='+workspace.id+'&status=1'),async()=>({}))).data;
    assert.equal(statusOnly.status,'queued');assert.equal('snapshot' in statusOnly,false);assert.equal('activity' in statusOnly,false);
    const debateSession=await db.Session.create({name:'In progress debate',scenario_id:scenario.id});
    const trackerIndex=await service({method:'GET'},user,new URL('http://local/api/analyses?workspace_id='+workspace.id+'&view=tracker-index'),async()=>({}));
    assert.equal(trackerIndex.data.sessions[0].id,debateSession.id);
    assert.deepEqual(trackerIndex.data.scenarios,[{id:scenario.id,name:scenario.name}]);
    assert.equal('facilitator_note' in trackerIndex.data.sessions[0],false);
    const queue=(await service({method:'GET'},user,new URL('http://local/api/analyses?workspace_id='+workspace.id+'&status=1'),async()=>({}))).data;
    assert.equal(queue[0].id,created.id);
    assert.deepEqual(queue[0].input,{question:input.question});
    assert.equal('result' in queue[0],false);
    assert.equal('snapshot' in queue[0],false);
    const intruder={id:crypto.randomUUID()};
    await assert.rejects(service({method:'GET'},intruder,new URL('http://local/api/analyses?workspace_id='+workspace.id+'&view=tracker-index'),async()=>({})),/permission/);
    await db.SessionAgent.create({session_id:debateSession.id,agent_id:panel[0].id,round1_assessment:'Saved first-round response',status:'r1_done'});
    await pool.query('UPDATE analysis_jobs SET checkpoints=$2,progress=$3 WHERE id=$1',[created.id,JSON.stringify({scenario:{sessionId:debateSession.id}}),JSON.stringify({stage:'round1',agentId:panel[1].id})]);
    const summary=(await call('GET',`/${created.id}`)).data.activity;
    assert.equal(summary.options[0].agents[0].round1_done,true);
    assert.equal(summary.options[0].agents[1].round1_done,false);
    assert.equal('round1' in summary.options[0].agents[0],false,'transcript is fetched only on request');
    const transcript=(await service({method:'GET'},outsider,new URL(`http://local/api/analyses/${created.id}?workspace_id=${workspace.id}&debate=1`),async()=>({}))).data.activity;
    assert.equal(transcript.options[0].agents[0].round1,'Saved first-round response');
    assert.equal(transcript.options[0].agents[0].round2,'');
    assert.equal(transcript.options[0].session_id,debateSession.id);
    await assert.rejects(call('POST', `/${created.id}/cancel`, {}, outsider), /permission/);
    assert.equal((await call('GET', `/${created.id}/freshness`)).data.stale, false);
    const supplemented = await buildSnapshot(db, { ...input, context_in_scenario: false, context: 'Stakeholders: operations and finance. Source: recovery exercise plan.' }, 'model');
    assert.ok(supplemented.scenario.context_document.includes('Recovery exercise results pending'));
    assert.ok(supplemented.scenario.context_document.includes('Stakeholders: operations and finance.'));
    assert.notEqual(fingerprint(supplemented), created.fingerprint);
    assert.equal((await db.Scenario.get(scenario.id)).context_document, 'Recovery exercise results pending');
    const included = await buildSnapshot(db, { ...input, context_in_scenario: true, context: 'Hidden draft must not be used' }, 'model');
    assert.equal(included.scenario.context_document, 'Recovery exercise results pending');
    assert.equal(fingerprint(included), created.fingerprint);
    await assert.rejects(buildSnapshot(db, { ...input, context_in_scenario: false, context: '  ' }, 'model'), /Add context/);

    await db.Scenario.update(scenario.id, { context_document: 'Updated evidence' });
    assert.equal((await call('GET', `/${created.id}/freshness`)).data.stale, true);
    await call('POST', `/${created.id}/cancel`);
    assert.equal((await call('POST', `/${created.id}/resume`)).data.status, 'queued');
    await pool.query("UPDATE analysis_jobs SET status='complete',result=$2 WHERE id=$1", [created.id, JSON.stringify({ brief, sessions: [] })]);
    const action = (await call('POST', `/${created.id}/actions`, { index: 0 })).data;
    assert.equal((await call('POST', `/${created.id}/actions`, { index: 0 })).data.id, action.id);
    assert.equal(action.status, 'proposed');
    assert.equal(action.completion_criteria, brief.actions[0].completion_criteria);
    const current = await buildSnapshot(db, input, 'model');
    assert.notEqual(fingerprint(current), created.fingerprint);
  } finally { await engine.close(); }
});
