import { aggregateSessionRisk, riskScore, riskBandFromScore } from '@/lib/risk';
import MetricHint, { HintDot } from '@/components/ui/MetricHint';
import { RISK_HINTS } from '@/lib/riskGlossary';

// One-line executive summary of the whole session — the at-a-glance source of
// truth shown above the synthesis. Everything is derived from session data.
function Stat({ label, value, sub, color, hint, align = 'left' }) {
  const content = (
    <>
      <span className="text-[10px] font-mono tracking-wider flex items-center gap-0.5" style={{ color: 'var(--wr-text-muted)' }}>
        {label}{hint && <HintDot />}
      </span>
      <span className="text-lg font-bold font-mono leading-tight" style={{ color: color || 'var(--wr-text-primary)' }}>{value}</span>
      {sub && <span className="text-[10px]" style={{ color: 'var(--wr-text-muted)' }}>{sub}</span>}
    </>
  );
  if (!hint) return <div className="flex flex-col px-4 first:pl-0">{content}</div>;
  return (
    <MetricHint title={hint.title} body={hint.body} align={align} className="flex flex-col px-4 first:pl-0">
      {content}
    </MetricHint>
  );
}

export default function SessionRiskHeader({ sessionAgents = [], threats = [], chains = [], mitigations = [] }) {
  const agg = aggregateSessionRisk(sessionAgents);
  const peak = agg?.peak ?? null;
  const peakBand = peak != null ? riskBandFromScore(peak) : null;
  const openCriticals = threats.filter(t => (t.severity || '').toUpperCase() === 'CRITICAL').length;

  const scored = mitigations.filter(m => m.inherent_likelihood && m.inherent_impact);
  const inherentTot = scored.reduce((a, m) => a + riskScore(m.inherent_likelihood, m.inherent_impact), 0);
  const residualTot = scored.reduce((a, m) => a + (riskScore(m.residual_likelihood, m.residual_impact) ?? riskScore(m.inherent_likelihood, m.inherent_impact)), 0);
  const netReduction = inherentTot - residualTot;

  return (
    <div data-ui="surface" className="mb-4 rounded-2xl px-5 py-3 flex items-center gap-1 flex-wrap divide-x" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', borderColor: 'var(--wr-border)' }}>
      <Stat
        label="PEAK RISK"
        value={peak != null ? <>{peak}<span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>/25</span></> : '—'}
        sub={peakBand?.label || 'no L×I yet'}
        color={peakBand?.color}
        hint={RISK_HINTS.PEAK}
      />
      <Stat label="OPEN CRITICALS" value={openCriticals} sub="threats" color={openCriticals > 0 ? '#C0392B' : undefined} hint={RISK_HINTS.OPEN_CRITICALS} />
      <Stat label="KILL CHAINS" value={chains.length} sub="identified" hint={RISK_HINTS.KILL_CHAINS} />
      <Stat label="MITIGATIONS" value={mitigations.length} sub="registered" hint={RISK_HINTS.MITIGATIONS} align="right" />
      <Stat
        label="NET REDUCTION"
        value={netReduction > 0 ? `−${netReduction}` : '0'}
        sub="risk pts"
        color={netReduction > 0 ? '#27AE60' : undefined}
        hint={RISK_HINTS.NET_REDUCTION}
        align="right"
      />
    </div>
  );
}
