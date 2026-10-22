import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// The original generated baseline used mixed LF/CRLF. Only this exact SQL
// content may match its historical byte checksum; changed SQL still fails.
const legacyBaseline={"name":"001_local_postgres.sql","legacy":"b255d3ab02a48cc94606d22828519f141403709527929fcb1e813fedced8d73b","canonical":"1c06c71231f84cf8b2ba38364d34b5ff6761906b6f2d7c1b75aaf31665f02be6"};
export function migrationChecksum(sql){return createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');}
export function matchesMigrationChecksum(name,sql,stored){
 const canonical=migrationChecksum(sql),lf=sql.replace(/\r\n/g,'\n');
 return stored===canonical||stored===createHash('sha256').update(sql).digest('hex')||stored===createHash('sha256').update(lf.replace(/\n/g,'\r\n')).digest('hex')||(name===legacyBaseline.name&&stored===legacyBaseline.legacy&&canonical===legacyBaseline.canonical);
}
export async function migrate(pool, directory = new URL('../db/migrations/', import.meta.url)) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TABLE IF NOT EXISTS local_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('LOCK TABLE local_schema_migrations IN EXCLUSIVE MODE');
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = migrationChecksum(sql);
      const existing = await client.query('SELECT checksum FROM local_schema_migrations WHERE name=$1', [name]);
      if (existing.rows.length) {
        if (!matchesMigrationChecksum(name,sql,existing.rows[0].checksum)) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO local_schema_migrations (name,checksum) VALUES ($1,$2)', [name, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env before running migrations.');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try { await migrate(pool); console.log('PostgreSQL migrations applied.'); }
  finally { await pool.end(); }
}
