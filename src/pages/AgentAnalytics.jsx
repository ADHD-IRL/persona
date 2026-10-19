import { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { TrendingUp, TrendingDown, Minus, Brain, Info, ChevronDown, ChevronUp } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import AgentPerformanceCard from '@/components/agents/AgentPerformanceCard';
import TeamPerformanceSummary from '@/components/agents/TeamPerformanceSummary';

const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const SEV_ORDER  = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

// ── Shared tooltip ────────────────────────────────────────────────────────────
function InfoTip({ children, align = 'right' }) {
  const [show, setShow] = useState(false);
  const pos = align === 'right' ? { left: 18, top: -4 } : { right: 18, top: -4 };
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <Info
        className="w-3 h-3 cursor-help flex-shrink-0"
        style={{ color: 'var(--wr-text-muted)', marginLeft: 3 }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div style={{
          position: 'absolute', zIndex: 60, width: 230, ...pos,
          padding: '8px 10px', borderRadius: 6,
          backgroundColor: '#0D1B2A', border: '1px solid var(--wr-border)',
          color: 'var(--wr-text-secondary)', fontSize: 11, lineHeight: 1.6,
          pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {children}
        </div>
      )}
    </span>
  );
}

// ── Bias helpers ──────────────────────────────────────────────────────────────
function getBias(counts) {
  const { CRITICAL = 0, HIGH = 0, MEDIUM = 0, LOW = 0 } = counts;
  const total = CRITICAL + HIGH + MEDIUM + LOW;
  if (total === 0) return null;
  const critPct    = (CRITICAL / total) * 100;
  const lowPct     = (LOW / total) * 100;
  const highEndPct = ((CRITICAL + HIGH) / total) * 100;
  const lowEndPct  = ((LOW + MEDIUM) / total) * 100;
  if (critPct >= 50)    return { label: 'Doom-Sayer',  color: '#C0392B', icon: TrendingDown, short: 'Flags CRITICAL in >50% of assessments' };
  if (lowPct >= 50)     return { label: 'Optimist',    color: '#27AE60', icon: TrendingUp,   short: 'Rates LOW in >50% of assessments' };
  if (highEndPct >= 70) return { label: 'Pessimist',   color: '#D68910', icon: TrendingDown, short: 'Skewed toward HIGH/CRITICAL' };
  if (lowEndPct >= 70)  return { label: 'Minimizer',   color: '#2E86AB', icon: TrendingUp,   short: 'Skewed toward LOW/MEDIUM' };
  return                       { label: 'Balanced',    color: '#8A9BB5', icon: Minus,         short: 'Distributes severity evenly' };
}

const BIAS_RISK_NOTES = {
  'Doom-Sayer':  'Risk model impact: This agent\'s critical findings should be cross-checked — over-flagging can desensitize the analyst to genuine emergencies.',
  'Optimist':    'Risk model impact: Threats rated LOW by this agent may deserve a second look — systematic under-rating can create false confidence.',
  'Pessimist':   'Risk model impact: HIGH/CRITICAL findings from this agent carry less discriminating power — use absolute counts alongside percentages.',
  'Minimizer':   'Risk model impact: LOW/MEDIUM findings dominate this agent\'s output. Verify that genuine high-risk threats aren\'t being downgraded.',
  'Balanced':    'Risk model impact: This agent\'s ratings are suitable as a reference baseline when comparing against more skewed assessors.',
};

// ── Bias card with expandable detail ─────────────────────────────────────────
function AgentBiasCard({ agentStats, rank }) {
  const [expanded, setExpanded] = useState(false);
  const { agent, counts, total, escalationRate, domain } = agentStats;
  const bias = getBias(counts);
  const BiasIcon = bias?.icon || Minus;

  const sevBarData = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => ({
    name: s, value: counts[s] || 0,
    pct: total > 0 ? Math.round(((counts[s] || 0) / total) * 100) : 0,
  }));

  return (
    <div data-ui="surface" className="rounded overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <div className="h-1.5" style={{ backgroundColor: domain?.color || '#F0A500' }} />
      <div className="p-4">

        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-start gap-2 mb-0.5">
              <span className="text-xs font-mono font-bold flex-shrink-0 mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>#{rank}</span>
              <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</h3>
            </div>
            {agent.discipline && (
              <p className="text-xs leading-snug mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</p>
            )}
            {domain && (
              <p className="text-xs font-mono font-semibold mt-0.5" style={{ color: domain.color }}>{domain.name}</p>
            )}
          </div>
          {total > 0 && bias && (
            <div data-ui="surface" className="flex items-center gap-1 px-2 py-1 rounded flex-shrink-0"
              style={{ backgroundColor: `${bias.color}18`, color: bias.color, border: `1px solid ${bias.color}40` }}>
              <BiasIcon className="w-3 h-3" />
              <span className="text-xs font-bold font-mono">{bias.label}</span>
            </div>
          )}
        </div>

        {total === 0 ? (
          <p className="text-xs py-3 text-center rounded" style={{
            color: 'var(--wr-text-muted)', backgroundColor: 'var(--wr-bg-secondary)',
            border: '1px dashed var(--wr-border)',
          }}>
            No assessment data
          </p>
        ) : (
          <>
            {/* Severity bar */}
            <div className="flex h-3 rounded overflow-hidden mb-2">
              {sevBarData.filter(d => d.value > 0).map(d => (
                <div key={d.name} style={{ width: `${d.pct}%`, backgroundColor: SEV_COLORS[d.name] }} />
              ))}
            </div>

            {/* Counts row */}
            <div className="grid grid-cols-4 gap-1 mb-3">
              {sevBarData.map(d => (
                <div key={d.name} className="text-center rounded p-1.5" style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
                  <div className="text-sm font-bold font-mono" style={{ color: SEV_COLORS[d.name] }}>{d.value}</div>
                  <div className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{d.name.slice(0, 3)}</div>
                  <div className="text-xs" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>{d.pct}%</div>
                </div>
              ))}
            </div>

            {/* Bottom row: assessments + escalation */}
            <div className="flex items-center justify-between text-xs pb-3 border-b" style={{ borderColor: 'var(--wr-border)' }}>
              <span style={{ color: 'var(--wr-text-muted)' }}>{total} assessments</span>
              <span style={{ color: 'var(--wr-text-muted)' }}>
                CRIT/HIGH:&nbsp;
                <span className="font-mono font-bold" style={{ color: escalationRate >= 60 ? '#C0392B' : escalationRate >= 35 ? '#D68910' : '#27AE60' }}>
                  {escalationRate}%
                </span>
              </span>
            </div>

            {/* Bias short description */}
            {bias && (
              <p className="text-xs mt-2.5 leading-snug" style={{ color: 'var(--wr-text-secondary)' }}>
                <span style={{ color: bias.color, fontWeight: 700 }}>{bias.label}:</span> {bias.short}
              </p>
            )}

            {/* Expand toggle */}
            <button data-ui="action"
              onClick={() => setExpanded(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 mt-3 py-1.5 rounded text-xs font-mono"
              style={{ border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)', backgroundColor: 'transparent' }}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'HIDE RISK IMPACT' : 'RISK MODEL IMPACT'}
            </button>

            {/* Expanded: risk notes */}
            {expanded && bias && (
              <div data-ui="surface" className="mt-3 p-2.5 rounded text-xs leading-snug" style={{ backgroundColor: `${bias.color}0d`, border: `1px solid ${bias.color}30` }}>
                <p style={{ color: 'var(--wr-text-secondary)' }}>{BIAS_RISK_NOTES[bias.label]}</p>
                <div className="mt-2 pt-2 border-t" style={{ borderColor: `${bias.color}25` }}>
                  <p className="font-bold font-mono mb-1" style={{ color: 'var(--wr-text-muted)' }}>CALIBRATION GUIDANCE</p>
                  {escalationRate >= 60 && (
                    <p style={{ color: 'var(--wr-text-muted)' }}>Consider applying a severity discount when this agent is the sole assessor for a threat. Corroborate CRITICAL findings with a second opinion.</p>
                  )}
                  {escalationRate <= 20 && total > 2 && (
                    <p style={{ color: 'var(--wr-text-muted)' }}>Consider requesting explicit justification when this agent rates threats LOW — systematic under-rating can mask emerging risks.</p>
                  )}
                  {escalationRate > 20 && escalationRate < 60 && (
                    <p style={{ color: 'var(--wr-text-muted)' }}>This agent's ratings can generally be used at face value without systematic adjustment.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Severity overview chart ───────────────────────────────────────────────────
function OverviewChart({ agentStats }) {
  const data = agentStats
    .filter(s => s.total > 0)
    .slice(0, 14)
    .map(s => ({
      name: s.agent.name.length > 16 ? s.agent.name.slice(0, 15) + '…' : s.agent.name,
      fullName: s.agent.name,
      CRITICAL: s.counts.CRITICAL || 0,
      HIGH: s.counts.HIGH || 0,
      MEDIUM: s.counts.MEDIUM || 0,
      LOW:  s.counts.LOW  || 0,
    }));

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No assessment data yet</p>
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 48, left: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: 'var(--wr-text-muted)', fontFamily: 'JetBrains Mono, monospace' }}
          angle={-35} textAnchor="end" interval={0}
        />
        <YAxis tick={{ fontSize: 9, fill: 'var(--wr-text-muted)' }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', borderRadius: 4, fontSize: 11, color: 'var(--wr-text-primary)' }}
          formatter={(v, name) => [v, name]}
          labelFormatter={(_l, p) => p?.[0]?.payload?.fullName || _l}
        />
        <Bar dataKey="CRITICAL" stackId="a" fill={SEV_COLORS.CRITICAL} />
        <Bar dataKey="HIGH"     stackId="a" fill={SEV_COLORS.HIGH} />
        <Bar dataKey="MEDIUM"   stackId="a" fill={SEV_COLORS.MEDIUM} />
        <Bar dataKey="LOW"      stackId="a" fill={SEV_COLORS.LOW} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Sort / filter options ─────────────────────────────────────────────────────
const PERF_SORTS = [
  { value: 'score',       label: 'Score',       col: 'SCORE'    },
  { value: 'completion',  label: 'Completion',  col: 'DONE'     },
  { value: 'crithigh',    label: 'CRIT/HIGH',   col: 'CRIT/H'   },
  { value: 'consistency', label: 'Stability',   col: 'STABLE'   },
  { value: 'total',       label: 'Sessions',    col: 'SESS'     },
  { value: 'name',        label: 'Name A–Z',    col: null       },
];
const BIAS_SORTS = [
  { value: 'pessimism', label: 'Most Pessimistic' },
  { value: 'optimism',  label: 'Most Optimistic' },
  { value: 'total',     label: 'Most Active' },
  { value: 'name',      label: 'Name A–Z' },
];
const TABS = ['PERFORMANCE', 'BIAS PATTERNS'];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AgentAnalytics() {
  const { db } = useWorkspace();
  const [agents, setAgents]               = useState([]);
  const [domains, setDomains]             = useState([]);
  const [sessionAgents, setSessionAgents] = useState([]);
  const [sessions, setSessions]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState('PERFORMANCE');
  const [sort, setSort]                   = useState('score');
  const [filterDomain, setFilterDomain]   = useState('');
  const [filterSession, setFilterSession] = useState('');

  useEffect(() => {
    if (!db) return;
    Promise.all([
      db.Agent.list(),
      db.Domain.list(),
      db.SessionAgent.list(),
      db.Session.list(),
    ]).then(([a, d, sa, s]) => {
      setAgents(a); setDomains(d); setSessionAgents(sa); setSessions(s);
      setLoading(false);
    });
  }, [db]);

  const domainMap = useMemo(() => Object.fromEntries(domains.map(d => [d.id, d])), [domains]);

  const sessionAgentsFiltered = useMemo(() => {
    return filterSession
      ? sessionAgents.filter(sa => sa.session_id === filterSession)
      : sessionAgents;
  }, [sessionAgents, filterSession]);

  // Per-agent stats
  const agentStats = useMemo(() => {
    return agents.map(agent => {
      const records   = sessionAgentsFiltered.filter(sa => sa.agent_id === agent.id);
      const completed = records.filter(sa => sa.status === 'complete');

      const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      records.forEach(sa => {
        const sev = sa.round2_revised_severity || sa.round1_severity;
        if (sev && counts[sev] !== undefined) counts[sev]++;
      });
      const total = counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.LOW;
      const escalationRate = total > 0 ? Math.round(((counts.CRITICAL + counts.HIGH) / total) * 100) : 0;

      const sessionIds         = new Set(records.map(r => r.session_id));
      const sessionsParticipated = sessionIds.size;
      const completionRate     = records.length > 0 ? Math.round((completed.length / records.length) * 100) : 0;

      const withBothRounds = records.filter(sa => sa.round1_severity && sa.round2_revised_severity);
      const revised        = withBothRounds.filter(sa => sa.round1_severity !== sa.round2_revised_severity);
      const revisionRate   = withBothRounds.length > 0 ? Math.round((revised.length / withBothRounds.length) * 100) : 0;

      let avgSevShift = null;
      if (withBothRounds.length > 0) {
        const totalShift = withBothRounds.reduce((sum, sa) =>
          sum + (SEV_ORDER[sa.round2_revised_severity] - SEV_ORDER[sa.round1_severity]), 0);
        avgSevShift = totalShift / withBothRounds.length;
      }

      const engagementScore = Math.min(100, Math.round((sessionsParticipated / Math.max(sessions.length, 1)) * 100));
      const score = total === 0 ? 0 : Math.round(
        completionRate * 0.4 + (100 - revisionRate) * 0.3 + engagementScore * 0.3
      );

      return {
        agent,
        domain: domainMap[agent.domain_id] || null,
        counts,
        total,
        escalationRate,
        perf: { total, sessionsParticipated, completionRate, revisionRate, avgSevShift, engagementScore, score },
      };
    });
  }, [agents, sessionAgentsFiltered, domainMap, sessions]);

  const applySort = (list, s) => {
    switch (s) {
      case 'score':       return [...list].sort((a, b) => b.perf.score - a.perf.score);
      case 'completion':  return [...list].sort((a, b) => b.perf.completionRate - a.perf.completionRate);
      case 'crithigh':    return [...list].sort((a, b) => b.escalationRate - a.escalationRate || b.total - a.total);
      case 'consistency': return [...list].sort((a, b) => (100 - b.perf.revisionRate) - (100 - a.perf.revisionRate));
      case 'pessimism':   return [...list].sort((a, b) => b.escalationRate - a.escalationRate || b.total - a.total);
      case 'optimism':    return [...list].sort((a, b) => a.escalationRate - b.escalationRate || b.total - a.total);
      case 'total':       return [...list].sort((a, b) => b.perf.total - a.perf.total);
      case 'name':        return [...list].sort((a, b) => a.agent.name.localeCompare(b.agent.name));
      default:           return list;
    }
  };

  const filtered = useMemo(() => {
    const base = filterDomain ? agentStats.filter(s => s.agent.domain_id === filterDomain) : agentStats;
    return applySort(base, sort);
  }, [agentStats, sort, filterDomain]);

  const withData   = agentStats.filter(s => s.total > 0);
  const totalAssessments = agentStats.reduce((sum, s) => sum + s.total, 0);
  const avgEscalation = withData.length
    ? Math.round(withData.reduce((s, a) => s + a.escalationRate, 0) / withData.length) : 0;
  const mostPessimistic = withData.length ? [...withData].sort((a, b) => b.escalationRate - a.escalationRate)[0] : null;
  const mostOptimistic  = withData.length ? [...withData].sort((a, b) => a.escalationRate - b.escalationRate)[0] : null;

  const currentSortOptions = tab === 'PERFORMANCE' ? PERF_SORTS : BIAS_SORTS;
  const defaultSort = tab === 'PERFORMANCE' ? 'score' : 'pessimism';
  const handleTabChange = (t) => { setTab(t); setSort(t === 'PERFORMANCE' ? 'score' : 'pessimism'); };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <PageHeader
        icon={Brain}
        title="AGENT ANALYTICS"
        subtitle="Performance reliability · Severity bias · Risk calibration guidance"
      />

      {/* Tab bar + session filter */}
      <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--wr-border)', backgroundColor: 'var(--wr-bg-secondary)' }}>
        <div className="flex">
          {TABS.map(t => (
            <button data-ui="action" key={t} onClick={() => handleTabChange(t)}
              className="px-6 py-3 text-xs font-bold tracking-widest font-mono transition-colors"
              style={{
                color: tab === t ? 'var(--wr-amber)' : 'var(--wr-text-muted)',
                borderBottom: tab === t ? '2px solid var(--wr-amber)' : '2px solid transparent',
              }}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4">
          <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>SESSION</span>
          <select value={filterSession} onChange={e => setFilterSession(e.target.value)}
            className="px-3 py-1.5 text-xs rounded outline-none"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}>
            <option value="">All Sessions</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.status?.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── PERFORMANCE TAB ─────────────────────────────────────────────── */}
        {tab === 'PERFORMANCE' && (
          <>
            {loading ? (
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} />)}
              </div>
            ) : (
              <TeamPerformanceSummary agentStats={agentStats} domains={domains} />
            )}

            {/* Roster header: domain filter + sort columns */}
            <div data-ui="surface" className="rounded-t overflow-hidden" style={{ border: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-secondary)' }}>
              {/* Filter bar */}
              <div className="flex items-center gap-3 px-3 py-2 border-b" style={{ borderColor: 'var(--wr-border)' }}>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>
                  AGENT ROSTER
                </span>
                <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                  {filtered.filter(s => s.total > 0).length} active · {filtered.filter(s => s.total === 0).length} unassessed
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>DOMAIN</span>
                  <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
                    className="px-2 py-1 text-xs rounded outline-none"
                    style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}>
                    <option value="">All Domains</option>
                    {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Column headers with sort */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px 6px 16px' }}>
                {/* domain bar offset */}
                <div style={{ width: 4, flexShrink: 0 }} />
                {/* identity */}
                <div style={{ flex: '1 1 210px', minWidth: 0, paddingLeft: 18 }}>
                  <button data-ui="action" onClick={() => setSort('name')}
                    style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: sort === 'name' ? 'var(--wr-amber)' : 'var(--wr-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    AGENT / DISCIPLINE {sort === 'name' ? '↓' : ''}
                  </button>
                </div>
                {/* Score */}
                <button data-ui="action" onClick={() => setSort('score')}
                  style={{ width: 62, flexShrink: 0, textAlign: 'center', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: sort === 'score' ? 'var(--wr-amber)' : 'var(--wr-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  SCORE {sort === 'score' ? '↓' : ''}
                </button>
                {/* Metric cols */}
                {[
                  { key: 'completion',  label: 'DONE'   },
                  { key: 'crithigh',    label: 'CRIT/H' },
                  { key: 'consistency', label: 'STABLE' },
                ].map(col => (
                  <button data-ui="action" key={col.key} onClick={() => setSort(col.key)}
                    style={{ width: 86, flexShrink: 0, textAlign: 'left', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: sort === col.key ? 'var(--wr-amber)' : 'var(--wr-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {col.label} {sort === col.key ? '↓' : ''}
                  </button>
                ))}
                {/* Sessions */}
                <button data-ui="action" onClick={() => setSort('total')} style={{ width: 44, flexShrink: 0, textAlign: 'center', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: sort === 'total' ? 'var(--wr-amber)' : 'var(--wr-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  SESS {sort === 'total' ? '↓' : ''}
                </button>
                {/* Signal legend */}
                <div style={{ width: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#27AE60' }} title="OK" />
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#D68910' }} title="Review" />
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#C0392B' }} title="Action needed" />
                </div>
              </div>
            </div>

            {/* Roster rows */}
            {loading ? (
              <div className="space-y-1.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-14 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div data-ui="surface" className="text-center py-12 rounded" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>No agents match the current filters.</p>
              </div>
            ) : (() => {
              const active   = filtered.filter(s => s.total > 0);
              const inactive = filtered.filter(s => s.total === 0);
              return (
                <div className="space-y-1.5">
                  {active.map((s, i) => (
                    <AgentPerformanceCard key={s.agent.id} stats={s} rank={i + 1} />
                  ))}
                  {inactive.length > 0 && (
                    <>
                      <div className="flex items-center gap-3 py-1">
                        <div className="h-px flex-1" style={{ backgroundColor: 'var(--wr-border)' }} />
                        <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                          NOT YET ASSESSED ({inactive.length})
                        </span>
                        <div className="h-px flex-1" style={{ backgroundColor: 'var(--wr-border)' }} />
                      </div>
                      {inactive.map((s, i) => (
                        <AgentPerformanceCard key={s.agent.id} stats={s} rank={active.length + i + 1} />
                      ))}
                    </>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* ── BIAS PATTERNS TAB ───────────────────────────────────────────── */}
        {tab === 'BIAS PATTERNS' && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>TOTAL ASSESSMENTS</p>
                </div>
                <p className="text-3xl font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{totalAssessments}</p>
                <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--wr-text-muted)' }}>{withData.length} active agents contributing</p>
              </div>

              <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>AVG CRIT/HIGH RATE</p>
                  <InfoTip>Average share of assessments rated CRITICAL or HIGH across all active agents. Calibrate your risk model if this is very high or very low.</InfoTip>
                </div>
                <p className="text-3xl font-bold font-mono" style={{ color: avgEscalation >= 60 ? '#C0392B' : avgEscalation >= 35 ? '#D68910' : '#27AE60' }}>{avgEscalation}%</p>
                <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--wr-text-muted)' }}>
                  {avgEscalation >= 60 ? 'SME panel skews pessimistic' : avgEscalation >= 35 ? 'Moderate escalation tendency' : 'SME panel skews optimistic'}
                </p>
              </div>

              <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs font-bold tracking-widest font-mono" style={{ color: '#C0392B' }}>MOST PESSIMISTIC</p>
                  <InfoTip align="left">Agent with the highest share of CRIT/HIGH ratings. Their findings may carry a systematic upward bias.</InfoTip>
                </div>
                {mostPessimistic ? (
                  <>
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--wr-text-primary)' }}>{mostPessimistic.agent.name}</p>
                    <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--wr-text-muted)' }}>
                      {mostPessimistic.escalationRate}% CRIT/HIGH · {mostPessimistic.total} assessments
                    </p>
                  </>
                ) : <p className="text-xs mt-2" style={{ color: 'var(--wr-text-muted)' }}>No data yet</p>}
              </div>

              <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs font-bold tracking-widest font-mono" style={{ color: '#27AE60' }}>MOST OPTIMISTIC</p>
                  <InfoTip align="left">Agent with the lowest share of CRIT/HIGH ratings. Check if genuine high-risk threats are being under-rated in their assessments.</InfoTip>
                </div>
                {mostOptimistic ? (
                  <>
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--wr-text-primary)' }}>{mostOptimistic.agent.name}</p>
                    <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--wr-text-muted)' }}>
                      {mostOptimistic.escalationRate}% CRIT/HIGH · {mostOptimistic.total} assessments
                    </p>
                  </>
                ) : <p className="text-xs mt-2" style={{ color: 'var(--wr-text-muted)' }}>No data yet</p>}
              </div>
            </div>

            {/* Severity breakdown chart */}
            <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
              <div className="flex items-center gap-1 mb-0.5">
                <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>SEVERITY BREAKDOWN BY AGENT</h2>
                <InfoTip>Stacked bars show the raw count of each severity level per agent. Taller bars = more assessments. Red-heavy bars = pessimistic pattern. Hover an agent for full name.</InfoTip>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>
                <span style={{ color: '#C0392B' }}>■</span> CRITICAL&nbsp;&nbsp;
                <span style={{ color: '#D68910' }}>■</span> HIGH&nbsp;&nbsp;
                <span style={{ color: '#2E86AB' }}>■</span> MEDIUM&nbsp;&nbsp;
                <span style={{ color: '#27AE60' }}>■</span> LOW
              </p>
              {loading
                ? <div className="h-48 animate-pulse rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)' }} />
                : <OverviewChart agentStats={agentStats} />
              }
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>SORT</span>
                <div data-ui="surface" className="flex rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
                  {BIAS_SORTS.map(o => (
                    <button data-ui="action" key={o.value} onClick={() => setSort(o.value)}
                      className="px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{ backgroundColor: sort === o.value ? 'var(--wr-amber)' : 'transparent', color: sort === o.value ? '#0D1B2A' : 'var(--wr-text-secondary)' }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>DOMAIN</span>
                <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded outline-none"
                  style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}>
                  <option value="">All Domains</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <span className="text-xs ml-auto" style={{ color: 'var(--wr-text-muted)' }}>{filtered.length} agents</span>
            </div>

            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-52 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div data-ui="surface" className="text-center py-16 rounded" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>No agents match the current filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filtered.map((s, i) => <AgentBiasCard key={s.agent.id} agentStats={s} rank={i + 1} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
