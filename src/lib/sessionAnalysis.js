// Session-scoped chain analysis: run Chain Breaker on a session's chains and
// auto-create session-linked mitigations from the roadmaps — so a fully debated
// session yields kill chains, break analysis, and mitigations without leaving it.
import { analyzeChainBreaker } from '@/lib/llm';

const LEV_LI = { HIGH: [4, 5], MEDIUM: [3, 4], LOW: [2, 3] };
const cfgKey = (chainId) => `chain_breaker_${chainId}`;

// Persist a chain's analysis to app_configs (upsert by key).
async function saveAnalysis(db, chain, analysis) {
  const value = JSON.stringify({ analysis, analyzed_at: new Date().toISOString() });
  try {
    const existing = (await db.AppConfig.filter({ key: cfgKey(chain.id) }))?.[0];
    if (existing) await db.AppConfig.update(existing.id, { value, label: chain.name });
    else await db.AppConfig.create({ key: cfgKey(chain.id), value, label: chain.name });
  } catch { /* non-fatal */ }
}

// Load persisted analyses for a set of chains → { chainId: analysis }.
export async function loadChainAnalyses({ db, chains }) {
  const map = {};
  if (!db || !chains?.length) return map;
  try {
    const cfgs = await db.AppConfig.list();
    const byKey = Object.fromEntries(cfgs.map(c => [c.key, c]));
    for (const chain of chains) {
      const cfg = byKey[cfgKey(chain.id)];
      if (cfg?.value) { try { map[chain.id] = JSON.parse(cfg.value).analysis; } catch { /* skip */ } }
    }
  } catch { /* ignore */ }
  return map;
}

// Analyze every chain and create deduped session mitigations from each roadmap.
// onProgress(indexDone, total, chainName). Returns { analyses, created }.
export async function analyzeSessionChains({ db, sessionId, chains = [], scenarioContext = '', existingMitigations = [], onProgress }) {
  const analyses = {};
  let created = 0;
  const seen = new Set(existingMitigations.map(m => (m.title || '').toLowerCase().trim()));

  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    onProgress?.(i, chains.length, chain.name);
    if (!(chain.steps?.length)) continue;

    let analysis;
    try {
      analysis = await analyzeChainBreaker({
        chain: {
          name: chain.name,
          description: chain.description || '',
          steps: chain.steps.map(s => ({
            step_number: s.step_number,
            agent_label: s.agent_label || `Step ${s.step_number}`,
            step_text: s.step_text || '',
          })),
        },
        scenarioContext,
      });
    } catch { continue; }

    analyses[chain.id] = analysis;
    await saveAnalysis(db, chain, analysis);

    const stepMap = Object.fromEntries((analysis.steps || []).map(s => [s.step_number, s]));
    for (const m of (analysis.mitigation_roadmap || [])) {
      const title = (m.action || '').trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // Inherent risk = worst leverage among the steps this action breaks.
      let inherent = [3, 3];
      (m.breaks_steps || []).forEach(sn => {
        const map = LEV_LI[stepMap[sn]?.leverage];
        if (map && map[0] * map[1] > inherent[0] * inherent[1]) inherent = map;
      });

      try {
        await db.Mitigation.create({
          title,
          effect: m.effect || null,
          control_type: m.type || null,
          effort: m.effort || null,
          time_to_deploy: m.time_to_deploy || null,
          breaks_steps: m.breaks_steps || [],
          status: 'proposed',
          source: 'chain_breaker',
          chain_id: chain.id,
          session_id: sessionId,
          inherent_likelihood: inherent[0],
          inherent_impact: inherent[1],
        });
        created++;
      } catch { /* skip a failed row */ }
    }
  }
  onProgress?.(chains.length, chains.length, null);
  return { analyses, created };
}

// Build the analysisMap / rankMap a ChainFlowGraph expects from one analysis.
export function toChainMaps(analysis) {
  if (!analysis?.steps) return { analysisMap: {}, rankMap: {} };
  const analysisMap = Object.fromEntries(analysis.steps.map(s => [s.step_number, s]));
  const rankMap = {};
  (analysis.priority_steps || []).forEach((n, i) => { rankMap[n] = i + 1; });
  return { analysisMap, rankMap };
}
