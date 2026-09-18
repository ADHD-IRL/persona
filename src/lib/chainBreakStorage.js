/**
 * Chain Breaker analysis persistence via AppConfig KV store.
 *
 * The Chain and SessionSynthesis entities have fixed schemas — custom fields
 * like break_analysis are silently dropped on list/filter. AppConfig has
 * defined `key` and `value` string fields and reliably round-trips data.
 *
 * Key format:
 *   cb_lib_{chainId}           → library chain analysis
 *   cb_ses_{synthId}_{idx}     → session synthesis compound chain analysis
 *
 * Library entries also record the scenario they were analysed against
 * (scenario_id) so the What-If Simulator can pick them up for any session
 * that runs on that scenario.
 */

const LIB_PREFIX = 'cb_lib_';
const SES_PREFIX = 'cb_ses_';

export const libKey  = (chainId)        => `${LIB_PREFIX}${chainId}`;
export const sesKey  = (synthId, idx)   => `${SES_PREFIX}${synthId}_${idx}`;
export const isAnalysisKey = (k)        => k?.startsWith(LIB_PREFIX) || k?.startsWith(SES_PREFIX);

/**
 * Parse a list of AppConfig records into indexed maps.
 * Returns:
 *   libMap  { [chainId]:  { analysis, analyzed_at, scenario_id, configId } }
 *   sesMap  { [`${synthId}_${idx}`]: { analysis, analyzed_at, configId } }
 */
export function parseAnalysisConfigs(configs) {
  const libMap = {};
  const sesMap = {};
  for (const cfg of configs) {
    if (!isAnalysisKey(cfg.key)) continue;
    try {
      const data = JSON.parse(cfg.value);
      if (cfg.key.startsWith(LIB_PREFIX)) {
        const chainId = cfg.key.slice(LIB_PREFIX.length);
        libMap[chainId] = {
          analysis:    data.analysis,
          analyzed_at: data.analyzed_at,
          scenario_id: data.scenario_id || null,
          configId:    cfg.id,
        };
      } else {
        const rest = cfg.key.slice(SES_PREFIX.length);
        sesMap[rest]  = { analysis: data.analysis, analyzed_at: data.analyzed_at, configId: cfg.id };
      }
    } catch { /* malformed entry — skip */ }
  }
  return { libMap, sesMap };
}

/**
 * Upsert a library chain analysis. Returns the AppConfig id.
 * `scenarioId` links the analysis to a scenario so sessions on that scenario
 * can use its countermeasures in the What-If Simulator.
 */
export async function saveLibraryAnalysis(db, chainId, analysis, analyzedAt, scenarioId = null) {
  const key   = libKey(chainId);
  const value = JSON.stringify({ analysis, analyzed_at: analyzedAt, scenario_id: scenarioId || null });
  const existing = await db.AppConfig.filter({ key });
  if (existing.length > 0) {
    await db.AppConfig.update(existing[0].id, { value });
    return existing[0].id;
  }
  const created = await db.AppConfig.create({ key, value });
  return created.id;
}

/** Upsert a session synthesis chain analysis. Returns the AppConfig id. */
export async function saveSessionAnalysis(db, synthId, idx, analysis, analyzedAt) {
  const key   = sesKey(synthId, idx);
  const value = JSON.stringify({ analysis, analyzed_at: analyzedAt });
  const existing = await db.AppConfig.filter({ key });
  if (existing.length > 0) {
    await db.AppConfig.update(existing[0].id, { value });
    return existing[0].id;
  }
  const created = await db.AppConfig.create({ key, value });
  return created.id;
}

/** Delete a library chain analysis. */
export async function clearLibraryAnalysis(db, chainId) {
  const existing = await db.AppConfig.filter({ key: libKey(chainId) });
  if (existing.length > 0) await db.AppConfig.delete(existing[0].id);
}

/** Delete a session synthesis chain analysis. */
export async function clearSessionAnalysis(db, synthId, idx) {
  const existing = await db.AppConfig.filter({ key: sesKey(synthId, idx) });
  if (existing.length > 0) await db.AppConfig.delete(existing[0].id);
}
