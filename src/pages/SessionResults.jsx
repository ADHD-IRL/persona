import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { ArrowLeft, Loader2, BarChart2, TrendingUp, TrendingDown, Minus, Users, AlertTriangle, CheckCircle2, Shield } from 'lucide-react';
import SeverityBadge from '@/components/ui/SeverityBadge';
import SynthesisDocument from '@/components/session/SynthesisDocument';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';

const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const SEV_ORDER  = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
const SEV_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function StatCard({ label, value, sub, color = '#F0A500', icon: IconComp }) {
  const Icon = IconComp;
  return (
    <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-2xl font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{value}</span>
      </div>
      <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>{label}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>{sub}</p>}
    </div>
  );
}

function SeverityShiftRow({ sa, agent }) {
  const r1 = sa.round1_severity;
  const r2 = sa.round2_revised_severity;
  const shift = r1 && r2 ? SEV_ORDER[r2] - SEV_ORDER[r1] : null;
  const ShiftIcon = shift === null ? null : shift > 0 ? TrendingUp : shift < 0 ? TrendingDown : Minus;
  const shiftColor = shift === null ? '#546E7A' : shift > 0 ? '#C0392B' : shift < 0 ? '#27AE60' : '#8A9BB5';
  const confidence = sa.round2_confidence ?? sa.round1_confidence;
  return (
    <div className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--wr-border)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{agent?.name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{agent?.discipline}</p>
      </div>
      <div className="flex items-center gap-2">
        {confidence != null && (
          <span data-ui="badge" className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(46,134,171,0.12)', color: '#2E86AB' }}>
            {confidence}%
          </span>
        )}
        {r1 && <SeverityBadge severity={r1} size="xs" />}
        {r2 && r1 && (
          <>
            <span style={{ color: 'var(--wr-text-muted)' }}>→</span>
            <SeverityBadge severity={r2} size="xs" />
          </>
        )}
        {ShiftIcon && <ShiftIcon className="w-3.5 h-3.5" style={{ color: shiftColor }} />}
      </div>
    </div>
  );
}

export default function SessionResults() {
  const { id } = useParams();
  const { db } = useWorkspace();
  const [session, setSession]         = useState(null);
  const [sessionAgents, setSessionAgents] = useState([]);
  const [agents, setAgents]           = useState([]);
  const [synthesis, setSynthesis]     = useState(null);
  const [scenario, setScenario]       = useState(null);
  const [domains, setDomains]         = useState([]);
  const [synthText, setSynthText]     = useState('');
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!db) return;
    Promise.all([
      db.Session.filter({ id }),
      db.SessionAgent.filter({ session_id: id }),
      db.Agent.list(),
      db.SessionSynthesis.filter({ session_id: id }),
      db.Domain.list(),
    ]).then(async ([sess, sa, ag, synth, dom]) => {
      const s = sess[0] || null;
      setSession(s);
      setSessionAgents(sa);
      setAgents(ag);
      setDomains(dom);
      const syn = synth[0] || null;
      setSynthesis(syn);
      if (syn?.raw_text) {
        const raw = syn.raw_text;
        if (raw.startsWith('http')) {
          const text = await fetch(raw).then(r => r.text());
          setSynthText(text);
        } else {
          setSynthText(raw);
        }
      }
      if (s?.scenario_id) {
        const sc = await db.Scenario.filter({ id: s.scenario_id });
        setScenario(sc[0] || null);
      }
      setLoading(false);
    });
  }, [id, db]);

  const agentMap  = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);
  const domainMap = useMemo(() => Object.fromEntries(domains.map(d => [d.id, d])), [domains]);

  // Final severity counts (prefer R2, fallback R1)
  const severityCounts = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    sessionAgents.forEach(sa => {
      const sev = sa.round2_revised_severity || sa.round1_severity;
      if (sev && counts[sev] !== undefined) counts[sev]++;
    });
    return counts;
  }, [sessionAgents]);

  const pieData = SEV_LEVELS.filter(s => severityCounts[s] > 0).map(s => ({
    name: s, value: severityCounts[s], color: SEV_COLORS[s],
  }));

  // R1 vs R2 bar comparison
  const r1r2Data = useMemo(() => {
    const r1 = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const r2 = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    sessionAgents.forEach(sa => {
      if (sa.round1_severity) r1[sa.round1_severity]++;
      if (sa.round2_revised_severity) r2[sa.round2_revised_severity]++;
    });
    return SEV_LEVELS.map(s => ({ name: s, 'Round 1': r1[s], 'Round 2': r2[s] }));
  }, [sessionAgents]);

  // Per-agent radar (escalation rate by domain)
  const domainRadar = useMemo(() => {
    const byDomain = {};
    sessionAgents.forEach(sa => {
      const agent = agentMap[sa.agent_id];
      if (!agent) return;
      const domId = agent.domain_id || '_none';
      const dom = domainMap[domId];
      const key = dom?.name || 'No Domain';
      if (!byDomain[key]) byDomain[key] = { critHigh: 0, total: 0, color: dom?.color || '#8A9BB5' };
      const sev = sa.round2_revised_severity || sa.round1_severity;
      if (sev) {
        byDomain[key].total++;
        if (sev === 'CRITICAL' || sev === 'HIGH') byDomain[key].critHigh++;
      }
    });
    return Object.entries(byDomain).map(([name, d]) => ({
      domain: name,
      escalation: d.total > 0 ? Math.round((d.critHigh / d.total) * 100) : 0,
      color: d.color,
    }));
  }, [sessionAgents, agentMap, domainMap]);

  // Agents sorted by final severity
  const sortedAgents = useMemo(() => {
    return [...sessionAgents].sort((a, b) => {
      const sevA = SEV_ORDER[a.round2_revised_severity || a.round1_severity] ?? -1;
      const sevB = SEV_ORDER[b.round2_revised_severity || b.round1_severity] ?? -1;
      return sevB - sevA;
    });
  }, [sessionAgents]);

  // Escalation stats
  const escalated   = sessionAgents.filter(sa => sa.round1_severity && sa.round2_revised_severity && SEV_ORDER[sa.round2_revised_severity] > SEV_ORDER[sa.round1_severity]).length;
  const deEscalated = sessionAgents.filter(sa => sa.round1_severity && sa.round2_revised_severity && SEV_ORDER[sa.round2_revised_severity] < SEV_ORDER[sa.round1_severity]).length;
  const unchanged   = sessionAgents.filter(sa => sa.round1_severity && sa.round2_revised_severity && sa.round1_severity === sa.round2_revised_severity).length;

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--wr-amber)' }} />
    </div>
  );

  if (!session) return (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <p style={{ color: 'var(--wr-text-muted)' }}>Session not found.</p>
    </div>
  );

  const statusColors = { pending: '#546E7A', round1: '#2E86AB', round2: '#D68910', complete: '#27AE60' };
  const statusColor  = statusColors[session.status] || '#546E7A';

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-4" style={{ borderColor: 'var(--wr-border)', backgroundColor: 'var(--wr-bg-secondary)' }}>
        <Link data-ui="action" to={`/session-tracker?session=${id}`} className="text-xs flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Session Tracker
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <BarChart2 className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h1 className="font-bold text-lg" style={{ color: 'var(--wr-text-primary)' }}>{session.name} — Results</h1>
            <span data-ui="badge" className="text-xs px-2 py-0.5 rounded font-bold font-mono" style={{ backgroundColor: `${statusColor}22`, color: statusColor }}>
              {session.status?.toUpperCase()}
            </span>
          </div>
          {scenario && <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>Scenario: {scenario.name}</p>}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={Users}         label="AGENTS"       value={sessionAgents.length}          sub="participated in session"     color="#2E86AB" />
          <StatCard icon={AlertTriangle} label="CRITICAL"     value={severityCounts.CRITICAL}        sub="critical severity findings"  color="#C0392B" />
          <StatCard icon={TrendingUp}    label="ESCALATED"    value={escalated}                      sub="severity raised in Round 2"  color="#D68910" />
          <StatCard icon={CheckCircle2}  label="CONSISTENT"   value={unchanged}                      sub="severity unchanged R1→R2"    color="#27AE60" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-3 gap-5">

          {/* Severity Pie */}
          <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <h2 className="text-xs font-bold tracking-widest font-mono mb-4" style={{ color: 'var(--wr-text-muted)' }}>FINAL SEVERITY DISTRIBUTION</h2>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', fontSize: '11px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {SEV_LEVELS.map(s => severityCounts[s] > 0 && (
                    <div key={s} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SEV_COLORS[s] }} />
                      <span style={{ color: 'var(--wr-text-muted)' }}>{s}</span>
                      <span className="font-mono font-bold ml-auto" style={{ color: 'var(--wr-text-primary)' }}>{severityCounts[s]}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40">
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No assessment data yet</p>
              </div>
            )}
          </div>

          {/* R1 vs R2 Bar */}
          <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <h2 className="text-xs font-bold tracking-widest font-mono mb-4" style={{ color: 'var(--wr-text-muted)' }}>ROUND 1 vs ROUND 2 SHIFT</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={r1r2Data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--wr-text-muted)' }} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--wr-text-muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', fontSize: '11px', color: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: '10px', color: 'var(--wr-text-muted)' }} />
                <Bar dataKey="Round 1" fill="#2E86AB" radius={[2,2,0,0]} />
                <Bar dataKey="Round 2" fill="#F0A500" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Domain Radar */}
          <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <h2 className="text-xs font-bold tracking-widest font-mono mb-4" style={{ color: 'var(--wr-text-muted)' }}>ESCALATION RATE BY DOMAIN</h2>
            {domainRadar.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={domainRadar}>
                  <PolarGrid stroke="var(--wr-border)" />
                  <PolarAngleAxis dataKey="domain" tick={{ fontSize: 9, fill: 'var(--wr-text-muted)' }} />
                  <Radar dataKey="escalation" stroke="#F0A500" fill="#F0A500" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', fontSize: '11px', color: '#fff' }}
                    formatter={(v) => [`${v}%`, 'CRIT/HIGH rate']} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40">
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No domain data</p>
              </div>
            )}
          </div>
        </div>

        {/* Agent Severity Shifts + Top Findings */}
        <div className="grid grid-cols-2 gap-5">

          {/* Agent Severity Shifts */}
          <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <h2 className="text-xs font-bold tracking-widest font-mono mb-4" style={{ color: 'var(--wr-text-muted)' }}>AGENT SEVERITY SHIFTS (R1 → R2)</h2>
            <div className="flex items-center gap-4 mb-4 text-xs">
              <div className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" style={{ color: '#C0392B' }} /><span style={{ color: 'var(--wr-text-secondary)' }}>Escalated: <strong style={{ color: '#C0392B' }}>{escalated}</strong></span></div>
              <div className="flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" style={{ color: '#27AE60' }} /><span style={{ color: 'var(--wr-text-secondary)' }}>De-escalated: <strong style={{ color: '#27AE60' }}>{deEscalated}</strong></span></div>
              <div className="flex items-center gap-1"><Minus className="w-3.5 h-3.5" style={{ color: '#8A9BB5' }} /><span style={{ color: 'var(--wr-text-secondary)' }}>Unchanged: <strong style={{ color: '#8A9BB5' }}>{unchanged}</strong></span></div>
            </div>
            <div className="overflow-y-auto max-h-72">
              {sortedAgents.map(sa => (
                <SeverityShiftRow key={sa.id} sa={sa} agent={agentMap[sa.agent_id]} />
              ))}
            </div>
          </div>

          {/* Top Critical Findings */}
          <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <h2 className="text-xs font-bold tracking-widest font-mono mb-4" style={{ color: 'var(--wr-text-muted)' }}>TOP CRITICAL / HIGH FINDINGS</h2>
            <div className="space-y-3 overflow-y-auto max-h-72">
              {sortedAgents
                .filter(sa => ['CRITICAL','HIGH'].includes(sa.round2_revised_severity || sa.round1_severity))
                .map(sa => {
                  const agent = agentMap[sa.agent_id];
                  const sev = sa.round2_revised_severity || sa.round1_severity;
                  const text = sa.round2_rebuttal || sa.round1_assessment || '';
                  return (
                    <div data-ui="surface" key={sa.id} className="rounded p-3" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: `1px solid ${SEV_COLORS[sev]}33` }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{agent?.name}</span>
                        <SeverityBadge severity={sev} size="xs" />
                      </div>
                      <p className="text-xs line-clamp-3 leading-relaxed" style={{ color: 'var(--wr-text-muted)' }}>{text}</p>
                    </div>
                  );
              })}
              {sortedAgents.filter(sa => ['CRITICAL','HIGH'].includes(sa.round2_revised_severity || sa.round1_severity)).length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--wr-text-muted)' }}>No critical or high findings</p>
              )}
            </div>
          </div>
        </div>

        {/* Synthesis Summary */}
        {synthText && (
          <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
              <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>SYNTHESIS SUMMARY</h2>
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              <SynthesisDocument text={synthText} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}