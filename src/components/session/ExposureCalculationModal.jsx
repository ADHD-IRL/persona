import { X } from 'lucide-react';
import { riskScore, expectedExposure, riskBandFromScore } from '@/lib/risk';

const DEFAULT_CONF = 0.6; // matches expectedExposure's fallback when confidence is null

// Transparent derivation of the confidence-weighted Exposure for a round:
// average over SMEs of (Likelihood × Impact × Confidence). Missing confidence
// counts as 60%. Every number shown is the real value that fed the score.
export default function ExposureCalculationModal({ points = [], avgExposure = 0, peak = null, onClose }) {
  const rows = points.map(p => {
    const score = riskScore(p.l, p.i);
    const c = p.conf == null ? DEFAULT_CONF : Math.min(100, Math.max(0, p.conf)) / 100;
    const exposure = expectedExposure(p.l, p.i, p.conf) ?? 0;
    return { ...p, score, c, exposure, confMissing: p.conf == null };
  });
  const sumExposure = Math.round(rows.reduce((a, r) => a + r.exposure, 0) * 10) / 10;
  const peakBand = peak != null ? riskBandFromScore(peak) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div data-ui="surface" className="w-[600px] max-w-full max-h-[88vh] flex flex-col rounded-lg overflow-hidden"
        style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--wr-border)' }}>
          <div>
            <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>HOW EXPOSURE IS CALCULATED</h3>
            <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              Exposure = average of (Likelihood × Impact × Confidence) across SMEs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{avgExposure}</span>
            <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div data-ui="surface" className="rounded-lg p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
            <p className="text-xs font-bold tracking-wide mb-1" style={{ color: 'var(--wr-text-primary)' }}>
              <span className="font-mono" style={{ color: 'var(--wr-amber)' }}>1. </span>Each SME's exposure
            </p>
            <p className="text-[11px] mb-2 leading-relaxed" style={{ color: 'var(--wr-text-muted)' }}>
              Multiply the SME's likelihood × impact (1–25), then shrink by their confidence. A hedged call barely counts; a confident one counts fully. Missing confidence counts as {Math.round(DEFAULT_CONF * 100)}%.
            </p>
            <div data-ui="surface" className="rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
              <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--wr-bg-card)', color: 'var(--wr-text-muted)' }}>
                    <th className="text-left font-mono font-normal px-2 py-1">SME</th>
                    <th className="text-left font-mono font-normal px-2 py-1">L × I = score</th>
                    <th className="text-left font-mono font-normal px-2 py-1">Confidence</th>
                    <th className="text-right font-mono font-normal px-2 py-1">= exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--wr-border)' }}>
                      <td className="px-2 py-1 truncate" style={{ color: 'var(--wr-text-primary)', maxWidth: 150 }}>
                        {r.name}{r.discipline ? <span style={{ color: 'var(--wr-text-muted)' }}> · {r.discipline}</span> : null}
                      </td>
                      <td className="px-2 py-1 font-mono" style={{ color: 'var(--wr-text-secondary)' }}>{r.l} × {r.i} = {r.score}</td>
                      <td className="px-2 py-1 font-mono" style={{ color: r.confMissing ? 'var(--wr-text-muted)' : 'var(--wr-text-secondary)' }}>
                        {r.confMissing ? `${Math.round(DEFAULT_CONF * 100)}% (default)` : `${r.conf}%`}
                      </td>
                      <td className="px-2 py-1 font-mono text-right" style={{ color: 'var(--wr-text-primary)' }}>{r.exposure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div data-ui="surface" className="rounded-lg p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--wr-text-primary)' }}>
                  <span className="font-mono" style={{ color: 'var(--wr-amber)' }}>2. </span>Panel average
                </p>
                <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--wr-text-muted)' }}>
                  Σ exposures <strong style={{ color: 'var(--wr-text-primary)' }}>{sumExposure}</strong> ÷ <strong style={{ color: 'var(--wr-text-primary)' }}>{rows.length}</strong> SME{rows.length !== 1 ? 's' : ''} = <strong style={{ color: 'var(--wr-text-primary)' }}>{avgExposure}</strong>
                </p>
              </div>
              <span className="text-lg font-bold font-mono flex-shrink-0" style={{ color: 'var(--wr-text-primary)' }}>{avgExposure}</span>
            </div>
          </div>

          {peak != null && (
            <p className="text-[11px] font-mono px-1" style={{ color: 'var(--wr-text-muted)' }}>
              For contrast, <strong style={{ color: peakBand?.color }}>Peak</strong> is the single highest raw score — <strong style={{ color: peakBand?.color }}>{peak}/25 ({peakBand?.label})</strong> — with no confidence weighting and no averaging.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
