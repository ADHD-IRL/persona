// R-N10 acceptance tests — durable run state.
// Run with: node --test scripts/   (or: node scripts/runState.test.mjs)
// No build step, no network, no API key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEARTBEAT_MS, STALE_AFTER_MS, runKey, makeRunRecord, touchRun, classifyRun,
  nextSessionStage, sessionResumePlan, hasStuckAgents, decisionResumePlan, describeRun,
} from '../src/lib/runState.js';

const T0 = Date.parse('2026-10-05T12:00:00Z');

test('R-N10: run keys are namespaced per kind and id', () => {
  assert.equal(runKey('session', 'abc'), 'run_session_abc');
  assert.equal(runKey('decision', 'xyz'), 'run_decision_xyz');
  assert.notEqual(runKey('session', 'abc'), runKey('decision', 'abc'));
});

test('R-N10: heartbeat interval is well inside the stale window', () => {
  assert.ok(STALE_AFTER_MS >= HEARTBEAT_MS * 3, 'a single missed beat must not look like an interruption');
});

test('R-N10: a fresh record is alive to other tabs and own to its owner', () => {
  const rec = makeRunRecord({ kind: 'session', id: 's1', stage: 'round1', tabId: 'tab-A', total: 5 }, T0);
  assert.equal(classifyRun(rec, 'tab-A', T0 + 1000), 'own');
  assert.equal(classifyRun(rec, 'tab-B', T0 + 1000), 'alive');
  assert.equal(classifyRun(null, 'tab-B', T0), 'none');
  assert.equal(classifyRun(undefined, 'tab-B', T0), 'none');
});

test('R-N10: a record whose owner stopped heartbeating becomes stale (resumable)', () => {
  const rec = makeRunRecord({ kind: 'session', id: 's1', stage: 'round2', tabId: 'tab-A' }, T0);
  assert.equal(classifyRun(rec, 'tab-B', T0 + STALE_AFTER_MS), 'alive', 'exactly at the boundary is still alive');
  assert.equal(classifyRun(rec, 'tab-B', T0 + STALE_AFTER_MS + 1), 'stale');
  // The owner tab is never told its own run is stale: it holds the live loop.
  assert.equal(classifyRun(rec, 'tab-A', T0 + STALE_AFTER_MS * 10), 'own');
});

test('R-N10: touching a record advances progress and refreshes the heartbeat only', () => {
  const rec = makeRunRecord({ kind: 'session', id: 's1', stage: 'round1', tabId: 'tab-A', total: 3 }, T0);
  const later = touchRun(rec, { step: 2, label: 'Dr. Vale' }, T0 + 7000);
  assert.equal(later.step, 2);
  assert.equal(later.label, 'Dr. Vale');
  assert.equal(later.startedAt, rec.startedAt, 'startedAt is preserved');
  assert.equal(later.heartbeatAt, new Date(T0 + 7000).toISOString());
  assert.equal(classifyRun(later, 'tab-B', T0 + 7000 + 1000), 'alive');
});

test('R-N10: next stage follows round1 → round2 → synthesis → done', () => {
  const a = { round1_assessment: null, round2_rebuttal: null };
  const b = { round1_assessment: 'x', round2_rebuttal: null };
  const c = { round1_assessment: 'x', round2_rebuttal: 'y' };
  assert.equal(nextSessionStage([], false), null, 'no agents, nothing to resume');
  assert.equal(nextSessionStage([a, c], false), 'round1');
  assert.equal(nextSessionStage([b, c], false), 'round2');
  assert.equal(nextSessionStage([c, c], false), 'synthesis');
  assert.equal(nextSessionStage([c, c], true), null);
});

test('R-N10: resume plan resets stuck statuses and lists only unfinished agents', () => {
  const agents = [
    { id: '1', status: 'r1_done',       round1_assessment: 'done', round2_rebuttal: null },
    { id: '2', status: 'generating_r1', round1_assessment: null,   round2_rebuttal: null }, // killed mid-call
    { id: '3', status: 'pending',       round1_assessment: null,   round2_rebuttal: null },
    { id: '4', status: 'generating_r1', round1_assessment: 'done', round2_rebuttal: null }, // call finished, status did not
  ];
  const plan = sessionResumePlan('round1', agents);
  assert.equal(plan.stage, 'round1');
  assert.deepEqual(plan.pendingAgentIds, ['2', '3'], 'agent 4 already has its assessment');
  assert.deepEqual(plan.resets, [
    { id: '2', status: 'pending' },
    { id: '4', status: 'r1_done' },
  ]);
});

test('R-N10: resume plan for round 2 resets a mid-call agent to r1_done', () => {
  const agents = [
    { id: '1', status: 'generating_r2', round1_assessment: 'a', round2_rebuttal: null },
    { id: '2', status: 'complete',      round1_assessment: 'a', round2_rebuttal: 'b' },
    { id: '3', status: 'generating_r2', round1_assessment: 'a', round2_rebuttal: 'b' },
  ];
  const plan = sessionResumePlan('round2', agents);
  assert.deepEqual(plan.pendingAgentIds, ['1']);
  assert.deepEqual(plan.resets, [
    { id: '1', status: 'r1_done' },
    { id: '3', status: 'complete' },
  ]);
});

test('R-N10: synthesis resume plan has no per-agent work but still heals statuses', () => {
  const agents = [{ id: '1', status: 'generating_r2', round1_assessment: 'a', round2_rebuttal: 'b' }];
  const plan = sessionResumePlan('synthesis', agents);
  assert.deepEqual(plan.pendingAgentIds, []);
  assert.deepEqual(plan.resets, [{ id: '1', status: 'complete' }]);
});

test('R-N10: stuck agents are detected even when no run record exists (pre-R-N10 runs)', () => {
  assert.equal(hasStuckAgents([{ status: 'pending' }, { status: 'complete' }]), false);
  assert.equal(hasStuckAgents([{ status: 'pending' }, { status: 'generating_r2' }]), true);
});

test('R-N10: decision resume plan reuses complete sessions, continues partial ones, creates missing', () => {
  const options = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const sessions = [
    { id: 's-old', decision_option_id: 'A', status: 'round1',   created_at: '2026-10-01T00:00:00Z' },
    { id: 's-new', decision_option_id: 'A', status: 'complete', created_at: '2026-10-02T00:00:00Z' },
    { id: 's-b',   decision_option_id: 'B', status: 'round2',   created_at: '2026-10-02T00:00:00Z' },
  ];
  assert.deepEqual(decisionResumePlan({ options, sessions }), [
    { optionId: 'A', state: 'complete', sessionId: 's-new' },
    { optionId: 'B', state: 'partial',  sessionId: 's-b' },
    { optionId: 'C', state: 'missing',  sessionId: null },
  ]);
});

test('R-N10: describeRun names the stage and position in plain words', () => {
  const s = makeRunRecord({ kind: 'session', id: 's1', stage: 'round2', tabId: 't', step: 3, total: 5, label: 'Dr. Vale' }, T0);
  assert.equal(describeRun(s), 'Round 2 · agent 3/5 · Dr. Vale');
  const d = makeRunRecord({ kind: 'decision', id: 'd1', stage: 'option', tabId: 't', optionIndex: 1, total: 3, label: 'Build in-house' }, T0);
  assert.equal(describeRun(d), 'Decision panel · option B of 3 · Build in-house');
  const a = makeRunRecord({ kind: 'decision', id: 'd1', stage: 'assessment', tabId: 't' }, T0);
  assert.equal(describeRun(a), 'Decision assessment');
});
