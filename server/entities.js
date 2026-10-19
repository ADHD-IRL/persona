export const TABLES = Object.freeze({
  Agent: 'agents', Domain: 'domains', Scenario: 'scenarios', Threat: 'threats', Chain: 'chains',
  Session: 'sessions', SessionAgent: 'session_agents', SessionSynthesis: 'session_syntheses',
  SessionMessage: 'session_messages', SessionSource: 'session_sources', SessionParticipant: 'session_participants',
  AppConfig: 'app_configs', Mitigation: 'mitigations', Decision: 'decisions', DecisionOption: 'decision_options',
  DecisionAssumption: 'decision_assumptions', KnowledgeDocument: 'knowledge_documents', KnowledgeChunk: 'knowledge_chunks',
});
const adminDelete = new Set(['Agent', 'Domain', 'Scenario', 'Threat', 'Chain', 'Session', 'SessionAgent', 'SessionSynthesis', 'SessionMessage', 'SessionSource', 'SessionParticipant', 'AppConfig']);
const references = {
  analysis_job_id: 'analysis_jobs',
  domain_id: 'domains', scenario_id: 'scenarios', session_id: 'sessions', agent_id: 'agents',
  threat_id: 'threats', chain_id: 'chains', message_id: 'session_messages', document_id: 'knowledge_documents', decision_id: 'decisions',
  decision_option_id: 'decision_options', chosen_option_id: 'decision_options',
  round2_strongest_ally_agent_id: 'agents', round2_strongest_disagree_agent_id: 'agents',
};
export const httpError = (status, message) => Object.assign(new Error(message), { status });
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw httpError(400, 'Invalid record identifier.');
  return value;
}
const identifier = value => `"${value}"`;

export async function withWorkspace(pool, userId, workspaceId, write, fn, deleteRequiresAdmin = false) {
  uuid(workspaceId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const membership = await client.query('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE', [workspaceId, userId]);
    const role = membership.rows[0]?.role;
    if (!role || (write && !['admin', 'analyst'].includes(role)) || (deleteRequiresAdmin && role !== 'admin')) throw httpError(403, 'You do not have permission for this workspace operation.');
    await client.query('SET LOCAL ROLE agentdebate_app');
    await client.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.member_role', $2, true)", [workspaceId, role]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function loadColumns(pool) {
  const { rows } = await pool.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public'");
  const columns = {};
  for (const row of rows) (columns[row.table_name] ??= new Map()).set(row.column_name, row.data_type);
  return columns;
}

export async function entityOperation({ pool, columns, userId, workspaceId, entity, method, id, filters = {}, sort, limit, offset = 0, payload = {}, analysisJobId = null }) {
  if (!Object.hasOwn(TABLES, entity)) throw httpError(404, 'Unknown entity.');
  const table = TABLES[entity];
  const allowed = columns[table];
  if (!allowed) throw httpError(503, 'Database schema is not initialized.');
  if (id) uuid(id);
  const validateColumn = name => {
    if (!allowed.has(name)) throw httpError(400, `Unknown field: ${name}`);
    return identifier(name);
  };
  return withWorkspace(pool, userId, workspaceId, method !== 'GET', async client => {
    // Background-owned sessions cannot be mutated by a competing browser run.
    if (method !== 'GET' && ['Session', 'SessionAgent', 'SessionSynthesis'].includes(entity)) {
      let sessionId = entity === 'Session' ? id : payload.session_id;
      if (entity !== 'Session' && id) sessionId = (await client.query('SELECT session_id FROM ' + identifier(table) + ' WHERE id=$1 AND workspace_id=$2', [id, workspaceId])).rows[0]?.session_id;
      let jobId = entity === 'Session' ? payload.analysis_job_id : null;
      if (sessionId) jobId = (await client.query('SELECT analysis_job_id FROM sessions WHERE id=$1 AND workspace_id=$2', [sessionId, workspaceId])).rows[0]?.analysis_job_id || jobId;
      if (jobId && jobId !== analysisJobId) {
        const job = (await client.query('SELECT status FROM analysis_jobs WHERE id=$1 AND workspace_id=$2', [jobId, workspaceId])).rows[0];
        if (job && ['queued','running'].includes(job.status)) throw httpError(409, 'This session is owned by a background analysis. Stop or resume it from Start analysis.');
      }
    }
    if (method === 'GET') {
      const values = [workspaceId];
      const where = ['workspace_id=$1'];
      if (id) { values.push(id); where.push(`id=$${values.length}`); }
      for (const [field, value] of Object.entries(filters)) {
        const name = validateColumn(field);
        if (value === null) where.push(`${name} IS NULL`);
        else { values.push(value); where.push(`${name}=$${values.length}`); }
      }
      let field = 'created_at', direction = 'ASC';
      if (typeof sort === 'string') { direction = sort.startsWith('-') ? 'DESC' : 'ASC'; field = sort.replace(/^-/, ''); }
      else if (sort) { field = Array.isArray(sort) ? sort[0] : sort.field; direction = (Array.isArray(sort) ? sort[1] : sort.order) === 'desc' ? 'DESC' : 'ASC'; }
      const count = limit == null ? 500 : Number(limit);
      if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isInteger(Number(offset)) || Number(offset) < 0) throw httpError(400, 'Invalid pagination.');
      values.push(count, Number(offset));
      const { rows } = await client.query(`SELECT * FROM ${identifier(table)} WHERE ${where.join(' AND ')} ORDER BY ${validateColumn(field)} ${direction}, id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
      if (id && !rows.length) throw httpError(404, 'Record not found.');
      return id ? rows[0] : rows;
    }
    if (method === 'DELETE') {
      if (!id) throw httpError(400, 'A record identifier is required.');
      const { rows } = await client.query(`DELETE FROM ${identifier(table)} WHERE id=$1 AND workspace_id=$2 RETURNING id`, [id, workspaceId]);
      if (!rows.length) throw httpError(404, 'Record not found.');
      return rows[0];
    }
    if (!['POST', 'PATCH'].includes(method) || (method === 'PATCH' && !id)) throw httpError(405, 'Method not allowed.');
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw httpError(400, 'Expected a record object.');
    if (payload.workspace_id != null && payload.workspace_id !== workspaceId) throw httpError(400, 'Cannot move a record to another workspace.');
    if ('id' in payload || 'created_at' in payload) throw httpError(400, 'Record identity and creation time are server-managed.');
    const data = { ...payload, workspace_id: workspaceId };
    if ('merged_into' in data) throw httpError(400, 'Use the merge operation to combine findings.');
    if (['Threat','Chain'].includes(entity)) {
      if ('name' in data && (typeof data.name !== 'string' || !data.name.trim())) throw httpError(400, 'Enter a finding name.');
      if (entity === 'Chain' && 'steps' in data) {
        if (!Array.isArray(data.steps) || data.steps.some((step,index) => !step || step.step_number !== index + 1 || typeof step.step_text !== 'string')) throw httpError(400, 'Chain steps must have text and consecutive step numbers.');
        if (id) {
          const current = (await client.query('SELECT steps FROM chains WHERE id=$1 AND workspace_id=$2',[id,workspaceId])).rows[0];
          const actions = (await client.query('SELECT breaks_steps FROM mitigations WHERE chain_id=$1 AND workspace_id=$2',[id,workspaceId])).rows;
          const linked = new Set(actions.flatMap(a => a.breaks_steps || []));
          for (const number of linked) if (current?.steps?.find(s => s.step_number === number)?.step_text !== data.steps.find(s => s.step_number === number)?.step_text) throw httpError(400, 'A linked action depends on this step. Preserve its position and text, or create a separate chain for the revised path.');
        }
      }
      if (method === 'PATCH' && ['name','description','steps','evidence'].some(k => k in data) && data.review_status !== 'archived') data.review_status = 'needs_review';
      if ('evidence' in data && (!Array.isArray(data.evidence) || data.evidence.some(e => !e || typeof e.text !== 'string'))) throw httpError(400, 'Evidence must contain text entries.');
      if (data.review_status === 'reviewed') {
        const current = id ? (await client.query('SELECT scenario_id FROM '+identifier(table)+' WHERE id=$1 AND workspace_id=$2', [id, workspaceId])).rows[0] : null;
        const scenarioId = data.scenario_id === undefined ? current?.scenario_id : data.scenario_id;
        data.reviewed_context = scenarioId ? (await client.query('SELECT context_document FROM scenarios WHERE id=$1 AND workspace_id=$2', [scenarioId, workspaceId])).rows[0]?.context_document || '' : '';
        data.last_reviewed_at = new Date().toISOString();
      } else { delete data.last_reviewed_at; delete data.reviewed_context; }
    }
    delete data.created_by;
    if (method === 'POST' && allowed.has('created_by')) data.created_by = userId;
    if (allowed.has('updated_at')) data.updated_at = new Date().toISOString();
    for (const field of Object.keys(data)) validateColumn(field);
    for (const [field, referenceTable] of Object.entries(references)) {
      if (!data[field]) continue;
      uuid(data[field]);
      const { rows } = await client.query(`SELECT id FROM ${identifier(referenceTable)} WHERE id=$1 AND workspace_id=$2`, [data[field], workspaceId]);
      if (!rows.length) throw httpError(400, `${field} must reference a record in this workspace.`);
    }
    for (const [field, referenceTable] of [['agent_ids', 'agents'], ['pinned_chain_ids', 'chains']]) {
      if (!data[field]) continue;
      if (!Array.isArray(data[field])) throw httpError(400, `${field} must be an array.`);
      for (const value of data[field]) uuid(value);
      const unique = [...new Set(data[field])];
      const { rows } = await client.query(`SELECT id FROM ${identifier(referenceTable)} WHERE id=ANY($1::uuid[]) AND workspace_id=$2`, [unique, workspaceId]);
      if (rows.length !== unique.length) throw httpError(400, `${field} contains records outside this workspace.`);
    }
    const fields = Object.keys(data);
    const values = fields.map(field => allowed.get(field) === 'jsonb' ? JSON.stringify(data[field]) : data[field]);
    let sql;
    if (method === 'POST') sql = `INSERT INTO ${identifier(table)} (${fields.map(identifier).join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
    else {
      values.push(id, workspaceId);
      sql = `UPDATE ${identifier(table)} SET ${fields.map((field, i) => `${identifier(field)}=$${i + 1}`).join(',')} WHERE id=$${values.length - 1} AND workspace_id=$${values.length} RETURNING *`;
    }
    const { rows } = await client.query(sql, values);
    if (!rows.length) throw httpError(404, 'Record not found.');
    return rows[0];
  }, method === 'DELETE' && adminDelete.has(entity));
}
