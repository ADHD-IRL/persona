// Plain-node checks for the structured debate protocol.
//   node scripts/debateProtocol.test.mjs
import assert from 'node:assert/strict';
import {
  extractAgenda, createDebate, phaseInstruction, pickForPhase, noteTurn, phaseVerdict, advance,
  recordResolution, skipQuestion, debateSummary, debateNarrative, debateReport, agendaOutcomes, PHASES,
} from '../src/lib/panel/debateProtocol.js';

// agenda: Q-lines win
const lantern = `7. WHAT I NEED THE PANEL TO DECIDE OR ADVISE\n\nQ1. Commercial LEO. Is it acceptable?\nQ2. Traffic flow security. Right trade?\n\n8. ASSUMPTIONS`;
const a1 = extractAgenda(lantern);
assert.equal(a1.length, 2);
assert.equal(a1[0].id, 'q1');
assert.ok(a1[1].text.startsWith('Traffic flow security'));

// agenda: numbered items after an "asks... :" line
const hospital = `The incident commander has asked for a panel recommendation on three questions before the noon leadership meeting:\n\n1. Diversion. Continue partial diversion?\n2. Restoration order. What comes back first?\n3. The ransom. Pay or refuse?\n\nThe CEO has said privately.`;
const a2 = extractAgenda(hospital);
assert.equal(a2.length, 3, JSON.stringify(a2));
assert.ok(a2[2].text.startsWith('The ransom'));

// agenda: question sentences, then default
assert.equal(extractAgenda('Nothing here. Just prose about fuel and ISR that never asks anything?')[0].source, 'derived');
assert.equal(extractAgenda('No questions at all.', { fallbackName: 'Resupply' })[0].source, 'default');

// state machine over a 3-expert panel
const experts = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cal' }];
const ranked = [{ id: 'a', score: 50 }, { id: 'b', score: 40 }, { id: 'c', score: 30 }];
let d = createDebate(a1);
d.status = 'running';
assert.equal(d.phase, 'opening');
assert.ok(phaseInstruction(d, { panelSize: 3 }).includes('OPENING POSITIONS'));

// opening: everyone speaks once, in urge order, confidences parsed
assert.equal(pickForPhase(d, ranked), 'a');
d = noteTurn(d, { agentId: 'a', agentName: 'Ada', text: 'I am about 80% confident LEO is unacceptable.', turn: 1 });
assert.equal(pickForPhase(d, ranked), 'b');
d = noteTurn(d, { agentId: 'b', agentName: 'Ben', text: 'Roughly 30% — acceptable with monitoring.', turn: 2 });
d = noteTurn(d, { agentId: 'c', agentName: 'Cal', text: 'Call it 55%.', turn: 3 });
assert.equal(pickForPhase(d, ranked), null, 'nobody left to open');
let v = phaseVerdict(d, { panelSize: 3 });
assert.ok(v.end && v.kind === 'complete');
let r = advance(d, { ...v, turn: 3 });
d = r.debate;
assert.equal(d.phase, 'cross');
assert.ok(r.insight.includes('50-point spread'), r.insight);
assert.ok(r.insight.includes('genuinely split'));

// cross: the floor goes to the far end from the last speaker
assert.equal(pickForPhase(d, ranked, { lastSpeakerId: 'a' }), 'b', 'Ben (30%) is farthest from Ada (80%)');
assert.equal(pickForPhase(d, ranked, { lastSpeakerId: 'b' }), 'a');
d = noteTurn(d, { agentId: 'b', agentName: 'Ben', text: 'Ada, the terminals are the issue, not the link.', turn: 4 });
v = phaseVerdict(d, { panelSize: 3 });
assert.equal(v.end, false);
assert.equal(v.budget, 6, 'budget is 2x panel, min 4 max 10');
v = phaseVerdict(d, { panelSize: 3, pulseVerdict: { stop: true, kind: 'impasse', reason: 'positions have stopped moving' } });
assert.ok(v.end && v.kind === 'impasse');
r = advance(d, { ...v, turn: 4 });
d = r.debate;
assert.equal(d.phase, 'evidence');
assert.ok(r.insight.includes('impasse'));

// evidence: one pass, citation heuristic
for (const e of experts) d = noteTurn(d, { agentId: e.id, agentName: e.name, text: e.id === 'a' ? 'Per the risk register R2, no TRANSEC on LEO.' : 'From experience.', turn: 5 });
assert.equal(d.records[0].evidence.filter(x => x.cites).length, 1);
r = advance(d, { ...phaseVerdict(d, { panelSize: 3 }), turn: 7 });
d = r.debate;
assert.equal(d.phase, 'closing');

// closing: movement measured
d = noteTurn(d, { agentId: 'a', agentName: 'Ada', text: 'Still 80%.', turn: 8 });
d = noteTurn(d, { agentId: 'b', agentName: 'Ben', text: 'I have moved to 60% — the terminal point landed.', turn: 9 });
d = noteTurn(d, { agentId: 'c', agentName: 'Cal', text: 'Holding at 55%.', turn: 10 });
r = advance(d, { ...phaseVerdict(d, { panelSize: 3 }), turn: 10 });
d = r.debate;
assert.equal(d.phase, 'resolution');
assert.ok(r.insight.includes('1 of 3 moved'), r.insight);
assert.ok(r.insight.includes('Ben 30% → 60%'));

// resolution: dissent is 25+ points from the median
d = recordResolution(d, { consensus: true, title: 'Restrict LEO to status traffic', rationale: 'Terminals untrusted.' });
assert.equal(d.records[0].decision.status, 'decided', 'median 60, farthest is Ada at 80 (20 pts) — no dissent');
r = advance(d, { kind: 'decided', reason: 'x', turn: 11 });
d = r.debate;
assert.equal(d.qIndex, 1, 'moved to Q2');
assert.equal(d.phase, 'opening');
assert.ok(r.insight.includes('resolved'));

// skip the last question -> complete
r = skipQuestion(d, { turn: 12 });
d = r.debate;
assert.equal(d.status, 'complete');
const s = debateSummary(d);
assert.deepEqual([s.questions, s.decided, s.skipped], [2, 1, 1]);
assert.ok(debateNarrative(d, { panelSize: 3 }).headline.includes('complete'));

// report + outcomes
const rep = debateReport({ report: { debate: d } });
assert.ok(rep.md.includes('# Debate record'));
assert.ok(rep.md.includes('Restrict LEO to status traffic'));
assert.ok(rep.blocks.some(b => b.type === 'table' && b.headers.includes('Δ')));
assert.equal(agendaOutcomes(d)[1].status, 'skipped');
assert.equal(debateReport({ report: {} }).md, '');

// unresolved with dissent
let u = createDebate([{ id: 'q1', text: 'Pay the ransom?' }]);
u.phase = 'closing';
u = noteTurn(u, { agentId: 'a', agentName: 'Ada', text: '90% pay.', turn: 1 });
u = noteTurn(u, { agentId: 'b', agentName: 'Ben', text: '10% pay.', turn: 2 });
u = noteTurn(u, { agentId: 'c', agentName: 'Cal', text: '50%.', turn: 3 });
u = recordResolution(u, { consensus: false });
assert.equal(u.records[0].decision.status, 'unresolved');
assert.deepEqual(u.records[0].decision.dissenters.map(x => x.name).sort(), ['Ada', 'Ben']);

assert.equal(PHASES.length, 5);
console.log('debateProtocol: all checks passed');

