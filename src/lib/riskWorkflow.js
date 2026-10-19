export const riskStatuses = ['needs_review', 'reviewed', 'monitoring', 'archived'];
export const actionStatuses = ['proposed', 'accepted', 'in_progress', 'implemented', 'verified', 'rejected'];
export const activeRisk = r => r.review_status !== 'archived' && !r.merged_into;
export const normalizeRiskName = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function duplicateCandidates(record, records) {
 const words = new Set(normalizeRiskName(record.name).split(' ').filter(w => w.length > 3));
 return records.filter(r => r.id !== record.id && activeRisk(r) && r.scenario_id === record.scenario_id).map(r => {
 const other = new Set(normalizeRiskName(r.name).split(' ').filter(w => w.length > 3));
 const overlap = [...words].filter(w => other.has(w)).length;
 return { ...r, similarity: normalizeRiskName(r.name) === normalizeRiskName(record.name) ? 1 : overlap / Math.max(1, new Set([...words,...other]).size) };
 }).filter(r => r.similarity >= .45).sort((a,b) => b.similarity-a.similarity).slice(0,5);
}
export function relatedActions(record, kind, actions, chains = []) {
 const ids = new Set(chains.filter(c => c.threat_id === record.id).map(c => c.id));
 return actions.filter(a => kind === 'Chain' ? a.chain_id === record.id : a.threat_id === record.id || ids.has(a.chain_id));
}
export function needsReassessment(record, scenario, actions = []) {
 return !!record.last_reviewed_at && ((record.reviewed_context !== null && record.reviewed_context !== (scenario?.context_document || '')) || actions.some(a => ['implemented','verified'].includes(a.status) && new Date(a.updated_at) > new Date(record.last_reviewed_at)));
}
export function suggestRisks(records, scenario, question = '') {
 const words = [...new Set((question.toLowerCase().match(/[a-z0-9]{4,}/g) || []))];
 return records.filter(activeRisk).map(r => ({ ...r, relevance: (r.scenario_id === scenario?.id ? 10 : 0) + (r.domain_id && r.domain_id === scenario?.domain_id ? 3 : 0) + words.filter(w => (r.name+' '+r.description).toLowerCase().includes(w)).length })).filter(r => r.relevance > 0).sort((a,b) => b.relevance-a.relevance).slice(0,10);
}
export function editableRisk(record) {
 const keys = ['name','description','severity','domain_id','scenario_id','category','tags','likelihood','impact','steps','is_ai_generated','threat_id','review_status','owner','confidence','rationale','evidence','reviewed_context','last_reviewed_at'];
 return Object.fromEntries(Object.entries(record).filter(([k]) => keys.includes(k)).map(([k,v]) => [k, k.endsWith('_id') && !v ? null : v]));
}
