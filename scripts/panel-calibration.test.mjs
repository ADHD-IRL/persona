// Run with: node scripts/calibration.test.mjs
import {
  statedConfidence, assertivenessOf, needsCalibrationAudit, bumpCalibration, AUDIT_THRESHOLD,
} from '../src/lib/panel/calibration.js';
import { emptyLedger, normalizeLedger, applyLedgerUpdate } from '../src/lib/panel/beliefLedger.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const assertive = 'This is definitely the primary vector. It will fail under load — no doubt about it, and there is no way the current controls hold.';
const hedged = 'I think it\'s likely the IAM config, though it depends on what the logs show; roughly 60% if I had to guess, and I could be wrong.';
const statedHigh = 'Based on the scan results I\'m about 90% sure the edge device is unpatched and exploitable.';

// ── Stated confidence extraction ─────────────────────────────────────────────
{
  ok(statedConfidence(hedged) === 0.6, `extracts 60% → 0.6, got ${statedConfidence(hedged)}`);
  ok(statedConfidence(statedHigh) === 0.9, 'extracts 90%');
  ok(statedConfidence('no numbers here') === null, 'no percentage → null');
  ok(statedConfidence('between 40% and 75% likely') === 0.75, 'takes the highest stated percentage');
}

// ── Assertiveness separates certain from hedged speech ───────────────────────
{
  const a = assertivenessOf(assertive), h = assertivenessOf(hedged);
  ok(a > h, `assertive text scores higher (${a}) than hedged (${h})`);
  ok(a >= AUDIT_THRESHOLD, 'assertive text clears the audit threshold');
  ok(h === 0, `heavily hedged text floors at 0, got ${h}`);
  ok(assertivenessOf('') === 0, 'empty → 0');
}

// ── Audit gating ─────────────────────────────────────────────────────────────
{
  ok(needsCalibrationAudit({ text: assertive, mode: 'system1', snapCap: 0.65 }) === true, 'assertive System 1 reply is audited');
  ok(needsCalibrationAudit({ text: assertive, mode: 'system2', snapCap: 0.65 }) === false, 'System 2 turns are never audited (already deliberated)');
  ok(needsCalibrationAudit({ text: hedged, mode: 'system1', snapCap: 0.65 }) === false, 'hedged reply within cap is not audited');
  ok(needsCalibrationAudit({ text: hedged, mode: 'system1', snapCap: 0.55 }) === true, 'the same 60% read exceeds a Junior\'s 55% cap → audited');
  ok(needsCalibrationAudit({ text: statedHigh, mode: 'system1', snapCap: 0.65 }) === true, 'a stated 90% above cap is audited even without strong markers');
  ok(needsCalibrationAudit({ text: 'Agreed.', mode: 'system1', snapCap: 0.65 }) === false, 'too short to audit');
}

// ── Calibration tally rides on the ledger ────────────────────────────────────
{
  const l0 = emptyLedger();
  ok(l0.calibration.audits === 0 && l0.calibration.overreach === 0 && l0.calibration.corrections === 0, 'empty ledger has a zeroed tally');
  const l1 = bumpCalibration(l0, { overreach: true, corrected: true });
  const l2 = bumpCalibration(l1, { overreach: false });
  ok(l2.calibration.audits === 2 && l2.calibration.overreach === 1 && l2.calibration.corrections === 1, `counters accumulate: ${JSON.stringify(l2.calibration)}`);
  // Survives normalization and a position update.
  const withPos = applyLedgerUpdate(l2, [{ id: 'p1', claim: 'X', credence: 0.7 }], { turn: 3 }).ledger;
  ok(withPos.calibration.audits === 2, 'tally preserved through applyLedgerUpdate');
  ok(normalizeLedger({ positions: [], calibration: { audits: '4', overreach: -1, corrections: 2.7 } }).calibration.audits === 4, 'string count coerced');
  ok(normalizeLedger({ positions: [], calibration: { audits: '4', overreach: -1, corrections: 2.7 } }).calibration.overreach === 0, 'negative count floored at 0');
  ok(normalizeLedger({ positions: [], calibration: { audits: '4', overreach: -1, corrections: 2.7 } }).calibration.corrections === 2, 'fractional count floored to int');
  ok(normalizeLedger({ positions: [] }).calibration.audits === 0, 'missing tally → zeros');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

