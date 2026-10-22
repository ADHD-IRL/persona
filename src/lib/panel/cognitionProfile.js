// Per-SME cognition profile — the persona-level slice of the Virtual Domain
// Expert architecture. The runtime engines (belief ledger, System 1/2 router,
// attention) implement the machinery; this block holds the INDIVIDUAL
// DIFFERENCES they read: how confident an expert lets a gut read be, what makes
// them slow down, how they weigh kinds of evidence, where their belief
// thresholds sit, which biases they police in themselves, and how much room
// they leave for tail risk.
//
// Deliberately omitted: capacity_chunks, decay_rate_ms, monitoring hz, speed
// multipliers, search depth — numbers that describe a brain without changing
// what a language model says. Every field here alters an observable behavior.
//
// Stored in agents.cognition (jsonb, migration 024). A missing block is fine:
// deriveCognitionDefaults() produces a deterministic baseline from the fields
// every persona already has, so all 300+ SMEs behave sensibly before any
// per-persona refinement. No imports — loadable by plain node for tests.

export const COGNITION_VERSION = 1;

const clamp01 = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};
const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
const has = (text, ...words) => words.some(w => lower(text).includes(w));

// What makes each reasoning style slow down and think — the System 2 trigger.
const DELIBERATION_BY_STYLE = {
  Analytical:    'when the numbers don\'t reconcile or a claim outruns the evidence behind it',
  Intuitive:     'when a pattern doesn\'t match anything you\'ve seen before',
  Contrarian:    'when the room agrees too quickly',
  Systematic:    'when a step in the chain is missing or has been assumed',
  Probabilistic: 'when the base rate and the specific case disagree',
};
const DELIBERATION_DEFAULT = 'when the question is novel or the stakes are high';

// How confident a snap read is allowed to be before the expert must deliberate
// (the architecture's System 1 accuracy_confidence_cap), by seniority.
const SNAP_CAP_BY_LEVEL = {
  'Junior': 0.55,
  'Mid-Level': 0.60,
  'Senior': 0.70,
  'Principal': 0.75,
  'World-Class': 0.80,
};
const SNAP_CAP_DEFAULT = 0.65;

// The architecture's default belief-state thresholds (§2.3).
const BELIEF_DEFAULT = { hypothesis: 0.3, working_theory: 0.7, established_fact: 0.95 };

// The architecture's System 1 biases to monitor, used when a persona names none.
const BIASES_DEFAULT = ['Availability', 'Anchoring', 'Confirmation'];

// Black-swan allowance margin (§1 UncertaintyHandling) default.
const TAIL_DEFAULT = 0.05;

function splitBiases(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/[,;\n]| and /i)
    .map(s => s.replace(/\b(bias|biases)\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 1)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .slice(0, 6);
}

/**
 * Deterministic baseline cognition from the fields every persona already has.
 * Same input → same output, so the whole bench can be expanded consistently
 * with no model calls. Coarse by design — a per-persona LLM refinement pass
 * (derived: 'llm') can replace it later.
 */
export function deriveCognitionDefaults(agent = {}) {
  const style = agent.reasoning_style;
  const rp = agent.risk_posture || {};

  // Source credibility: a shared base, tilted by how the expert reasons.
  const cred = {
    empirical_data: 0.90,
    peer_consensus: 0.75,
    institutional_reporting: 0.70,
    anecdotal_reports: 0.30,
    vendor_claims: 0.35,
  };
  if (style === 'Analytical' || style === 'Probabilistic') { cred.empirical_data = 0.95; cred.anecdotal_reports = 0.20; }
  if (style === 'Systematic')  { cred.empirical_data = 0.92; }
  if (style === 'Intuitive')   { cred.anecdotal_reports = 0.45; cred.peer_consensus = 0.80; }
  if (style === 'Contrarian')  { cred.peer_consensus = 0.55; cred.vendor_claims = 0.25; }

  // Belief thresholds: sceptics and probabilists demand more before "fact";
  // intuitives form working theories sooner.
  const bt = { ...BELIEF_DEFAULT };
  if (style === 'Contrarian' || style === 'Probabilistic') bt.established_fact = 0.97;
  if (style === 'Intuitive') bt.working_theory = 0.65;

  // Tail-risk allowance from risk posture text (free-form on the bench).
  let tail = TAIL_DEFAULT;
  if (has(rp.risk_sensitivity, 'high', 'acute', 'elevated')) tail = 0.10;
  else if (has(rp.risk_sensitivity, 'low', 'relaxed')) tail = 0.03;
  if (has(rp.false_negative_tolerance, 'low', 'zero', 'none', 'intolerant')) tail = Math.max(tail, 0.10);
  if (has(rp.escalation_bias, 'escalat', 'aggressive', 'early')) tail = Math.max(tail, 0.08);

  const biases = splitBiases(agent.cognitive_bias);

  return {
    version: COGNITION_VERSION,
    derived: 'defaults',
    deliberation_trigger: DELIBERATION_BY_STYLE[style] || DELIBERATION_DEFAULT,
    snap_confidence_cap: SNAP_CAP_BY_LEVEL[agent.expertise_level] ?? SNAP_CAP_DEFAULT,
    source_credibility: cred,
    belief_thresholds: bt,
    biases_to_monitor: biases.length ? biases : [...BIASES_DEFAULT],
    tail_risk_allowance: tail,
  };
}

/**
 * Safe parse of whatever is stored, with every gap filled from the derived
 * baseline for this persona — so callers always get a complete block.
 */
export function normalizeCognition(raw, agent = {}) {
  const d = deriveCognitionDefaults(agent);
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const credIn = r.source_credibility && typeof r.source_credibility === 'object' ? r.source_credibility : {};
  const btIn = r.belief_thresholds && typeof r.belief_thresholds === 'object' ? r.belief_thresholds : {};

  const cred = {};
  for (const k of Object.keys(d.source_credibility)) cred[k] = clamp01(credIn[k], d.source_credibility[k]);

  const bt = {
    hypothesis: clamp01(btIn.hypothesis, d.belief_thresholds.hypothesis),
    working_theory: clamp01(btIn.working_theory, d.belief_thresholds.working_theory),
    established_fact: clamp01(btIn.established_fact, d.belief_thresholds.established_fact),
  };
  // Keep the ladder ordered even if a stored value is odd.
  bt.working_theory = Math.max(bt.working_theory, bt.hypothesis + 0.05);
  bt.established_fact = Math.max(bt.established_fact, bt.working_theory + 0.05);
  bt.established_fact = Math.min(1, bt.established_fact);

  const biases = Array.isArray(r.biases_to_monitor)
    ? r.biases_to_monitor.map(b => String(b).trim()).filter(Boolean).slice(0, 8)
    : d.biases_to_monitor;

  return {
    version: Number(r.version) || COGNITION_VERSION,
    derived: ['defaults', 'llm', 'manual'].includes(r.derived) ? r.derived : (raw ? 'manual' : 'defaults'),
    deliberation_trigger: typeof r.deliberation_trigger === 'string' && r.deliberation_trigger.trim()
      ? r.deliberation_trigger.trim().slice(0, 240)
      : d.deliberation_trigger,
    snap_confidence_cap: clamp01(r.snap_confidence_cap, d.snap_confidence_cap),
    source_credibility: cred,
    belief_thresholds: bt,
    biases_to_monitor: biases.length ? biases : d.biases_to_monitor,
    tail_risk_allowance: clamp01(r.tail_risk_allowance, d.tail_risk_allowance),
  };
}

/** The cognition block for an agent — stored if present, derived otherwise. */
export function cognitionFor(agent) {
  return normalizeCognition(agent?.cognition, agent || {});
}

const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * Prompt lines describing the cognition profile — appended to the persona
 * header so the expert's individual cognitive habits shape every turn.
 */
export function describeCognition(c) {
  if (!c) return [];
  const lines = [];
  lines.push(`Snap-read confidence cap: a gut read of yours never carries more than ${pct(c.snap_confidence_cap)} confidence — past that you slow down and reason it through.`);
  lines.push(`You slow down and deliberate ${c.deliberation_trigger}.`);
  const s = c.source_credibility;
  lines.push(`How you weigh evidence (credibility you assign): empirical data ${pct(s.empirical_data)}, peer consensus ${pct(s.peer_consensus)}, institutional reporting ${pct(s.institutional_reporting)}, anecdote ${pct(s.anecdotal_reports)}, vendor claims ${pct(s.vendor_claims)}. Say when a read leans on the weaker kinds.`);
  const b = c.belief_thresholds;
  lines.push(`Your belief ladder: a hypothesis from ~${pct(b.hypothesis)}, a working theory from ~${pct(b.working_theory)}, and you call something established only at ~${pct(b.established_fact)}.`);
  if (c.biases_to_monitor?.length) lines.push(`Biases you actively police in yourself: ${c.biases_to_monitor.join(', ')}.`);
  lines.push(`Tail-risk allowance: you hold ~${pct(c.tail_risk_allowance)} in reserve for low-probability, high-impact outcomes the evidence hasn't ruled out.`);
  return lines;
}
