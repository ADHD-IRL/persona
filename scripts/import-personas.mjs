import fs from 'node:fs/promises';
import pg from 'pg';
import { loadColumns, withWorkspace, uuid } from '../server/entities.js';

const [sourcePath, workspaceId] = process.argv.slice(2);
const replace = process.argv.includes('--replace');
const countArgument = process.argv.find(value => value.startsWith('--expect-count='));
const expectedCount = countArgument ? Number(countArgument.split('=')[1]) : null;
if (!sourcePath || !workspaceId) throw new Error('Usage: node --env-file=.env scripts/import-personas.mjs <export.json> <workspace-id> [--replace --expect-count=N]');
if (replace && (!Number.isInteger(expectedCount) || expectedCount < 0)) throw new Error('Replacement requires --expect-count=N to guard against unexpected roster changes.');
uuid(workspaceId);
const payload = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
if (payload.format !== 'agentdebate.personas' || payload.version !== 1 || !Array.isArray(payload.personas)) throw new Error('Expected an agentdebate.personas version 1 export.');
if (replace && !payload.personas.length) throw new Error('Cannot replace a roster with an empty export.');
if (payload.count !== undefined && payload.count !== payload.personas.length) throw new Error('Export count does not match its persona records.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const normalized = value => String(value || '').trim().toLowerCase();
const identity = (name, discipline, domainId) => [normalized(name), normalized(discipline), domainId || ''].join('|');
try {
  const workspace = (await pool.query('SELECT id,owner_id FROM workspaces WHERE id=$1', [workspaceId])).rows[0];
  if (!workspace?.owner_id) throw new Error('The target workspace has no owner.');
  const columns = (await loadColumns(pool)).agents;
  const protectedFields = new Set(['id','workspace_id','created_by','created_at','updated_at','domain_id','domain']);
  for (const persona of payload.personas) {
    if (!persona || typeof persona.name !== 'string' || !persona.name.trim() || typeof persona.discipline !== 'string' || !persona.discipline.trim()) throw new Error('Every imported persona needs a name and discipline.');
    const unsupported = Object.keys(persona).filter(field => !protectedFields.has(field) && !columns.has(field));
    if (unsupported.length) throw new Error(`Unsupported fields on ${persona.name}: ${unsupported.join(', ')}`);
  }
  const result = await withWorkspace(pool, workspace.owner_id, workspaceId, true, async client => {
    // Serialize imports for this workspace so retries cannot race duplicates.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['persona-import:' + workspaceId]);
    let deleted = 0;
    if (replace) {
      await client.query('LOCK TABLE agents IN SHARE ROW EXCLUSIVE MODE');
      const count = (await client.query('SELECT count(*)::int AS count FROM agents WHERE workspace_id=$1', [workspaceId])).rows[0].count;
      if (count !== expectedCount) throw new Error(`Expected ${expectedCount} agents before replacement, found ${count}. No changes made.`);
      const references = (await client.query('SELECT (SELECT count(*)::int FROM session_agents WHERE workspace_id=$1) + (SELECT count(*)::int FROM sessions WHERE workspace_id=$1 AND cardinality(agent_ids)>0) AS count', [workspaceId])).rows[0].count;
      if (references) throw new Error('Existing sessions reference this roster. Resolve those references before replacing agent IDs.');
      deleted = (await client.query('DELETE FROM agents WHERE workspace_id=$1 RETURNING id', [workspaceId])).rows.length;
    }
    const existingDomains = (await client.query('SELECT id,name FROM domains WHERE workspace_id=$1', [workspaceId])).rows;
    const domainByName = new Map(existingDomains.map(domain => [normalized(domain.name), domain.id]));
    const existingAgents = (await client.query('SELECT id,name,discipline,domain_id FROM agents WHERE workspace_id=$1', [workspaceId])).rows;
    const known = new Set(existingAgents.map(agent => identity(agent.name, agent.discipline, agent.domain_id)));
    const seen = new Map();
    let created = 0, skipped = 0, domainsCreated = 0, variants = 0;
    for (const persona of payload.personas) {
      const domainName = String(persona.domain || 'Imported Experts').trim();
      let domainId = domainByName.get(normalized(domainName));
      if (!domainId) {
        const row = (await client.query('INSERT INTO domains (workspace_id,name,color,created_by) VALUES ($1,$2,$3,$4) RETURNING id', [workspaceId, domainName, '#F0A500', workspace.owner_id])).rows[0];
        domainId = row.id; domainByName.set(normalized(domainName), domainId); domainsCreated++;
      }
      const sourceIdentity = identity(persona.name, persona.discipline, domainId);
      const occurrence = (seen.get(sourceIdentity) || 0) + 1;
      seen.set(sourceIdentity, occurrence);
      const name = occurrence > 1 ? `${persona.name.trim()} (Variant ${occurrence})` : persona.name.trim();
      if (occurrence > 1) variants++;
      const key = identity(name, persona.discipline, domainId);
      if (known.has(key)) { skipped++; continue; }
      const data = Object.fromEntries(Object.entries(persona).filter(([field]) => !protectedFields.has(field)));
      Object.assign(data, { name, discipline: persona.discipline.trim(), workspace_id: workspaceId, domain_id: domainId, created_by: workspace.owner_id });
      const fields = Object.keys(data);
      const values = fields.map(field => columns.get(field) === 'jsonb' ? JSON.stringify(data[field]) : data[field]);
      await client.query(`INSERT INTO agents (${fields.map(field => '"' + field + '"').join(',')}) VALUES (${fields.map((_, index) => '$' + (index + 1)).join(',')})`, values);
      known.add(key); created++;
    }
    return { sourceProfiles: payload.personas.length, deleted, created, skipped, domainsCreated, variants };
  });
  const totals = (await pool.query('SELECT (SELECT count(*)::int FROM agents WHERE workspace_id=$1) AS agents, (SELECT count(*)::int FROM domains WHERE workspace_id=$1) AS domains', [workspaceId])).rows[0];
  console.log(JSON.stringify({ ...result, totals }));
} finally { await pool.end(); }
