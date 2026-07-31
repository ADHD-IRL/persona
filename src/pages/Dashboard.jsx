import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, LogOut, LayoutDashboard, Globe, Bot, Target, AlertTriangle, Swords, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { useAuth } from '@/lib/AuthContext';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

import RiskRail    from '@/components/dashboard/RiskRail';
import EventsList  from '@/components/dashboard/EventsList';
import { aggregateSessionRisk, riskScore } from '@/lib/risk';
import { buildGroups } from '@/components/threatmap/mapUtils';
import ConvenePanelButton from '@/components/session/ConvenePanelButton';

// ── Helpers ────────────────────────────────────────────────────────────────

const SEV_KEYS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// ── Main export ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { db, workspace } = useWorkspace();
  const { signOut }        = useAuth();
  const navigate           = useNavigate();
  const [params, setParams] = useSearchParams();

  const filter    = params.get('filter') || 'ALL';
  const [search, setSearch] = useState('');

  const setFilter = useCallback((v) => {
    const p = new URLSearchParams(params);
    if (v === 'ALL') p.delete('filter');
    else p.set('filter', v.toLowerCase().replace(' ', '-'));
    setParams(p);
  }, [params, setParams]);

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  // ── Data loading ───────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState({
    sessions: [], sessionAgents: [], syntheses: [], scenarios: [], agents: [], domains: [], threats: [],
    decisions: [], mitigations: [], assumptions: [],
  });

  const loadData = useCallback(() => {
    if (!db) return;
    Promise.all([
      db.Session.list(),
      db.SessionAgent.list(),
      db.SessionSynthesis.list(),
      db.Scenario.list(),
      db.Agent.list(),
      db.Domain.list(),
      db.Threat.list(),
      db.Decision ? db.Decision.list().catch(() => []) : [],
      db.Mitigation ? db.Mitigation.list().catch(() => []) : [],
      db.DecisionAssumption ? db.DecisionAssumption.list().catch(() => []) : [],
    ]).then(([sessions, sessionAgents, syntheses, scenarios, agents, domains, threats, decisions, mitigations, assumptions]) => {
      setData({ sessions, sessionAgents, syntheses, scenarios, agents, domains, threats, decisions, mitigations, assumptions });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [db]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadData]);

  // ── Derived maps ───────────────────────────────────────────────────────────

  const scenarioMap = useMemo(() =>
    Object.fromEntries(data.scenarios.map(s => [s.id, s])),
  [data.scenarios]);

  const agentMap = useMemo(() =>
    Object.fromEntries(data.agents.map(a => [a.id, a])),
  [data.agents]);

  // ── Session enrichment → event shape ─────────────────────────────────────

  const events = useMemo(() => {
    const saBySession = {};
    for (const sa of data.sessionAgents) {
      if (!saBySession[sa.session_id]) saBySession[sa.session_id] = [];
      saBySession[sa.session_id].push(sa);
    }

    return data.sessions.map(s => {
      const sas       = saBySession[s.id] || [];
      const ranSAs    = sas.filter(sa => sa.round1_assessment);
      const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      for (const sa of ranSAs) {
        const sev = sa.round2_revised_severity || sa.round1_severity;
        if (sev && sevCounts[sev] !== undefined) sevCounts[sev]++;
      }
      const topSeverity = SEV_KEYS.find(k => sevCounts[k] > 0) || 'LOW';
      const findingCount = ranSAs.length;
      const criticalCount = sevCounts.CRITICAL;

      const leadSA    = sas[0];
      const leadAgent = leadSA ? agentMap[leadSA.agent_id] : null;

      const isLive = (s.status === 'round1' || s.status === 'round2');

      return {
        id:       s.id,
        date:     s.created_at,
        title:    s.name || `Session ${s.id?.slice(0, 6)}`,
        scenario: scenarioMap[s.scenario_id]?.name || null,
        status:   s.status || 'pending',
        severity: topSeverity,
        findings: findingCount,
        critical: criticalCount,
        owner:    leadAgent?.name || null,
        live:     isLive,
      };
    });
  }, [data.sessions, data.sessionAgents, scenarioMap, agentMap]);

  // ── Risk posture metrics (the useful cards) ──────────────────────────────────

  const riskMetrics = useMemo(() => {
    const saBySession = {};
    for (const sa of data.sessionAgents) {
      (saBySession[sa.session_id] = saBySession[sa.session_id] || []).push(sa);
    }

    // Per-session quantified risk; find the worst
    let peak = { score: 0, session: null };
    let openCriticals = 0;
    let analyzedSessions = 0;
    for (const s of data.sessions) {
      const agg = aggregateSessionRisk(saBySession[s.id] || []);
      if (!agg) continue;
      analyzedSessions++;
      openCriticals += agg.severityCounts.CRITICAL;
      if (agg.peak > peak.score) peak = { score: agg.peak, session: s };
    }

    // Coverage gaps: domains with threat load but no/thin agent bench
    let gaps = [];
    try {
      const { groups } = buildGroups({ axis: 'domain', agents: data.agents, domains: data.domains, threats: data.threats });
      gaps = groups.filter(g => !g.isUnassigned && g.score > 0 && g.agents.length <= 1);
    } catch { gaps = []; }

    // Mitigation program: net risk reduction + open items
    const scored = data.mitigations.filter(m =>
      m.status !== 'rejected' &&
      riskScore(m.inherent_likelihood, m.inherent_impact) != null &&
      riskScore(m.residual_likelihood, m.residual_impact) != null
    );
    const inherentSum = scored.reduce((a, m) => a + riskScore(m.inherent_likelihood, m.inherent_impact), 0);
    const residualSum = scored.reduce((a, m) => a + riskScore(m.residual_likelihood, m.residual_impact), 0);
    const openMitigations = data.mitigations.filter(m => ['proposed', 'accepted', 'in_progress'].includes(m.status)).length;

    // Decisions awaiting a call
    const pendingDecisions = data.decisions.filter(d => d.status !== 'decided' && d.status !== 'archived');

    // Assumptions flagged for re-assessment
    const invalidatedAssumptions = data.assumptions.filter(a => a.status === 'invalidated');

    return {
      peak, openCriticals, analyzedSessions, gaps,
      netReduction: { inherent: inherentSum, residual: residualSum, delta: inherentSum - residualSum, count: scored.length },
      openMitigations,
      pendingDecisions,
      invalidatedAssumptions,
    };
  }, [data.sessions, data.sessionAgents, data.agents, data.domains, data.threats, data.mitigations, data.decisions, data.assumptions]);

  // Prioritized "needs attention" queue — the actionable exceptions
  const attention = useMemo(() => {
    const items = [];
    for (const a of riskMetrics.invalidatedAssumptions.slice(0, 3)) {
      items.push({ kind: 'assumption', color: '#C0392B', label: 'Assumption invalidated — re-assess', detail: a.text, to: `/decisions/${a.decision_id}` });
    }
    for (const g of riskMetrics.gaps.slice(0, 3)) {
      items.push({ kind: 'gap', color: '#D68910', label: `Coverage gap: ${g.name}`, detail: `${g.total} threat${g.total !== 1 ? 's' : ''}, ${g.agents.length} agent${g.agents.length !== 1 ? 's' : ''} — no bench to analyze it`, to: '/threatmap' });
    }
    for (const d of riskMetrics.pendingDecisions.slice(0, 2)) {
      items.push({ kind: 'decision', color: '#2E86AB', label: `Decision open: ${d.title}`, detail: 'Compare options and record the call', to: `/decisions/${d.id}` });
    }
    return items.slice(0, 6);
  }, [riskMetrics]);

  // ── Filter & search ────────────────────────────────────────────────────────

  const activeFilterKey = filter === 'in-progress' ? 'IN PROGRESS'
    : filter === 'complete' ? 'COMPLETE'
    : 'ALL';

  const filteredEvents = useMemo(() => {
    let list = events;
    if (activeFilterKey === 'IN PROGRESS') {
      list = list.filter(e => e.status !== 'complete');
    } else if (activeFilterKey === 'COMPLETE') {
      list = list.filter(e => e.status === 'complete');
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.scenario || '').toLowerCase().includes(q) ||
        (e.owner || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, activeFilterKey, search]);

  const filterLabel =
    activeFilterKey === 'COMPLETE'    ? 'completed'  :
    activeFilterKey === 'IN PROGRESS' ? 'in progress' : 'total';

  // ── Workflow setup checklist ───────────────────────────────────────────────
  // Ordered to mirror the sidebar workflow. Shown until every step is done.

  const workflowSteps = useMemo(() => [
    { key: 'domains',   label: 'Add domains',      icon: Globe,         to: '/domains',      done: data.domains.length   > 0, hint: 'Broad categories that link threats to agents' },
    { key: 'agents',    label: 'Build agents',     icon: Bot,           to: '/agents',       done: data.agents.length    > 0, hint: 'Your panel of expert thinking styles' },
    { key: 'scenarios', label: 'Define a scenario', icon: Target,       to: '/scenarios',    done: data.scenarios.length > 0, hint: 'The situation you want to stress-test' },
    { key: 'threats',   label: 'Catalog threats',  icon: AlertTriangle, to: '/threats',      done: data.threats.length   > 0, hint: 'Known risks — optional but sharpens analysis' },
    { key: 'session',   label: 'Run a session',    icon: Swords,        to: '/sessions/new', done: data.sessions.length  > 0, hint: 'The red-team debate itself' },
  ], [data.domains.length, data.agents.length, data.scenarios.length, data.threats.length, data.sessions.length]);

  const setupComplete = workflowSteps.every(s => s.done);
  const nextStep = workflowSteps.find(s => !s.done);
  const showChecklist = !loading && !setupComplete;

  // ── Skeleton ───────────────────────────────────────────────────────────────

  const Skeleton = ({ h = 120 }) => (
    <div style={{ height: h, borderRadius: 6, backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', animation: 'pulse 1.5s ease-in-out infinite' }} />
  );

  // ── Current date display ───────────────────────────────────────────────────

  const dateStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }, []);

  const timeStr = useMemo(() => {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm} UTC`;
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const FILTERS = ['ALL', 'IN PROGRESS', 'COMPLETE'];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>

      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid var(--wr-border)',
        backgroundColor: 'var(--wr-bg-primary)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        {/* Left: icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)',
          }}>
            <LayoutDashboard style={{ width: 16, height: 16, color: 'var(--wr-amber)' }} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.04em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--wr-text-primary)' }}>
              Dashboard
            </div>
            <div style={{ fontSize: 11, marginTop: 2, color: 'var(--wr-text-muted)' }}>
              {dateStr} · {timeStr}
              {workspace?.name && (
                <> · workspace <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--wr-text-secondary)' }}>{workspace.name}</span></>
              )}
            </div>
          </div>
        </div>

        {/* Right: filter + search + CTA + sign out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Filter pills */}
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--wr-border)', borderRadius: 6, overflow: 'hidden' }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '6px 10px', border: 'none', cursor: 'pointer',
                  color: activeFilterKey === f ? 'var(--wr-amber)' : 'var(--wr-text-muted)',
                  backgroundColor: activeFilterKey === f ? 'rgba(240,165,0,0.1)' : 'transparent',
                  transition: 'all 0.12s',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--wr-border)', color: 'var(--wr-text-secondary)' }}>
            <Search style={{ width: 11, height: 11, flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search events, scenarios, owners…"
              style={{
                width: 220, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 12, color: 'var(--wr-text-primary)', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Convene a live panel — zero-ceremony entry for a real-world event */}
          <ConvenePanelButton size="md" />

          {/* New event CTA */}
          <Link to="/sessions/new" style={{ textDecoration: 'none' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              backgroundColor: 'var(--wr-amber)', color: '#0D1B2A',
              fontSize: 14, fontWeight: 600,
            }}>
              <Plus style={{ width: 14, height: 14 }} />
              New event
            </button>
          </Link>

          {/* Sign out */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', borderRadius: 6,
                  backgroundColor: 'transparent', border: '1px solid var(--wr-border)',
                  color: 'var(--wr-text-muted)', fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#C0392B'; e.currentTarget.style.borderColor = 'rgba(192,57,43,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--wr-text-muted)'; e.currentTarget.style.borderColor = 'var(--wr-border)'; }}
              >
                <LogOut style={{ width: 12, height: 12 }} />
                Sign out
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Sign out of your workspace</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Page body */}
      <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Workflow setup checklist */}
        {showChecklist && (
          <div style={{
            borderRadius: 8, overflow: 'hidden',
            backgroundColor: 'var(--wr-bg-card)', border: '1px solid rgba(240,165,0,0.25)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '12px 16px', borderBottom: '1px solid var(--wr-border)',
              backgroundColor: 'rgba(240,165,0,0.06)',
            }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wr-text-primary)' }}>Get set up</p>
                <p style={{ fontSize: 11.5, color: 'var(--wr-text-muted)', marginTop: 1 }}>
                  {workflowSteps.filter(s => s.done).length} of {workflowSteps.length} steps done · follow the workflow left to right
                </p>
              </div>
              {nextStep && (
                <Link to={nextStep.to} style={{ textDecoration: 'none' }}>
                  <button style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    backgroundColor: 'var(--wr-amber)', color: '#0D1B2A', fontSize: 13, fontWeight: 600,
                  }}>
                    Next: {nextStep.label} <ArrowRight style={{ width: 13, height: 13 }} />
                  </button>
                </Link>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${workflowSteps.length}, 1fr)` }}>
              {workflowSteps.map((step, i) => {
                const StepIcon = step.icon;
                const isNext = nextStep?.key === step.key;
                return (
                  <Link key={step.key} to={step.to} style={{
                    textDecoration: 'none',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    padding: '14px 16px',
                    borderLeft: i ? '1px solid var(--wr-border)' : 'none',
                    backgroundColor: isNext ? 'rgba(240,165,0,0.05)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {step.done
                        ? <CheckCircle2 style={{ width: 15, height: 15, color: '#27AE60', flexShrink: 0 }} />
                        : <Circle style={{ width: 15, height: 15, color: isNext ? 'var(--wr-amber)' : 'var(--wr-text-muted)', flexShrink: 0 }} />}
                      <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--wr-text-muted)' }}>
                        STEP {i + 1}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <StepIcon style={{ width: 14, height: 14, flexShrink: 0, color: step.done ? '#27AE60' : isNext ? 'var(--wr-amber)' : 'var(--wr-text-secondary)' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: step.done ? 'var(--wr-text-secondary)' : 'var(--wr-text-primary)' }}>
                        {step.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--wr-text-muted)' }}>{step.hint}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Risk posture rail */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Skeleton h={128} /><Skeleton h={128} /><Skeleton h={128} /><Skeleton h={128} />
          </div>
        ) : (
          <RiskRail metrics={riskMetrics} attention={attention} />
        )}

        {/* Events list */}
        {loading ? <Skeleton h={400} /> : (
          <EventsList events={filteredEvents} filterLabel={filterLabel} />
        )}
      </div>
    </div>
  );
}
