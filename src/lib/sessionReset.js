// Clear numeric ratings together with their source assessments so a rerun
// cannot prefer the previous round's risk over newly generated findings.
export const SESSION_AGENT_RESET = Object.freeze({
  round1_assessment: null, round1_severity: null, round1_confidence: null,
  round1_likelihood: null, round1_impact: null,
  round2_rebuttal: null, round2_revised_severity: null, round2_confidence: null,
  round2_likelihood: null, round2_impact: null,
  compound_chain_text: null, round0_briefing: null, status: 'pending',
});
