// Small JSON key-value layer over the AppConfig entity (app_configs table).
// Several features keep their durable state here (chain-break analyses,
// decision setup and assessment, R-N10 run records). Keys are plain strings;
// values are JSON-encoded on write and parsed on read.

export async function readKV(db, key) {
  const rows = await db.AppConfig.filter({ key });
  if (!rows?.length) return null;
  try { return JSON.parse(rows[0].value); }
  catch (e) { throw new Error(`Stored value for "${key}" is not valid JSON: ${e.message}`); }
}

export async function writeKV(db, key, value) {
  const rows = await db.AppConfig.filter({ key });
  const payload = JSON.stringify(value);
  if (rows?.length) { await db.AppConfig.update(rows[0].id, { value: payload }); return rows[0].id; }
  const created = await db.AppConfig.create({ key, value: payload });
  return created.id;
}

export async function deleteKV(db, key) {
  const rows = await db.AppConfig.filter({ key });
  for (const r of rows || []) await db.AppConfig.delete(r.id);
  return rows?.length || 0;
}
