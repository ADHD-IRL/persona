const toText = (x) => (x == null ? '' : typeof x === 'string' ? x : typeof x === 'object' ? JSON.stringify(x) : String(x));
const toList = (x) => Array.isArray(x) ? x.map(toText).filter(Boolean) : (x == null || x === '' ? [] : [toText(x)]);
const oneOf = (x, allowed, fallback) => { const v = toText(x).trim().toUpperCase(); return allowed.includes(v) ? v : fallback; };

/** Map whatever the model called an option (id, letter, "Option B", or its name) to a real option id. */
export function resolveOptionId(raw, options) {
  if (raw == null) return null;
  const s = toText(raw).trim();
  if (!s) return null;
  const byId = options.find(o => o.id === s);
  if (byId) return byId.id;
  const m = s.match(/^(?:option\s*)?([A-Za-z])\b/i);
  if (m) { const idx = m[1].toUpperCase().charCodeAt(0) - 65; if (options[idx]) return options[idx].id; }
  const low = s.toLowerCase();
  const byName = options.find(o => (o.name || '').trim().toLowerCase() === low);
  if (byName) return byName.id;
  const byContains = options.find(o => o.name && low.includes(o.name.trim().toLowerCase()));
  return byContains?.id || null;
}

export function normalizeAssessment(parsed, options) {
  const status = parsed.recommendation_status == null ? 'RECOMMEND_OPTION' : toText(parsed.recommendation_status).trim().toUpperCase();
  if (!['RECOMMEND_OPTION', 'REJECT_ALL', 'NEEDS_MORE_INFORMATION'].includes(status)) throw new Error('Unknown recommendation status. Try regenerating.');
  const recommends = status === 'RECOMMEND_OPTION';
  const recommended = recommends ? resolveOptionId(parsed.recommended_option_id, options) : null;
  if (!recommends && parsed.recommended_option_id != null && toText(parsed.recommended_option_id).trim()) throw new Error('A deferred or rejected assessment must not recommend an option. Try regenerating.');
  if (recommends && !recommended) {
    throw new Error(`The assessment recommended "${toText(parsed.recommended_option_id)}", which is not one of this decision's options. Try regenerating.`);
  }
  if (!Array.isArray(parsed.options)) throw new Error('The assessment needs evidence for every option. Try regenerating.');
  const seen = new Set();
  const normOptions = parsed.options
    .filter(o => o && typeof o === 'object')
    .map(o => ({
      option_id: resolveOptionId(o.option_id, options),
      verdict: oneOf(o.verdict, ['RECOMMENDED', 'VIABLE', 'NOT RECOMMENDED', 'NEEDS EVIDENCE'], 'VIABLE'),
      risk_summary: toText(o.risk_summary),
      key_risks: toList(o.key_risks),
      meets_acceptance_criteria: oneOf(o.meets_acceptance_criteria, ['YES', 'PARTIAL', 'NO', 'UNKNOWN'], 'UNKNOWN'),
      acceptance_note: toText(o.acceptance_note),
      assumptions_at_risk: toList(o.assumptions_at_risk),
      accepted_risk_if_chosen: toText(o.accepted_risk_if_chosen),
    }))
    .filter(o => o.option_id && !seen.has(o.option_id) && seen.add(o.option_id))
    // The recommended option's verdict follows the recommendation, whatever the model wrote.
    .map(o => ({ ...o, verdict: status === 'REJECT_ALL' ? 'NOT RECOMMENDED' : o.option_id === recommended ? 'RECOMMENDED' : o.verdict === 'RECOMMENDED' ? (recommends ? 'VIABLE' : 'NEEDS EVIDENCE') : o.verdict }));
  if (normOptions.length !== options.length) throw new Error('The assessment omitted one or more decision options. Try regenerating.');
  return {
    recommendation_status: status,
    recommended_option_id: recommended,
    confidence: oneOf(parsed.confidence, ['HIGH', 'MEDIUM', 'LOW'], 'MEDIUM'),
    headline: toText(parsed.headline),
    rationale: toList(parsed.rationale),
    options: normOptions,
    tradeoffs: toList(parsed.tradeoffs),
    conditions_to_revisit: toList(parsed.conditions_to_revisit),
  };
}

// An explicit abstention must never become a lowest-risk recommendation in the UI.
export function getRecommendedOptionId(assessment, options, optionData = {}) {
  if (assessment) return assessment.recommendation_status && assessment.recommendation_status !== 'RECOMMEND_OPTION'
    ? null : (options.some(o => o.id === assessment.recommended_option_id) ? assessment.recommended_option_id : null);
  const scored = options.map(o => ({ o, agg: optionData[o.id]?.agg })).filter(x => x.agg);
  return scored.sort((a, b) => a.agg.peak - b.agg.peak || a.agg.avgExposure - b.agg.avgExposure)[0]?.o.id || null;
}
