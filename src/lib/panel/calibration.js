// Metacognition — the confidence calibration loop (Virtual Domain Expert
// architecture §2.2): after speaking, an expert checks whether their certainty
// outpaced their evidence, and if so says so out loud and softens the
// overclaimed positions in their ledger.
//
// Cost is gated locally. Only System 1 (quick-reply) turns are audited — a
// System 2 turn already reasoned through competing hypotheses — and only when
// the reply SOUNDED surer than the expert's snap-read cap permits: strong
// certainty markers, few hedges, or a stated confidence above the cap. That
// lexical check is free; the audit itself is one small model call.
//
// No top-level '@' imports, so the pure parts load in plain node for tests;
// the llm import is deferred to inside auditCalibrationLLM.

import { normalizeLedger } from './beliefLedger.js';

// Certainty markers that raise assertiveness, and hedges that lower it.
const STRONG = [
  /\bdefinitely\b/, /\bcertainly\b/, /\bclearly\b/, /\bobviously\b/, /\bundoubtedly\b/,
  /\bunquestionably\b/, /\bwithout (a )?doubt\b/, /\bno doubt\b/, /\bguaranteed?\b/,
  /\babsolutely\b/, /\balways\b/, /\bnever\b/, /\bimpossible\b/, /\bcannot\b/, /\bcan't\b/,
  /\bwill (not |never )?(fail|work|happen|hold|break|succeed)\b/, /\bis the (only|primary|real|single|main)\b/,
  /\bthere('s| is) no (way|question|chance)\b/, /\bproven\b/, /\bestablished fact\b/, /\bit's a fact\b/,
  /\b100 ?%/, /\bmust\b/,
];
const HEDGE = [
  /\blikely\b/, /\bprobably\b/, /\bmight\b/, /\bmay\b/, /\bcould\b/, /\bsuggests?\b/,
  /\bi (think|suspect|believe|'d guess|would guess)\b/, /\bmy (read|sense|guess|hunch)\b/,
  /\buncertain\b/, /\bnot sure\b/, /\bhard to say\b/, /\bdepends\b/, /\broughly\b/, /\baround\b/,
  /\bapproximately\b/, /\bestimate\b/, /\bhypothesis\b/, /\bworking theory\b/, /\bif\b/,
  /\bassuming\b/, /\bperhaps\b/, /\bpossibly\b/, /\bseems?\b/, /\bunclear\b/,
];

// Highest confidence the speaker stated as a percentage (0..1), or null.
export function statedConfidence(text) {
  let max = null;
  for (const m of (text || '').matchAll(/(\d{1,3})\s?%/g)) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 100 && (max == null || n > max)) max = n;
  }
  return max == null ? null : max / 100;
}

// How sure the reply SOUNDS, 0..1. Lexical and local.
export function assertivenessOf(text) {
  const t = (text || '').toLowerCase();
  if (!t) return 0;
  let strong = 0, hedge = 0;
  for (const re of STRONG) if (re.test(t)) strong++;
  for (const re of HEDGE) if (re.test(t)) hedge++;
  const pct = statedConfidence(t);
  const score = strong * 0.25 - hedge * 0.12 + (pct != null && pct >= 0.85 ? 0.3 : 0);
  return Math.max(0, Math.min(1, score));
}

export const AUDIT_THRESHOLD = 0.4;
const MIN_AUDIT_LENGTH = 40;

/**
 * Should this turn be audited? Only quick (System 1) replies of real length
 * that either state a confidence above the expert's snap cap or sound
 * assertive enough to have outrun a gut read.
 */
export function needsCalibrationAudit({ text, mode = 'system1', snapCap = 0.65 } = {}) {
  if (mode !== 'system1') return false;
  if (!text || text.trim().length < MIN_AUDIT_LENGTH) return false;
  const pct = statedConfidence(text);
  if (pct != null && pct > snapCap) return true;
  return assertivenessOf(text) >= AUDIT_THRESHOLD;
}

// Per-session calibration tally, carried on the belief ledger.
export function bumpCalibration(ledger, { overreach = false, corrected = false } = {}) {
  const l = normalizeLedger(ledger);
  const c = l.calibration || { audits: 0, overreach: 0, corrections: 0 };
  return {
    ...l,
    calibration: {
      audits: c.audits + 1,
      overreach: c.overreach + (overreach ? 1 : 0),
      corrections: c.corrections + (corrected ? 1 : 0),
    },
  };
}

/**
 * The audit itself: the expert's own metacognition judging what they just
 * said against the evidence they actually had. Returns
 *   { overreach, claims[], soften[{id, credence, reason}], correction|null }
 * or null if the model gave nothing usable.
 */
