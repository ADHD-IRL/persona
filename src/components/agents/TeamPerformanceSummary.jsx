import { useState } from 'react';
import { Activity, CheckCircle2, TrendingUp, Users, AlertTriangle, Info } from 'lucide-react';

const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };

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

function StatCard({ label, value, sub, color = '#F0A500', icon: IconComp, tip }) {
  return (
    <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18` }}>
          <IconComp className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-2xl font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{value}</span>
      </div>
      <div className="flex items-center gap-0.5 mb-1">
        <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>{label}</p>
        {tip && <InfoTip>{tip}</InfoTip>}
      </div>
      {sub && <p className="text-xs leading-snug" style={{ color: 'var(--wr-text-muted)' }}>{sub}</p>}
    </div>
  );
}

function buildRiskSignals(active, agentStats) {
  const signals = [];
  const noData = agentStats.filter(s => s.perf.total === 0);
  if (noData.length > 0) {
    signals.push({ level: 'warn', text: `${noData.length} agent${noData.length !== 1 ? 's' : ''} have no assessment data — their threat areas have zero coverage.` });
  }
  const lowCompletion = active.filter(s => s.perf.completionRate < 50);
  if (lowCompletion.length > 0) {
    signals.push({ level: 'warn', text: `${lowCompletion.length} agent${lowCompletion.length !== 1 ? 's' : ''} below 50% completion — risk picture in those areas may be incomplete.` });
  }
  const highEscalation = active.filter(s => s.escalationRate >= 70);
  if (highEscalation.length > 0) {
    signals.push({ level: 'info', text: `${highEscalation.length} agent${highEscalation.length !== 1 ? 's' : ''} rate 70%+ findings as CRIT/HIGH — account for pessimistic skew in aggregate risk.` });
  }
  const highRevision = active.filter(s => s.perf.revisionRate > 50);
  if (highRevision.length > 0) {
    signals.push({ level: 'info', text: `${highRevision.length} agent${highRevision.length !== 1 ? 's' : ''} change severity frequently between rounds — findings carry higher uncertainty.` });
  }
  return signals;
}

export default function TeamPerformanceSummary({ agentStats, domains }) {
  const active = agentStats.filter(s => s.perf.total > 0);

  if (active.length === 0) return (
    <div data-ui="surface" className="rounded p-8 text-center" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>No performance data — complete sessions to see SME panel metrics.</p>
    </div>
  );

  const avgScore        = Math.round(active.reduce((s, a) => s + a.perf.score, 0) / active.length);
  const avgCompletion   = Math.round(active.reduce((s, a) => s + a.perf.completionRate, 0) / active.length);
  const avgConsistency  = Math.round(active.reduce((s, a) => s + (100 - a.perf.revisionRate), 0) / active.length);
  const avgEscalation   = Math.round(active.reduce((s, a) => s + (a.escalationRate || 0), 0) / active.length);
  const totalAssessments = active.reduce((s, a) => s + a.perf.total, 0);
  const riskSignals = buildRiskSignals(active, agentStats);

  // Team-wide severity mix (combined counts)
  const teamCounts = active.reduce((acc, s) => {
    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(sev => {
      acc[sev] = (acc[sev] || 0) + (s.counts[sev] || 0);
    });
    return acc;
  }, {});
  const teamTotal = Object.values(teamCounts).reduce((s, v) => s + v, 0);
  const sevMix = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => ({
    sev,
    count: teamCounts[sev] || 0,
    pct: teamTotal > 0 ? Math.round(((teamCounts[sev] || 0) / teamTotal) * 100) : 0,
  }));

  // Domain performance
  const domainMap = Object.fromEntries(domains.map(d => [d.id, d]));
  const byDomain = {};
  active.forEach(s => {
    const domId = s.agent.domain_id || '_none';
    if (!byDomain[domId]) byDomain[domId] = {
      scores: [], escalations: [], completions: [],
      name: domainMap[domId]?.name || 'No Domain',
      color: domainMap[domId]?.color || '#8A9BB5',
    };
    byDomain[domId].scores.push(s.perf.score);
    byDomain[domId].escalations.push(s.escalationRate || 0);
    byDomain[domId].completions.push(s.perf.completionRate);
  });
  const domainPerf = Object.values(byDomain).map(d => ({
    name: d.name,
    score: Math.round(d.scores.reduce((s, v) => s + v, 0) / d.scores.length),
    escalation: Math.round(d.escalations.reduce((s, v) => s + v, 0) / d.escalations.length),
    completion: Math.round(d.completions.reduce((s, v) => s + v, 0) / d.completions.length),
    count: d.scores.length,
    color: d.color,
  })).sort((a, b) => b.score - a.score);

  const escalationColor = avgEscalation >= 60 ? '#C0392B' : avgEscalation >= 35 ? '#D68910' : '#27AE60';

  return (
    <div className="space-y-4">

      {/* Risk signals */}
      {riskSignals.length > 0 && (
        <div data-ui="surface" className="rounded p-3" style={{ backgroundColor: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.25)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#F0A500' }} />
            <p className="text-xs font-bold font-mono tracking-widest" style={{ color: '#F0A500' }}>SME PANEL RISK SIGNALS</p>
          </div>
          <div className="space-y-1.5">
            {riskSignals.map((sig, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: sig.level === 'warn' ? '#C0392B' : '#D68910' }} />
                <p className="text-xs leading-snug" style={{ color: 'var(--wr-text-secondary)' }}>{sig.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Activity} label="AVG SCORE" value={avgScore}
          sub={`${active.length} of ${agentStats.length} agents have data`} color="#F0A500"
          tip="Composite reliability score: 40% completion + 30% consistency + 30% engagement. Reflects how dependably agents contribute — NOT how severe their findings are." />
        <StatCard icon={CheckCircle2} label="COMPLETION" value={`${avgCompletion}%`}
          sub="avg rounds submitted" color="#27AE60"
          tip="How often agents finish assigned rounds. Low completion means threats are assessed by fewer data points — higher uncertainty in the risk model." />
        <StatCard icon={TrendingUp} label="CONSISTENCY" value={`${avgConsistency}%`}
          sub="severity unchanged R1→R2" color="#2E86AB"
          tip="How often severity ratings hold from Round 1 to Round 2. Low consistency may indicate peer influence or analytical uncertainty." />
        <StatCard icon={Users} label="CRIT/HIGH RATE" value={`${avgEscalation}%`}
          sub={`across ${totalAssessments} assessments`} color={escalationColor}
          tip="SME panel share rated CRITICAL or HIGH. >60% = pessimistic tendency, <25% = optimistic. Use this to calibrate aggregate risk appetite before decision-making." />
      </div>

      {/* Team severity mix + Domain performance side by side */}
      <div className="grid grid-cols-2 gap-4">

        {/* Team severity mix */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-1 mb-0.5">
            <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              SME ASSESSMENT MIX
            </h3>
            <InfoTip>
              Combined severity breakdown across all {totalAssessments} assessments from active agents.
              A heavily red/orange bar means the SME panel skews pessimistic — apply calibration before aggregating into scenario risk scores.
            </InfoTip>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>
            All {totalAssessments} assessments from {active.length} active agents
          </p>

          {/* Stacked bar */}
          <div className="flex rounded overflow-hidden mb-3" style={{ height: 20 }}>
            {sevMix.filter(s => s.count > 0).map(s => (
              <div key={s.sev} style={{ width: `${s.pct}%`, backgroundColor: SEV_COLORS[s.sev] }} />
            ))}
          </div>

          {/* Count breakdown */}
          <div className="grid grid-cols-4 gap-2">
            {sevMix.map(s => (
              <div key={s.sev} className="rounded p-2.5 text-center" style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
                <div className="text-lg font-bold font-mono" style={{ color: SEV_COLORS[s.sev] }}>{s.count}</div>
                <div className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{s.sev.slice(0, 4)}</div>
                <div className="text-xs" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>{s.pct}%</div>
              </div>
            ))}
          </div>

          {/* Interpretation */}
          <div className="mt-4 pt-3 border-t text-xs leading-relaxed" style={{ borderColor: 'var(--wr-border)', color: 'var(--wr-text-muted)' }}>
            {avgEscalation >= 60
              ? <span><strong style={{ color: '#C0392B' }}>Pessimistic SME panel:</strong> Over 60% of findings rated high-severity. Cross-check critical threats before escalating to decision-makers.</span>
              : avgEscalation <= 25
              ? <span><strong style={{ color: '#27AE60' }}>Optimistic SME panel:</strong> Under 25% rated high-severity. Verify that genuine risks aren't being systematically discounted.</span>
              : <span><strong style={{ color: '#2E86AB' }}>Balanced mix:</strong> Severity distribution appears reasonably calibrated. Use findings at face value with normal review.</span>
            }
          </div>
        </div>

        {/* Domain performance */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-1 mb-0.5">
            <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              PERFORMANCE BY DOMAIN
            </h3>
            <InfoTip>
              Average performance score per domain. Low score = agents in that domain complete fewer rounds or revise severity often — consider reviewing SME coverage or domain organization.
              <br /><br />
              <strong style={{ color: 'var(--wr-amber)' }}>C/H</strong> = avg CRIT/HIGH rate for agents in that domain — use to spot domain-level bias.
            </InfoTip>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>Score · completion · avg CRIT/HIGH rate</p>
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 240 }}>
            {domainPerf.map(d => {
              const barColor = d.score >= 75 ? '#27AE60' : d.score >= 50 ? '#D68910' : '#C0392B';
              const escColor = d.escalation >= 60 ? '#C0392B' : d.escalation >= 35 ? '#D68910' : '#27AE60';
              return (
                <div key={d.name}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-xs font-medium flex-1 leading-snug" style={{ color: 'var(--wr-text-secondary)' }}>{d.name}</span>
                    <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>{d.count} agent{d.count !== 1 ? 's' : ''}</span>
                    <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>{d.completion}% done</span>
                    <span className="text-xs font-mono font-bold flex-shrink-0" style={{ color: escColor }}>{d.escalation}% C/H</span>
                    <span className="text-xs font-mono font-bold w-8 text-right flex-shrink-0" style={{ color: barColor }}>{d.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full ml-4" style={{ backgroundColor: 'var(--wr-border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${d.score}%`, backgroundColor: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
