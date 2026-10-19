import test from 'node:test';
import assert from 'node:assert/strict';
import { domainCoverage, coverageBand, moveDomainMembers, normalizeDomainName } from '../src/lib/domainCoverage.js';

test('coverage counts each SME once and separates missing domain assignments from discipline matches', () => {
  const domains = [{ id: 'a', name: 'Cyber' }, { id: 'b', name: 'Finance' }, { id: 'c', name: 'Empty' }];
  const a = { id: 'one', name: 'One', domain_id: 'a' };
  const result = domainCoverage(domains, [a, a, { id: 'two', domain_id: 'b' }, { id: 'three', domain_id: null, discipline: 'Cyber' }, { id: 'four', domain_id: 'deleted' }], [{ id: 's', domain_id: 'a' }]);
  assert.equal(result.total, 4);
  assert.equal(result.assigned, 2);
  assert.equal(result.unassigned.length, 2);
  assert.equal(result.empty, 1);
  assert.equal(result.rows[0].share, 25);
  assert.equal(result.rows[0].scenarioCount, 1);
  assert.equal(result.rows.reduce((sum, d) => sum + d.count, 0) + result.unassigned.length, result.total);
});
test('coverage handles empty libraries and duplicate names without combining their counts', () => {
  const result = domainCoverage([{ id: 'a', name: ' Cyber  Defense ' }, { id: 'b', name: 'cyber defense' }], []);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].share, 0);
  assert.equal(normalizeDomainName(' Cyber  Defense '), 'cyber defense');
});
test('heatmap bins keep exact boundary values and use stable meaning across filters', () => {
  assert.equal(coverageBand(0).label, '0 SMEs');
  for (const n of [1, 5]) assert.equal(coverageBand(n).label, '1–5 SMEs');
  for (const n of [6, 15]) assert.equal(coverageBand(n).label, '6–15 SMEs');
  for (const n of [16, 30]) assert.equal(coverageBand(n).label, '16–30 SMEs');
  assert.equal(coverageBand(1000).label, '31+ SMEs');
});
test('bulk moves touch only selected domain assignments and report partial failures for retry', async () => {
  const calls = [], progress = [];
  const db = { Agent: { update: async (id, patch) => { calls.push({ id, patch }); if (id === 'b') throw Error('Permission denied'); return { id, ...patch }; } } };
  const agents = [{ id: 'a', domain_id: 'old' }, { id: 'b', name: 'Failed SME', domain_id: null }, { id: 'c', domain_id: 'new' }, { id: 'd', domain_id: 'old' }];
  const result = await moveDomainMembers(db, agents, new Set(['a', 'b', 'c']), 'new', (n, total) => progress.push([n, total]));
  assert.deepEqual(calls, [{ id: 'a', patch: { domain_id: 'new' } }, { id: 'b', patch: { domain_id: 'new' } }]);
  assert.deepEqual(result.changed, ['a']);
  assert.equal(result.failures[0].id, 'b');
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
});
