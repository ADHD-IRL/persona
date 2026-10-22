export function scenarioWithContext(scenario, context = '', included = true) {
  const extra = included ? '' : context.trim();
  return { ...scenario, context_document: [scenario?.context_document || '', extra ? 'ADDITIONAL CONTEXT AND SUPPORTING INFORMATION:\n' + extra : ''].filter(Boolean).join('\n\n') };
}
// Shared, deterministic workflow rules. No model calls are needed for setup.
export const ANALYSIS_VERSION = '2026-10-16.1';
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function readiness(input) {
  const errors = [], warnings = [];
  if (!input.question?.trim()) errors.push('State the question you need answered.');
  if (!input.scenario?.context_document?.trim()) errors.push('Add scenario context or supporting information.');
  if (!['risk', 'challenge', 'compare'].includes(input.mode)) errors.push('Choose an analysis goal.');
  if (!input.agents || input.agents.length < 3 || input.agents.length > 8) errors.push('Choose between three and eight agents.');
  if (input.mode === 'compare') {
    if (!input.decision?.acceptance_criteria?.trim()) errors.push('Define the acceptance criteria for comparing options.');
    if (input.options?.length < 2 || input.options?.length > 6) errors.push('Provide two to six options.');
    if (input.options?.some(o => !o.name?.trim() || !o.description?.trim())) errors.push('Give every option a name and description.');
    if (new Set(input.options?.map(o => o.name.trim().toLowerCase())).size !== input.options?.length) errors.push('Use distinct option names.');
  }
  if (!input.assumptions?.length) warnings.push('No assumptions are recorded. Identify what must be true for this plan to work.');
  if (!input.constraints?.trim()) warnings.push('No constraints are stated. Consider budget, timing, and non-negotiable requirements.');
  return { errors, warnings };
}
export function recommendPanel(agents, text, count = 5) {
  const terms = [...new Set((text.toLowerCase().match(/[a-z0-9]{4,}/g) || []))];
  const ranked = agents.map(agent => {
    const haystack = [agent.name, agent.discipline, agent.persona_description, agent.expertise_boundaries].join(' ').toLowerCase();
    const matches = terms.filter(t => haystack.includes(t));
    return { agent, matches, score: matches.length };
  }).sort((a, b) => b.score - a.score || a.agent.name.localeCompare(b.agent.name));
  const selected = [], disciplines = new Set();
  for (const row of ranked) {
    const discipline = row.agent.discipline || row.agent.domain_id || row.agent.id;
    if (disciplines.has(discipline)) continue;
    selected.push({ ...row.agent, selection_reason: row.matches.length ? `Matches ${row.matches.slice(0, 3).join(', ')}; adds ${row.agent.discipline || 'another perspective'}.` : `Adds a different perspective: ${row.agent.discipline || row.agent.name}. No direct keyword match; review suitability.` });
    disciplines.add(discipline);
    if (selected.length === count) break;
  }
  for (const row of ranked) {
    if (selected.length >= count) break;
    if (!selected.some(a => a.id === row.agent.id)) selected.push({ ...row.agent, selection_reason: 'Additional relevant perspective; review overlap with the panel.' });
  }
  return selected;
}
export function changedInputs(previous, current) {
  return ['question', 'mode', 'constraints', 'scenario', 'decision', 'options', 'assumptions', 'agents', 'knowledge', 'knowledge_sources', 'threats', 'chains', 'model', 'version'].filter(key => canonical(previous?.[key]) !== canonical(current?.[key]));
}
export function optionInputs(snapshot, option) {
  const { options: _options, ...common } = snapshot;
  return { ...common, option, prompt_revision: 'full-evidence-v2' };
}
export function validateBrief(value, evidence) {
  if (!value || typeof value.headline !== 'string' || !value.headline.trim() || !Array.isArray(value.findings) || !value.findings.length) throw new Error('The decision brief is incomplete. Resume to retry the brief.');
  const sources = new Map(evidence.map(e => [e.id, e]));
  const text = v => typeof v === 'string' ? v : '';
  return {
    headline: value.headline,
    findings: value.findings.slice(0, 3).map(f => {
      const references = Array.isArray(f.references) ? f.references.filter(r => sources.has(r.id) && typeof r.quote === 'string' && r.quote.trim().length >= 12 && sources.get(r.id).text.includes(r.quote)).map(r => ({ id: r.id, quote: r.quote })) : [];
      return { title: text(f.title), impact: text(f.impact), basis: references.some(r => sources.get(r.id).kind === 'supplied') && f.basis === 'SUPPLIED_EVIDENCE' ? 'SUPPLIED_EVIDENCE' : f.basis === 'ASSUMPTION' ? 'ASSUMPTION' : 'MODEL_INFERENCE', references };
    }),
    disagreements: (Array.isArray(value.disagreements) ? value.disagreements : []).filter(v => typeof v === 'string').slice(0, 4),
    revisit: (Array.isArray(value.revisit) ? value.revisit : []).filter(v => typeof v === 'string').slice(0, 4),
    actions: (Array.isArray(value.actions) ? value.actions : []).filter(a => typeof a.title === 'string' && a.title.trim()).slice(0, 5).map(a => ({ title: a.title, completion_criteria: text(a.completion_criteria), evidence_ids: (Array.isArray(a.evidence_ids) ? a.evidence_ids : []).filter(id => sources.has(id)) })),
  };
}
