// Run with: node scripts/cognitionProfile.test.mjs
import {
  COGNITION_VERSION, deriveCognitionDefaults, normalizeCognition, cognitionFor, describeCognition,
} from '../src/lib/panel/cognitionProfile.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const analyticalPrincipal = {
  name: 'Sarah Chen', reasoning_style: 'Analytical', expertise_level: 'Principal',
  cognitive_bias: 'Anchoring bias and confirmation bias',
  risk_posture: { risk_sensitivity: 'High', false_negative_tolerance: 'Low' },
};
const intuitiveJunior = { name: 'Lee', reasoning_style: 'Intuitive', expertise_level: 'Junior' };
const contrarian = { name: 'Reed', reasoning_style: 'Contrarian', expertise_level: 'Senior', cognitive_bias: '' };

// ── Determinism ──────────────────────────────────────────────────────────────
{
  const a = deriveCognitionDefaults(analyticalPrincipal);
  const b = deriveCognitionDefaults(analyticalPrincipal);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same persona → identical baseline');
  ok(a.version === COGNITION_VERSION && a.derived === 'defaults', 'stamped with version and derived=defaults');
}

// ── Individual differences fall out of existing fields ───────────────────────
{
  const a = deriveCognitionDefaults(analyticalPrincipal);
  const j = deriveCognitionDefaults(intuitiveJunior);
  const c = deriveCognitionDefaults(contrarian);
  ok(a.snap_confidence_cap > j.snap_confidence_cap, 'a Principal trusts a snap read more than a Junior');
  ok(a.source_credibility.empirical_data > j.source_credibility.empirical_data, 'Analytical weights empirical data higher than Intuitive');
  ok(j.source_credibility.anecdotal_reports > a.source_credibility.anecdotal_reports, 'Intuitive weights anecdote higher than Analytical');
  ok(c.source_credibility.peer_consensus < a.source_credibility.peer_consensus, 'Contrarian discounts peer consensus');
  ok(c.belief_thresholds.established_fact > a.belief_thresholds.established_fact, 'Contrarian demands more before calling something established');
  ok(j.belief_thresholds.working_theory < a.belief_thresholds.working_theory, 'Intuitive forms working theories sooner');
  ok(a.deliberation_trigger !== j.deliberation_trigger, 'deliberation trigger differs by reasoning style');
}

// ── Risk posture text drives tail-risk allowance ─────────────────────────────
{
  const a = deriveCognitionDefaults(analyticalPrincipal);          // high sensitivity, low FN tolerance
  const relaxed = deriveCognitionDefaults({ risk_posture: { risk_sensitivity: 'Low' } });
  const none = deriveCognitionDefaults({});
  ok(a.tail_risk_allowance === 0.10, `high sensitivity → 0.10 tail allowance, got ${a.tail_risk_allowance}`);
  ok(relaxed.tail_risk_allowance === 0.03, `low sensitivity → 0.03, got ${relaxed.tail_risk_allowance}`);
  ok(none.tail_risk_allowance === 0.05, `no posture → architecture default 0.05, got ${none.tail_risk_allowance}`);
}

// ── Biases parse from free text, or fall back to the architecture's list ─────
{
  const a = deriveCognitionDefaults(analyticalPrincipal);
  ok(a.biases_to_monitor.length === 2 && a.biases_to_monitor.every(b => /Anchoring|Confirmation/.test(b)), `split "X bias and Y bias" → [Anchoring, Confirmation], got ${JSON.stringify(a.biases_to_monitor)}`);
  const c = deriveCognitionDefaults(contrarian);
  ok(JSON.stringify(c.biases_to_monitor) === JSON.stringify(['Availability', 'Anchoring', 'Confirmation']), 'empty bias text → default System 1 biases');
}

// ── normalizeCognition fills gaps and keeps the belief ladder ordered ────────
{
  const partial = { snap_confidence_cap: 1.7, belief_thresholds: { hypothesis: 0.9, working_theory: 0.2 }, biases_to_monitor: ['Sunk cost'] };
  const n = normalizeCognition(partial, analyticalPrincipal);
  ok(n.snap_confidence_cap === 1, 'out-of-range cap clamped to 1');
  ok(n.belief_thresholds.working_theory > n.belief_thresholds.hypothesis, 'working theory forced above hypothesis');
  ok(n.belief_thresholds.established_fact > n.belief_thresholds.working_theory, 'established fact forced above working theory');
  ok(n.belief_thresholds.established_fact <= 1, 'ladder capped at 1');
  ok(n.biases_to_monitor[0] === 'Sunk cost', 'stored biases preserved');
  ok(n.deliberation_trigger === deriveCognitionDefaults(analyticalPrincipal).deliberation_trigger, 'missing trigger filled from derived baseline');
  ok(n.derived === 'manual', 'a stored block without a derived tag is treated as manual');
  ok(normalizeCognition(null, analyticalPrincipal).derived === 'defaults', 'null block → defaults');
}

// ── cognitionFor prefers the stored block, else derives ──────────────────────
{
  const stored = { ...analyticalPrincipal, cognition: { derived: 'llm', snap_confidence_cap: 0.42 } };
  ok(cognitionFor(stored).snap_confidence_cap === 0.42 && cognitionFor(stored).derived === 'llm', 'stored block wins');
  ok(cognitionFor(analyticalPrincipal).derived === 'defaults', 'no block → derived defaults');
  ok(cognitionFor(null).snap_confidence_cap === 0.65, 'null agent → safe generic defaults');
}

// ── describeCognition renders every field as prompt text ─────────────────────
{
  const lines = describeCognition(cognitionFor(analyticalPrincipal));
  const text = lines.join('\n');
  ok(lines.length === 6, `six prompt lines, got ${lines.length}`);
  ok(text.includes('75%') && text.includes('Snap-read'), 'renders the snap cap as a percentage');
  ok(text.includes('Anchoring'), 'renders biases');
  ok(text.includes('established only at ~95%'), 'renders the belief ladder');
  ok(describeCognition(null).length === 0, 'null → no lines');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

