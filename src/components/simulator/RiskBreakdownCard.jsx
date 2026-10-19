import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { getPosture } from '@/lib/scrsEngine';
import MetricHint, { HintDot } from '@/components/ui/MetricHint';
import { RISK_HINTS } from '@/lib/riskGlossary';
import ScrsCalculationModal from './ScrsCalculationModal';

export default function RiskBreakdownCard({ breakdown, scrs, previousScrs }) {
  const posture = getPosture(scrs);
  const delta   = previousScrs !== undefined ? scrs - previousScrs : null;
  const [showCalc, setShowCalc] = useState(false);

  const Row = ({ label, value, note, color, hint }) => {
    const inner = (
      <>
        <div>
          <p className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--wr-text-secondary)' }}>
            {label}{hint && <HintDot />}
          </p>
          {note && <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{note}</p>}
        </div>
        <span className="text-sm font-bold font-mono" style={{ color: color || 'var(--wr-text-primary)' }}>
          {value}
        </span>
      </>
    );
    const cls = 'flex items-center justify-between py-2 border-b last:border-0';
    if (!hint) return <div className={cls} style={{ borderColor: 'var(--wr-border)' }}>{inner}</div>;
    return (
      <MetricHint title={hint.title} body={hint.body} className={cls} style={{ borderColor: 'var(--wr-border)' }}>
        {inner}
      </MetricHint>
    );
  };

  return (
    <>
    <div data-ui="surface" className="rounded-lg overflow-hidden"
      style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--wr-border)' }}>
        <p className="text-xs font-bold tracking-widest font-mono"
          style={{ color: 'var(--wr-text-muted)' }}>RISK BREAKDOWN</p>
        <div className="flex items-center gap-2">
          {delta !== null && delta !== 0 && (
            <span data-ui="badge" className="text-xs font-bold font-mono px-2 py-0.5 rounded"
              style={{
                color: delta < 0 ? '#27AE60' : '#C0392B',
                backgroundColor: delta < 0 ? 'rgba(39,174,96,0.1)' : 'rgba(192,57,43,0.1)',
              }}>
              {delta > 0 ? '+' : ''}{delta} pts
            </span>
          )}
          <button data-ui="action" onClick={() => setShowCalc(true)}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors hover:bg-white/5"
            style={{ color: 'var(--wr-text-secondary)', backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}
            title="Show how this score is calculated">
            <Calculator className="w-3 h-3" /> Show calculation
          </button>
        </div>
      </div>
      <div className="px-4 divide-y" style={{ divideColor: 'var(--wr-border)' }}>
        <Row
          label="Base Score"
          note={`${breakdown?.agentCount || 0} agent findings, expertise-weighted`}
          value={`${breakdown?.baseScore ?? 0}`}
          color="var(--wr-text-primary)"
          hint={RISK_HINTS.BASE_SCORE}
        />
        <Row
          label="Chain Resilience"
          note="Brittle chains reduce score"
          value={`${breakdown?.resilienceModifier ?? 0}`}
          color={breakdown?.resilienceModifier < 0 ? '#27AE60' : 'var(--wr-text-muted)'}
          hint={RISK_HINTS.CHAIN_RESILIENCE}
        />
        <Row
          label="Countermeasure Coverage"
          note={`${breakdown?.coveredHighSteps ?? 0} / ${breakdown?.totalHighSteps ?? 0} HIGH-leverage steps covered`}
          value={`${breakdown?.countermeasureModifier ?? 0}`}
          color={breakdown?.countermeasureModifier < 0 ? '#27AE60' : 'var(--wr-text-muted)'}
          hint={RISK_HINTS.COUNTERMEASURE_COVERAGE}
        />
        <MetricHint title={RISK_HINTS.SCRS.title} body={RISK_HINTS.SCRS.body} className="flex items-center justify-between py-3">
          <p className="text-sm font-bold flex items-center gap-1" style={{ color: 'var(--wr-text-primary)' }}>
            SCRS<HintDot />
          </p>
          <span className="text-xl font-bold font-mono" style={{ color: posture.color }}>
            {scrs} / 100
          </span>
        </MetricHint>
      </div>
    </div>
    {showCalc && <ScrsCalculationModal breakdown={breakdown} scrs={scrs} onClose={() => setShowCalc(false)} />}
    </>
  );
}
