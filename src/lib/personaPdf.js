// @ts-check
// R-N13 — export SME personas to a formatted PDF.
//
// Two halves. `buildPersonaDocument` turns an agent row into a plain document
// model (title, meta, sections of paragraphs, lists, key-values and bars) and
// is pure. `renderPersonaPdf` draws that model with jsPDF: real selectable
// text, Letter pages, a handling marking and page numbers on every page.
// Relative imports only so scripts/personaPdf.test.mjs can run it under Node.
import { toPersona } from './agentExport.js';

// Every PDF export carries a handling marking (AGENTS.md C1). This workspace
// is approved for low-sensitivity data only.
export const HANDLING_MARKING = 'LOW SENSITIVITY · NO CUI';

const ROLE_LABELS = { sme: 'Blue team expert', challenger: 'Red team challenger', moderator: 'Moderator' };
const DEFAULT_ACCENT = '#F0A500';

const isBlank = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const str = (v) => (v == null ? '' : String(v));

function paragraph(label, text) { return isBlank(text) ? null : { type: 'paragraph', label, text: str(text) }; }
function list(label, items) {
  const arr = Array.isArray(items) ? items.map(str).filter(Boolean) : isBlank(items) ? [] : [str(items)];
  return arr.length ? { type: 'list', label, items: arr } : null;
}
function kv(rows) {
  const out = rows.filter(([, v]) => !isBlank(v)).map(([k, v]) => [k, str(v)]);
  return out.length ? { type: 'kv', rows: out } : null;
}
function section(heading, blocks) {
  const kept = blocks.filter(Boolean);
  return kept.length ? { heading, blocks: kept } : null;
}

/**
 * Build the document model for one agent.
 * @param {Record<string, any>} agent
 * @param {Array<{ id: string, name: string, color?: string }>} domains
 */
export function buildPersonaDocument(agent, domains = []) {
  const domain = domains.find((d) => d.id === agent.domain_id) || null;
  const p = toPersona(agent, Object.fromEntries(domains.map((d) => [d.id, d.name])));
  const eb = p.expertise_boundaries || {};
  const tc = p.tradecraft || {};
  const rp = p.risk_posture || {};
  const db = p.debate_behavior || {};
  const ut = p.update_triggers || {};
  const fluency = Object.entries(p.domain_expertise || {}).filter(([, v]) => !isBlank(v)).map(([k, v]) => `${k}: ${v}/10`);

  const subtitleParts = [p.discipline, domain ? domain.name : 'No domain assigned'].filter(Boolean);

  const meta = [
    ['Role', p.role_type ? `${ROLE_LABELS[p.role_type] || p.role_type} (${p.role_type})` : null],
    ['Expertise level', p.expertise_level],
    ['Reasoning style', p.reasoning_style],
    ['Default severity', p.severity_default],
  ].filter(([, v]) => !isBlank(v)).map(([label, value]) => ({ label, value: str(value) }));

  // Profile groups in reading order. Empty groups are dropped and named in
  // `notRecorded` so a sparse persona says what is missing (AGENTS.md §5.3).
  const groups = [
    section('Persona', [
      paragraph(null, p.persona_description),
      paragraph('Background', p.professional_background),
      paragraph('Institutional background', p.institutional_background),
      paragraph('Institutional incentives', p.institutional_incentives),
    ]),
    section('Cognition', [
      paragraph('Cognitive bias', p.cognitive_bias),
      paragraph('Debiasing instruction', p.debiasing_instruction),
      paragraph('Epistemic style', p.epistemic_style),
      paragraph('Decision style', p.decision_style),
      paragraph('Conflict triggers', p.conflict_triggers),
    ]),
    section('Red team', [
      paragraph('Red-team focus', p.red_team_focus),
      paragraph('Adversary model', p.adversary_model),
    ]),
    section('Method', [
      paragraph('Analytical framework', p.analytical_framework),
      paragraph('Source preferences', p.source_preferences),
    ]),
    section('Expertise boundaries', [
      list('Strong in', eb.strong),
      list('Moderate in', eb.moderate),
      list('Weak in', eb.weak),
      list('Defer to', eb.defer_to),
      paragraph('Forbidden overreach', eb.forbidden_overreach),
    ]),
    section('Domain fluency', [list(null, fluency)]),
    section('Tradecraft', [
      list('Common indicators', tc.common_indicators),
      list('Common false positives', tc.common_false_positives),
      list('Failure modes', tc.failure_modes),
    ]),
    section('Risk posture', [kv([
      ['Risk sensitivity', rp.risk_sensitivity],
      ['False negative tolerance', rp.false_negative_tolerance],
      ['False positive tolerance', rp.false_positive_tolerance],
      ['Escalation bias', rp.escalation_bias],
    ])]),
    section('Debate behaviour', [kv([
      ['Debate role', db.debate_role],
      ['Rebuttal style', db.rebuttal_style],
      ['What changes their mind', db.what_changes_mind],
    ])]),
    section('Update triggers', [kv([
      ['Fast when', ut.fast_when],
      ['Slow when', ut.slow_when],
      ['Resistant when', ut.resistant_when],
    ])]),
    section('Calibration', [
      list('Historical strengths', p.historical_strengths),
      list('Historical weaknesses', p.historical_weaknesses),
      kv([['Weighting adjustment', p.weighting_adjustment]]),
    ]),
  ];
  const GROUP_NAMES = ['Persona', 'Cognition', 'Red team', 'Method', 'Expertise boundaries', 'Domain fluency', 'Tradecraft', 'Risk posture', 'Debate behaviour', 'Update triggers', 'Calibration'];
  const present = new Set(groups.filter(Boolean).map((s) => s.heading));
  const notRecorded = GROUP_NAMES.filter((g) => !present.has(g));

  const sections = groups.filter(Boolean);
  sections.push({
    heading: 'Coverage vectors',
    blocks: [{
      type: 'bars',
      rows: [
        ['Human', agent.vector_human ?? 50],
        ['Technical', agent.vector_technical ?? 50],
        ['Physical', agent.vector_physical ?? 30],
        ['Futures', agent.vector_futures ?? 40],
      ],
    }],
  });
  const classification = section('Classification', [
    list('Tags', p.tags),
    list('Scenario tags', p.scenario_tags),
    kv([['Generated with AI assistance', p.is_ai_generated ? 'yes' : null]]),
  ]);
  if (classification) sections.push(classification);

  return {
    title: str(p.name) || 'Unnamed agent',
    subtitle: subtitleParts.join(' · '),
    accent: domain?.color || DEFAULT_ACCENT,
    meta,
    sections,
    notRecorded,
    marking: HANDLING_MARKING,
  };
}

/** Flatten a document to plain text, in reading order. Used by tests and as a debugging aid. */
export function documentText(doc) {
  const lines = [doc.title, doc.subtitle];
  for (const m of doc.meta) lines.push(`${m.label}: ${m.value}`);
  for (const s of doc.sections) {
    lines.push(s.heading);
    for (const b of s.blocks) {
      if (b.type === 'paragraph') lines.push(b.label ? `${b.label}: ${b.text}` : b.text);
      else if (b.type === 'list') { if (b.label) lines.push(b.label); for (const it of b.items) lines.push(`• ${it}`); }
      else if (b.type === 'kv' || b.type === 'bars') for (const [k, v] of b.rows) lines.push(`${k}: ${v}`);
    }
  }
  if (doc.notRecorded.length) lines.push(`Not recorded for this agent: ${doc.notRecorded.join(', ')}`);
  lines.push(doc.marking);
  return lines.join('\n');
}

// ------------------------------------------------------------------ render

const PAGE = { margin: 48, footer: 40 };
const FONT = { title: 18, subtitle: 10.5, meta: 9.5, heading: 10.5, label: 9, body: 9.5, footer: 8 };
const LINE = { title: 22, body: 13, small: 12 };
const COLOR = { ink: '#1F2933', muted: '#6B7280', rule: '#D1D5DB', bar: '#E5E7EB' };

function fmtDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Draw one or more persona documents into a jsPDF instance. Each document
 * starts on a new page; long documents flow across pages. Footer with the
 * handling marking and page numbers is stamped on every page at the end.
 * @param {any} pdf jsPDF instance (or a test double with the same surface)
 * @param {ReturnType<typeof buildPersonaDocument>[]} docs
 * @param {{ exportedAt?: Date }} [opts]
 */
export function renderPersonaPdf(pdf, docs, { exportedAt = new Date() } = {}) {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = PAGE.margin;
  const width = W - 2 * M;
  const bottom = H - PAGE.footer;
  let y = M;

  const ensure = (h) => { if (y + h > bottom) { pdf.addPage(); y = M; } };
  const setStyle = (size, weight = 'normal', color = COLOR.ink) => {
    pdf.setFont('helvetica', weight); pdf.setFontSize(size); pdf.setTextColor(color);
  };
  // Write wrapped text, breaking pages between lines. Returns nothing; advances y.
  const write = (text, { size = FONT.body, weight = 'normal', color = COLOR.ink, lineHeight = LINE.body, x = M, maxWidth = width } = {}) => {
    setStyle(size, weight, color);
    const lines = pdf.splitTextToSize(str(text), maxWidth);
    for (const line of lines) {
      ensure(lineHeight);
      pdf.text(line, x, y + lineHeight * 0.75);
      y += lineHeight;
    }
  };
  const label = (text) => write(text, { size: FONT.label, weight: 'bold', color: COLOR.muted, lineHeight: LINE.small });

  docs.forEach((doc, i) => {
    if (i > 0) { pdf.addPage(); }
    y = M;

    // Accent bar, title, subtitle.
    pdf.setFillColor(doc.accent);
    pdf.rect(M, y, width, 4, 'F');
    y += 12;
    write(doc.title, { size: FONT.title, weight: 'bold', lineHeight: LINE.title });
    if (doc.subtitle) write(doc.subtitle, { size: FONT.subtitle, color: COLOR.muted, lineHeight: LINE.body });
    y += 4;

    // Meta row: "Label: value" items separated across the line.
    if (doc.meta.length) {
      write(doc.meta.map((m) => `${m.label}: ${m.value}`).join('    '), { size: FONT.meta, color: COLOR.ink, lineHeight: LINE.body });
    }
    y += 6;

    for (const s of doc.sections) {
      // Keep the heading with at least its rule and two lines of content so a
      // heading never sits alone at the foot of a page.
      ensure(8 + 14 + 6 + LINE.small + LINE.body + 4);
      y += 8;
      setStyle(FONT.heading, 'bold', doc.accent);
      pdf.text(s.heading.toUpperCase(), M, y + 9);
      y += 14;
      pdf.setDrawColor(COLOR.rule); pdf.setLineWidth(0.5);
      pdf.line(M, y, M + width, y);
      y += 6;

      for (const b of s.blocks) {
        if (b.type === 'paragraph') {
          if (b.label) label(b.label);
          write(b.text);
          y += 4;
        } else if (b.type === 'list') {
          if (b.label) label(b.label);
          for (const it of b.items) write(`•  ${it}`, { x: M + 6, maxWidth: width - 6 });
          y += 4;
        } else if (b.type === 'kv') {
          // "Label:" in bold with the value beside it and a hanging indent,
          // so short facts take one line instead of two.
          for (const [k, v] of b.rows) {
            setStyle(FONT.label, 'bold', COLOR.muted);
            const labelText = `${k}:`;
            const indent = Math.min(pdf.getTextWidth(labelText) + 6, width * 0.45);
            ensure(LINE.body);
            pdf.text(labelText, M, y + LINE.body * 0.75);
            write(v, { x: M + indent, maxWidth: width - indent });
            y += 2;
          }
          y += 2;
        } else if (b.type === 'bars') {
          const labelW = 70, barW = Math.min(260, width - labelW - 40), barH = 7;
          for (const [k, v] of b.rows) {
            ensure(16);
            const n = Math.max(0, Math.min(100, Number(v) || 0));
            setStyle(FONT.body, 'normal', COLOR.ink);
            pdf.text(k, M, y + 9);
            pdf.setFillColor(COLOR.bar); pdf.rect(M + labelW, y + 2, barW, barH, 'F');
            pdf.setFillColor(doc.accent); pdf.rect(M + labelW, y + 2, (barW * n) / 100, barH, 'F');
            pdf.text(String(n), M + labelW + barW + 8, y + 9);
            y += 16;
          }
          y += 2;
        }
      }
    }

    if (doc.notRecorded.length) {
      y += 6;
      write(`Not recorded for this agent: ${doc.notRecorded.join(', ')}`, { size: FONT.label, color: COLOR.muted, lineHeight: LINE.small });
    }
  });

  // Footer on every page: marking left, provenance centre, page number right.
  const n = pdf.getNumberOfPages();
  const stamp = `Exported ${fmtDate(exportedAt)} · AgentDebate`;
  for (let p = 1; p <= n; p += 1) {
    pdf.setPage(p);
    pdf.setDrawColor(COLOR.rule); pdf.setLineWidth(0.5);
    pdf.line(M, H - PAGE.footer + 10, W - M, H - PAGE.footer + 10);
    setStyle(FONT.footer, 'bold', COLOR.muted);
    pdf.text(HANDLING_MARKING, M, H - 18);
    setStyle(FONT.footer, 'normal', COLOR.muted);
    pdf.text(stamp, W / 2, H - 18, { align: 'center' });
    pdf.text(`Page ${p} of ${n}`, W - M, H - 18, { align: 'right' });
  }
  return pdf;
}

function slug(s) {
  return str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'agent';
}

/** File name: one agent → its name; several → count and date. */
export function pdfFilename(agents, date = new Date()) {
  if (agents.length === 1) return `agentdebate-persona-${slug(agents[0].name)}.pdf`;
  return `agentdebate-personas-${agents.length}-${fmtDate(date)}.pdf`;
}

/**
 * Browser entry point: build, render and download. jsPDF is imported lazily so
 * it stays out of the main bundle until someone exports.
 * @param {Record<string, any>[]} agents
 * @param {Array<{ id: string, name: string, color?: string }>} domains
 */
export async function exportPersonasPdf(agents, domains, filename = pdfFilename(agents)) {
  if (!agents?.length) throw new Error('Nothing to export: no agents selected');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  pdf.setProperties({ title: agents.length === 1 ? `${agents[0].name} — persona` : `AgentDebate personas (${agents.length})`, subject: HANDLING_MARKING, creator: 'AgentDebate' });
  renderPersonaPdf(pdf, agents.map((a) => buildPersonaDocument(a, domains)));
  pdf.save(filename);
  return filename;
}
