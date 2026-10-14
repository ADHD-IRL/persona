import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { parseAnalysisConfigs } from '@/lib/chainBreakStorage';
import { countermeasureText } from '@/lib/llm';
import { computeSCRS, estimateCMDelta, getPosture } from '@/lib/scrsEngine';
import SCRSGauge from '@/components/simulator/SCRSGauge';
import RiskBreakdownCard from '@/components/simulator/RiskBreakdownCard';
import CountermeasureToggle from '@/components/simulator/CountermeasureToggle';
import PageHeader from '@/components/ui/PageHeader';
import {
  FlaskConical, ArrowRight, Save, FileText, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';

const CHAIN_RESILIENCE_COLOR = { HIGH: '#C0392B', MEDIUM: '#D68910', LOW: '#27AE60' };

export default function WhatIfSimulator() {
  const { db } = useWorkspace();
  const { id: preloadSessionId } = useParams();

  const [loading,    setLoading]    = useState(true);
  const [sessions,   setSessions]   = useState([]);
  const [agents,     setAgents]     = useState([]);
  const [sessionId,  setSessionId]  = useState(preloadSessionId || '');
  const [sessionAgents, setSessionAgents] = useState([]);
  const [syntheses,  setSyntheses]  = useState([]);
  const [chains,     setChains]     = useState([]);
  const [libMap,     setLibMap]     = useState({});
  const [sesMap,     setSesMap]     = useState({});
  const [appliedCMs, setAppliedCMs] = useState({}); // key: `${chainId}_${stepNum}_${cmIdx}` → bool
  const [expanded,   setExpanded]   = useState({});
  const [saved,      setSaved]      = useState(false);
  // Arriving from a session scopes the page to it; the picker is a disclosure.
  const [pickSession, setPickSession] = useState(!preloadSessionId);

  const loadData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const [s, a, sa, sy, c, configs] = await Promise.all([
        db.Session.list(),
        db.Agent.list(),
        db.SessionAgent.list(),
        db.SessionSynthesis.list(),
        db.Chain.list(),
        db.AppConfig.list(),
      ]);
      const { libMap: lm, sesMap: sm } = parseAnalysisConfigs(configs);
      setSessions(s);
      setAgents(a);
      setSessionAgents(sa);
      setSyntheses(sy);
      setChains(c);
      setLibMap(lm);
      setSesMap(sm);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived: session agents for selected session ───────────────────────────

  const agentMap    = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);
  const session     = useMemo(() => sessions.find(s => s.id === sessionId), [sessions, sessionId]);

  const filteredSAs = useMemo(() =>
    sessionAgents
      .filter(sa => sa.session_id === sessionId)
      .map(sa => ({ ...sa, agent: agentMap[sa.agent_id] })),
    [sessionAgents, sessionId, agentMap]
  );

  // ── Derived: chain analyses for selected session ──────────────────────────

  const synthesis = useMemo(() =>
    syntheses.find(sy => sy.session_id === sessionId),
    [syntheses, sessionId]
  );

  // Two sources feed the simulator:
  //   1. Chain Breaker analyses of this session's synthesised compound chains.
  //   2. Chain Breaker analyses of library chains that belong to this session —
  //      linked to it directly, or to the scenario the session runs on (either
  //      via the scenario chosen when the analysis was saved, or the chain's own
  //      scenario). Without (2), a library-chain analysis never reaches What-If.
  const chainAnalyses = useMemo(() => {
    const out = [];
    if (synthesis?.compound_chains) {
      synthesis.compound_chains.forEach((chain, idx) => {
        const key    = `${synthesis.id}_${idx}`;
        const stored = sesMap[key];
        if (stored) out.push({ ...chain, ...stored.analysis, _key: key, _idx: idx, _source: 'session' });
      });
    }
    if (session) {
      for (const chain of chains) {
        const stored = libMap[chain.id];
        if (!stored) continue;
        const linkedToSession  = chain.session_id && chain.session_id === session.id;
        const linkedToScenario = session.scenario_id &&
          (stored.scenario_id === session.scenario_id || chain.scenario_id === session.scenario_id);
        if (!linkedToSession && !linkedToScenario) continue;
        out.push({ ...chain, ...stored.analysis, _key: `lib_${chain.id}`, _idx: chain.id, _source: 'library' });
      }
    }
    return out;
  }, [synthesis, sesMap, session, chains, libMap]);

  // ── SCRS computation ─────────────────────────────────────────────────────

  const appliedList = useMemo(() => {
    const out = [];
    for (const [key, on] of Object.entries(appliedCMs)) {
      if (!on) continue;
      const [chainKey, stepNum, cmIdx] = key.split('::');
      const chain = chainAnalyses.find(c => c._key === chainKey);
      const step  = chain?.steps?.find(s => String(s.step_number) === stepNum);
      if (step?.countermeasures?.[cmIdx]) {
        out.push({ text: countermeasureText(step.countermeasures[cmIdx]), leverage: step.leverage, difficulty: step.difficulty });
      }
    }
    return out;
  }, [appliedCMs, chainAnalyses]);

  const { scrs, posture, breakdown } = useMemo(() =>
    computeSCRS({ sessionAgents: filteredSAs, chainAnalyses, appliedCMs: appliedList }),
    [filteredSAs, chainAnalyses, appliedList]
  );

  const baseResult = useMemo(() =>
    computeSCRS({ sessionAgents: filteredSAs, chainAnalyses, appliedCMs: [] }),
    [filteredSAs, chainAnalyses]
  );

  const totalHighSteps = useMemo(() =>
    chainAnalyses.flatMap(ca => (ca.steps || []).filter(s => s.leverage === 'HIGH')).length,
    [chainAnalyses]
  );

  // Top priority actions = unapplied HIGH-leverage, sorted by EASY first
  const priorityActions = useMemo(() => {
    const actions = [];
    for (const chain of chainAnalyses) {
      for (const step of (chain.steps || [])) {
        if (step.leverage !== 'HIGH') continue;
        for (let i = 0; i < (step.countermeasures || []).length; i++) {
          const key = `${chain._key}::${step.step_number}::${i}`;
          if (!appliedCMs[key]) {
            actions.push({ text: countermeasureText(step.countermeasures[i]), difficulty: step.difficulty,
              delta: estimateCMDelta({ leverage: 'HIGH' }, totalHighSteps), key });
          }
        }
      }
    }
    return actions
      .sort((a, b) => { const o = { EASY: 0, MODERATE: 1, HARD: 2 }; return o[a.difficulty] - o[b.difficulty]; })
      .slice(0, 5);
  }, [chainAnalyses, appliedCMs, totalHighSteps]);

  const toggleCM = (key) => {
    setAppliedCMs(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const toggleExpanded = (key) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const applyAll = () => {
    const all = {};
    for (const chain of chainAnalyses) {
      for (const step of (chain.steps || [])) {
        for (let i = 0; i < (step.countermeasures || []).length; i++) {
          all[`${chain._key}::${step.step_number}::${i}`] = true;
        }
      }
    }
    setAppliedCMs(all);
    setSaved(false);
  };

  const clearAll = () => { setAppliedCMs({}); setSaved(false); };

  const saveSimulation = async () => {
    const snapshot = {
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      scrs,
      posture: posture.label,
      applied_countermeasures: appliedList,
      findings_summary: breakdown,
    };
    const key   = `rs_${sessionId}_${Date.now()}`;
    const value = JSON.stringify(snapshot);
    await db.AppConfig.create({ key, value });
    setSaved(true);
  };

  // ── Skeleton ──────────────────────────────────────────────────────────────

  const Skeleton = ({ h = 'h-32' }) => (
    <div className={`${h} rounded-lg animate-pulse`}
      style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }} />
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <PageHeader
        icon={FlaskConical}
        title="What-If Simulator"
        subtitle="Toggle countermeasures and watch the risk score update in real time"
        actions={
          <div className="flex items-center gap-2">
            {sessionId && chainAnalyses.length > 0 && (
              <>
                <button onClick={clearAll}
                  className="px-3 py-2 rounded text-xs font-medium transition-all"
                  style={{ color: 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }}>
                  Clear all
                </button>
                <button onClick={applyAll}
                  className="px-3 py-2 rounded text-xs font-medium transition-all"
                  style={{ color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)', backgroundColor: 'rgba(240,165,0,0.08)' }}>
                  Apply all
                </button>
                <button onClick={saveSimulation}
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition-all"
                  style={{ backgroundColor: saved ? '#27AE60' : 'var(--wr-amber)', color: '#0D1B2A' }}>
                  <Save className="w-3.5 h-3.5" />
                  {saved ? 'Saved' : 'Save Simulation'}
                </button>
              </>
            )}
          </div>
        }
      />

      {preloadSessionId && (
        <div className="px-6 pt-4">
          <Link to={`/sessions/${preloadSessionId}`} className="text-xs font-mono inline-flex items-center gap-1 px-2 py-1 rounded"
            style={{ color: 'var(--wr-amber)', backgroundColor: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', textDecoration: 'none' }}>
            ← Back to session
          </Link>
        </div>
      )}

      <div className="p-6">
        {/* Session selector — collapsed to a label when scoped to a session */}
        <div className="mb-5 rounded-lg p-4"
          style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          {!pickSession && session ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold font-mono" style={{ color: 'var(--wr-text-muted)' }}>SESSION</p>
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--wr-text-primary)' }}>{session.name}</p>
              </div>
              <button onClick={() => setPickSession(true)} className="text-xs underline flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>
                Change session
              </button>
            </div>
          ) : (
            <>
              <label className="text-xs font-bold font-mono block mb-2"
                style={{ color: 'var(--wr-text-muted)' }}>SELECT SESSION</label>
              <select
                value={sessionId}
                onChange={e => { setSessionId(e.target.value); setAppliedCMs({}); }}
                className="w-full rounded px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)',
                  color: 'var(--wr-text-primary)' }}>
                <option value="">Choose a completed session…</option>
                {sessions.filter(s => s.status === 'complete').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </>
          )}
          {session && chainAnalyses.length === 0 && (
            <p className="text-xs mt-2" style={{ color: '#D68910' }}>
              ⚠ No chain analyses found for this session. Run Chain Breaker on its synthesised chains, or on a library chain with this session's scenario selected, and save the analysis.
            </p>
          )}
        </div>

        {!sessionId ? (
          <div className="rounded-lg py-20 text-center"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: 'var(--wr-amber)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--wr-text-secondary)' }}>
              Select a session to begin
            </p>
            <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
              Run a session through synthesis and Chain Breaker analysis first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">

            {/* ── LEFT: Chain countermeasures ─────────────────────────── */}
            <div className="col-span-2 space-y-4">

              {/* Score delta bar */}
              {chainAnalyses.length > 0 && (
                <div className="rounded-lg p-4 flex items-center gap-6"
                  style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                  <div className="text-center">
                    <p className="text-xs font-mono mb-1" style={{ color: 'var(--wr-text-muted)' }}>BASELINE</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: getPosture(baseResult.scrs).color }}>
                      {baseResult.scrs}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
                  <div className="text-center">
                    <p className="text-xs font-mono mb-1" style={{ color: 'var(--wr-text-muted)' }}>CURRENT</p>
                    <p className="text-2xl font-bold font-mono transition-colors" style={{ color: posture.color }}>
                      {scrs}
                    </p>
                  </div>
                  {scrs < baseResult.scrs && (
                    <>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ backgroundColor: '#27AE60', width: `${((baseResult.scrs - scrs) / baseResult.scrs) * 100}%` }} />
                      </div>
                      <span className="text-sm font-bold font-mono flex-shrink-0" style={{ color: '#27AE60' }}>
                        −{baseResult.scrs - scrs} pts
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Chains */}
              {chainAnalyses.map(chain => {
                const isOpen = expanded[chain._key] !== false; // default open
                const resColor = CHAIN_RESILIENCE_COLOR[chain.chain_resilience] || 'var(--wr-text-muted)';

                return (
                  <div key={chain._key} className="rounded-lg overflow-hidden"
                    style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>

                    {/* Chain header */}
                    <button
                      className="w-full flex items-center justify-between px-5 py-4 text-left"
                      onClick={() => toggleExpanded(chain._key)}>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>
                          {chain.name}
                        </p>
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded"
                          style={{ color: resColor, backgroundColor: `${resColor}15`, border: `1px solid ${resColor}30` }}>
                          {chain.chain_resilience} RESILIENCE
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded"
                          style={{ color: 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }}>
                          {chain._source === 'library' ? 'LIBRARY CHAIN' : 'SESSION CHAIN'}
                        </span>
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} />
                        : <ChevronDown className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} />
                      }
                    </button>

                    {isOpen && (
                      <div className="border-t" style={{ borderColor: 'var(--wr-border)' }}>
                        {(chain.steps || []).map(step => (
                          <div key={step.step_number}
                            className="px-5 py-4 border-b last:border-0"
                            style={{ borderColor: 'var(--wr-border)' }}>
                            <div className="flex items-start gap-3 mb-3">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono"
                                style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)',
                                  border: '1px solid var(--wr-border)' }}>
                                {step.step_number}
                              </span>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>
                                {step.adversary_objective || step.step_text}
                              </p>
                            </div>

                            {(step.countermeasures || []).length > 0 && (
                              <div className="ml-9 space-y-1.5">
                                <p className="text-xs font-bold font-mono mb-2"
                                  style={{ color: 'var(--wr-text-muted)', opacity: 0.7 }}>
                                  COUNTERMEASURES
                                </p>
                                {step.countermeasures.map((cm, i) => {
                                  const key = `${chain._key}::${step.step_number}::${i}`;
                                  return (
                                    <CountermeasureToggle
                                      key={key}
                                      cm={{ text: countermeasureText(cm), leverage: step.leverage, difficulty: step.difficulty }}
                                      applied={!!appliedCMs[key]}
                                      onToggle={() => toggleCM(key)}
                                      totalHighSteps={totalHighSteps}
                                    />
                                  );
                                })}
                                {step.residual_risk && (
                                  <p className="text-xs mt-2 pt-2 italic"
                                    style={{ color: 'var(--wr-text-muted)', borderTop: '1px solid var(--wr-border)' }}>
                                    <strong style={{ color: '#D68910' }}>Residual: </strong>
                                    {step.residual_risk}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {chainAnalyses.length === 0 && sessionId && (
                <div className="rounded-lg py-16 text-center"
                  style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                  <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: '#D68910' }} />
                  <p className="text-sm font-medium mb-2" style={{ color: 'var(--wr-text-secondary)' }}>
                    No chain analyses available
                  </p>
                  <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
                    Run Chain Breaker on this session's synthesised chains, or on a library chain with
                    {session?.scenario_id ? ' this session’s scenario' : ' a scenario'} selected, then save the analysis.
                  </p>
                  <Link to="/chain-breaker"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold"
                    style={{ backgroundColor: 'var(--wr-amber)', color: '#0D1B2A' }}>
                    Open Chain Breaker <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* ── RIGHT: Gauge + breakdown + priority actions ────────── */}
            <div className="col-span-1 space-y-4">

              {/* Gauge */}
              <div className="rounded-lg p-5 flex flex-col items-center"
                style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold tracking-widest font-mono mb-4"
                  style={{ color: 'var(--wr-text-muted)' }}>SYSTEMIC CRITICAL RISK SCORE</p>
                <SCRSGauge scrs={scrs} size={180} />
              </div>

              {/* Breakdown */}
              <RiskBreakdownCard
                breakdown={breakdown}
                scrs={scrs}
                previousScrs={baseResult.scrs}
              />

              {/* Priority actions */}
              {priorityActions.length > 0 && (
                <div className="rounded-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                  <p className="px-4 py-3 text-xs font-bold tracking-widest font-mono border-b"
                    style={{ color: 'var(--wr-text-muted)', borderColor: 'var(--wr-border)' }}>
                    PRIORITY ACTIONS
                  </p>
                  <div className="px-4 py-3 space-y-2">
                    {priorityActions.map((a, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="flex-shrink-0 text-xs font-bold font-mono mt-0.5"
                          style={{ color: 'var(--wr-amber)' }}>{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-snug" style={{ color: 'var(--wr-text-secondary)' }}>
                            {a.text}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: '#27AE60' }}>
                            −{a.delta} pts · {a.difficulty}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate brief — routes to Reports pre-scoped to this session */}
              {sessionId && (
                <Link to={`/reports?session=${sessionId}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded text-sm font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)',
                    border: '1px solid rgba(240,165,0,0.3)' }}>
                  <FileText className="w-4 h-4" />
                  Generate Decision Brief
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
