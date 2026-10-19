export const normalizeDomainName = name => (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const COVERAGE_BANDS = [
  { label: '0 SMEs', max: 0, color: '#182230' },
  { label: '1–5 SMEs', max: 5, color: '#173e53' },
  { label: '6–15 SMEs', max: 15, color: '#205d72' },
  { label: '16–30 SMEs', max: 30, color: '#267f86' },
  { label: '31+ SMEs', max: Infinity, color: '#399b88' },
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
  const rows = domains.map(domain => ({ ...domain, count: members.get(domain.id).length, members: members.get(domain.id), scenarioCount: scenarios.filter(s => s.domain_id === domain.id).length, share: uniqueAgents.length ? members.get(domain.id).length / uniqueAgents.length * 100 : 0 }));
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
