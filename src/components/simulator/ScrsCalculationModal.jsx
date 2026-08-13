import { X } from 'lucide-react';
import { SEV_WEIGHT, EXPERTISE_MULTIPLIER, RESILIENCE_MODIFIER, getPosture } from '@/lib/scrsEngine';

const GREEN = '#27AE60';
const SEV_COLOR = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };

// A numbered derivation step with its running result on the right.
function Step({ n, title, subtitle, result, resultColor, children }) {
  return (
    <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--wr-text-primary)' }}>
            <span className="font-mono" style={{ color: 'var(--wr-amber)' }}>{n}. </span>{title}
          </p>
          {subtitle && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--wr-text-muted)' }}>{subtitle}</p>}
        </div>
        {result != null && (
          <span className="text-lg font-bold font-mono flex-shrink-0" style={{ color: resultColor || 'var(--wr-text-primary)' }}>{result}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// Full, transparent derivation of the SCRS from the breakdown that computeSCRS
// returns. Every number shown is the real value that fed the score.
export default function ScrsCalculationModal({ breakdown = {}, scrs = 0, onClose }) {
  const posture = getPosture(scrs);
  const {
    contributions = [], weightedSum = 0, maxPossible = 0, baseScore = 0,
    chainContributions = [], resilienceRaw = 0, resilienceModifier = 0, resilienceCapped = false,
    coveredHighSteps = 0, totalHighSteps = 0, coveragePct = 0, countermeasureModifier = 0, ccmMax = 20,
    rawScrs = 0,
  } = breakdown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div className="w-[640px] max-w-full max-h-[88vh] flex flex-col rounded-lg overflow-hidden"
        style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--wr-border)' }}>
          <div>
            <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>HOW THIS SCORE IS CALCULATED</h3>
            <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              SCRS = Base Score + Chain Resilience + Countermeasure Coverage, clamped 0–100
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: posture.color }}>{scrs}</span>
            <button onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Step 1 — Base Score */}
          <Step
            n={1}
            title="Base Score"
            subtitle="Each SME's top severity, weighted by the SME's expertise, normalised to 0–100."
            result={Math.round(baseScore)}
            resultColor="var(--wr-text-primary)"
          >
            <p className="text-[10px] font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>
              Severity weight: <span style={{ color: SEV_COLOR.CRITICAL }}>CRITICAL {SEV_WEIGHT.CRITICAL}</span> · <span style={{ color: SEV_COLOR.HIGH }}>HIGH {SEV_WEIGHT.HIGH}</span> · <span style={{ color: SEV_COLOR.MEDIUM }}>MEDIUM {SEV_WEIGHT.MEDIUM}</span> · <span style={{ color: SEV_COLOR.LOW }}>LOW {SEV_WEIGHT.LOW}</span>
              {'  ×  '}expertise: {Object.entries(EXPERTISE_MULTIPLIER).map(([k, v]) => `${k} ${v}`).join(' · ')}
            </p>
            {contributions.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No rated findings yet — base score is 0.</p>
            ) : (
              <>
                <div className="rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
                  <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--wr-bg-card)', color: 'var(--wr-text-muted)' }}>
                        <th className="text-left font-mono font-normal px-2 py-1">SME</th>
                        <th className="text-left font-mono font-normal px-2 py-1">Severity (weight)</th>
                        <th className="text-left font-mono font-normal px-2 py-1">Expertise (×mult)</th>
                        <th className="text-right font-mono font-normal px-2 py-1">= weighted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributions.map((c, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--wr-border)' }}>
                          <td className="px-2 py-1 truncate" style={{ color: 'var(--wr-text-primary)', maxWidth: 160 }}>
                            {c.name}{c.discipline ? <span style={{ color: 'var(--wr-text-muted)' }}> · {c.discipline}</span> : null}
                          </td>
                          <td className="px-2 py-1 font-mono" style={{ color: SEV_COLOR[c.severity] || 'var(--wr-text-secondary)' }}>{c.severity} ({c.sevWeight})</td>
                          <td className="px-2 py-1 font-mono" style={{ color: 'var(--wr-text-secondary)' }}>{c.expertiseLevel} (×{c.multiplier})</td>
                          <td className="px-2 py-1 font-mono text-right" style={{ color: 'var(--wr-text-primary)' }}>{c.weighted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] font-mono mt-2" style={{ color: 'var(--wr-text-muted)' }}>
                  Σ weighted = <strong style={{ color: 'var(--wr-text-primary)' }}>{weightedSum}</strong> ÷ max possible <strong style={{ color: 'var(--wr-text-primary)' }}>{maxPossible}</strong>
                  {' '}(all rating CRITICAL at World-Class) × 100 = <strong style={{ color: 'var(--wr-text-primary)' }}>{Math.round(baseScore)}</strong>
                </p>
              </>
            )}
          </Step>

          {/* Step 2 — Chain Resilience */}
          <Step
            n={2}
            title="Chain Resilience"
            subtitle="Brittle kill chains are easy to break, so they reduce risk (down to −25). Robust chains hold and subtract nothing."
            result={resilienceModifier === 0 ? '0' : resilienceModifier}
            resultColor={resilienceModifier < 0 ? GREEN : 'var(--wr-text-muted)'}
          >
            {chainContributions.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No chains analysed — modifier is 0.</p>
            ) : (
              <>
                <div className="space-y-1">
                  {chainContributions.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="truncate" style={{ color: 'var(--wr-text-secondary)', maxWidth: 380 }}>{c.name}</span>
                      <span className="font-mono flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>
                        {c.resilience} → <span style={{ color: c.modifier < 0 ? GREEN : 'var(--wr-text-muted)' }}>{c.modifier}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] font-mono mt-2" style={{ color: 'var(--wr-text-muted)' }}>
                  Sum = <strong style={{ color: 'var(--wr-text-primary)' }}>{resilienceRaw}</strong>
                  {resilienceCapped && <> (capped at −25)</>} → <strong style={{ color: resilienceModifier < 0 ? GREEN : 'var(--wr-text-primary)' }}>{resilienceModifier}</strong>
                </p>
                <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--wr-text-muted)' }}>
                  Modifiers: {Object.entries(RESILIENCE_MODIFIER).map(([k, v]) => `${k} ${v}`).join(' · ')}
                </p>
              </>
            )}
          </Step>

          {/* Step 3 — Countermeasure Coverage */}
          <Step
            n={3}
            title="Countermeasure Coverage"
            subtitle={`Applied countermeasures on HIGH-leverage steps reduce the score, up to −${ccmMax}.`}
            result={countermeasureModifier === 0 ? '0' : countermeasureModifier}
            resultColor={countermeasureModifier < 0 ? GREEN : 'var(--wr-text-muted)'}
          >
            {totalHighSteps === 0 ? (
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No HIGH-leverage steps to cover — modifier is 0.</p>
            ) : (
              <p className="text-[11px] font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                <strong style={{ color: 'var(--wr-text-primary)' }}>{coveredHighSteps}</strong> of <strong style={{ color: 'var(--wr-text-primary)' }}>{totalHighSteps}</strong> HIGH-leverage steps covered
                {' = '}<strong style={{ color: 'var(--wr-text-primary)' }}>{coveragePct}%</strong> × −{ccmMax} = <strong style={{ color: countermeasureModifier < 0 ? GREEN : 'var(--wr-text-primary)' }}>{countermeasureModifier}</strong>
              </p>
            )}
          </Step>

          {/* Step 4 — Final */}
          <Step n={4} title="Final SCRS" subtitle="The three parts combined, then clamped to the 0–100 range.">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                {Math.round(baseScore)} {resilienceModifier < 0 ? '−' : '+'} {Math.abs(resilienceModifier)} {countermeasureModifier < 0 ? '−' : '+'} {Math.abs(countermeasureModifier)}
                {' = '}<strong style={{ color: 'var(--wr-text-primary)' }}>{rawScrs}</strong>{rawScrs !== scrs && <> → clamp</>}
              </p>
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded" style={{ color: posture.color, backgroundColor: posture.bg, border: `1px solid ${posture.border}` }}>
                {scrs} · {posture.label}
              </span>
            </div>
          </Step>
        </div>
      </div>
    </div>
  );
}
