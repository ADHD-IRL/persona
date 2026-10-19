import { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { GitCompare, ChevronDown, Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SeverityBadge from '@/components/ui/SeverityBadge';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  Tooltip, PieChart, Pie, Cell
} from 'recharts';

const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const STATUS_COLOR = { pending: '#546E7A', round1: '#2E86AB', round2: '#D68910', complete: '#27AE60' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSeverityCounts(sessionAgents) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  sessionAgents.forEach(sa => {
    const sev = sa.round2_revised_severity || sa.round1_severity;
    if (sev && counts[sev] !== undefined) counts[sev]++;
  });
  return counts;
}

function getEscalations(sessionAgents) {
  // How many agents escalated (r2 severity higher than r1)
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  let up = 0, down = 0, same = 0;
  sessionAgents.forEach(sa => {
    if (!sa.round1_severity || !sa.round2_revised_severity) return;
    const diff = order[sa.round1_severity] - order[sa.round2_revised_severity];
    if (diff > 0) up++;
    else if (diff < 0) down++;
    else same++;
  });
  return { up, down, same };
}

function getAgentOverlap(sa1, sa2) {
  const ids1 = new Set(sa1.map(s => s.agent_id));
  const ids2 = new Set(sa2.map(s => s.agent_id));
  const shared = [...ids1].filter(id => ids2.has(id));
  const onlyA  = [...ids1].filter(id => !ids2.has(id));
  const onlyB  = [...ids2].filter(id => !ids1.has(id));
  return { shared, onlyA, onlyB };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SessionPicker({ label, value, onChange, sessions, color }) {
  return (
    <div className="flex-1">
      <p className="text-xs font-bold tracking-widest font-mono mb-2" style={{ color }}>
        {label}
      </p>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 text-sm rounded outline-none appearance-none pr-8"
          style={{ backgroundColor: 'var(--wr-bg-card)', border: `1px solid ${color}60`, color: 'var(--wr-text-primary)' }}
        >
          <option value="">— Select session —</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} [{s.status?.toUpperCase()}]
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--wr-text-muted)' }} />
      </div>
    </div>
  );
}

function SeverityDonut({ counts, color, label }) {
  const total = SEVERITIES.reduce((s, k) => s + (counts[k] || 0), 0);
  const data = SEVERITIES.filter(k => counts[k] > 0).map(k => ({ name: k, value: counts[k] }));
  const escalationRate = total > 0 ? Math.round(((counts.CRITICAL + counts.HIGH) / total) * 100) : 0;

  if (total === 0) return (
    <div className="flex flex-col items-center justify-center h-36">
      <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No assessments</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs font-bold tracking-widest font-mono" style={{ color }}>{label}</p>
      <div style={{ width: 140, height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => <Cell key={i} fill={SEV_COLORS[entry.name]} />)}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${v} (${Math.round(v/total*100)}%)`, n]}
              contentStyle={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', borderRadius: '4px', fontSize: '11px', color: 'var(--wr-text-primary)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-4 gap-2 w-full text-center">
        {SEVERITIES.map(s => (
          <div key={s}>
            <div className="text-sm font-bold font-mono" style={{ color: SEV_COLORS[s] }}>{counts[s] || 0}</div>
            <div className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{s.slice(0, 3)}</div>
          </div>
        ))}
      </div>
      <p className="text-xs font-mono" style={{ color: escalationRate >= 60 ? '#C0392B' : 'var(--wr-text-muted)' }}>
        {escalationRate}% CRIT/HIGH rate
      </p>
    </div>
  );
}

function SeverityBar({ counts, color }) {
  const total = SEVERITIES.reduce((s, k) => s + (counts[k] || 0), 0);
  if (total === 0) return <div className="h-3 rounded" style={{ backgroundColor: 'var(--wr-border)' }} />;
  return (
    <div className="flex h-3 rounded overflow-hidden w-full">
      {SEVERITIES.filter(k => counts[k] > 0).map(k => (
        <div
          key={k}
          style={{ width: `${Math.round((counts[k] / total) * 100)}%`, backgroundColor: SEV_COLORS[k] }}
          title={`${k}: ${counts[k]}`}
        />
      ))}
    </div>
  );
}

function RadarComparison({ sa1, sa2, agentMap }) {
  // Severity by agent discipline — use the shared agents
  const disciplines = [...new Set([...sa1, ...sa2].map(sa => agentMap[sa.agent_id]?.discipline).filter(Boolean))];
  const sevScore = sev => ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[sev] || 0);

  const data = disciplines.slice(0, 8).map(disc => {
    const r1agents = sa1.filter(sa => agentMap[sa.agent_id]?.discipline === disc);
    const r2agents = sa2.filter(sa => agentMap[sa.agent_id]?.discipline === disc);
    const avg = (list) => list.length === 0 ? 0 :
      list.reduce((s, sa) => s + sevScore(sa.round2_revised_severity || sa.round1_severity), 0) / list.length;
    return { discipline: disc.split(' ')[0], A: parseFloat(avg(r1agents).toFixed(2)), B: parseFloat(avg(r2agents).toFixed(2)) };
  });

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Need shared disciplines to compare</p>
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="var(--wr-border)" />
        <PolarAngleAxis dataKey="discipline" tick={{ fontSize: 9, fill: 'var(--wr-text-muted)' }} />
        <Radar name="Session A" dataKey="A" stroke="#F0A500" fill="#F0A500" fillOpacity={0.15} dot={{ r: 3, fill: '#F0A500' }} />
        <Radar name="Session B" dataKey="B" stroke="#2E86AB" fill="#2E86AB" fillOpacity={0.15} dot={{ r: 3, fill: '#2E86AB' }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', borderRadius: '4px', fontSize: '11px', color: 'var(--wr-text-primary)' }}
          formatter={(v, name) => [['—','LOW','MEDIUM','HIGH','CRITICAL'][v] || v, name]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function AgentParticipationRow({ agentId, agentMap, saA, saB }) {
  const agent = agentMap[agentId];
  if (!agent) return null;
  const recA = saA.find(s => s.agent_id === agentId);
  const recB = saB.find(s => s.agent_id === agentId);
  const sevA = recA ? (recA.round2_revised_severity || recA.round1_severity) : null;
  const sevB = recB ? (recB.round2_revised_severity || recB.round1_severity) : null;

  return (
    <div className="grid grid-cols-3 gap-3 items-center py-2 border-b" style={{ borderColor: 'var(--wr-border)' }}>
      <div className="min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</p>
      </div>
      <div className="text-center">
        {sevA ? <SeverityBadge severity={sevA} size="xs" /> : <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>—</span>}
      </div>
      <div className="text-center">
        {sevB ? <SeverityBadge severity={sevB} size="xs" /> : <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>—</span>}
      </div>
    </div>
  );
}

function DeltaStatCard({ label, valueA, valueB, unit = '', invert = false }) {
  const delta = valueB - valueA;
  const isUp = invert ? delta < 0 : delta > 0;
  const isDown = invert ? delta > 0 : delta < 0;
  return (
    <div data-ui="surface" className="rounded p-3 text-center" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
      <p className="text-xs font-mono font-bold mb-1" style={{ color: 'var(--wr-text-muted)' }}>{label}</p>
      <div className="flex items-center justify-center gap-2">
        <span className="font-mono text-sm font-bold" style={{ color: '#F0A500' }}>{valueA}{unit}</span>
        <span style={{ color: 'var(--wr-text-muted)' }}>→</span>
        <span className="font-mono text-sm font-bold" style={{ color: '#2E86AB' }}>{valueB}{unit}</span>
      </div>
      {delta !== 0 && (
        <p className="text-xs mt-1 font-mono font-bold" style={{ color: isUp ? '#27AE60' : isDown ? '#C0392B' : 'var(--wr-text-muted)' }}>
          {delta > 0 ? '+' : ''}{delta}{unit}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SessionComparison() {
  const { db } = useWorkspace();
  const [sessions, setSessions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [allSessionAgents, setAllSessionAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionAId, setSessionAId] = useState('');
  const [sessionBId, setSessionBId] = useState('');

  useEffect(() => {
    if (!db) return;
    Promise.all([
      db.Session.list('-created_at', 100),
      db.Agent.list(),
      db.SessionAgent.list(),
    ]).then(([s, a, sa]) => {
      setSessions(s);
      setAgents(a);
      setAllSessionAgents(sa);
      setLoading(false);
    });
  }, [db]);

  const agentMap = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);

  const sessionA = useMemo(() => sessions.find(s => s.id === sessionAId) || null, [sessions, sessionAId]);
  const sessionB = useMemo(() => sessions.find(s => s.id === sessionBId) || null, [sessions, sessionBId]);
  const saA = useMemo(() => allSessionAgents.filter(sa => sa.session_id === sessionAId), [allSessionAgents, sessionAId]);
  const saB = useMemo(() => allSessionAgents.filter(sa => sa.session_id === sessionBId), [allSessionAgents, sessionBId]);

  const countsA = useMemo(() => getSeverityCounts(saA), [saA]);
  const countsB = useMemo(() => getSeverityCounts(saB), [saB]);
  const escalA = useMemo(() => getEscalations(saA), [saA]);
  const escalB = useMemo(() => getEscalations(saB), [saB]);
  const overlap = useMemo(() => getAgentOverlap(saA, saB), [saA, saB]);

  const totalA = SEVERITIES.reduce((s, k) => s + (countsA[k] || 0), 0);
  const totalB = SEVERITIES.reduce((s, k) => s + (countsB[k] || 0), 0);
  const escalRateA = totalA > 0 ? Math.round(((countsA.CRITICAL + countsA.HIGH) / totalA) * 100) : 0;
  const escalRateB = totalB > 0 ? Math.round(((countsB.CRITICAL + countsB.HIGH) / totalB) * 100) : 0;

  const allAgentIds = useMemo(() => {
    const ids = new Set([...saA.map(s => s.agent_id), ...saB.map(s => s.agent_id)]);
    return [...ids];
  }, [saA, saB]);

  const ready = sessionAId && sessionBId && sessionAId !== sessionBId;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <PageHeader
        icon={GitCompare}
        title="SESSION COMPARISON"
        subtitle="Side-by-side risk assessment analysis across sessions"
      />

      <div className="p-6 space-y-6">

        {/* Session Pickers */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <p className="text-xs font-bold tracking-widest font-mono mb-4" style={{ color: 'var(--wr-text-muted)' }}>SELECT SESSIONS TO COMPARE</p>
          <div className="flex items-end gap-4">
            <SessionPicker label="SESSION A" value={sessionAId} onChange={setSessionAId} sessions={sessions} color="#F0A500" />
            <div className="pb-3 flex-shrink-0">
              <GitCompare className="w-5 h-5" style={{ color: 'var(--wr-text-muted)' }} />
            </div>
            <SessionPicker label="SESSION B" value={sessionBId} onChange={setSessionBId} sessions={sessions} color="#2E86AB" />
          </div>
          {sessionAId && sessionBId && sessionAId === sessionBId && (
            <p className="text-xs mt-3" style={{ color: '#D68910' }}>⚠ Please select two different sessions</p>
          )}
        </div>

        {/* Placeholder */}
        {!ready && (
          <div className="flex flex-col items-center justify-center py-20">
            <GitCompare className="w-12 h-12 mb-4" style={{ color: 'var(--wr-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>Select two different sessions above to begin comparison</p>
          </div>
        )}

        {ready && (
          <>
            {/* Session Status Headers */}
            <div className="grid grid-cols-2 gap-4">
              {[{ session: sessionA, color: '#F0A500', label: 'SESSION A', sa: saA, counts: countsA, esc: escalA },
                { session: sessionB, color: '#2E86AB', label: 'SESSION B', sa: saB, counts: countsB, esc: escalB }]
                .map(({ session, color, label, sa, counts, esc }) => (
                <div data-ui="surface" key={label} className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: `1px solid ${color}50` }}>
                  <p className="text-xs font-bold tracking-widest font-mono mb-1" style={{ color }}>{label}</p>
                  <p className="text-base font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{session?.name}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span data-ui="badge" className="text-xs px-2 py-0.5 rounded font-bold font-mono"
                      style={{ backgroundColor: `${STATUS_COLOR[session?.status]}22`, color: STATUS_COLOR[session?.status] }}>
                      {session?.status?.toUpperCase()}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{sa.length} agents · {SEVERITIES.reduce((s, k) => s + (counts[k] || 0), 0)} assessments</span>
                  </div>
                  <div className="mt-3">
                    <SeverityBar counts={counts} color={color} />
                  </div>
                  <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                    <span>↑ Escalated: <strong style={{ color: '#C0392B' }}>{esc.up}</strong></span>
                    <span>↓ De-escalated: <strong style={{ color: '#27AE60' }}>{esc.down}</strong></span>
                    <span>= Same: <strong>{esc.same}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            {/* Delta Stats */}
            <div className="grid grid-cols-4 gap-3">
              <DeltaStatCard label="ASSESSMENTS" valueA={totalA} valueB={totalB} />
              <DeltaStatCard label="CRIT/HIGH RATE" valueA={escalRateA} valueB={escalRateB} unit="%" invert={true} />
              <DeltaStatCard label="CRITICAL COUNT" valueA={countsA.CRITICAL} valueB={countsB.CRITICAL} invert={true} />
              <DeltaStatCard label="AGENTS" valueA={saA.length} valueB={saB.length} />
            </div>

            {/* Severity Donuts + Radar */}
            <div className="grid grid-cols-3 gap-4">
              <div data-ui="surface" className="rounded p-5 flex flex-col items-center" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold tracking-widest font-mono mb-4 self-start" style={{ color: 'var(--wr-text-muted)' }}>SEVERITY DISTRIBUTION</p>
                <SeverityDonut counts={countsA} color="#F0A500" label="SESSION A" />
              </div>
              <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold tracking-widest font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>RISK PROFILE BY DISCIPLINE</p>
                <RadarComparison sa1={saA} sa2={saB} agentMap={agentMap} />
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#F0A500' }} /><span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Session A</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#2E86AB' }} /><span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Session B</span></div>
                </div>
              </div>
              <div data-ui="surface" className="rounded p-5 flex flex-col items-center" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold tracking-widest font-mono mb-4 self-start" style={{ color: 'var(--wr-text-muted)' }}>SEVERITY DISTRIBUTION</p>
                <SeverityDonut counts={countsB} color="#2E86AB" label="SESSION B" />
              </div>
            </div>

            {/* Agent Overlap */}
            <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
              <p className="text-xs font-bold tracking-widest font-mono mb-4" style={{ color: 'var(--wr-text-muted)' }}>AGENT PARTICIPATION</p>
              <div className="flex gap-4 mb-4 flex-wrap">
                <div data-ui="surface" className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                  style={{ backgroundColor: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)', color: 'var(--wr-text-secondary)' }}>
                  <Users className="w-3 h-3" style={{ color: '#F0A500' }} />
                  <strong style={{ color: '#F0A500' }}>{overlap.shared.length}</strong> shared agents
                </div>
                <div data-ui="surface" className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                  style={{ backgroundColor: 'rgba(240,165,0,0.05)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)' }}>
                  {overlap.onlyA.length} only in A
                </div>
                <div data-ui="surface" className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                  style={{ backgroundColor: 'rgba(46,134,171,0.05)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)' }}>
                  {overlap.onlyB.length} only in B
                </div>
              </div>

              {/* Header row */}
              <div className="grid grid-cols-3 gap-3 mb-2 pb-2 border-b" style={{ borderColor: 'var(--wr-border)' }}>
                <p className="text-xs font-bold font-mono" style={{ color: 'var(--wr-text-muted)' }}>AGENT</p>
                <p className="text-xs font-bold font-mono text-center" style={{ color: '#F0A500' }}>SESSION A</p>
                <p className="text-xs font-bold font-mono text-center" style={{ color: '#2E86AB' }}>SESSION B</p>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-0">
                {/* Shared agents first */}
                {overlap.shared.map(id => <AgentParticipationRow key={id} agentId={id} agentMap={agentMap} saA={saA} saB={saB} />)}
                {/* Only-A agents */}
                {overlap.onlyA.map(id => <AgentParticipationRow key={id} agentId={id} agentMap={agentMap} saA={saA} saB={saB} />)}
                {/* Only-B agents */}
                {overlap.onlyB.map(id => <AgentParticipationRow key={id} agentId={id} agentMap={agentMap} saA={saA} saB={saB} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}