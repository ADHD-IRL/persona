import { uuid } from './entities.js';

// Machine access is restricted to the server-configured workspace and the
// existing bearer-key/read-only MCP tool contract.
export function createPostgresRepo(pool, workspaceId) {
  uuid(workspaceId);
  async function query(sql, values = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE agentdebate_app');
      await client.query("SELECT set_config('app.workspace_id',$1,true),set_config('app.member_role','viewer',true)", [workspaceId]);
      const result = await client.query(sql, values);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const listDomains = async () => (await query('SELECT id,name,description,color FROM domains WHERE workspace_id=$1 ORDER BY name,id', [workspaceId])).rows;
  async function prepare({ domain, role_type, expertise_level, tags } = {}) {
    const values = [workspaceId];
    const filters = ['workspace_id=$1'];
    if (domain) {
      const match = (await listDomains()).find(d => d.name.toLowerCase() === domain.trim().toLowerCase());
      if (!match) throw new Error(`No domain named "${domain}" in this workspace.`);
      values.push(match.id); filters.push(`domain_id=$${values.length}`);
    }
    for (const [field, value] of [['role_type', role_type], ['expertise_level', expertise_level]]) if (value) { values.push(value); filters.push(`${field}=$${values.length}`); }
    if (tags?.length) { values.push(tags); filters.push(`tags @> $${values.length}::text[]`); }
    return { values, where: filters.join(' AND ') };
  }
  return {
    listDomains,
    async domainCounts() {
      const { rows } = await query('SELECT domain_id,count(*)::int AS count FROM agents WHERE workspace_id=$1 GROUP BY domain_id', [workspaceId]);
      return Object.fromEntries(rows.map(row => [row.domain_id, row.count]));
    },
    async listAgents(options = {}) {
      const { values, where } = await prepare(options);
      const total = (await query(`SELECT count(*)::int AS total FROM agents WHERE ${where}`, values)).rows[0].total;
      values.push(options.limit ?? 50, options.offset ?? 0);
      const { rows } = await query(`SELECT * FROM agents WHERE ${where} ORDER BY name,id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
      return { rows, total };
    },
    async searchAgents(options) {
      const { values, where } = await prepare(options);
      const literal = options.query.replace(/[\\%_]/g, char => `\\${char}`);
      values.push(`%${literal}%`);
      const term = `$${values.length}`;
      const search = ['name', 'discipline', 'persona_description', 'red_team_focus', 'professional_background'].map(field => `${field} ILIKE ${term}`).join(' OR ');
      values.push(options.limit ?? 10);
      return (await query(`SELECT * FROM agents WHERE ${where} AND (${search}) ORDER BY name,id LIMIT $${values.length}`, values)).rows;
    },
    async getAgentById(id) { uuid(id); return (await query('SELECT * FROM agents WHERE workspace_id=$1 AND id=$2', [workspaceId, id])).rows[0] ?? null; },
    async getAgentByName(name) { return (await query('SELECT * FROM agents WHERE workspace_id=$1 AND lower(name)=lower($2) ORDER BY id LIMIT 1', [workspaceId, name])).rows[0] ?? null; },
  };
}
