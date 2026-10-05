import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import {
  ArrowLeft, Plus, X, Play, CheckCircle2, AlertTriangle, Trophy, StopCircle,
  RefreshCw, Sparkles, ExternalLink, Scale, ShieldAlert, Eye,
} from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import { WrSelect } from '@/components/ui/WrInput';
import ProcessingBar from '@/components/ui/ProcessingBar';
import { useElapsed } from '@/hooks/useElapsed';
import { aggregateSessionRisk, riskBandFromScore } from '@/lib/risk';
import {
  runOptionSession, generateDecisionAssessment,
  readKV, writeKV, assessmentKey, setupKey,
} from '@/lib/decisionRunner';

const CRIT_COLOR = { LOW: '#27AE60', MEDIUM: '#D68910', HIGH: '#C0392B' };
const ASSUMPTION_STATUS = { holds: '#27AE60', monitoring: '#D68910', invalidated: '#C0392B' };
const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const VERDICT = {
  'RECOMMENDED':     { color: '#27AE60', label: 'RECOMMENDED' },
  'VIABLE':          { color: '#D68910', label: 'VIABLE' },
  'NOT RECOMMENDED': { color: '#C0392B', label: 'NOT RECOMMENDED' },
};
const ACCEPT = { YES: '#27AE60', PARTIAL: '#D68910', NO: '#C0392B', UNKNOWN: '#546E7A' };
const CONF_COLOR = { HIGH: '#27AE60', MEDIUM: '#D68910', LOW: '#C0392B' };
const STAGE_LABEL = { round1: 'Round 1', round2: 'Round 2', synthesis: 'Synthesis', assessment: 'Writing the assessment' };

const letter = (i) => String.fromCharCode(65 + i);
// Stored assessments are normalised on write, but rows written before that
// normalisation existed may still hold strings where lists are expected.
const list = (x) => (Array.isArray(x) ? x : []);
const card = { backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' };
const field = { backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' };

export default function DecisionDetail() {
  const { id } = useParams();
  const { db } = useWorkspace();

  const [decision, setDecision] = useState(null);
  const [options, setOptions] = useState([]);
  const [assumptions, setAssumptions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionAgents, setSessionAgents] = useState([]);
  const [syntheses, setSyntheses] = useState([]);
  const [agents, setAgents] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [assessmentRec, setAssessmentRec] = useState(null); // { generated_at, assessment, session_ids }
  const [loading, setLoading] = useState(true);

  // Panel setup
  const [scenarioId, setScenarioId] = useState('');
  const [agentIds, setAgentIds] = useState(new Set());
  const [setupOpen, setSetupOpen] = useState(false);
  const setupSeeded = useRef(false);
  const defaultedFor = useRef(null);   // scenario id the bench was last defaulted for

  // Run state
  const [running, setRunning] = useState(null);   // { optionIndex, optionName, stage, agentIndex, agentTotal, agentName, reused }
  const [runError, setRunError] = useState(null);
  const cancelRef = useRef(false);
  const elapsed = useElapsed(!!running);

  // Assumptions + record
  const [newAssumption, setNewAssumption] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [rationale, setRationale] = useState('');
  const [decidedBy, setDecidedBy] = useState('');

  const load = async () => {
    if (!db) return;
    const [d, opts, asm, allSessions, allSA, allSynth, ag, sc, setup, assess] = await Promise.all([
      db.Decision.get(id),
      db.DecisionOption.filter({ decision_id: id }),
      db.DecisionAssumption.filter({ decision_id: id }),
      db.Session.list(),
      db.SessionAgent.list(),
      db.SessionSynthesis.list().catch(() => []),
      db.Agent.list(),
      db.Scenario.list(),
      readKV(db, setupKey(id)),
      readKV(db, assessmentKey(id)),
    ]);
    setDecision(d);
    setOptions((opts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    setAssumptions(asm || []);
    setSessions((allSessions || []).filter(s => s.decision_id === id));
    setSessionAgents(allSA || []);
    setSyntheses(allSynth || []);
    setAgents(ag || []);
    setScenarios(sc || []);
    setAssessmentRec(assess || null);
    setRationale(prev => prev || d?.decision_rationale || '');
    if (!setupSeeded.current) {
      setupSeeded.current = true;
      if (setup?.scenario_id && (sc || []).some(s => s.id === setup.scenario_id)) setScenarioId(setup.scenario_id);
      // Only agents that still exist; a deleted agent must not count toward the bench.
      const live = new Set((ag || []).map(a => a.id));
      const kept = (setup?.agent_ids || []).filter(x => live.has(x));
      if (kept.length) setAgentIds(new Set(kept));
    }
    setLoading(false);
  };
  // Per-decision state must not leak when the route param changes in place.
  useEffect(() => {
    setupSeeded.current = false;
    defaultedFor.current = null;
    setScenarioId('');
    setAgentIds(new Set());
    setSetupOpen(false);
    setAssessmentRec(null);
    setRunError(null);
    setRationale('');
    setDecidedBy('');
    setLoading(true);
    load();
  }, [db, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────

  const agentById = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);
  const scenario = useMemo(() => scenarios.find(s => s.id === scenarioId) || null, [scenarios, scenarioId]);

  // Default bench once per scenario: the scenario's domain, falling back to
  // everyone. Runs only when the scenario changes, so clearing the bench by
  // hand is not undone by the next reload of agents.
  useEffect(() => {
    if (!scenario || !agents.length || defaultedFor.current === scenario.id) return;
    defaultedFor.current = scenario.id;
    if (agentIds.size > 0) return;   // seeded from a saved setup
    const inDomain = agents.filter(a => scenario.domain_id && a.domain_id === scenario.domain_id);
    setAgentIds(new Set((inDomain.length ? inDomain : agents).map(a => a.id)));
  }, [scenario, agents]); // eslint-disable-line react-hooks/exhaustive-deps

  // The bench is the saved/selected ids that still correspond to real agents.
  const bench = useMemo(() => agents.filter(a => agentIds.has(a.id)), [agents, agentIds]);

  // Latest complete session per option, with its agents and synthesis.
  const optionData = useMemo(() => {
    const map = {};
    for (const opt of options) {
      const optSessions = sessions.filter(s => s.decision_option_id === opt.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const complete = optSessions.find(s => s.status === 'complete') || null;
      const sas = complete ? sessionAgents.filter(sa => sa.session_id === complete.id).map(sa => ({ ...sa, agent: agentById[sa.agent_id] })) : [];
      map[opt.id] = {
        session: complete,
        anySession: optSessions[0] || null,
        sessionCount: optSessions.length,
        sessionAgents: sas,
        synthesis: complete ? (syntheses.find(sy => sy.session_id === complete.id)?.raw_text || '') : '',
        agg: sas.length ? aggregateSessionRisk(sas) : null,
      };
    }
    return map;
  }, [options, sessions, sessionAgents, syntheses, agentById]);

  const allAnalyzed = options.length >= 2 && options.every(o => optionData[o.id]?.session);
  const assessment = assessmentRec?.assessment || null;
  // Stale when the sessions it was built from are no longer the ones that
  // count: a newer session for an option, an option added or removed since,
  // or a recommendation pointing at an option that no longer exists.
  const assessmentStale = useMemo(() => {
    if (!assessment) return false;
    const ids = new Set(assessmentRec.session_ids || []);
    if (ids.size !== options.length) return true;
    if (!options.some(o => o.id === assessment.recommended_option_id)) return true;
    return options.some(o => !optionData[o.id]?.session || !ids.has(optionData[o.id].session.id));
  }, [assessment, assessmentRec, options, optionData]);

  const recommendedId = assessment?.recommended_option_id
    || (() => {
      const scored = options.map(o => ({ o, agg: optionData[o.id]?.agg })).filter(x => x.agg);
      if (!scored.length) return null;
      return scored.sort((a, b) => a.agg.peak - b.agg.peak || a.agg.avgExposure - b.agg.avgExposure)[0].o.id;
    })();

  const canRun = !!scenario && bench.length > 0 && options.length >= 2 && !running;

  // ── Run the panel ──────────────────────────────────────────────────────────

  const runPanel = async ({ rerunAll = false } = {}) => {
    if (!canRun) return;
    cancelRef.current = false;
    setRunError(null);
    try {
      await writeKV(db, setupKey(id), { scenario_id: scenario.id, agent_ids: bench.map(a => a.id) });
      if (decision.status === 'framing') await db.Decision.update(id, { status: 'analyzing', updated_at: new Date().toISOString() });
      const threats = await db.Threat.filter({ scenario_id: scenario.id }).catch(() => []);

      const perOption = [];
      for (let k = 0; k < options.length; k++) {
        const opt = options[k];
        const existing = optionData[opt.id];
        // Reuse only a session analysed against the scenario chosen now; mixing
        // scenarios across options would make the comparison meaningless.
        if (!rerunAll && existing?.session && existing.session.scenario_id === scenario.id) {
          setRunning({ optionIndex: k, optionName: opt.name, stage: 'reuse' });
          perOption.push({ option: opt, sessionAgents: existing.sessionAgents, synthesis: existing.synthesis, sessionId: existing.session.id });
          continue;
        }
        const r = await runOptionSession({
          db, decision, option: opt, assumptions, scenario, agents: bench, threats,
          onProgress: p => setRunning({ optionIndex: k, optionName: opt.name, ...p }),
          shouldCancel: () => cancelRef.current,
        });
        perOption.push({
          option: opt,
          sessionAgents: r.sessionAgents.map(sa => ({ ...sa, agent: agentById[sa.agent_id] })),
          synthesis: r.synthesis,
          sessionId: r.session.id,
        });
      }

      setRunning({ stage: 'assessment' });
      const result = await generateDecisionAssessment({ decision, options, assumptions, perOption });
      const rec = { generated_at: new Date().toISOString(), assessment: result, session_ids: perOption.map(p => p.sessionId) };
      await writeKV(db, assessmentKey(id), rec);
      setAssessmentRec(rec);
    } catch (e) {
      if (e.message === 'Cancelled') setRunError('Stopped. Finished options keep their sessions; the option that was in progress is re-run from scratch on the next run.');
      else setRunError(e.message || 'The panel run failed.');
    } finally {
      setRunning(null);
      load();
    }
  };

  // Re-write the assessment from the sessions that already exist.
  const regenerateAssessment = async () => {
    if (!allAnalyzed || running) return;
    setRunError(null);
    setRunning({ stage: 'assessment' });
    try {
      const perOption = options.map(o => ({
        option: o, sessionAgents: optionData[o.id].sessionAgents, synthesis: optionData[o.id].synthesis, sessionId: optionData[o.id].session.id,
      }));
      const result = await generateDecisionAssessment({ decision, options, assumptions, perOption });
      const rec = { generated_at: new Date().toISOString(), assessment: result, session_ids: perOption.map(p => p.sessionId) };
      await writeKV(db, assessmentKey(id), rec);
      setAssessmentRec(rec);
    } catch (e) {
      setRunError(e.message || 'Could not regenerate the assessment.');
    } finally {
      setRunning(null);
    }
  };

  // ── Assumptions + record ───────────────────────────────────────────────────

  const addAssumption = async () => {
    if (!newAssumption.trim()) return;
    await db.DecisionAssumption.create({ decision_id: id, text: newAssumption.trim(), criticality: 'MEDIUM', status: 'holds' });
    setNewAssumption('');
    load();
  };
  const cycleAssumption = async (a) => {
    const order = ['holds', 'monitoring', 'invalidated'];
    const next = order[(order.indexOf(a.status) + 1) % order.length];
    await db.DecisionAssumption.update(a.id, { status: next });
    setAssumptions(prev => prev.map(x => x.id === a.id ? { ...x, status: next } : x));
  };
  const cycleCriticality = async (a) => {
    const order = ['LOW', 'MEDIUM', 'HIGH'];
    const next = order[(order.indexOf(a.criticality) + 1) % order.length];
    await db.DecisionAssumption.update(a.id, { criticality: next });
    setAssumptions(prev => prev.map(x => x.id === a.id ? { ...x, criticality: next } : x));
  };
  const removeAssumption = async (aid) => { await db.DecisionAssumption.delete(aid); load(); };

  const openRecord = () => {
    if (!rationale && assessment) {
      const rec = assessment.options?.find(o => o.option_id === assessment.recommended_option_id);
      setRationale([
        assessment.headline,
        ...list(assessment.rationale).map(r => `- ${r}`),
        rec?.accepted_risk_if_chosen ? `Accepted risk: ${rec.accepted_risk_if_chosen}` : '',
      ].filter(Boolean).join('\n'));
    }
    setRecordOpen(true);
  };

  const recordDecision = async (chosenOptionId) => {
    await db.Decision.update(id, {
      status: 'decided', chosen_option_id: chosenOptionId,
      decision_rationale: rationale, decided_by: decidedBy,
      decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    setRecordOpen(false);
    load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-6"><div className="h-40 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} /></div>;
  if (!decision) return <div className="p-6 text-sm" style={{ color: 'var(--wr-text-muted)' }}>Decision not found.</div>;

  const chosen = options.find(o => o.id === decision.chosen_option_id);
  const recommendedOpt = options.find(o => o.id === recommendedId);
  const showSetup = !assessment && !running ? true : setupOpen;

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ backgroundColor: 'var(--wr-bg-primary)', borderColor: 'var(--wr-border)' }}>
        <Link to="/decisions" className="text-xs flex items-center gap-1 mb-2" style={{ color: 'var(--wr-text-muted)' }}><ArrowLeft className="w-3 h-3" /> Decisions</Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--wr-text-primary)' }}>{decision.title}</h1>
            {decision.description && <p className="text-sm mt-1" style={{ color: 'var(--wr-text-secondary)', maxWidth: 720 }}>{decision.description}</p>}
            {decision.acceptance_criteria && (
              <p className="text-xs mt-2" style={{ color: 'var(--wr-text-muted)' }}><span className="font-mono font-bold">ACCEPTANCE: </span>{decision.acceptance_criteria}</p>
            )}
          </div>
          {decision.status !== 'decided' && (
            <WrButton onClick={openRecord} disabled={!recommendedOpt || !!running}><Trophy className="w-4 h-4" /> Record Decision</WrButton>
          )}
        </div>
        {decision.status === 'decided' && (
          <div className="mt-3 rounded px-4 py-2 flex items-center gap-2" style={{ backgroundColor: 'rgba(39,174,96,0.1)', border: '1px solid rgba(39,174,96,0.3)' }}>
            <CheckCircle2 className="w-4 h-4" style={{ color: '#27AE60' }} />
            <span className="text-sm" style={{ color: '#27AE60' }}>
              Decided: <strong>{chosen?.name || '—'}</strong>{decision.decided_by && ` · by ${decision.decided_by}`}
            </span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">

        {/* ── Run / progress / error ────────────────────────────────────── */}
        {running && (
          <div className="rounded-lg p-5" style={{ ...card, border: '1px solid rgba(240,165,0,0.35)' }}>
            <ProcessingBar
              label={running.stage === 'assessment'
                ? 'Comparing the options and writing the reasoned assessment…'
                : running.stage === 'reuse'
                  ? `Option ${letter(running.optionIndex)} · ${running.optionName} — already analysed, reusing its session`
                  : `Option ${letter(running.optionIndex)} of ${options.length} · ${running.optionName} — ${STAGE_LABEL[running.stage] || running.stage}${running.agentTotal ? ` · agent ${running.agentIndex}/${running.agentTotal}${running.agentName ? `: ${running.agentName}` : ''}` : ''}`}
              elapsedMs={elapsed}
              color="var(--wr-amber)"
              sublabel={running.stage === 'assessment'
                ? 'Weighing peak risk, SME confidence, acceptance criteria and assumptions across every option.'
                : `Each option runs Round 1 → Round 2 → Synthesis with the same ${bench.length}-agent bench. Usually a few minutes per option.`}
            />
            {running.stage !== 'assessment' && (
              <div className="mt-3 flex justify-end">
                <WrButton size="sm" variant="secondary" onClick={() => { cancelRef.current = true; }} style={{ color: '#C0392B' }}>
                  <StopCircle className="w-3.5 h-3.5" /> Stop after this agent
                </WrButton>
              </div>
            )}
          </div>
        )}

        {runError && !running && (
          <div className="rounded p-3 flex items-start gap-2" style={{ backgroundColor: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C0392B' }} />
            <p className="text-sm flex-1" style={{ color: '#C0392B' }}>{runError}</p>
            <button onClick={() => setRunError(null)}><X className="w-3.5 h-3.5" style={{ color: 'var(--wr-text-muted)' }} /></button>
          </div>
        )}

        {/* ── Panel setup ─────────────────────────────────────────────── */}
        {showSetup && !running && (
          <div className="rounded-lg p-5" style={card}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>DECISION PANEL</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)', maxWidth: 640 }}>
                  One click runs the same expert bench against every option — Round 1, Round 2 and Synthesis each — then compares them and recommends one with reasons.
                  {options.length < 2 && <span style={{ color: '#D68910' }}> Add at least two options first.</span>}
                </p>
              </div>
              {assessment && <button onClick={() => setSetupOpen(false)} className="text-xs underline" style={{ color: 'var(--wr-text-muted)' }}>close</button>}
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <WrSelect label="SCENARIO" value={scenarioId} onChange={v => { setScenarioId(v); setAgentIds(new Set()); }}>
                  <option value="">Select the scenario to stress-test against…</option>
                  {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </WrSelect>
                {scenarios.length === 0 && <p className="text-xs mt-1" style={{ color: '#D68910' }}>No scenarios yet — create one on the Scenarios page.</p>}
                <p className="text-xs mt-3" style={{ color: 'var(--wr-text-muted)' }}>
                  Each option gets its own session named “{decision.title} — <em>option</em>”, linked back here. Options that already have a complete session are reused unless you choose to re-run everything.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>EXPERT BENCH · {bench.length}</label>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setAgentIds(new Set(agents.map(a => a.id)))} className="underline" style={{ color: 'var(--wr-text-muted)' }}>all</button>
                    <button onClick={() => setAgentIds(new Set())} className="underline" style={{ color: 'var(--wr-text-muted)' }}>none</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                  {agents.length === 0 && <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No agents in this workspace yet.</span>}
                  {agents.map(a => {
                    const on = agentIds.has(a.id);
                    return (
                      <button key={a.id} onClick={() => setAgentIds(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                        className="text-xs px-2 py-1 rounded transition-colors" title={a.discipline}
                        style={{
                          backgroundColor: on ? 'rgba(240,165,0,0.15)' : 'transparent',
                          color: on ? 'var(--wr-amber)' : 'var(--wr-text-muted)',
                          border: `1px solid ${on ? 'rgba(240,165,0,0.4)' : 'var(--wr-border)'}`,
                        }}>
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                {options.length} option{options.length !== 1 ? 's' : ''} × {bench.length} agent{bench.length !== 1 ? 's' : ''} × 2 rounds, plus a synthesis per option and one assessment.
              </p>
              <div className="flex items-center gap-2">
                {allAnalyzed && (
                  <WrButton variant="secondary" onClick={() => { if (window.confirm('Run fresh sessions for every option? Existing sessions are kept but the assessment will use the new ones.')) runPanel({ rerunAll: true }); }} disabled={!canRun}>
                    <RefreshCw className="w-3.5 h-3.5" /> Re-run everything
                  </WrButton>
                )}
                <WrButton onClick={() => runPanel()} disabled={!canRun}>
                  <Play className="w-4 h-4" /> {allAnalyzed ? 'Regenerate assessment' : 'Run decision panel'}
                </WrButton>
              </div>
            </div>
          </div>
        )}

        {/* ── Reasoned assessment ─────────────────────────────────────── */}
        {assessment && !running && (
          <div className="rounded-lg overflow-hidden" style={{ ...card, border: '1px solid rgba(39,174,96,0.35)' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--wr-border)', backgroundColor: 'rgba(39,174,96,0.06)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Scale className="w-4 h-4" style={{ color: '#27AE60' }} />
                    <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: '#27AE60' }}>PANEL RECOMMENDATION</h2>
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${CONF_COLOR[assessment.confidence] || '#546E7A'}1f`, color: CONF_COLOR[assessment.confidence] || '#546E7A' }}>
                      {assessment.confidence || '—'} CONFIDENCE
                    </span>
                    {assessmentStale && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(214,137,16,0.15)', color: '#D68910' }}>options or sessions changed since — run again</span>
                    )}
                  </div>
                  <p className="text-base font-semibold" style={{ color: 'var(--wr-text-primary)' }}>
                    {recommendedOpt ? <span style={{ color: '#27AE60' }}>Option {letter(options.indexOf(recommendedOpt))} · {recommendedOpt.name}</span> : null}
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--wr-text-secondary)' }}>{assessment.headline}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={regenerateAssessment} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded" style={{ color: 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }} title="Re-write the assessment from the existing sessions">
                    <Sparkles className="w-3 h-3" /> Regenerate
                  </button>
                  <button onClick={() => setSetupOpen(o => !o)} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded" style={{ color: 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }}>
                    <RefreshCw className="w-3 h-3" /> Panel setup
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 grid grid-cols-3 gap-6">
              <div className="col-span-2">
                <p className="text-xs font-bold tracking-widest font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>WHY</p>
                <ul className="space-y-1.5">
                  {list(assessment.rationale).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--wr-text-secondary)' }}>
                      <span className="text-xs font-mono font-bold mt-0.5 flex-shrink-0" style={{ color: '#27AE60' }}>{i + 1}.</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                {list(assessment.tradeoffs).length > 0 && (
                  <div>
                    <p className="text-xs font-bold tracking-widest font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>TRADE-OFFS</p>
                    <ul className="space-y-1">
                      {list(assessment.tradeoffs).map((t, i) => <li key={i} className="text-xs leading-snug" style={{ color: 'var(--wr-text-secondary)' }}>· {t}</li>)}
                    </ul>
                  </div>
                )}
                {list(assessment.conditions_to_revisit).length > 0 && (
                  <div>
                    <p className="text-xs font-bold tracking-widest font-mono mb-2 flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}><Eye className="w-3 h-3" /> REVISIT IF</p>
                    <ul className="space-y-1">
                      {list(assessment.conditions_to_revisit).map((t, i) => <li key={i} className="text-xs leading-snug" style={{ color: 'var(--wr-text-secondary)' }}>· {t}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <p className="px-5 pb-3 text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              Generated {new Date(assessmentRec.generated_at).toLocaleString()} from {assessmentRec.session_ids?.length || 0} option sessions.
            </p>
          </div>
        )}

        {/* ── Options ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-bold tracking-widest font-mono mb-3" style={{ color: 'var(--wr-text-muted)' }}>OPTIONS</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(options.length, 1), 4)}, 1fr)` }}>
            {options.map((opt, i) => {
              const { agg, session, anySession, sessionCount } = optionData[opt.id] || {};
              const a = assessment?.options?.find(o => o.option_id === opt.id);
              const verdict = a ? (VERDICT[a.verdict] || VERDICT.VIABLE) : null;
              const isRec = recommendedId === opt.id;
              const isChosen = decision.chosen_option_id === opt.id;
              const band = agg ? riskBandFromScore(agg.peak) : null;
              const borderColor = isChosen ? '#27AE60' : verdict ? `${verdict.color}66` : isRec ? 'rgba(240,165,0,0.5)' : 'var(--wr-border)';
              return (
                <div key={opt.id} className="rounded-lg p-4 flex flex-col" style={{ backgroundColor: 'var(--wr-bg-card)', border: `1px solid ${borderColor}` }}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono font-bold w-5 h-5 flex items-center justify-center rounded" style={{ backgroundColor: 'rgba(240,165,0,0.15)', color: 'var(--wr-amber)' }}>{letter(i)}</span>
                    {isChosen && <span className="text-xs font-mono font-bold px-1.5 rounded flex items-center gap-1" style={{ backgroundColor: 'rgba(39,174,96,0.15)', color: '#27AE60' }}><CheckCircle2 className="w-3 h-3" /> CHOSEN</span>}
                    {verdict && <span className="text-xs font-mono font-bold px-1.5 rounded" style={{ backgroundColor: `${verdict.color}1f`, color: verdict.color }}>{verdict.label}</span>}
                    {!verdict && isRec && !isChosen && agg && <span className="text-xs font-mono font-bold px-1.5 rounded" style={{ backgroundColor: 'rgba(240,165,0,0.15)', color: 'var(--wr-amber)' }}>LOWEST RISK</span>}
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--wr-text-primary)' }}>{opt.name}</p>
                  {opt.description && <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>{opt.description}</p>}

                  {agg ? (
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono" style={{ color: band.color }}>{agg.peak}</span>
                        <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>peak /25</span>
                      </div>
                      <div className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>exposure {agg.avgExposure}</div>
                      <div className="flex gap-1 ml-auto">
                        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => agg.severityCounts[s] > 0 && (
                          <span key={s} className="text-xs font-mono px-1 rounded" style={{ backgroundColor: `${SEV_COLORS[s]}1f`, color: SEV_COLORS[s] }}>{agg.severityCounts[s]}{s[0]}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs mb-3 italic" style={{ color: 'var(--wr-text-muted)' }}>
                      {anySession ? `Session in progress (${anySession.status}).` : 'Not analysed yet.'}
                    </p>
                  )}

                  {a && (
                    <div className="space-y-2.5 mb-3 text-xs">
                      <p style={{ color: 'var(--wr-text-secondary)' }}>{a.risk_summary}</p>
                      {list(a.key_risks).length > 0 && (
                        <div>
                          <p className="font-mono font-bold mb-1 flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}><ShieldAlert className="w-3 h-3" /> KEY RISKS</p>
                          <ul className="space-y-0.5">{list(a.key_risks).map((k, j) => <li key={j} style={{ color: 'var(--wr-text-secondary)' }}>· {k}</li>)}</ul>
                        </div>
                      )}
                      <p>
                        <span className="font-mono font-bold px-1.5 py-0.5 rounded mr-1.5" style={{ backgroundColor: `${ACCEPT[a.meets_acceptance_criteria] || ACCEPT.UNKNOWN}1f`, color: ACCEPT[a.meets_acceptance_criteria] || ACCEPT.UNKNOWN }}>
                          ACCEPTANCE {a.meets_acceptance_criteria || 'UNKNOWN'}
                        </span>
                        <span style={{ color: 'var(--wr-text-muted)' }}>{a.acceptance_note}</span>
                      </p>
                      {list(a.assumptions_at_risk).length > 0 && (
                        <p style={{ color: '#D68910' }}><span className="font-mono font-bold">ASSUMPTIONS AT RISK: </span>{list(a.assumptions_at_risk).join(' · ')}</p>
                      )}
                      {a.accepted_risk_if_chosen && (
                        <p style={{ color: 'var(--wr-text-muted)' }}><span className="font-mono font-bold">IF CHOSEN, YOU ACCEPT: </span>{a.accepted_risk_if_chosen}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-2 flex items-center justify-between text-xs font-mono" style={{ color: 'var(--wr-text-muted)', borderTop: '1px solid var(--wr-border)' }}>
                    <span>{sessionCount ? `${sessionCount} session${sessionCount !== 1 ? 's' : ''}` : 'no sessions'}</span>
                    {(session || anySession) && (
                      <Link to={`/sessions/${(session || anySession).id}`} className="inline-flex items-center gap-1" style={{ color: 'var(--wr-amber)', textDecoration: 'none' }}>
                        Open session <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Assumptions ─────────────────────────────────────────────── */}
        <div className="rounded-lg p-5" style={card}>
          <h2 className="text-xs font-bold tracking-widest font-mono mb-1" style={{ color: 'var(--wr-text-muted)' }}>KEY ASSUMPTIONS</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>The load-bearing assumptions this decision rests on. They are injected into every option's prompts; the assessment flags which ones each option would strain. Click a status to cycle it.</p>
          <div className="space-y-2 mb-3">
            {assumptions.length === 0 && <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>No assumptions tracked yet.</p>}
            {assumptions.map(a => (
              <div key={a.id} className="flex items-center gap-2">
                <button onClick={() => cycleCriticality(a)} className="text-xs font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0" title="Criticality — click to cycle"
                  style={{ backgroundColor: `${CRIT_COLOR[a.criticality]}1f`, color: CRIT_COLOR[a.criticality], border: `1px solid ${CRIT_COLOR[a.criticality]}55`, width: 62 }}>
                  {a.criticality}
                </button>
                <button onClick={() => cycleAssumption(a)} className="text-xs font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 flex items-center gap-1" title="Status — click to cycle"
                  style={{ backgroundColor: `${ASSUMPTION_STATUS[a.status]}1f`, color: ASSUMPTION_STATUS[a.status], border: `1px solid ${ASSUMPTION_STATUS[a.status]}55`, width: 104 }}>
                  {a.status === 'invalidated' && <AlertTriangle className="w-3 h-3" />}{a.status}
                </button>
                <span className="text-sm flex-1" style={{ color: 'var(--wr-text-secondary)', textDecoration: a.status === 'invalidated' ? 'line-through' : 'none' }}>{a.text}</span>
                <button onClick={() => removeAssumption(a.id)}><X className="w-3.5 h-3.5" style={{ color: 'var(--wr-text-muted)' }} /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input value={newAssumption} onChange={e => setNewAssumption(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAssumption()}
              placeholder="Add an assumption this decision depends on…" className="flex-1 text-sm px-3 py-2 rounded outline-none" style={field} />
            <WrButton variant="outline" onClick={addAssumption}><Plus className="w-3.5 h-3.5" /> Add</WrButton>
          </div>
        </div>
      </div>

      {/* ── Record decision modal ───────────────────────────────────── */}
      {recordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-[560px] rounded-lg p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>RECORD DECISION</h2>
              <button onClick={() => setRecordOpen(false)}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>Which option are you choosing? This creates the durable decision record, including any risk you're knowingly accepting.{assessment ? ' The rationale is pre-filled from the panel’s assessment; edit it freely.' : ''}</p>
            <div className="space-y-2 mb-4">
              {options.map((o, i) => {
                const agg = optionData[o.id]?.agg;
                const a = assessment?.options?.find(x => x.option_id === o.id);
                const v = a ? VERDICT[a.verdict] : null;
                return (
                  <button key={o.id} onClick={() => recordDecision(o.id)} className="w-full flex items-center gap-3 p-3 rounded text-left hover:bg-white/5"
                    style={{ backgroundColor: 'var(--wr-bg-secondary)', border: `1px solid ${recommendedId === o.id ? 'rgba(39,174,96,0.5)' : 'var(--wr-border)'}` }}>
                    <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-amber)' }}>{letter(i)}</span>
                    <span className="text-sm flex-1" style={{ color: 'var(--wr-text-primary)' }}>{o.name}</span>
                    {agg && <span className="text-xs font-mono" style={{ color: riskBandFromScore(agg.peak).color }}>peak {agg.peak}</span>}
                    {v && <span className="text-xs font-mono font-bold" style={{ color: v.color }}>{v.label}</span>}
                    {!v && recommendedId === o.id && <span className="text-xs font-mono" style={{ color: 'var(--wr-amber)' }}>lowest risk</span>}
                  </button>
                );
              })}
            </div>
            <input value={decidedBy} onChange={e => setDecidedBy(e.target.value)} placeholder="Decided by (name / role)" className="w-full text-sm px-3 py-2 rounded outline-none mb-2" style={field} />
            <textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={6} placeholder="Rationale — why this option, and what risk is being knowingly accepted…" className="w-full text-sm px-3 py-2 rounded outline-none resize-none" style={field} />
            <p className="text-xs mt-3" style={{ color: 'var(--wr-text-muted)' }}>Click an option above to record it as the decision.</p>
          </div>
        </div>
      )}
    </div>
  );
}
