import { readAnalysisActivity } from './analysisActivity.js';
import { createHash } from 'node:crypto';
import { TABLES, entityOperation, loadColumns, withWorkspace, httpError, uuid } from './entities.js';
import { retrieveKnowledge } from '../src/lib/knowledge.js';
import { ANALYSIS_VERSION, canonical, readiness, changedInputs, scenarioWithContext } from '../src/lib/analysisWorkflow.js';
export const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');
export async function workspaceDb(pool, userId, workspaceId, analysisJobId = null) {
  const columns = await loadColumns(pool);
  return Object.fromEntries(Object.keys(TABLES).map(entity => {
    const op = args => entityOperation({ pool, columns, userId, workspaceId, entity, analysisJobId, ...args });
    const list = async (filters = {}) => {
      const all = [];
      for (;;) { const page = await op({ method: 'GET', filters, limit: 1000, offset: all.length }); all.push(...page); if (page.length < 1000) return all; }
    };
    return [entity, { list: () => list(), filter: list, get: id => op({ method: 'GET', id }), create: payload => op({ method: 'POST', payload }), update: (id, payload) => op({ method: 'PATCH', id, payload }) }];
  }));
}
const semantic = row => Object.fromEntries(Object.entries(row || {}).filter(([key]) => !['created_at', 'updated_at', 'created_by', 'workspace_id', 'selection_reason'].includes(key)));
export async function buildSnapshot(db, input, model) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.agent_ids) || new Set(input.agent_ids).size !== input.agent_ids.length) throw httpError(400, 'Choose a distinct panel.');
  if (input.agent_ids.length < 3 || input.agent_ids.length > 8) throw httpError(400, 'Choose three to eight agents.');
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  const constraints = typeof input.constraints === 'string' ? input.constraints.trim() : '';
  if (question.length > 4000 || constraints.length > 10000) throw httpError(400, 'The question or constraints are too long.');
  if (input.context_in_scenario !== undefined && typeof input.context_in_scenario !== 'boolean') throw httpError(400, 'Choose whether context is included in the scenario.');
  if (input.context !== undefined && typeof input.context !== 'string') throw httpError(400, 'Context must be text.');
  if (input.context_in_scenario === false && !input.context?.trim()) throw httpError(400, 'Add context and supporting information, or confirm it is included in the scenario.');
  const scenario = scenarioWithContext(semantic(await db.Scenario.get(uuid(input.scenario_id))), input.context || '', input.context_in_scenario !== false);
  const agents = await Promise.all(input.agent_ids.map(id => db.Agent.get(uuid(id)).then(semantic)));
  let decision = null, options = [], assumptions = [];
  if (input.mode === 'compare') {
    const record = await db.Decision.get(uuid(input.decision_id));
    decision = { id: record.id, title: record.title, description: record.description, acceptance_criteria: record.acceptance_criteria };
    options = (await db.DecisionOption.filter({ decision_id: decision.id })).map(semantic).sort((a, b) => a.id.localeCompare(b.id));
    assumptions = (await db.DecisionAssumption.filter({ decision_id: decision.id })).map(semantic).sort((a, b) => a.id.localeCompare(b.id));
  } else {
    assumptions = (typeof input.assumptions === 'string' ? input.assumptions : '').split('\n').filter(s => s.trim()).map(text => ({ text: text.trim(), status: 'unverified' }));
  }
  const knowledge = (await retrieveKnowledge(db, `${scenario.context_document || ''} ${question}`, 5)).map(semantic);
  const selected = async (entity, ids) => {
    if (ids === undefined) return [];
    if (!Array.isArray(ids) || ids.length > 30 || new Set(ids).size !== ids.length) throw httpError(400, 'Choose up to 30 distinct findings of each type.');
    const rows = await Promise.all(ids.map(id => db[entity].get(uuid(id))));
    if (rows.some(r => !r || r.review_status === 'archived' || r.merged_into)) throw httpError(400, 'A selected finding is archived or unavailable. Review your selection.');
    return rows.map(semantic).sort((a,b) => a.id.localeCompare(b.id));
  };
  const threats = await selected('Threat', input.threat_ids);
  const chains = await selected('Chain', input.chain_ids);
  const snapshot = { version: ANALYSIS_VERSION, model, mode: input.mode, question, constraints, scenario, agents, decision, options, assumptions, knowledge, threats, chains };
  const checks = readiness(snapshot);
  if (checks.errors.length) throw httpError(400, checks.errors.join(' '));
  return snapshot;
}
export function createAnalysisService(pool, config) {
  const scoped = (user, workspace, write, fn) => withWorkspace(pool, user.id, workspace, write, fn);
  async function get(user, workspace, id) {
    return scoped(user, workspace, false, async client => {
      const row = (await client.query('SELECT * FROM analysis_jobs WHERE id=$1 AND workspace_id=$2', [uuid(id), workspace])).rows[0];
      if (!row) throw httpError(404, 'Analysis not found.');
      return row;
    });
  }
  return async function route(req, user, url, body) {
    const match = /^\/api\/analyses(?:\/([^/]+))?(?:\/(resume|cancel|freshness|actions))?$/.exec(url.pathname);
    if (!match) return null;
    const workspace = uuid(url.searchParams.get('workspace_id'));
    const [, id, action] = match;
    if (req.method === 'GET' && !id) return scoped(user, workspace, false, async client => ({ status: 200, data: (await client.query('SELECT id,status,input,result,error,progress,created_at,updated_at FROM analysis_jobs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100', [workspace])).rows }));
    if (req.method === 'GET' && id) {
      const job = await get(user, workspace, id);
      if (action === 'freshness') {
        try {
          const snapshot = await buildSnapshot(await workspaceDb(pool, user.id, workspace), job.input, config.defaultModel);
          return { status: 200, data: { changes: changedInputs(job.snapshot, snapshot), stale: job.fingerprint !== fingerprint(snapshot) } };
        } catch (error) { return { status: 200, data: { stale: true, changes: ['Inputs are no longer available or ready'], error: error.message } }; }
      }
      if (action) throw httpError(405, 'Method not allowed.');
      const activity = await scoped(user, workspace, false, client => readAnalysisActivity(client, job, url.searchParams.get('debate') === '1'));
      return { status: 200, data: { ...job, activity } };
    }
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    await scoped(user, workspace, true, async () => {});
    if (!id) {
      if (config.provider !== 'mitre_aip') throw httpError(400, 'Background analysis requires the configured MITRE AIP provider.');
      const input = await body(req);
      const snapshot = await buildSnapshot(await workspaceDb(pool, user.id, workspace), input, config.defaultModel);
      const hash = fingerprint(snapshot);
      return scoped(user, workspace, true, async client => {
        const row = (await client.query("INSERT INTO analysis_jobs(workspace_id,user_id,input,snapshot,fingerprint) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (workspace_id,fingerprint) WHERE status IN ('queued','running') DO UPDATE SET updated_at=analysis_jobs.updated_at RETURNING *", [workspace, user.id, JSON.stringify(input), JSON.stringify(snapshot), hash])).rows[0];
        return { status: 202, data: row };
      });
    }
    const job = await get(user, workspace, id);
    if (action === 'actions') {
      const payload = await body(req);
      const index = payload.index;
      const proposed = job.result?.brief?.actions?.[index];
      if (!Number.isInteger(index) || !proposed || job.status !== 'complete') throw httpError(400, 'Choose a completed analysis action.');
      return scoped(user, workspace, true, async client => {
        const row = (await client.query("INSERT INTO mitigations(workspace_id,title,description,source,status,analysis_job_id,action_index,completion_criteria,evidence_ids,session_id,scenario_id) VALUES ($1,$2,$3,'analysis','proposed',$4,$5,$6,$7,$8,$9) ON CONFLICT (analysis_job_id,action_index) WHERE analysis_job_id IS NOT NULL DO UPDATE SET title=mitigations.title RETURNING *", [workspace, proposed.title, 'Review the linked evidence before accepting this proposed action.', id, index, proposed.completion_criteria, JSON.stringify(proposed.evidence_ids), job.result.sessions?.[0]?.sessionId || null, job.snapshot.scenario.id])).rows[0];
        return { status: 200, data: row };
      });
    }
    if (action === 'resume') {
      if (!['failed', 'cancelled'].includes(job.status)) throw httpError(409, 'Only a stopped analysis can be resumed.');
      return scoped(user, workspace, true, async client => {
        try { return { status: 202, data: (await client.query("UPDATE analysis_jobs SET status='queued',error=null,cancel_requested=false,updated_at=now() WHERE id=$1 AND status IN ('failed','cancelled') RETURNING *", [id])).rows[0] }; }
        catch (error) { if (error.code === '23505') throw httpError(409, 'An analysis with these inputs is already active.'); throw error; }
      });
    }
    if (action === 'cancel') return scoped(user, workspace, true, async client => ({ status: 200, data: (await client.query("UPDATE analysis_jobs SET cancel_requested=true,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,updated_at=now() WHERE id=$1 RETURNING *", [id])).rows[0] }));
    throw httpError(405, 'Method not allowed.');
  };
}
