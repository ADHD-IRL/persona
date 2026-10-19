import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRound2, generateRound2Stream, generateSynthesis } from '../src/lib/llm.js';
import { runOptionSession, generateDecisionAssessment } from '../src/lib/decisionRunner.js';
import { normalizeAssessment, getRecommendedOptionId } from '../src/lib/decisionAssessment.js';
import { setProviderConfig, clearApiCredentials } from '../src/lib/apiCredentials.js';

const options = [{ id: 'option-a', name: 'Managed identity', description: 'Vendor hosted' }, { id: 'option-b', name: 'Local identity', description: 'On site' }];
const agent = { id: 'agent-1', name: 'Cyber analyst', discipline: 'Cybersecurity', persona_description: 'An identity specialist', cognitive_bias: 'Prefers local controls', severity_default: 'HIGH' };
const decision = { id: 'decision-1', title: 'Choose identity architecture', description: 'Preserve urgent access', acceptance_criteria: 'Recovery within five minutes' };
const assumptions = [{ text: 'Emergency logins work offline', criticality: 'HIGH', status: 'monitoring' }, { text: 'Invalidated test assumption', status: 'invalidated' }];
const decisionContext = 'DECISION: Identity architecture\nOPTION: Local identity\nAcceptance criteria: Recovery within five minutes\nAssumption: Emergency logins work offline';
const positions = 'Detailed analysis '.repeat(80) + 'ESSENTIAL_EVIDENCE_AT_END';
const marks = '\nSEVERITY: HIGH\nLIKELIHOOD: 3\nIMPACT: 5\nCONFIDENCE: 60\nCOMPOUND_CHAIN: none';
function assessment(status = 'RECOMMEND_OPTION') {
  return { recommendation_status: status, recommended_option_id: status === 'RECOMMEND_OPTION' ? options[1].id : null, headline: 'Inspect offline recovery evidence', confidence: 'LOW', rationale: ['Recovery has not been tested'], options: options.map(o => ({ option_id: o.id, verdict: 'RECOMMENDED', meets_acceptance_criteria: 'UNKNOWN' })), conditions_to_revisit: ['Test emergency access during an outage'] };
}
function mockLLM(t, answer = () => positions + marks) {
  const requests = [];
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  setProviderConfig({ provider: 'mitre_aip', defaultModel: 'mock-model' });
  t.after(() => { clearApiCredentials(); if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage; });
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const body = JSON.parse(request.body); requests.push(body);
    const text = answer(body, requests.length);
    return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\ndata: {"type":"message_stop"}\n\n`);
  });
  return requests;
}
for (const fn of [generateRound2, generateRound2Stream]) {
  test(`${fn.name} keeps scenario, decision constraints and own prior position`, async t => {
    const requests = mockLLM(t);
    await fn({ agent, scenarioContext: decisionContext, phaseFocus: 'Outage recovery', ownAssessment: 'My earlier finding: fallback shares the identity dependency', othersAssessments: 'Clinical analyst: an outage delays treatment' });
    const prompt = requests[0].messages[0].content;
    assert.ok(prompt.includes(decisionContext));
    assert.ok(prompt.includes('Outage recovery'));
    assert.ok(prompt.includes('My earlier finding: fallback shares the identity dependency'));
    assert.ok(prompt.includes('Clinical analyst: an outage delays treatment'));
  });
}
test('decision synthesis preserves framing and evidence beyond old excerpt limits', async t => {
  const requests = mockLLM(t);
  const longFraming = 'f'.repeat(1800) + decisionContext;
  await generateSynthesis({ session: { name: 'Identity', phase_focus: 'Decision option evaluation' }, scenarioContext: 'A hospital outage', decisionContext: longFraming, sessionAgents: [{ agentName: agent.name, round1_assessment: positions, round2_rebuttal: positions + 'ROUND2_END' }] });
  const prompt = requests[0].messages[0].content;
  assert.ok(prompt.includes(longFraming));
  assert.equal(prompt.split('ESSENTIAL_EVIDENCE_AT_END').length - 1, 2);
  assert.ok(prompt.includes('ROUND2_END'));
  assert.ok(prompt.includes('## OPTION EVALUATION'));
  assert.ok(prompt.includes('MET, NOT MET, or UNKNOWN'));
});
test('ordinary synthesis preserves full evidence just like decision synthesis', async t => {
  const requests = mockLLM(t);
  await generateSynthesis({ session: { name: 'Risk review' }, scenarioContext: 'Scenario', sessionAgents: [{ agentName: agent.name, round1_assessment: positions, round2_rebuttal: positions }] });
  assert.equal(requests[0].messages[0].content.split('ESSENTIAL_EVIDENCE_AT_END').length - 1, 2);
  assert.ok(!requests[0].messages[0].content.includes('## OPTION EVALUATION'));
});
test('valid recommendation and legacy assessments normalize consistently', () => {
  const raw = assessment();
  const result = normalizeAssessment(raw, options);
  assert.equal(result.recommendation_status, 'RECOMMEND_OPTION');
  assert.equal(result.options[0].verdict, 'VIABLE');
  assert.equal(result.options[1].verdict, 'RECOMMENDED');
  delete raw.recommendation_status;raw.recommended_option_id = 'Option B';
  assert.equal(normalizeAssessment(raw, options).recommended_option_id, options[1].id);
});
for (const status of ['REJECT_ALL', 'NEEDS_MORE_INFORMATION']) {
  test(`${status} stays unselected despite an available lowest risk score`, () => {
    const result = normalizeAssessment(assessment(status), options);
    assert.equal(result.recommendation_status, status);
    assert.equal(result.recommended_option_id, null);
    assert.ok(result.options.every(o => o.verdict === (status === 'REJECT_ALL' ? 'NOT RECOMMENDED' : 'NEEDS EVIDENCE')));
    assert.equal(getRecommendedOptionId(result, options, { [options[0].id]: { agg: { peak: 1, avgExposure: 1 } } }), null);
  });
}
test('inconsistent recommendations, unknown statuses and incomplete comparisons are rejected', () => {
  assert.throws(() => normalizeAssessment({ ...assessment('REJECT_ALL'), recommended_option_id: options[0].id }, options), /must not recommend/);
  assert.throws(() => normalizeAssessment({ ...assessment(), recommended_option_id: 'nonexistent' }, options), /not one of/);
  assert.throws(() => normalizeAssessment({ ...assessment(), recommendation_status: 'PICK_ANY' }, options), /Unknown recommendation status/);
  assert.throws(() => normalizeAssessment({ ...assessment('NEEDS_MORE_INFORMATION'), options: [{ option_id: options[0].id }] }, options), /omitted/);
});
test('legacy selection and an unassessed lowest risk display still work', () => {
  assert.equal(getRecommendedOptionId({ recommended_option_id: options[1].id }, options), options[1].id);
  assert.equal(getRecommendedOptionId(null, options, { [options[0].id]: { agg: { peak: 1, avgExposure: 1 } } }), options[0].id);
});
test('option runner carries criteria through both rounds and synthesis, then compares without forcing a winner', async t => {
  const requests = mockLLM(t, body => body.messages[0].content.includes('decision-assessment engine') ? JSON.stringify(assessment('NEEDS_MORE_INFORMATION')) : positions + marks);
  let nextId = 0;
  const tables = {};
  const db = Object.fromEntries(['Session', 'SessionAgent', 'SessionSynthesis', 'Chain'].map(entity => {
    tables[entity] = [];
    return [entity, {
      create: async data => { const row = { ...data, id: `${entity}-${++nextId}` }; tables[entity].push(row); return row; },
      update: async (id, data) => Object.assign(tables[entity].find(r => r.id === id), data),
      filter: async filter => tables[entity].filter(r => Object.entries(filter).every(([key, value]) => r[key] === value)),
    }];
  }));
  const perOption = [];
  for (const option of options) {
    const result = await runOptionSession({ db, decision, option, assumptions, scenario: { id: 'scenario-1', context_document: 'Hospital outage' }, agents: [agent], chains: [{ name: 'Selected cascade path', steps: [{ step_number: 1, step_text: 'Unique chain evidence marker' }] }] });
    perOption.push({ option, sessionAgents: result.sessionAgents.map(sa => ({ ...sa, agent })), synthesis: '## OPTION EVALUATION\n' + positions });
  }
  const result = await generateDecisionAssessment({ decision, options, assumptions, perOption });
  assert.equal(result.recommendation_status, 'NEEDS_MORE_INFORMATION');
  assert.equal(result.recommended_option_id, null);
  for (let i = 0; i < 6; i++) {
    const prompt = requests[i].messages[0].content;
    assert.ok(prompt.includes(options[Math.floor(i / 3)].name));
    assert.ok(prompt.includes(decision.acceptance_criteria));
    assert.ok(prompt.includes(assumptions[0].text));
    assert.ok(!prompt.includes(assumptions[1].text));
    if (i % 3 !== 2) assert.ok(prompt.includes('Unique chain evidence marker'));
    if (i % 3 === 1) assert.ok(prompt.includes(positions));
  }
  const comparison = requests.at(-1).messages[0].content;
  assert.ok(comparison.includes('REJECT_ALL'));
  assert.ok(comparison.includes('NEEDS_MORE_INFORMATION'));
  assert.ok(comparison.includes('ESSENTIAL_EVIDENCE_AT_END'));
  assert.ok(comparison.includes('OPTION EVALUATION'));
  assert.equal(tables.Session.length, 2);
  assert.ok(tables.Session.every(s => s.status === 'complete'));
});
