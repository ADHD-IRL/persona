// Run with: node scripts/attention.test.mjs
// attention.js imports floorControl by relative path (not the '@' alias), and
// floorControl has no dependencies, so both load cleanly in plain node.

import { salienceTo, recallRemarks, recallPassages, renderRecall } from '../src/lib/panel/attention.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const cyber = {
  id: 'a1', name: 'Sarah Chen', discipline: 'Cybersecurity',
  expertise_boundaries: { strong: ['network security', 'IAM', 'zero trust'] },
  domain_expertise: { 'cyber technical': 9 },
  red_team_focus: 'lateral movement',
  tags: ['cyber'],
};
const logi = {
  id: 'a2', name: 'Marcus Reed', discipline: 'Logistics',
  expertise_boundaries: { strong: ['supply chain', 'resupply', 'transport'] },
  domain_expertise: { logistics: 9 },
  tags: ['logistics'],
};

// ── Salience separates the two experts on the same texts ────────────────────
{
  const netText = 'the IAM misconfiguration opens lateral movement across the network';
  const supText = 'the resupply convoy is the single point of failure in the supply chain';
  ok(salienceTo(cyber, netText) > salienceTo(logi, netText), 'cyber SME finds the network text more salient');
  ok(salienceTo(logi, supText) > salienceTo(cyber, supText), 'logistics SME finds the supply text more salient');
  ok(salienceTo(cyber, 'the weather today is mild') === 0, 'irrelevant text scores zero salience');
}

// ── Two experts recall DIFFERENT older remarks from the same transcript ─────
{
  const messages = [
    { role: 'agent', agentId: 'x', agentName: 'A', content: 'The IAM roles grant far too much privilege on the edge network.' },
    { role: 'agent', agentId: 'y', agentName: 'B', content: 'Our resupply depends on one transport corridor through the strait.' },
    { role: 'agent', agentId: 'z', agentName: 'C', content: 'Weather is expected to be clear for the exercise window.' },
    // 8 recent messages heard verbatim by everyone (skipRecent default 8)
    ...Array.from({ length: 8 }, (_, i) => ({ role: 'user', authorName: 'Team', content: `recent point ${i}` })),
  ];
  const topic = 'what are our biggest vulnerabilities';
  const cyberRecall = recallRemarks({ agent: cyber, messages, topic });
  const logiRecall = recallRemarks({ agent: logi, messages, topic });
  ok(cyberRecall.some(r => r.content.includes('IAM')), 'cyber SME recalls the IAM remark');
  ok(!cyberRecall.some(r => r.content.includes('resupply')), 'cyber SME does not recall the resupply remark');
  ok(logiRecall.some(r => r.content.includes('resupply')), 'logistics SME recalls the resupply remark');
  ok(!cyberRecall.some(r => r.content.includes('Weather')), 'nobody recalls the irrelevant weather remark');
}

// ── Recent messages are excluded from recall (heard verbatim) ────────────────
{
  const messages = [
    { role: 'agent', agentId: 'x', agentName: 'A', content: 'IAM privilege sprawl on the network edge is the core issue.' },
    ...Array.from({ length: 8 }, (_, i) => ({ role: 'user', authorName: 'Team', content: `IAM network recent ${i}` })),
  ];
  const recall = recallRemarks({ agent: cyber, messages, topic: 'IAM network' });
  // Only the first (older) message is eligible; the 8 recent ones are skipped.
  ok(recall.length === 1 && recall[0].content.includes('core issue'), 'only older remarks are recalled');
}

// ── Passage recall pulls the discipline's slice of a document ────────────────
{
  const doc = {
    name: 'read-ahead',
    text: [
      'The network architecture places all IAM controls at a single identity provider, creating a chokepoint for lateral movement if compromised. Zero trust segmentation is not yet deployed across the edge.',
      'Resupply for the forward element depends entirely on one maritime corridor. The supply chain has no overland alternative within the operational timeline, making the transport route a single point of failure.',
      'Administrative staff will rotate on a standard fortnightly schedule with no changes anticipated during the exercise.',
    ].join('\n\n'),
  };
  const cyberP = recallPassages({ agent: cyber, topic: 'vulnerabilities', documents: [doc] });
  const logiP = recallPassages({ agent: logi, topic: 'vulnerabilities', documents: [doc] });
  ok(cyberP.some(p => /IAM|zero trust/i.test(p.text)), 'cyber SME surfaces the IAM passage');
  ok(logiP.some(p => /resupply|supply chain/i.test(p.text)), 'logistics SME surfaces the resupply passage');
  ok(!cyberP.some(p => /fortnightly/i.test(p.text)), 'neither surfaces the irrelevant admin passage');
}

// ── Budgets and rendering ────────────────────────────────────────────────────
{
  const long = { name: 'd', text: Array.from({ length: 20 }, () => 'network IAM lateral movement segmentation exploit privilege escalation vulnerability across the edge perimeter and beyond in detail here now').join('\n\n') };
  const p = recallPassages({ agent: cyber, topic: 'network', documents: [long], maxItems: 3, maxChars: 1100 });
  ok(p.length <= 3, 'passage count respects maxItems');
  ok(p.reduce((n, x) => n + x.text.length, 0) <= 1100, 'passage chars respect maxChars');
  const rendered = renderRecall({ remarks: [{ speaker: 'A', content: 'x' }], passages: [{ source: 'd', text: 'y' }] });
  ok(rendered.includes('A said earlier') && rendered.includes('From d'), 'renderRecall formats both kinds');
  ok(renderRecall({ remarks: [], passages: [] }) === '', 'empty recall renders empty');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

