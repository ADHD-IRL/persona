// @ts-check
// R-N10 — durable state for long-running analysis.
//
// Pure functions only: no React, no Supabase, no browser globals, relative
// imports only, so `scripts/runState.test.mjs` can run them under Node.
//
// A "run record" is a small JSON document stored in the AppConfig KV store
// under `run_<kind>_<id>` while a multi-step model-driven loop (Round 1,
// Round 2, Synthesis, or a decision panel) is in flight. The tab that owns
// the loop heartbeats it; any tab can read it to answer "is this still
// running?" from stored state instead of inferring it from agent statuses.

export const HEARTBEAT_MS = 5000;        // owner writes this often
export const STALE_AFTER_MS = 30000;     // no heartbeat for this long ⇒ interrupted

/** @typedef {'session'|'decision'} RunKind */
/** @typedef {'round1'|'round2'|'synthesis'} SessionStage */

/**
 * @typedef {Object} RunRecord
 * @property {RunKind} kind
 * @property {string} id            session or decision id
 * @property {string} stage         e.g. 'round1' | 'round2' | 'synthesis' | 'option' | 'assessment'
 * @property {string} tabId         owner tab (so the owner never treats its own run as foreign)
 * @property {string} startedAt     ISO
 * @property {string} heartbeatAt   ISO
 * @property {number} [step]        1-based progress within the stage
 * @property {number} [total]
 * @property {string} [label]       human-readable detail, e.g. agent name or option name
 * @property {number} [optionIndex] decision runs only
 */

/** @param {RunKind} kind @param {string} id */
export function runKey(kind, id) { return `run_${kind}_${id}`; }

/**
 * Build a fresh record. `now` is injectable for tests.
 * @param {{kind: RunKind, id: string, stage: string, tabId: string, step?: number, total?: number, label?: string, optionIndex?: number}} p
 * @param {number} [now]
 * @returns {RunRecord}
 */
export function makeRunRecord(p, now = Date.now()) {
  const iso = new Date(now).toISOString();
  return { ...p, startedAt: iso, heartbeatAt: iso };
}

/**
 * Advance a record: merge progress fields and refresh the heartbeat.
 * @param {RunRecord} rec @param {Partial<RunRecord>} patch @param {number} [now]
 * @returns {RunRecord}
 */
export function touchRun(rec, patch = {}, now = Date.now()) {
  return { ...rec, ...patch, heartbeatAt: new Date(now).toISOString() };
}

/**
 * What a reader should conclude from a stored record.
 *   'none'  — nothing in flight
 *   'own'   — this tab is the owner (the live loop is in this page's memory)
 *   'alive' — another tab is driving it and heartbeating
 *   'stale' — a run was in flight and its owner stopped heartbeating (reload,
 *             tab closed, app remounted). It can be resumed.
 * @param {RunRecord|null|undefined} rec
 * @param {string} tabId
 * @param {number} [now]
 * @returns {'none'|'own'|'alive'|'stale'}
 */
export function classifyRun(rec, tabId, now = Date.now()) {
  if (!rec || !rec.heartbeatAt) return 'none';
  if (rec.tabId && rec.tabId === tabId) return 'own';
  const age = now - Date.parse(rec.heartbeatAt);
  return age > STALE_AFTER_MS ? 'stale' : 'alive';
}

/**
 * The stage a session's analysis should continue from, given what is stored.
 * Returns null when nothing is left to do.
 * @param {Array<{round1_assessment?: string|null, round2_rebuttal?: string|null}>} sessionAgents
 * @param {boolean} hasSynthesis
 * @returns {SessionStage|null}
 */
export function nextSessionStage(sessionAgents, hasSynthesis) {
  if (!sessionAgents.length) return null;
  if (sessionAgents.some(sa => !sa.round1_assessment)) return 'round1';
  if (sessionAgents.some(sa => !sa.round2_rebuttal)) return 'round2';
  if (!hasSynthesis) return 'synthesis';
  return null;
}

/**
 * How to resume a session loop: which agents still need the stage, and which
 * stuck "generating" statuses must be reset first so the loop can pick them up.
 * @param {SessionStage} stage
 * @param {Array<{id: string, status?: string|null, round1_assessment?: string|null, round2_rebuttal?: string|null}>} sessionAgents
 * @returns {{stage: SessionStage, pendingAgentIds: string[], resets: Array<{id: string, status: string}>}}
 */
export function sessionResumePlan(stage, sessionAgents) {
  const resets = [];
  for (const sa of sessionAgents) {
    if (sa.status === 'generating_r1' && !sa.round1_assessment) resets.push({ id: sa.id, status: 'pending' });
    else if (sa.status === 'generating_r2' && !sa.round2_rebuttal) resets.push({ id: sa.id, status: 'r1_done' });
    // A row that finished its call but kept a transient status is also healed.
    else if (sa.status === 'generating_r1' && sa.round1_assessment) resets.push({ id: sa.id, status: 'r1_done' });
    else if (sa.status === 'generating_r2' && sa.round2_rebuttal) resets.push({ id: sa.id, status: 'complete' });
  }
  const field = stage === 'round1' ? 'round1_assessment' : stage === 'round2' ? 'round2_rebuttal' : null;
  const pendingAgentIds = field ? sessionAgents.filter(sa => !sa[field]).map(sa => sa.id) : [];
  return { stage, pendingAgentIds, resets };
}

/**
 * True when stored agent statuses imply a loop was in flight even though no
 * run record exists (runs that predate R-N10, or a record write that failed).
 * @param {Array<{status?: string|null}>} sessionAgents
 */
export function hasStuckAgents(sessionAgents) {
  return sessionAgents.some(sa => sa.status === 'generating_r1' || sa.status === 'generating_r2');
}

/**
 * Per-option resume plan for a decision panel run.
 *   'complete' — a complete session exists; reuse it
 *   'partial'  — a session exists but did not finish; continue it
 *   'missing'  — no session; create one
 * @param {{options: Array<{id: string}>, sessions: Array<{id: string, decision_option_id?: string|null, status?: string|null, created_at?: string}>}} p
 * @returns {Array<{optionId: string, state: 'complete'|'partial'|'missing', sessionId: string|null}>}
 */
export function decisionResumePlan({ options, sessions }) {
  return options.map(opt => {
    const mine = sessions
      .filter(s => s.decision_option_id === opt.id)
      .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
    const complete = mine.find(s => s.status === 'complete');
    if (complete) return { optionId: opt.id, state: 'complete', sessionId: complete.id };
    if (mine[0]) return { optionId: opt.id, state: 'partial', sessionId: mine[0].id };
    return { optionId: opt.id, state: 'missing', sessionId: null };
  });
}

/**
 * One line a banner can show for a record, e.g. "Round 2 · agent 3/5: Dr. Vale".
 * @param {RunRecord} rec
 */
export function describeRun(rec) {
  const stageName = {
    round1: 'Round 1', round2: 'Round 2', synthesis: 'Synthesis',
    option: 'Decision panel', assessment: 'Decision assessment', reuse: 'Decision panel',
  }[rec.stage] || rec.stage;
  const parts = [stageName];
  if (rec.kind === 'decision' && rec.optionIndex != null && rec.total) {
    parts.push(`option ${String.fromCharCode(65 + rec.optionIndex)} of ${rec.total}`);
  }
  if (rec.step && rec.total && rec.kind === 'session') parts.push(`agent ${rec.step}/${rec.total}`);
  if (rec.label) parts.push(rec.label);
  return parts.join(' · ');
}
