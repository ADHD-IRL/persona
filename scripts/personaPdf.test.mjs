// R-N13 — export SME personas to a formatted PDF.
// Run: node scripts/personaPdf.test.mjs
// Offline. The document builder is pure; the renderer is driven with a fake
// jsPDF that records every text placement so layout rules can be asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HANDLING_MARKING,
  buildPersonaDocument,
  documentText,
  renderPersonaPdf,
  pdfFilename,
} from '../src/lib/personaPdf.js';

const DOMAINS = [{ id: 'd1', name: 'Quantum, Photonics and Semiconductor Research', color: '#2E86AB' }];

const FULL = {
  id: 'agent-id-9c2b', workspace_id: 'workspace-id-7f3e', domain_id: 'd1', created_by: 'user-id-5d1a', created_at: '2026-10-07T00:00:00Z',
  name: 'Quantum Research Program Lead',
  discipline: 'Quantum Research Leadership',
  role_type: 'sme', expertise_level: 'Principal', reasoning_style: 'Analytical', severity_default: 'MEDIUM',
  persona_description: 'Leads a quantum research program: qubits, sensing, networking.',
  professional_background: 'Seventeen years in quantum science including program leadership.',
  institutional_background: 'Engineering research programs at universities and national labs.',
  institutional_incentives: 'Rewarded for demonstrations and sponsor milestones.',
  cognitive_bias: 'Focuses on scientific progress and may under-weight security.',
  debiasing_instruction: 'Ask what condition has not been tested.',
  epistemic_style: 'Trusts instrumented test data.',
  decision_style: 'Test-driven and envelope-aware.',
  conflict_triggers: 'Dismisses claims unsupported by test data.',
  red_team_focus: 'Hunts for programs dependent on single cryogenic resources.',
  adversary_model: 'The adversary is the physical world outside the test envelope.',
  analytical_framework: 'Systems engineering, test and evaluation.',
  source_preferences: 'Test data and telemetry, safety cases.',
  domain_expertise: { 'quantum leadership': 10, infrastructure: 9, 'wet lab': 2 },
  expertise_boundaries: { strong: ['quantum research leadership', 'roadmaps'], moderate: ['quantum sensing'], weak: ['aerospace operations'], defer_to: ['Cryogenic Systems Engineer on cryogenics'], forbidden_overreach: 'Never asserts legal conclusions as its own.' },
  tradecraft: { common_indicators: ['envelope expansion without incremental test'], common_false_positives: ['every anomaly read as a failure'], failure_modes: ['over-tests at the expense of schedule'] },
  risk_posture: { risk_sensitivity: 'high', false_negative_tolerance: 'low', false_positive_tolerance: 'medium', escalation_bias: 'holds tests on readiness doubt' },
  debate_behavior: { debate_role: 'engineering test realist', rebuttal_style: 'challenges with test data', what_changes_mind: 'a test result' },
  update_triggers: { fast_when: 'test data shows the gap', slow_when: 'the argument rests on simulation', resistant_when: 'the change removes a safety margin' },
  historical_strengths: ['called the cryostat outage'], historical_weaknesses: [], weighting_adjustment: 1.2,
  vector_human: 35, vector_technical: 90, vector_physical: 40, vector_futures: 65,
  tags: ['quantum', 'leadership'], scenario_tags: ['lab-outage'], is_ai_generated: false,
};

const MINIMAL = { id: 'a2', name: 'Bare Agent', discipline: 'Placeholder', vector_human: 50, vector_technical: 50, vector_physical: 30, vector_futures: 40 };

// Fake jsPDF: enough surface for the renderer, records text by page.
function fakeJsPDF({ width = 612, height = 792 } = {}) {
  const pages = [[]];
  let page = 0;
  let fontSize = 10;
  const api = {
    internal: { pageSize: { getWidth: () => width, getHeight: () => height } },
    calls: { save: [], rects: 0 },
    pages,
    setFont() { return api; }, setFontSize(n) { fontSize = n; return api; }, setTextColor() { return api; },
    setDrawColor() { return api; }, setFillColor() { return api; }, setLineWidth() { return api; },
    rect() { api.calls.rects += 1; return api; }, line() { return api; },
    roundedRect() { return api; },
    getTextWidth(s) { return String(s).length * fontSize * 0.5; },
    splitTextToSize(text, maxWidth) {
      const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.5)));
      const out = [];
      for (const para of String(text).split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          if ((line + ' ' + word).trim().length > perLine && line) { out.push(line); line = word; } else line = (line + ' ' + word).trim();
        }
        out.push(line);
      }
      return out;
    },
    text(str, x, y) { for (const s of Array.isArray(str) ? str : [str]) pages[page].push({ s: String(s), x, y, fontSize }); return api; },
    addPage() { pages.push([]); page = pages.length - 1; return api; },
    setPage(n) { page = n - 1; return api; },
    getNumberOfPages() { return pages.length; },
    save(name) { api.calls.save.push(name); return api; },
  };
  return api;
}

test('handling marking names the data sensitivity and excludes CUI', () => {
  assert.match(HANDLING_MARKING, /LOW SENSITIVITY/);
  assert.match(HANDLING_MARKING, /NO CUI/);
});

test('document carries every non-empty persona value and no infra fields', () => {
  const doc = buildPersonaDocument(FULL, DOMAINS);
  const text = documentText(doc);
  assert.equal(doc.title, FULL.name);
  assert.match(doc.subtitle, /Quantum Research Leadership/);
  assert.match(doc.subtitle, /Quantum, Photonics and Semiconductor Research/);
  for (const [k, v] of Object.entries(FULL)) {
    if (['id', 'workspace_id', 'domain_id', 'created_by', 'created_at', 'historical_weaknesses', 'is_ai_generated'].includes(k)) continue;
    if (typeof v === 'string') assert.ok(text.includes(v), `missing ${k}`);
    if (typeof v === 'number') assert.ok(text.includes(String(v)), `missing ${k}`);
    if (Array.isArray(v)) for (const item of v) assert.ok(text.includes(String(item)), `missing ${k} item ${item}`);
  }
  for (const bad of ['agent-id-9c2b', 'workspace-id-7f3e', 'user-id-5d1a', '2026-10-07T00:00:00Z']) assert.ok(!text.includes(bad), `infra leaked: ${bad}`);
  assert.ok(doc.sections.length >= 8);
});

test('structured blocks become labeled lists and fluency reads as n/10', () => {
  const text = documentText(buildPersonaDocument(FULL, DOMAINS));
  assert.match(text, /Defer to/);
  assert.match(text, /Forbidden overreach/);
  assert.match(text, /Common false positives/);
  assert.match(text, /quantum leadership: 10\/10/);
  assert.match(text, /Risk sensitivity: high/);
  assert.match(text, /What changes their mind/);
  assert.match(text, /Fast when/);
  assert.match(text, /Weighting adjustment: 1\.2/);
  assert.match(text, /Role: Blue team expert \(sme\)/);
});

test('a sparse persona omits empty sections and says which groups are not recorded', () => {
  const doc = buildPersonaDocument(MINIMAL, DOMAINS);
  const text = documentText(doc);
  assert.equal(doc.title, 'Bare Agent');
  assert.match(doc.subtitle, /No domain assigned/);
  assert.ok(!text.includes('Tradecraft\n'), 'empty section rendered');
  assert.match(text, /Not recorded for this agent: .*Tradecraft/);
  assert.match(text, /Not recorded for this agent: .*Risk posture/);
  assert.ok(!/Not recorded.*Coverage vectors/.test(text), 'vectors are present and should not be listed');
});

test('render places the marking and page numbers on every page and keeps text inside the page', () => {
  const pdf = fakeJsPDF();
  renderPersonaPdf(pdf, [buildPersonaDocument(FULL, DOMAINS), buildPersonaDocument(MINIMAL, DOMAINS)], { exportedAt: new Date('2026-10-07T12:00:00Z') });
  const n = pdf.getNumberOfPages();
  assert.ok(n >= 2, 'one agent per page start');
  pdf.pages.forEach((items, i) => {
    assert.ok(items.some((t) => t.s.includes(HANDLING_MARKING)), `marking missing on page ${i + 1}`);
    assert.ok(items.some((t) => t.s === `Page ${i + 1} of ${n}`), `page number missing on page ${i + 1}`);
    for (const t of items) {
      assert.ok(t.y > 0 && t.y <= 792, `text off page at y=${t.y} on page ${i + 1}: ${t.s.slice(0, 30)}`);
      assert.ok(t.x >= 0 && t.x <= 612, `text off page at x=${t.x}`);
    }
  });
  assert.equal(pdf.pages[0][0].s, 'Quantum Research Program Lead', 'first page starts with the first agent');
  assert.ok(pdf.pages.some((items) => items.some((t) => t.s === 'Bare Agent')));
  assert.ok(pdf.calls.rects > 0, 'coverage vectors are drawn as bars');
});

test('long personas paginate inside one agent without losing text', () => {
  const long = { ...FULL, persona_description: Array.from({ length: 60 }, (_, i) => `Sentence number ${i + 1} about the persona.`).join(' ') };
  const pdf = fakeJsPDF({ height: 300 });
  renderPersonaPdf(pdf, [buildPersonaDocument(long, DOMAINS)]);
  assert.ok(pdf.getNumberOfPages() > 2, 'small page height forces several pages');
  const all = pdf.pages.flat().map((t) => t.s).join(' ');
  assert.ok(all.includes('Sentence number 60'), 'tail of the long paragraph survives pagination');
  for (const items of pdf.pages) for (const t of items) assert.ok(t.y <= 300, `text off page at y=${t.y}`);
});

test('filenames use a name slug for one agent and a date for several', () => {
  const d = new Date('2026-10-07T12:00:00Z');
  assert.equal(pdfFilename([FULL], d), 'agentdebate-persona-quantum-research-program-lead.pdf');
  assert.equal(pdfFilename([FULL, MINIMAL], d), 'agentdebate-personas-2-2026-10-07.pdf');
});
