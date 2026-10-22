import {descendantDomainIds} from './domainHierarchy.js';
export const normalizeDomainName = name => (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const COVERAGE_BANDS = [
  { label: '0 SMEs', max: 0, color: '#1B232F' },
  { label: '1–5 SMEs', max: 5, color: '#28282C' },
  { label: '6–15 SMEs', max: 15, color: '#37302A' },
  { label: '16–30 SMEs', max: 30, color: '#493A25' },
  { label: '31+ SMEs', max: Infinity, color: '#5C4624' },
];
export const coverageBand = count => COVERAGE_BANDS.find(b => count <= b.max);
export function domainCoverage(domains, agents, scenarios = []) {
  const ids = new Set(domains.map(d => d.id));
  const uniqueAgents = [...new Map(agents.map(a => [a.id, a])).values()];
  const members = new Map(domains.map(d => [d.id, []]));
  const unassigned = [];
  for (const agent of uniqueAgents) {
    if (ids.has(agent.domain_id)) members.get(agent.domain_id).push(agent);
    else unassigned.push(agent);
  }
  const names = new Map();
  for (const domain of domains) {
    const name = normalizeDomainName(domain.name);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(domain);
  }
  const rows = domains.map(domain => {const family=descendantDomainIds(domains,domain.id),familyMembers=uniqueAgents.filter(a=>family.has(a.domain_id));return {...domain,directCount:members.get(domain.id).length,children:domains.filter(d=>d.parent_domain_id===domain.id),parentName:domains.find(d=>d.id===domain.parent_domain_id)?.name||'',count:familyMembers.length,members:familyMembers,scenarioCount:scenarios.filter(s=>family.has(s.domain_id)).length,share:uniqueAgents.length?familyMembers.length/uniqueAgents.length*100:0};});
  return { rows, total: uniqueAgents.length, unassigned, assigned: uniqueAgents.length - unassigned.length, empty: rows.filter(d => !d.count).length, duplicates: [...names.values()].filter(group => group.length > 1) };
}
export async function moveDomainMembers(db, agents, selectedIds, targetId, onProgress = () => {}) {
  const changed = [], failures = [];
  const targets = agents.filter(a => selectedIds.has(a.id) && a.domain_id !== targetId);
  for (const [index, agent] of targets.entries()) {
    try {
      const result = await db.Agent.update(agent.id, { domain_id: targetId });
      if (result?.domain_id !== targetId) throw new Error('Assignment was not saved.');
      changed.push(agent.id);
    } catch (error) { failures.push({ id: agent.id, name: agent.name, message: error.message }); }
    onProgress(index + 1, targets.length);
  }
  return { changed, failures };
}
