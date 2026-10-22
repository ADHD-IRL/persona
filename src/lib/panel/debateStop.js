// Debate termination — decides WHEN a non-facilitated run should end, the way
// floorControl decides WHO speaks. All heuristic and local (no LLM call).
//
// The principle: a debate is a search with diminishing returns. Each turn buys
// an increment of understanding g_t at a cost c (tokens, latency, attention).
// The optimal-stopping rule is: continue while E[g_{t+1}] > c, stop at the
// first turn where it drops below. Because increments are non-negative and
// shrinking in expectation, cumulative value is concave and the first
// down-crossing is the global optimum — stop earlier and value is left on the
// table, later and every turn costs more than it returns.
//
//   g_t = wN·novelty + wM·movement + wD·(disagreement · movement)
//
// The disagreement·movement product is deliberate: disagreement is only worth
// another turn while positions are still MOVING. A split room that has stopped
// moving is an impasse — a finding to record, not a reason to keep burning
// turns. Full derivation in docs/debate-termination.md.

// Relative (not @/ alias) so plain `node scripts/debateStop.test.mjs` can
// import this module without the bundler.
import { tokens } from './floorControl.js';

export const STOP_DEFAULTS = {
  wN: 0.25,         // weight: novelty (ground not covered in the recent window)
  wE: 0.25,         // weight: engagement (is this turn in dialogue with the room)
  wS: 0.25,         // weight: substance (is it concrete — figures, sources, reasoning)
  wM: 0.15,         // weight: position movement between polls
  wD: 0.10,         // weight: live disagreement (only while still moving)
  alpha: 0.5,       // EWMA smoothing on g_t
  // Calibrated against the composite below, which without a poll is the mean
  // of novelty, engagement, and substance. A turn that names a colleague,
  // cites something, and carries figures measures 0.6-0.8; vague agreement
  // measures 0.1-0.2. The bars sit between those bands.
  epsilon: 0.25,    // marginal cost of a turn — the stop bar for ḡ
  nu: 0.18,         // per-turn floor on g: a turn under this is a dry turn
  delta: 0.25,      // disagreement below this = consensus
  mu: 0.15,         // movement below this = positions have settled
  patience: 3,      // consecutive dry turns before stopping (lull protection)
  maxTurns: 12,     // hard budget backstop per auto-run
  pollWindow: 4,    // a poll older than this many turns is stale for M/D
  noveltyWindow: 6, // novelty is judged against the last N turns, not all time
};

// ── Per-turn signals ──────────────────────────────────────────────────────────

// Novelty: the share of a turn's content words not seen anywhere earlier in
// the discussion. 1 = all new ground, 0 = pure restatement. `seen` is mutated.
//
// Kept for callers that want lifetime novelty, but the tracker does NOT use
// it: measured against every word ever spoken, novelty decays monotonically
// and cannot recover, because a panel of specialists exhausts its shared
// vocabulary within a few turns. That made the pulse read "wrapping up" from
// turn four onward regardless of how good the argument was. The tracker uses
// noveltyAgainst() over a sliding window instead.
export function noveltyOf(text, seen) {
  const words = tokens(text);
  if (!words.length) return 0;
  let fresh = 0;
  for (const w of words) {
    if (!seen.has(w)) { fresh++; seen.add(w); }
  }
  return fresh / words.length;
}

// Novelty against a sliding window of recent turns: the share of content words
// that did not appear in the last N turns. Restating what was just said scores
// near zero; returning to an earlier thread with new material scores fresh
// again, which is what actually distinguishes a circling debate from a moving
// one. `recent` is an array of Sets, newest last.
export function noveltyAgainst(text, recent = []) {
  const words = tokens(text);
  if (!words.length) return 0;
  let fresh = 0;
  for (const w of words) {
    let seenRecently = false;
    for (const s of recent) { if (s.has(w)) { seenRecently = true; break; } }
    if (!seenRecently) fresh++;
  }
  return fresh / words.length;
}

// Engagement: is this turn in dialogue with the room, or a monologue? A debate
// that is working has experts answering each other by name, conceding specific
// points, and putting questions back. Unlike novelty this does not decay — a
// panel can engage hard on turn thirty.
const REBUT_RE = /\b(disagree|not right|wrong about|that is not|that's not|i'd push back|push back|the problem with|contrary|actually no|overstate|understate|too confident|skeptical of that|i doubt|overlooks?|misses the|skips?|ignores?|does not account|doesn't account|needs a source|is invented)\b/i;
const CONCEDE_RE = /\b(fair point|you are right|you're right|i'll grant|granted|i accept|that changes|i was wrong|i take that back|good catch|i'll concede|concede that|is right that|are right that)\b/i;
// Experts engage each other constantly without using names — "that assumes",
// "both of those positions", "the argument that". Without these, a perfectly
// good panel scores zero engagement and the pulse unfairly reads as cooling.
const REFERENCE_RE = /\b(that assumes|those assumptions?|that argument|the argument that|the point about|as noted|earlier point|someone said|we heard|the claim that|that read|the position that|those positions|that position|both of those|is right but|are right but|underneath (it|that|this)|the assumption|that figure|that number|those numbers)\b/i;
const HEDGE_ONLY_RE = /^\s*(i agree|agreed|exactly|right|yes|same here|no notes|nothing to add)\b/i;

export function engagementOf(text, { roster = [], lastSpeaker = null } = {}) {
  const t = String(text || '');
  if (!t.trim()) return 0;
  let score = 0;

  // Naming a colleague is the strongest signal of a real exchange.
  const names = [lastSpeaker, ...roster].filter(n => typeof n === 'string');
  const wordTokens = new Set(t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const named = names.some(n => {
    const parts = n.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    return [parts[0], parts.at(-1)].some(part => part?.length > 2 && wordTokens.has(part));
  });
  if (named) score += 0.45;

  if (REBUT_RE.test(t)) score += 0.3;
  if (CONCEDE_RE.test(t)) score += 0.3;
  if (REFERENCE_RE.test(t)) score += 0.25;

  // A question keeps the floor open for someone else.
  const questions = (t.match(/\?/g) || []).length;
  if (questions) score += Math.min(0.25, questions * 0.15);

  // Bare agreement with nothing after it is the opposite of engagement.
  if (HEDGE_ONLY_RE.test(t) && t.length < 220) score -= 0.25;

  return Math.max(0, Math.min(1, score));
}

// Substance: is the turn concrete enough to be acted on or argued with?
// Figures, named sources, and explicit reasoning are what make a panel turn
// worth its cost; adjectives are not.
const CITE_RE = /\b(per the|according to|section \d|the (register|plan|sop|guide|brief|document|report|assessment)|cites?|page \d|appendix|annex|paragraph)\b/i;
const CAUSAL_RE = /\b(because|which means|therefore|the reason|if .{2,60}\bthen\b|so that|the risk is|that implies|follows that|as a result)\b/i;
const CONDITION_RE = /\b(unless|provided that|only if|assuming|depends on|contingent|trade-?off|on condition)\b/i;

export function substanceOf(text) {
  const t = String(text || '');
  if (!t.trim()) return 0;
  let score = 0;

  // Figures: percentages, counts with units, times, quantities.
  const figures = (t.match(/\b\d+(?:[.,]\d+)?\s*(?:%|percent|hours?|minutes?|days?|weeks?|months?|gallons?|miles?|km|kilometers?|feet|meters?|degrees?|beds?|people|patients?|units?|dollars?|\$)?/gi) || [])
    .filter(m => /\d/.test(m)).length;
  score += Math.min(0.4, figures * 0.13);

  if (CITE_RE.test(t)) score += 0.25;
  if (CAUSAL_RE.test(t)) score += 0.2;
  if (CONDITION_RE.test(t)) score += 0.15;

  // Length is weak evidence of substance, and only up to a point.
  const words = tokens(t).length;
  score += Math.min(0.15, words / 400);

  return Math.max(0, Math.min(1, score));
}

// Movement: how much the ledger moved at the LAST poll — position changes and
// confidence deltas, averaged over the room. recordPositions() already stores
// shifted/confDelta per expert, so one ledger read gives movement since the
// poll before it.
export function movementOf(positions) {
  const list = Object.values(positions || {});
  if (!list.length) return null;
  let sum = 0;
  for (const p of list) {
    const shift = p.shifted ? 1 : 0;
    const conf = p.confDelta != null ? Math.min(1, Math.abs(p.confDelta) / 100) : 0;
    sum += (shift + conf) / 2;
  }
  return sum / list.length;
}

// Disagreement: confidence-weighted spread of stances. 0 = unanimous,
// 1 = evenly split. Needs the stance sign pollExpert now returns
// (for/against → ±1, mixed → 0). Null when no expert gave a usable stance.
const STANCE_SIGN = { for: 1, against: -1, mixed: 0 };
export function disagreementOf(positions) {
  const list = Object.values(positions || {});
  let net = 0, mass = 0;
  for (const p of list) {
    const s = STANCE_SIGN[p.stance];
    if (s === undefined) continue;
    const w = p.confidence != null ? p.confidence : 50; // unstated confidence = middling
    net += s * w;
    mass += w;
  }
  if (!mass) return null;
  return 1 - Math.abs(net) / mass;
}

// ── The tracker ───────────────────────────────────────────────────────────────

// One tracker per auto-run burst. Feed it each completed turn; it answers
// { stop, reason, kind, metrics }. Kinds map to the legitimate endings:
//   consensus  — the room agrees and has stopped moving
//   impasse    — stable disagreement (itself a finding)
//   exhaustion — novelty dried up / marginal value under the cost bar
//   budget     — hard turn cap (handled by the caller's counter)
// Silence (nobody clears the floor) is upstream: pickNextSpeaker returns null
// before a turn ever runs, so the caller reports it directly.
export function createStopTracker(overrides = {}) {
  const { seedTexts = [], ...rest } = overrides;
  const cfg = { ...STOP_DEFAULTS, ...rest };
  // Sliding window of the last few turns' vocabulary. Seeded with the
  // discussion so far so a burst's first turn is not scored as all-new when it
  // restates what was already on the table.
  const recent = [];
  const pushWindow = (text) => {
    recent.push(new Set(tokens(text)));
    while (recent.length > cfg.noveltyWindow) recent.shift();
  };
  for (const t of seedTexts) pushWindow(t);
  let gbar = null;        // EWMA of g_t — null until the first turn
  let dryStreak = 0;
  let turn = 0;
  let lastSpeakerName = null;
  let lastEvaluatedPollAt = null; // don't re-judge the same poll every turn

  // The pulse record: one metrics entry per observed turn, plus point events
  // (polls landing, runs ending) — what the DebatePulse chart renders.
  const history = [];
  const events = [];

  return {
    config: cfg,
    history,
    events,

    // A single quiet turn shouldn't kill a burst the user just started — the
    // room may have been idling before "Let them talk" was pressed.
    resetStreak() { dryStreak = 0; },

    // Record that the caller actually ended a run (the tracker only advises;
    // silence and budget endings never even pass through observeTurn).
    markStop(kind) { events.push({ turn, type: 'stop', kind }); },

    // Point events the chart annotates as CAUSES of momentum changes:
    // a stance switch ({type:'stance', stance}) or a facilitator/human message
    // ({type:'human'}). Anchored to the current turn count — they render in
    // the gap after that turn's bar.
    markEvent(type, data = {}) { events.push({ turn, type, ...data }); },

    /**
     * Observe one completed SME turn.
     * @param text          the turn's full text
     * @param speaker       display name of who spoke (for the pulse tooltip)
     * @param speakerId     agent id (bars are painted in the speaker's color)
     * @param positions     report.positions (the ledger), if any
     * @param pollTurn      agent-turn count when the latest poll was taken
     * @param currentTurn   agent-turn count now (for poll freshness)
     */
    observeTurn({ text, speaker = null, speakerId = null, positions = null, pollTurn = null, currentTurn = null, roster = [] }) {
      turn++;
      // Three signals that describe the turn itself, none of which decay
      // structurally: did it cover new ground, did it engage the room, was it
      // concrete. Novelty is measured BEFORE this turn joins the window.
      const n = noveltyAgainst(text, recent);
      const e = engagementOf(text, { roster, lastSpeaker: lastSpeakerName });
      const s = substanceOf(text);
      pushWindow(text);
      lastSpeakerName = speaker || lastSpeakerName;

      // M and D only count while the poll behind them is fresh; a stale ledger
      // says nothing about where the room is NOW.
      const fresh = pollTurn != null && currentTurn != null && currentTurn - pollTurn <= cfg.pollWindow;
      const M = fresh ? movementOf(positions) : null;
      const D = fresh ? disagreementOf(positions) : null;

      // Composite marginal value. When M/D are unknown, renormalize onto the
      // signals we have rather than treating absence as zero progress.
      let g = cfg.wN * n + cfg.wE * e + cfg.wS * s;
      let weight = cfg.wN + cfg.wE + cfg.wS;
      if (M != null) { g += cfg.wM * M; weight += cfg.wM; }
      if (M != null && D != null) { g += cfg.wD * (D * M); weight += cfg.wD; }
      g = g / weight;
      gbar = gbar == null ? g : cfg.alpha * g + (1 - cfg.alpha) * gbar;

      const metrics = {
        turn,
        speaker,
        speakerId,
        novelty: round2(n),
        engagement: round2(e),
        substance: round2(s),
        movement: M != null ? round2(M) : null,
        disagreement: D != null ? round2(D) : null,
        g: round2(g),
        gbar: round2(gbar),
        // The weakest component, so the cue can say WHY momentum is falling
        // instead of only that it is.
        weakest: [['novelty', n], ['engagement', e], ['substance', s]].sort((a, b) => a[1] - b[1])[0][0],
      };
      history.push(metrics);

      let verdict = null;

      // Poll-driven endings — judged once per poll, when its data is fresh.
      if (fresh && M != null && pollTurn !== lastEvaluatedPollAt) {
        lastEvaluatedPollAt = pollTurn;
        events.push({ turn, type: 'poll', movement: round2(M), disagreement: D != null ? round2(D) : null });
        if (M < cfg.mu && D != null && D < cfg.delta) {
          verdict = { stop: true, kind: 'consensus', metrics,
            reason: 'the room agrees and positions have settled' };
        } else if (M < cfg.mu && D != null && D >= cfg.delta) {
          verdict = { stop: true, kind: 'impasse', metrics,
            reason: 'positions have stopped moving but the room is still split — record the disagreement as a finding' };
        }
      }

      // Turn-driven ending — diminishing returns, with patience so a single
      // quiet turn (someone restating to hand off) doesn't kill a live thread.
      // Judged on the composite, not on novelty alone: a turn can cover no new
      // vocabulary and still be the best turn of the debate if it takes someone
      // apart with figures.
      if (gbar < cfg.epsilon || g < cfg.nu) dryStreak++;
      else dryStreak = 0;
      metrics.dry = dryStreak;

      if (!verdict && dryStreak >= cfg.patience) {
        verdict = { stop: true, kind: 'exhaustion', metrics,
          reason: 'the last few turns added nothing new' };
      }

      return verdict || { stop: false, kind: null, reason: null, metrics };
    },
  };
}

function round2(v) { return Math.round(v * 100) / 100; }

