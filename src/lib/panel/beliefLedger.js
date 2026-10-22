// Per-SME belief ledger: a live portfolio of graded positions each expert
// carries through a session. This is what makes opinion movement stateful —
// an SME who conceded ground three turns ago STAYS moved, instead of drifting
// with whatever happens to be in the context window.
//
// The ledger lives in session_agents.belief_state (jsonb, migration 022).
// Pure merge/clamp logic is separated from the LLM call so it is testable
// without a model (scripts/beliefLedger.test.mjs) — hence the llm import is
// deferred to inside updateLedgerLLM, keeping this module loadable by plain node.
// (cognitionProfile has no dependencies, so its relative import is node-safe.)

import { cognitionFor } from './cognitionProfile.js';

// Default belief-state thresholds (Architecture of a Virtual Domain Expert,
// §2.3): probabilities map to epistemic labels rather than binary true/false.
// Each expert's cognition profile can shift these — a sceptic demands more
// before calling something established.
export const BELIEF_THRESHOLDS = { hypothesis: 0.3, working_theory: 0.7, established_fact: 0.95 };

export function beliefLabel(credence, thresholds = BELIEF_THRESHOLDS) {
  const t = { ...BELIEF_THRESHOLDS, ...(thresholds || {}) };
  if (credence >= t.established_fact) return 'established fact';
  if (credence >= t.working_theory) return 'working theory';
  if (credence >= t.hypothesis) return 'hypothesis';
  return 'insufficient evidence';
}

// Hard caps enforced in code regardless of what the model proposes. The prompt
// carries the persona's update_triggers, but path-dependence is not optional:
// no single exchange swings an expert by more than MAX_DELTA, and fresh
// positions never start certain.
const MAX_DELTA = 0.3;        // max credence movement per update
const NOISE_DELTA = 0.02;     // below this, treat as no change (no history entry)
const SHIFT_DELTA = 0.15;     // at or above this, the room should see the shift
const MAX_POSITIONS = 6;      // working-memory-sized portfolio, not a database
const NEW_MIN = 0.05;
const NEW_MAX = 0.95;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function emptyLedger() {
  return { positions: [], updated_turn: 0, calibration: { audits: 0, overreach: 0, corrections: 0 } };
}

// Safe parse of whatever is in the DB row (null, legacy shapes, strings).
export function normalizeLedger(raw, thresholds = BELIEF_THRESHOLDS) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.positions)) return emptyLedger();
  const positions = raw.positions
    .filter(p => p && typeof p.claim === 'string' && p.claim.trim())
    .map(p => ({
      id: String(p.id || p.claim.slice(0, 24)),
      claim: p.claim.trim(),
      credence: clamp01(Number(p.credence) || 0),
      label: beliefLabel(clamp01(Number(p.credence) || 0), thresholds),
      would_change: typeof p.would_change === 'string' ? p.would_change : '',
      evidence: Array.isArray(p.evidence) ? p.evidence.filter(e => typeof e === 'string').slice(0, 4) : [],
      history: Array.isArray(p.history) ? p.history.slice(-8) : [],
      updated_turn: Number(p.updated_turn) || 0,
    }));
  // Per-session calibration tally (metacognition loop) rides along.
  const cal = raw.calibration && typeof raw.calibration === 'object' ? raw.calibration : {};
  const int = v => Math.max(0, Math.floor(Number(v) || 0));
  return {
    positions,
    updated_turn: Number(raw.updated_turn) || 0,
    calibration: { audits: int(cal.audits), overreach: int(cal.overreach), corrections: int(cal.corrections) },
  };
}

// Compact text block for injection into the SME's own prompts — their running
// notes, most recently touched first.
export function ledgerSummary(ledger, { max = 5 } = {}) {
  const l = normalizeLedger(ledger);
  if (!l.positions.length) return '';
  return [...l.positions]
    .sort((a, b) => b.updated_turn - a.updated_turn)
    .slice(0, max)
    .map(p => {
      const pct = Math.round(p.credence * 100);
      const wcm = p.would_change ? ` Would change my mind: ${p.would_change}` : '';
      return `- [${pct}% · ${p.label}] ${p.claim}${wcm}`;
    })
    .join('\n');
}

// Total absolute credence movement between two ledgers (matched by id) —
// usable as a stateful "movement" signal for the stop tracker.
export function credenceMovement(prev, next) {
  const a = normalizeLedger(prev), b = normalizeLedger(next);
  const byId = Object.fromEntries(a.positions.map(p => [p.id, p]));
  let sum = 0;
  for (const p of b.positions) {
    const old = byId[p.id];
    if (old) sum += Math.abs(p.credence - old.credence);
  }
  return sum;
}

// Deterministic upsert from a straw-poll result — polls are already a per-SME
// elicitation, so their output seeds the ledger with no extra LLM call.
export function seedFromPoll(ledger, { position, confidence, stance }, topic, turn, agent = null) {
  const thresholds = agent ? cognitionFor(agent).belief_thresholds : BELIEF_THRESHOLDS;
  const l = normalizeLedger(ledger, thresholds);
  const claim = (position || '').trim();
  if (!claim || confidence == null) return l;
  const credence = clamp01(confidence / 100);
  // A poll on the same topic updates the existing entry rather than piling up.
  const key = `poll_${(topic || claim).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`;
  const proposed = { id: key, claim, credence, would_change: '', update_reason: `straw poll${stance ? ` (${stance})` : ''}` };
  return applyLedgerUpdate(l, [proposed], { turn, thresholds }).ledger;
}

// Merge model-proposed positions into the ledger under the hard caps.
// Proposed entries with a matching id revise that position; new ids append;
// positions the proposal does not mention are KEPT unchanged (experts do not
// forget a position because the last exchange was about something else).
// Returns { ledger, shifts } — shifts are the movements the room should see.
//
// `thresholds` is the expert's own belief ladder (labels). `credibility` is
// the expert's source-credibility map: when a proposal names the kind of
// evidence that moved them (`evidence_kind`), the permitted movement scales by
// how much THIS expert trusts that kind — data moves an analyst the full step,
// an anecdote barely nudges them. Floored so no evidence is entirely inert.
const MIN_CREDIBILITY_WEIGHT = 0.25;

export function applyLedgerUpdate(ledger, proposed, { turn = 0, thresholds = BELIEF_THRESHOLDS, credibility = null } = {}) {
  const l = normalizeLedger(ledger, thresholds);
  const byId = Object.fromEntries(l.positions.map(p => [p.id, p]));
  const shifts = [];

  for (const raw of Array.isArray(proposed) ? proposed : []) {
    if (!raw || typeof raw.claim !== 'string' || !raw.claim.trim()) continue;
    const id = String(raw.id || raw.claim.slice(0, 24));
    const target = clamp01(Number(raw.credence));
    if (Number.isNaN(target)) continue;
    const note = typeof raw.update_reason === 'string' ? raw.update_reason.slice(0, 160) : '';
    const kind = typeof raw.evidence_kind === 'string' ? raw.evidence_kind : null;
    const weight = credibility && kind && credibility[kind] != null
      ? Math.max(MIN_CREDIBILITY_WEIGHT, clamp01(Number(credibility[kind])))
      : 1;
    const maxDelta = MAX_DELTA * weight;
    const existing = byId[id];

    if (existing) {
      const delta = target - existing.credence;
      if (Math.abs(delta) < NOISE_DELTA) {
        // No real movement — still refresh the softer fields.
        if (raw.would_change) existing.would_change = String(raw.would_change).slice(0, 200);
        continue;
      }
      const bounded = existing.credence + Math.sign(delta) * Math.min(Math.abs(delta), maxDelta);
      const next = clamp01(bounded);
      if (Math.abs(next - existing.credence) < NOISE_DELTA) continue; // weak evidence, no real move
      existing.history = [...existing.history, { turn, credence: existing.credence, note, kind }].slice(-8);
      if (Math.abs(next - existing.credence) >= SHIFT_DELTA) {
        shifts.push({ id, claim: existing.claim, from: existing.credence, to: next, reason: note, kind });
      }
      existing.credence = next;
      existing.label = beliefLabel(next, thresholds);
      existing.updated_turn = turn;
      if (raw.would_change) existing.would_change = String(raw.would_change).slice(0, 200);
      if (raw.evidence_note) existing.evidence = [...existing.evidence, String(raw.evidence_note).slice(0, 160)].slice(-4);
    } else {
      const entry = {
        id,
        claim: raw.claim.trim().slice(0, 240),
        credence: clamp01(Math.max(NEW_MIN, Math.min(NEW_MAX, target))),
        would_change: raw.would_change ? String(raw.would_change).slice(0, 200) : '',
        evidence: raw.evidence_note ? [String(raw.evidence_note).slice(0, 160)] : [],
        history: [],
        updated_turn: turn,
      };
      entry.label = beliefLabel(entry.credence, thresholds);
      byId[id] = entry;
      l.positions.push(entry);
    }
  }

  // Cap the portfolio at working-memory size: keep the most recently touched.
  if (l.positions.length > MAX_POSITIONS) {
    l.positions = [...l.positions]
      .sort((a, b) => b.updated_turn - a.updated_turn)
      .slice(0, MAX_POSITIONS);
  }
  l.updated_turn = Math.max(l.updated_turn, turn);
  return { ledger: l, shifts };
}

