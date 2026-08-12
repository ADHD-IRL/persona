import { Link } from 'react-router-dom';
import { AlertTriangle, GitBranch, Map, TrendingDown, ArrowRight, CheckCircle2, Flame } from 'lucide-react';
import { riskBandFromScore } from '@/lib/risk';
import MetricHint, { HintDot } from '@/components/ui/MetricHint';
import { RISK_HINTS } from '@/lib/riskGlossary';

// Compact KPI tile. Optional `to` makes the whole tile a link.
function Tile({ icon: Icon, label, value, sub, color = 'var(--wr-amber)', to, subColor, hint }) {
  const inner = (
    <div className="rounded-xl p-4 h-full flex flex-col justify-between transition-colors hover:bg-white/[0.03]"
      style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', minHeight: 118 }}>
      <div className="flex items-center justify-between">
        {hint ? (
          <MetricHint title={hint.title} body={hint.body} className="inline-flex">
            <span className="text-xs font-bold tracking-widest font-mono flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}>{label}<HintDot /></span>
          </MetricHint>
        ) : (
          <span className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>{label}</span>
        )}
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
      </div>
      <div>
        <p className="text-4xl font-black tabular-nums leading-none" style={{ color }}>{value}</p>
        {sub && <p className="text-xs mt-1.5" style={{ color: subColor || 'var(--wr-text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

export default function RiskRail({ metrics, attention = [] }) {
  const { peak, openCriticals, netReduction, gaps, openMitigations, pendingDecisions, analyzedSessions } = metrics;
  const peakBand = riskBandFromScore(peak.score || 0);

  return (
    <div className="space-y-4">
      {/* KPI tiles — risk / decisions / mitigation / coverage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Tile
          icon={Flame}
          label="PEAK RISK"
          value={peak.score ? `${peak.score}` : '—'}
          sub={peak.session ? `${peakBand.label} · ${peak.session.name?.slice(0, 22) || 'session'}` : (analyzedSessions ? 'no quantified risk yet' : 'run a session to score risk')}
          color={peak.score ? peakBand.color : 'var(--wr-text-muted)'}
          subColor={peak.score ? peakBand.color : undefined}
          to={peak.session ? `/sessions/${peak.session.id}` : '/sessions'}
          hint={RISK_HINTS.PEAK}
        />
        <Tile
          icon={AlertTriangle}
          label="OPEN CRITICALS"
          value={openCriticals}
          sub={openCriticals > 0 ? 'critical findings across sessions' : 'no critical findings'}
          color={openCriticals > 0 ? '#C0392B' : '#27AE60'}
          to="/sessions"
          hint={RISK_HINTS.OPEN_CRITICALS}
        />
        <Tile
          icon={TrendingDown}
          label="NET RISK REDUCTION"
          value={netReduction.count ? `−${netReduction.delta}` : '—'}
          sub={netReduction.count ? `${netReduction.inherent} → ${netReduction.residual} · ${openMitigations} open` : `${openMitigations || 0} mitigations, none scored`}
          color={netReduction.count ? '#27AE60' : 'var(--wr-text-muted)'}
          to="/mitigations"
          hint={RISK_HINTS.NET_REDUCTION}
        />
        <Tile
          icon={Map}
          label="COVERAGE GAPS"
          value={gaps.length}
          sub={gaps.length > 0 ? 'threat areas with no bench' : 'panel covers your threats'}
          color={gaps.length > 0 ? '#D68910' : '#27AE60'}
          to="/threatmap"
          hint={RISK_HINTS.COVERAGE_GAPS}
        />
      </div>

      {/* Needs attention — the actionable exceptions */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: attention.length ? '1px solid var(--wr-border)' : 'none' }}>
          <span className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>NEEDS ATTENTION</span>
          {pendingDecisions.length > 0 && (
            <Link to="/decisions" className="text-xs font-mono flex items-center gap-1" style={{ color: 'var(--wr-amber)', textDecoration: 'none' }}>
              <GitBranch className="w-3 h-3" /> {pendingDecisions.length} open decision{pendingDecisions.length !== 1 ? 's' : ''}
            </Link>
          )}
        </div>
        {attention.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-4">
            <CheckCircle2 className="w-4 h-4" style={{ color: '#27AE60' }} />
            <span className="text-sm" style={{ color: 'var(--wr-text-secondary)' }}>Nothing flagged — no invalidated assumptions, coverage gaps, or open decisions.</span>
          </div>
        ) : (
          <div>
            {attention.map((item, i) => (
              <Link key={i} to={item.to}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
                style={{ borderTop: i ? '1px solid var(--wr-border)' : 'none', textDecoration: 'none' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{item.label}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{item.detail}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
