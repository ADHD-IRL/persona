// Run with: node scripts/beliefLedger.test.mjs
import {
  beliefLabel, emptyLedger, normalizeLedger, ledgerSummary,
  applyLedgerUpdate, seedFromPoll, credenceMovement,
} from '../src/lib/panel/beliefLedger.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ── Labels track the document's belief-state thresholds ──────────────────────
{
  ok(beliefLabel(0.1) === 'insufficient evidence', 'below 0.3 is insufficient evidence');
  ok(beliefLabel(0.3) === 'hypothesis', '0.3 is hypothesis');
  ok(beliefLabel(0.7) === 'working theory', '0.7 is working theory');
  ok(beliefLabel(0.95) === 'established fact', '0.95 is established fact');
}

// ── New positions never start certain ────────────────────────────────────────
{
  const { ledger } = applyLedgerUpdate(emptyLedger(), [
    { id: 'p1', claim: 'The IAM config is exploitable', credence: 1.0 },
    { id: 'p2', claim: 'The vendor report is noise', credence: 0.0 },
  ], { turn: 1 });
  const p1 = ledger.positions.find(p => p.id === 'p1');
  const p2 = ledger.positions.find(p => p.id === 'p2');
  ok(p1.credence === 0.95, `new position capped at 0.95, got ${p1.credence}`);
  ok(p2.credence === 0.05, `new position floored at 0.05, got ${p2.credence}`);
}

// ── Path-dependence: one exchange can't swing an expert past MAX_DELTA ───────
{
  const start = applyLedgerUpdate(emptyLedger(), [{ id: 'p1', claim: 'X', credence: 0.8 }], { turn: 1 }).ledger;
  const { ledger, shifts } = applyLedgerUpdate(start, [{ id: 'p1', claim: 'X', credence: 0.05, update_reason: 'colleague pushback' }], { turn: 2 });
  const p1 = ledger.positions[0];
  ok(Math.abs(p1.credence - 0.5) < 1e-9, `movement clamped to 0.3 per update, got ${p1.credence}`);
  ok(shifts.length === 1 && shifts[0].from === 0.8, 'a big move is surfaced as a shift');
  ok(p1.history.length === 1 && p1.history[0].credence === 0.8, 'prior credence recorded in history');
}

// ── Unmentioned positions are kept; noise deltas are ignored ────────────────
{
  const start = applyLedgerUpdate(emptyLedger(), [
    { id: 'a', claim: 'A', credence: 0.6 },
    { id: 'b', claim: 'B', credence: 0.4 },
  ], { turn: 1 }).ledger;
  const { ledger, shifts } = applyLedgerUpdate(start, [{ id: 'a', claim: 'A', credence: 0.61 }], { turn: 2 });
  ok(ledger.positions.length === 2, 'unmentioned position survives an update');
  ok(ledger.positions.find(p => p.id === 'a').credence === 0.6, 'sub-noise delta ignored');
  ok(ledger.positions.find(p => p.id === 'a').history.length === 0, 'no history entry for noise');
  ok(shifts.length === 0, 'no shift surfaced for noise');
}

// ── Portfolio stays working-memory sized ─────────────────────────────────────
{
  const proposals = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, claim: `Claim ${i}`, credence: 0.5 }));
  let ledger = emptyLedger();
  proposals.forEach((p, i) => { ledger = applyLedgerUpdate(ledger, [p], { turn: i + 1 }).ledger; });
  ok(ledger.positions.length === 6, `capped at 6 positions, got ${ledger.positions.length}`);
  ok(!ledger.positions.some(p => p.id === 'p0'), 'oldest-touched position dropped first');
}

// ── Poll seeding is deterministic and idempotent per topic ───────────────────
{
  const l1 = seedFromPoll(emptyLedger(), { position: 'Segment the network now', confidence: 70, stance: 'for' }, 'network segmentation', 3);
  ok(l1.positions.length === 1 && l1.positions[0].credence === 0.7, 'poll seeds a position at confidence/100');
  const l2 = seedFromPoll(l1, { position: 'Segment the network now', confidence: 90, stance: 'for' }, 'network segmentation', 5);
  ok(l2.positions.length === 1, 'same-topic poll updates, does not duplicate');
  ok(l2.positions[0].credence === 0.9, `same-topic poll moves credence, got ${l2.positions[0].credence}`);
}

// ── Movement metric and summary ──────────────────────────────────────────────
{
  const a = applyLedgerUpdate(emptyLedger(), [{ id: 'p1', claim: 'X', credence: 0.5 }], { turn: 1 }).ledger;
  const b = applyLedgerUpdate(a, [{ id: 'p1', claim: 'X', credence: 0.7, would_change: 'a working exploit' }], { turn: 2 }).ledger;
  ok(Math.abs(credenceMovement(a, b) - 0.2) < 1e-9, 'credenceMovement sums per-position deltas');
  const s = ledgerSummary(b);
  ok(s.includes('70%') && s.includes('working theory') && s.includes('Would change my mind'), `summary renders pct/label/wcm: ${s}`);
  ok(ledgerSummary(null) === '', 'null ledger summarizes to empty string');
}

// ── normalizeLedger survives garbage ─────────────────────────────────────────
{
  ok(normalizeLedger(undefined).positions.length === 0, 'undefined -> empty');
  ok(normalizeLedger({ positions: [{ claim: '' }, { claim: 'ok', credence: '0.4' }] }).positions.length === 1, 'blank claims dropped, string credence coerced');
}

// ── Phase 3: evidence credibility bounds movement per expert ─────────────────
{
  // An Analytical expert's credibility map: data 0.95, anecdote 0.20.
  const credibility = { empirical_data: 0.95, peer_consensus: 0.75, institutional_reporting: 0.7, anecdotal_reports: 0.2, vendor_claims: 0.35 };
  const start = applyLedgerUpdate(emptyLedger(), [{ id: 'p1', claim: 'X', credence: 0.5 }], { turn: 1 }).ledger;

  const byData = applyLedgerUpdate(start, [{ id: 'p1', claim: 'X', credence: 0.9, evidence_kind: 'empirical_data' }], { turn: 2, credibility }).ledger;
  const byAnecdote = applyLedgerUpdate(start, [{ id: 'p1', claim: 'X', credence: 0.9, evidence_kind: 'anecdotal_reports' }], { turn: 2, credibility }).ledger;
  const dataMove = byData.positions[0].credence - 0.5;
  const anecMove = byAnecdote.positions[0].credence - 0.5;
  ok(Math.abs(dataMove - 0.3 * 0.95) < 1e-9, `data moves nearly the full step (0.285), got ${dataMove}`);
  ok(Math.abs(anecMove - 0.3 * 0.25) < 1e-9, `anecdote is floored at 25% of the step (0.075), got ${anecMove}`);
  ok(dataMove > anecMove, 'the same proposed jump moves the expert more when driven by data than by anecdote');
  ok(byData.positions[0].history[0].kind === 'empirical_data', 'history records the evidence kind');

  // An unknown / missing evidence kind keeps the full step (no penalty for the model omitting it).
  const noKind = applyLedgerUpdate(start, [{ id: 'p1', claim: 'X', credence: 0.9 }], { turn: 2, credibility }).ledger;
  ok(Math.abs(noKind.positions[0].credence - 0.8) < 1e-9, 'no evidence_kind → full 0.3 step');
}

// ── Phase 3: per-expert belief ladder relabels the same credence ────────────
{
  const sceptic = { hypothesis: 0.3, working_theory: 0.7, established_fact: 0.97 };
  ok(beliefLabel(0.95) === 'established fact', 'default ladder: 0.95 is established');
  ok(beliefLabel(0.95, sceptic) === 'working theory', 'sceptic ladder: 0.95 is still a working theory');
  const l = applyLedgerUpdate(emptyLedger(), [{ id: 'p1', claim: 'X', credence: 0.95 }], { turn: 1, thresholds: sceptic }).ledger;
  ok(l.positions[0].label === 'working theory', 'applyLedgerUpdate labels with the expert\'s own ladder');
  const seeded = seedFromPoll(emptyLedger(), { position: 'Yes', confidence: 95 }, 'q', 1, { reasoning_style: 'Contrarian' });
  ok(seeded.positions[0].label === 'working theory', 'seedFromPoll uses the agent\'s ladder (Contrarian → 0.97 bar)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

