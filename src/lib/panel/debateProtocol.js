// Structured debate protocol for scenario sessions.
//
// A deliberation without structure is a conversation: the topic is whatever
// was said last, and it ends when the pulse dies. The protocol turns it into a
// debate: the read-ahead's questions become an agenda, each question runs
// through five phases with their own floor rule and stop rule, and every phase
// end is explained to the room and written into a per-question record that the
// reports read. Pure and node-testable (scripts/debateProtocol.test.mjs); the
// room wires it to floor control, the stop tracker, and the model.

import { statedConfidence } from './calibration.js';

export const PHASES = [
  { id: 'opening',    label: 'Opening positions', short: 'Open',
    blurb: 'Each expert states a position on the question with an explicit confidence and what would change their mind. No cross-talk yet.',
    endsWhen: 'every expert has spoken once.' },
  { id: 'cross',      label: 'Cross-examination', short: 'Cross',
    blurb: 'The floor goes to whoever disagrees most with the last speaker. Objections must be specific; concessions must name what was conceded.',
    endsWhen: 'the pulse reads consensus or impasse (positions stopped moving), novelty runs dry, or the turn budget is spent.' },
  { id: 'evidence',   label: 'Evidence check',    short: 'Evidence',
    blurb: 'One pass: each expert names the reference, read-ahead fact, or data their position rests on, and the one assumption that would change their view if wrong.',
    endsWhen: 'every expert has spoken once.' },
  { id: 'closing',    label: 'Closing positions', short: 'Close',
    blurb: 'Final position and confidence from each expert, whether they moved and why, and the disagreement they still hold.',
    endsWhen: 'every expert has spoken once.' },
  { id: 'resolution', label: 'Resolution',        short: 'Resolve',
    blurb: 'The room converges or it does not. A decision is recorded, with named dissent if any; otherwise the disagreement is recorded with what would resolve it.',
    endsWhen: 'the convergence check has run.' },
];

export const phaseMeta = id => PHASES.find(p => p.id === id) || PHASES[0];
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const clone = d => JSON.parse(JSON.stringify(d));
const pct = c => (c == null ? '?' : `${Math.round(c * 100)}%`);

// ── Agenda ────────────────────────────────────────────────────────────────────
// Q1./Q2. lines win; then numbered items under a heading about deciding or
// questions; then question sentences; then a default. The facilitator can edit
// the result before starting.

const isCaps = l => /^[A-Z0-9][A-Z0-9 ,'()/&:;.+\-]{2,96}$/.test(l) && /[A-Z]{3}/.test(l);

export function extractAgenda(text, { max = 8, fallbackName = '' } = {}) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim());
  const seen = new Set();
  const push = (out, t, source) => {
    const key = norm(t).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id: `q${out.length + 1}`, text: norm(t), source });
  };

  let out = [];
  for (const l of lines) {
    const m = l.match(/^Q(\d{1,2})[.:)]\s+(.+)$/);
    if (m) push(out, m[2], 'read-ahead');
  }
  if (out.length) return out.slice(0, max);

  let inBlock = false;
  for (const l of lines) {
    if (!l) continue;
    if (isCaps(l)) { inBlock = /DECI|QUESTION|ASK|PANEL|RECOMMEND|OPTION/.test(l); continue; }
    if (/(?:decide|questions?|asks?|input on|recommend)[^.]*:\s*$/i.test(l)) { inBlock = true; continue; }
    if (inBlock) {
      const m = l.match(/^(\d{1,2})[.)]\s+(.+)$/) || l.match(/^(?:Option|Path)\s+([A-Z0-9])[.:]\s+(.+)$/);
      if (m) push(out, m[2], 'read-ahead');
      else if (out.length) inBlock = false;
    }
  }
  if (out.length) return out.slice(0, max);

  const sentences = String(text || '').split(/(?<=[.?!])\s+/).map(norm).filter(s => s.endsWith('?') && s.length >= 40 && s.length <= 320);
  for (const s of sentences) push(out, s, 'derived');
  if (out.length) return out.slice(0, max);

  out = [];
  push(out, fallbackName ? `What should the panel recommend on "${fallbackName}", and with what confidence?` : 'What should the panel recommend, and with what confidence?', 'default');
  return out;
}

// ── State ─────────────────────────────────────────────────────────────────────

export function createDebate(agenda, { autoAdvance = true, crossBudget = null, autoPoll = true } = {}) {
  const list = (agenda || []).filter(q => q && norm(q.text)).map((q, i) => ({ id: q.id || `q${i + 1}`, text: norm(q.text), source: q.source || 'facilitator' }));
  return {
    version: 1,
    status: 'ready',            // ready | running | paused | complete
    autoAdvance,
    crossBudget,
    // The pulse can only call consensus or impasse while a straw poll is fresh
    // (movement and disagreement are null without one), so a debate that never
    // polls can only ever end a cross-examination on budget or exhaustion.
    // Polling at the phase boundaries makes those endings reachable.
    autoPoll,
    agenda: list,
    qIndex: 0,
    phase: 'opening',
    phaseTurns: 0,
    spoken: [],
    startedAt: null,
    endedAt: null,
    events: [],
    records: list.map(q => ({ qid: q.id, question: q.text, opening: {}, closing: {}, evidence: [], decision: null, phases: {}, turns: 0, startMsg: null, startTurn: null })),
  };
}

export const currentQuestion = d => (d && d.agenda[d.qIndex]) || null;
export const currentRecord   = d => (d && d.records[d.qIndex]) || null;
export const debateTopic     = d => currentQuestion(d)?.text || '';
export const crossBudgetFor  = (d, panelSize) => d?.crossBudget || Math.max(4, Math.min(10, 2 * Math.max(1, panelSize)));

// ── Prompt instruction for the speaking expert ────────────────────────────────

export function phaseInstruction(d, { panelSize = 3 } = {}) {
  const q = debateTopic(d);
  const head = `\nSTRUCTURED DEBATE — question ${d.qIndex + 1} of ${d.agenda.length}: "${q}"`;
  switch (d.phase) {
    case 'opening':
      return `${head}\nPHASE: OPENING POSITIONS. State YOUR position on this question in under 120 words. Include an explicit confidence as a percentage (for example "I am about 70% confident") and one sentence on what evidence would change your mind. Do not respond to other panelists yet. If the question sits outside your competence, say so in one sentence and name the one thing you can contribute.`;
    case 'cross':
      return `${head}\nPHASE: CROSS-EXAMINATION. Engage the position you disagree with most, by name. Make the strongest SPECIFIC objection, or concede a specific point if the argument has earned it. Under 150 words. If you have moved since your opening position, say by roughly how much and what moved you.`;
    case 'evidence':
      return `${head}\nPHASE: EVIDENCE CHECK. Name the specific evidence your position rests on: a reference document by name, a fact in the read-ahead, or data you know. Then state the ONE assumption you are making that, if wrong, would change your view. Under 120 words. Do not restate your argument.`;
    case 'closing':
      return `${head}\nPHASE: CLOSING POSITIONS. Give your FINAL position on this question in under 100 words with an explicit confidence percentage. Say plainly whether you moved during this debate and what moved you, and name the disagreement you still hold with anyone on the panel, by name.`;
    default:
      return head;
  }
}

// ── Floor rule per phase ──────────────────────────────────────────────────────
// `ranked` is [{ id, score }] from floor control, highest urge first. Rounds
// (opening, evidence, closing) take the highest-urge expert who has not spoken
// this phase. Cross-examination takes the expert whose opening confidence is
// farthest from the last speaker's. Resolution has no speaker.

export function pickForPhase(d, ranked, { lastSpeakerId = null } = {}) {
  if (!d || !ranked?.length) return null;
  const rec = currentRecord(d);
  const spoken = new Set(d.spoken);
  if (d.phase === 'opening' || d.phase === 'evidence' || d.phase === 'closing') {
    const next = ranked.find(r => !spoken.has(r.id));
    return next ? next.id : null;
  }
  if (d.phase === 'cross') {
    const cands = ranked.filter(r => r.id !== lastSpeakerId);
    if (!cands.length) return ranked[0].id;
    const last = lastSpeakerId ? rec?.opening?.[lastSpeakerId]?.credence : null;
    if (last == null) return cands[0].id;
    let best = cands[0], bestScore = -Infinity;
    for (const c of cands) {
      const cr = rec?.opening?.[c.id]?.credence;
      const gap = cr == null ? 0.2 : Math.abs(cr - last);
      const score = gap * 100 + (Number(c.score) || 0) * 0.1;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best.id;
  }
  return null;
}

// ── Recording turns ───────────────────────────────────────────────────────────

export function noteTurn(d, { agentId, agentName = '', text = '', turn = 0 }) {
  const next = clone(d);
  const rec = next.records[next.qIndex];
  if (!rec) return next;
  if (rec.startTurn == null) rec.startTurn = turn;
  rec.turns += 1;
  next.phaseTurns += 1;
  if (agentId && !next.spoken.includes(agentId)) next.spoken.push(agentId);
  const excerpt = norm(text).slice(0, 240);
  const credence = statedConfidence(text);
  if (next.phase === 'opening' && agentId) rec.opening[agentId] = { name: agentName, credence, excerpt, turn };
  if (next.phase === 'closing' && agentId) rec.closing[agentId] = { name: agentName, credence, excerpt, turn };
  if (next.phase === 'evidence' && agentId) rec.evidence.push({ agentId, name: agentName, excerpt, turn, cites: /\b(per|according to|cites?|register|plan|sop|document|report|excerpt|section|architecture|read-ahead)\b/i.test(text) });
  return next;
}

// ── Should the phase end? ─────────────────────────────────────────────────────

export function phaseVerdict(d, { panelSize = 3, pulseVerdict = null } = {}) {
  if (!d) return { end: false };
  const n = Math.max(1, panelSize);
  if (d.phase === 'opening' || d.phase === 'evidence' || d.phase === 'closing') {
    if (d.spoken.length >= n) return { end: true, kind: 'complete', reason: `all ${n} experts have spoken` };
    if (d.phaseTurns >= n + 2) return { end: true, kind: 'complete', reason: 'the round ran its length' };
    return { end: false, remaining: n - d.spoken.length };
  }
  if (d.phase === 'cross') {
    const budget = crossBudgetFor(d, n);
    if (pulseVerdict?.stop) return { end: true, kind: pulseVerdict.kind || 'pulse', reason: pulseVerdict.reason || 'the pulse called a stop' };
    if (d.phaseTurns >= budget) return { end: true, kind: 'budget', reason: `the cross-examination budget of ${budget} turns is spent` };
    return { end: false, remaining: budget - d.phaseTurns, budget };
  }
  return { end: false };
}

// ── Movement and spread ───────────────────────────────────────────────────────

function spreadOf(map) {
  const vals = Object.entries(map || {}).map(([id, p]) => ({ id, ...p })).filter(p => p.credence != null);
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a.credence - b.credence);
  return { lo: sorted[0], hi: sorted[sorted.length - 1], n: vals.length, spread: sorted[sorted.length - 1].credence - sorted[0].credence, mean: vals.reduce((s, p) => s + p.credence, 0) / vals.length };
}

export function movementFor(rec) {
  const ids = new Set([...Object.keys(rec.opening || {}), ...Object.keys(rec.closing || {})]);
  return [...ids].map(id => {
    const o = rec.opening?.[id], c = rec.closing?.[id];
    const from = o?.credence ?? null, to = c?.credence ?? null;
    return { agentId: id, name: c?.name || o?.name || 'Expert', from, to, delta: from != null && to != null ? to - from : null };
  }).sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
}

// ── Insight text for a phase that just ended ──────────────────────────────────

export function insightFor(d, endedPhase, { kind = 'complete', reason = '' } = {}) {
  const rec = currentRecord(d);
  const n = d.qIndex + 1;
  if (!rec) return `Phase ${endedPhase} ended: ${reason}.`;
  switch (endedPhase) {
    case 'opening': {
      const s = spreadOf(rec.opening);
      const stated = Object.keys(rec.opening).length;
      if (!s) return `Opening positions on question ${n} complete: ${stated} expert${stated !== 1 ? 's' : ''} spoke, but none stated a confidence figure. Cross-examination begins without a measured spread.`;
      const read = s.spread >= 0.4 ? 'the room is genuinely split, so cross-examination will pit the far ends against each other'
        : s.spread <= 0.2 ? 'the room starts close to agreement; watch whether cross-examination finds anything the consensus is glossing over'
        : 'there is moderate disagreement to work';
      return `Opening positions on question ${n} complete: ${s.n} of ${stated} stated a confidence, from ${pct(s.lo.credence)} (${s.lo.name}) to ${pct(s.hi.credence)} (${s.hi.name}), a ${Math.round(s.spread * 100)}-point spread — ${read}. Cross-examination begins.`;
    }
    case 'cross': {
      const t = rec.phases?.cross?.turns ?? d.phaseTurns;
      const map = {
        consensus: `the pulse read consensus: positions have settled and the room agrees`,
        impasse: `the pulse read an impasse: positions stopped moving with the room still split — the evidence check will test what each side rests on`,
        exhaustion: `the last turns added nothing new (novelty fell below threshold), so continuing would only repeat`,
        novelty: `the last turns added nothing new (novelty fell below threshold), so continuing would only repeat`,
        budget: `the turn budget is spent; the room was still productive, so a longer budget may suit this question next time`,
        silence: `nobody claimed the floor`,
        manual: `the facilitator moved the debate on`,
      };
      return `Cross-examination on question ${n} ended after ${t} turn${t !== 1 ? 's' : ''} — ${map[kind] || reason}. Evidence check begins: each expert names what their position rests on.`;
    }
    case 'evidence': {
      const cites = rec.evidence.filter(e => e.cites).length;
      return `Evidence check on question ${n} complete: ${rec.evidence.length} expert${rec.evidence.length !== 1 ? 's' : ''} named their grounds; ${cites} pointed to a document or the read-ahead by name${cites < rec.evidence.length ? ', the rest to experience or reasoning' : ''}. Closing positions begin.`;
    }
    case 'closing': {
      const mv = movementFor(rec).filter(m => m.delta != null);
      const moved = mv.filter(m => Math.abs(m.delta) >= 0.1);
      const big = mv[0];
      const s = spreadOf(rec.closing);
      const tail = s ? ` Final spread ${Math.round(s.spread * 100)} points (${s.lo.name} ${pct(s.lo.credence)} to ${s.hi.name} ${pct(s.hi.credence)}).` : '';
      const move = mv.length
        ? `${moved.length} of ${mv.length} moved from their opening position${big && big.delta != null && Math.abs(big.delta) >= 0.1 ? `; largest move ${big.name} ${pct(big.from)} → ${pct(big.to)}` : ''}.`
        : 'no confidence figures were stated, so movement cannot be measured.';
      return `Closing positions on question ${n}: ${move}${tail} Resolution: checking whether the room converged.`;
    }
    case 'resolution': {
      const dec = rec.decision;
      if (!dec) return `Question ${n} closed without a resolution check.`;
      if (dec.status === 'unresolved') return `Question ${n} unresolved: the room did not converge.${dec.dissenters?.length ? ` Positions farthest from the middle: ${dec.dissenters.map(x => `${x.name} (${pct(x.credence)})`).join(', ')}.` : ''}${dec.rationale ? ` ${dec.rationale}` : ''}`;
      return `Question ${n} resolved: "${dec.title}"${dec.dissenters?.length ? ` — recorded with dissent from ${dec.dissenters.map(x => x.name).join(', ')}` : ' — no dissent recorded'}.`;
    }
    case 'skipped':
      return `Question ${n} skipped by the facilitator.`;
    default:
      return `${phaseMeta(endedPhase).label} ended: ${reason}.`;
  }
}

// ── Advancing ─────────────────────────────────────────────────────────────────

export function advance(d, { kind = 'complete', reason = '', turn = 0 } = {}) {
  const next = clone(d);
  const rec = next.records[next.qIndex];
  const ended = next.phase;
  if (rec) rec.phases[ended] = { kind, reason, turns: next.phaseTurns, endedTurn: turn };
  const insight = insightFor(next, ended, { kind, reason });
  next.events.push({ at: new Date().toISOString(), turn, qid: rec?.qid || null, phase: ended, kind, text: insight });
  const idx = PHASES.findIndex(p => p.id === ended);
  if (idx >= 0 && idx < PHASES.length - 1) {
    next.phase = PHASES[idx + 1].id;
  } else if (next.qIndex < next.agenda.length - 1) {
    next.qIndex += 1;
    next.phase = 'opening';
  } else {
    next.status = 'complete';
    next.endedAt = new Date().toISOString();
  }
  next.phaseTurns = 0;
  next.spoken = [];
  return { debate: next, insight, newQuestion: next.status !== 'complete' && next.phase === 'opening' && ended !== 'opening' && idx === PHASES.length - 1 };
}

export function skipQuestion(d, { turn = 0 } = {}) {
  const next = clone(d);
  const rec = next.records[next.qIndex];
  if (rec) rec.phases.skipped = { kind: 'manual', reason: 'skipped by the facilitator', turns: next.phaseTurns, endedTurn: turn };
  const insight = insightFor(next, 'skipped', {});
  next.events.push({ at: new Date().toISOString(), turn, qid: rec?.qid || null, phase: 'skipped', kind: 'manual', text: insight });
  if (next.qIndex < next.agenda.length - 1) { next.qIndex += 1; next.phase = 'opening'; }
  else { next.status = 'complete'; next.endedAt = new Date().toISOString(); }
  next.phaseTurns = 0;
  next.spoken = [];
  return { debate: next, insight, newQuestion: next.status !== 'complete' };
}

// ── Resolution ────────────────────────────────────────────────────────────────
// Dissenters are experts whose closing confidence sits 25+ points from the
// room's median; the model's convergence verdict decides decided vs unresolved.

export function recordResolution(d, { consensus = false, title = '', rationale = '' } = {}) {
  const next = clone(d);
  const rec = next.records[next.qIndex];
  if (!rec) return next;
  const closing = Object.entries(rec.closing || {}).map(([id, p]) => ({ agentId: id, ...p })).filter(p => p.credence != null);
  const sorted = closing.map(p => p.credence).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const dissenters = median == null ? [] : closing.filter(p => Math.abs(p.credence - median) >= 0.25).map(p => ({ agentId: p.agentId, name: p.name, credence: p.credence }));
  rec.decision = {
    status: consensus ? (dissenters.length ? 'decided_with_dissent' : 'decided') : 'unresolved',
    title: norm(title), rationale: norm(rationale), dissenters, median, at: new Date().toISOString(),
  };
  return next;
}

export const DECISION_LABEL = { decided: 'Decided', decided_with_dissent: 'Decided with dissent', unresolved: 'Unresolved', skipped: 'Skipped', pending: 'Not reached' };
export const recordStatus = rec => rec?.decision?.status || (rec?.phases?.skipped ? 'skipped' : 'pending');

export function debateSummary(d) {
  const recs = d?.records || [];
  const count = s => recs.filter(r => recordStatus(r) === s).length;
  return { questions: recs.length, decided: count('decided'), withDissent: count('decided_with_dissent'), unresolved: count('unresolved'), skipped: count('skipped'), pending: count('pending') };
}

// ── What is happening right now (console narrative) ──────────────────────────

export function debateNarrative(d, { panelSize = 3, autoRunning = true, speaking = false } = {}) {
  if (!d) return null;
  const q = currentQuestion(d);
  const rec = currentRecord(d);
  const meta = phaseMeta(d.phase);
  if (d.status === 'complete') {
    const s = debateSummary(d);
    return { headline: 'Debate complete', detail: `${s.questions} question${s.questions !== 1 ? 's' : ''}: ${s.decided} decided, ${s.withDissent} decided with dissent, ${s.unresolved} unresolved${s.skipped ? `, ${s.skipped} skipped` : ''}. Reports are being generated from the record.`, endsWhen: '' };
  }
  if (d.status === 'ready') return { headline: 'Ready to start', detail: 'Review the agenda, then start. The panel works one question at a time through five phases.', endsWhen: '' };
  const v = phaseVerdict(d, { panelSize });
  const stalled = d.status === 'running' && !autoRunning && !speaking && d.phase !== 'resolution';
  let detail = meta.blurb;
  if (d.phase === 'cross') {
    const s = spreadOf(rec?.opening);
    detail += s ? ` Opening spread was ${Math.round(s.spread * 100)} points; the far ends are ${s.lo.name} (${pct(s.lo.credence)}) and ${s.hi.name} (${pct(s.hi.credence)}).` : '';
    detail += v.budget ? ` Turn ${d.phaseTurns} of up to ${v.budget}.` : '';
  } else if (d.phase !== 'resolution') {
    detail += ` ${d.spoken.length} of ${panelSize} have spoken.`;
  } else {
    detail += ' The convergence check is reading the closing positions now.';
  }
  return {
    headline: `${d.status === 'paused' ? 'Paused — ' : stalled ? 'Stalled — ' : ''}Q${d.qIndex + 1}: ${meta.label}`,
    question: q?.text || '',
    detail,
    endsWhen: `Ends when ${meta.endsWhen}`,
    stalled,
  };
}

// ── Debate record report ──────────────────────────────────────────────────────

const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
function mdTable(headers, rows) {
  if (!rows.length) return '_none_';
  const line = cells => `| ${cells.map(c => esc(c && typeof c === 'object' && 'text' in c ? c.text : c)).join(' | ')} |`;
  return [line(headers), `|${headers.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n');
}
const signed = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}`);
const TONE = { decided: '#27AE60', decided_with_dissent: '#F0A500', unresolved: '#C0392B', skipped: '#8A9BB5', pending: '#8A9BB5' };

export function debateReport(b) {
  const d = b?.report?.debate;
  if (!d) {
    return { id: 'debate', title: 'Debate record', blocks: [{ type: 'empty', text: 'This session did not run a structured debate. Start one from the Debate console in a scenario session: the read-ahead\'s questions become the agenda and each runs through opening positions, cross-examination, evidence check, closing positions, and resolution.' }], md: '' };
  }
  const s = debateSummary(d);
  const blocks = [{ type: 'stats', items: [
    { label: 'Questions', value: s.questions, sub: d.status === 'complete' ? 'debate complete' : `in progress · Q${d.qIndex + 1} ${phaseMeta(d.phase).label.toLowerCase()}` },
    { label: 'Decided', value: s.decided },
    { label: 'With dissent', value: s.withDissent },
    { label: 'Unresolved', value: s.unresolved },
    { label: 'Expert turns', value: d.records.reduce((n, r) => n + r.turns, 0) },
  ] }];
  const md = [`# Debate record`, '', `**Status:** ${d.status}${d.startedAt ? `  \n**Started:** ${new Date(d.startedAt).toLocaleString()}` : ''}${d.endedAt ? `  \n**Ended:** ${new Date(d.endedAt).toLocaleString()}` : ''}`, '',
    mdTable(['Metric', 'Value'], [['Questions', s.questions], ['Decided', s.decided], ['Decided with dissent', s.withDissent], ['Unresolved', s.unresolved], ['Skipped', s.skipped]]), ''];

  d.records.forEach((rec, i) => {
    const status = recordStatus(rec);
    blocks.push({ type: 'heading', text: `Q${i + 1} · ${DECISION_LABEL[status]}`, sub: rec.question });
    md.push(`## Q${i + 1}: ${rec.question}`, '', `**Outcome:** ${DECISION_LABEL[status]}${rec.decision?.title ? ` — ${rec.decision.title}` : ''}`, '');
    if (rec.decision) {
      blocks.push({ type: 'list', items: [{ title: rec.decision.title || (status === 'unresolved' ? 'No convergence' : 'Decision'), body: rec.decision.rationale, tag: DECISION_LABEL[status] }] });
      if (rec.decision.rationale) md.push(rec.decision.rationale, '');
      if (rec.decision.dissenters?.length) {
        blocks.push({ type: 'text', text: `Dissent: ${rec.decision.dissenters.map(x => `${x.name} (${pct(x.credence)})`).join(', ')}.` });
        md.push(`**Dissent:** ${rec.decision.dissenters.map(x => `${x.name} (${pct(x.credence)})`).join(', ')}`, '');
      }
    }
    const mv = movementFor(rec);
    if (mv.length) {
      const rows = mv.map(m => [m.name, pct(m.from), pct(m.to), { text: signed(m.delta), color: m.delta > 0.05 ? '#27AE60' : m.delta < -0.05 ? '#C0392B' : null }, rec.closing?.[m.agentId]?.excerpt || rec.opening?.[m.agentId]?.excerpt || '']);
      blocks.push({ type: 'table', headers: ['Expert', 'Opening', 'Closing', 'Δ', 'Closing statement'], rows });
      md.push(`### Positions`, '', mdTable(['Expert', 'Opening', 'Closing', 'Delta', 'Closing statement'], rows.map(r => [r[0], r[1], r[2], r[3].text, r[4]])), '');
    }
    if (rec.evidence.length) {
      blocks.push({ type: 'heading', text: 'Evidence named' });
      blocks.push({ type: 'list', items: rec.evidence.map(e => ({ title: e.name, body: e.excerpt, tag: e.cites ? 'cites a source' : 'reasoning' })) });
      md.push(`### Evidence named`, '', ...rec.evidence.map(e => `- **${e.name}**${e.cites ? ' (cites a source)' : ''}: ${e.excerpt}`), '');
    }
    const ph = Object.entries(rec.phases || {});
    if (ph.length) {
      const rows = ph.map(([p, v]) => [phaseMeta(p).label || p, v.turns ?? '—', `${v.kind}${v.reason ? `: ${v.reason}` : ''}`]);
      blocks.push({ type: 'table', headers: ['Phase', 'Turns', 'Ended because'], rows });
      md.push(`### How each phase ended`, '', mdTable(['Phase', 'Turns', 'Ended because'], rows), '');
    }
  });

  if (d.events.length) {
    blocks.push({ type: 'heading', text: 'What happened, in order' });
    blocks.push({ type: 'list', items: d.events.map(e => ({ title: e.text, tag: new Date(e.at).toLocaleTimeString() })) });
    md.push(`## What happened, in order`, '', ...d.events.map(e => `- _${new Date(e.at).toLocaleTimeString()}_ ${e.text}`), '');
  }
  return { id: 'debate', title: 'Debate record', blocks, md: md.join('\n') };
}

// For the scenario report: one line per question with its outcome.
export function agendaOutcomes(d) {
  return (d?.records || []).map(rec => ({ question: rec.question, status: recordStatus(rec), title: rec.decision?.title || '', dissenters: (rec.decision?.dissenters || []).map(x => x.name) }));
}
