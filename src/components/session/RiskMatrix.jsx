import { useMemo, useState, Fragment } from 'react';
import { ChevronDown, ChevronUp, Grid3x3, HelpCircle, Calculator } from 'lucide-react';
import { matrixCellColor, riskScore, riskBandFromScore, likelihoodLabel, impactLabel, expectedExposure } from '@/lib/risk';
import ExposureCalculationModal from '@/components/session/ExposureCalculationModal';

const BANDS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const BAND_COLOR = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };

// Styled hover popover — richer than a native title tooltip.
function Popover({ title, show, children }) {
  if (!show) return null;
  return (
    <div
      className="absolute z-30 left-0 top-full mt-2 w-64 rounded-lg p-3 text-left pointer-events-none"
      style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', boxShadow: '0 8px 28px rgba(0,0,0,0.45)' }}
    >
      <p className="text-[11px] font-bold font-mono tracking-wider mb-1.5" style={{ color: 'var(--wr-amber)' }}>{title}</p>
      <div className="text-[11px] leading-relaxed space-y-1.5" style={{ color: 'var(--wr-text-secondary)' }}>{children}</div>
    </div>
  );
}

// Wraps any trigger with a hover popover.
function WithPopover({ title, body, className, style, children }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={`relative ${className || ''}`}
      style={{ cursor: 'help', ...style }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <Popover title={title} show={show}>{body}</Popover>
    </div>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-mono tracking-wider flex items-center gap-0.5" style={{ color: 'var(--wr-text-muted)' }}>
        {label}<HelpCircle className="w-2.5 h-2.5 opacity-50" />
      </span>
      <span className="text-base font-bold font-mono leading-tight" style={{ color: color || 'var(--wr-text-primary)' }}>{value}</span>
      {sub && <span className="text-[10px]" style={{ color: 'var(--wr-text-muted)' }}>{sub}</span>}
    </div>
  );
}

// Quantified risk for a round, distilled to a compact strip. The full 5×5
// likelihood × impact matrix is available on demand but collapsed by default
// so it doesn't dominate the debate flow.
export default function RiskMatrix({ sessionAgents, agents, round }) {
  const [hover, setHover] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  const agentMap = useMemo(() => Object.fromEntries((agents || []).map(a => [a.id, a])), [agents]);

  const points = useMemo(() => {
    return (sessionAgents || []).map(sa => {
      const l = round === 1 ? sa.round1_likelihood : sa.round2_likelihood;
      const i = round === 1 ? sa.round1_impact : sa.round2_impact;
      const conf = round === 1 ? sa.round1_confidence : sa.round2_confidence;
      if (!l || !i) return null;
      const agent = agentMap[sa.agent_id];
      return { l, i, conf, score: riskScore(l, i), name: agent?.name || 'SME', discipline: agent?.discipline || '' };
    }).filter(Boolean);
  }, [sessionAgents, agentMap, round]);

  const summary = useMemo(() => {
    if (!points.length) return null;
    const scores = points.map(p => p.score);
    const exposures = points.map(p => expectedExposure(p.l, p.i, p.conf) || 0);
    const peak = Math.max(...scores);
    const low = Math.min(...scores);
    const avgExposure = Math.round((exposures.reduce((a, b) => a + b, 0) / points.length) * 10) / 10;
    // Band distribution across SMEs
    const bandCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    points.forEach(p => { const b = riskBandFromScore(p.score).label; if (b) bandCounts[b]++; });
    return { peak, low, spread: peak - low, avgExposure, count: points.length, bandCounts };
  }, [points]);

  if (!points.length) {
    return (
      <div data-ui="surface" className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)' }}>
        No quantified likelihood × impact yet for this round.
      </div>
    );
  }

  const peakBand = riskBandFromScore(summary.peak);
  // Divergence read: a wide spread of scores means the SMEs disagree on risk.
  // Undefined with a single rating — there's nothing to agree or disagree on yet.
  const consensus = summary.count < 2
    ? { label: '—', color: 'var(--wr-text-muted)' }
    : summary.spread === 0
      ? { label: 'Aligned', color: '#27AE60' }
      : summary.spread >= 10
        ? { label: 'Divergent', color: '#C0392B' }
        : summary.spread >= 5
          ? { label: 'Mixed', color: '#D68910' }
          : { label: 'Close', color: '#2E86AB' };

  const cellPoints = {};
  points.forEach(p => { const key = `${p.l}-${p.i}`; (cellPoints[key] = cellPoints[key] || []).push(p); });
  const rows = [5, 4, 3, 2, 1];
  const cols = [1, 2, 3, 4, 5];

  return (
    <div data-ui="surface" className="rounded-lg" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      {/* Compact strip */}
      <div className="flex items-center gap-4 px-3 py-2 flex-wrap">
        <WithPopover
          title="Peak risk"
          body={<>
            <p>The single riskiest call on the table right now — the highest score any one SME gave.</p>
            <p>Each SME rates <strong style={{ color: 'var(--wr-text-primary)' }}>likelihood</strong> and <strong style={{ color: 'var(--wr-text-primary)' }}>impact</strong> from 1 to 5; we multiply them, so scores run 1–25. Right now that's <strong style={{ color: peakBand.color }}>{summary.peak}/25 ({peakBand.label})</strong>.</p>
            <p style={{ color: 'var(--wr-text-muted)' }}>It's the worst case, not an average — one alarmed SME is enough to raise it.</p>
          </>}
        >
          <Stat
            label="PEAK"
            value={<>{summary.peak}<span className="text-[10px]" style={{ color: 'var(--wr-text-muted)' }}>/25</span></>}
            sub={peakBand.label}
            color={peakBand.color}
          />
        </WithPopover>
        <div className="w-px self-stretch" style={{ backgroundColor: 'var(--wr-border)' }} />
        <WithPopover
          title="Exposure"
          body={<>
            <p>The panel's overall risk level, in one number.</p>
            <p>We average every SME's score, but first shrink each one by how sure that SME was. A confident severe call pulls it up; a hedged one barely moves it.</p>
            <p style={{ color: 'var(--wr-text-muted)' }}>It usually sits below Peak because it reflects the whole panel and their uncertainty — not just the loudest alarm.</p>
          </>}
        >
          <Stat label="EXPOSURE" value={summary.avgExposure} sub="confidence-weighted" />
        </WithPopover>
        <div className="w-px self-stretch" style={{ backgroundColor: 'var(--wr-border)' }} />
        <WithPopover
          title="Consensus"
          body={summary.count < 2 ? <>
            <p>Whether the SMEs agree on the risk — <strong style={{ color: 'var(--wr-text-primary)' }}>not available yet</strong>.</p>
            <p>Only one SME has put a number on it so far. There's nothing to agree or disagree on until a second SME rates.</p>
            <p style={{ color: 'var(--wr-text-muted)' }}>Once ≥ 2 have rated, this shows how far apart their scores are: Aligned · Close · Mixed · Divergent.</p>
          </> : <>
            <p>Whether the SMEs actually agree on the risk.</p>
            <p>We look at the gap between the highest and lowest scores — here <strong style={{ color: 'var(--wr-text-primary)' }}>{summary.low} to {summary.peak}</strong> (gap of {summary.spread}).</p>
            <p style={{ color: 'var(--wr-text-muted)' }}>Aligned = everyone matches · Close = gap under 5 · Mixed = 5–9 · Divergent = 10+. A big gap means they don't agree — worth resolving before you trust the number.</p>
          </>}
        >
          <Stat
            label="CONSENSUS"
            value={consensus.label}
            sub={summary.count < 2 ? 'needs 2+ SMEs' : summary.spread > 0 ? `${summary.low}–${summary.peak} spread` : 'all agree'}
            color={consensus.color}
          />
        </WithPopover>

        {/* Band distribution bar */}
        <WithPopover
          className="flex-1 min-w-[140px]"
          title="How the SMEs split"
          body={<>
            <p>Where the {summary.count} SME rating{summary.count !== 1 ? 's' : ''} land across the four risk levels.</p>
            <p>Each colored segment is one level; its width is how many SMEs put the risk there.</p>
            <p style={{ color: 'var(--wr-text-muted)' }}>Levels by score: <span style={{ color: BAND_COLOR.CRITICAL }}>Critical 15–25</span> · <span style={{ color: BAND_COLOR.HIGH }}>High 9–14</span> · <span style={{ color: BAND_COLOR.MEDIUM }}>Medium 4–8</span> · <span style={{ color: BAND_COLOR.LOW }}>Low 1–3</span>.</p>
          </>}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono tracking-wider flex items-center gap-0.5" style={{ color: 'var(--wr-text-muted)' }}>
              {summary.count} SME{summary.count !== 1 ? 's' : ''} RATED <HelpCircle className="w-2.5 h-2.5 opacity-50" />
            </span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
            {BANDS.map(b => {
              const n = summary.bandCounts[b];
              if (!n) return null;
              return <div key={b} title={`${n} ${b}`} style={{ flex: n, backgroundColor: BAND_COLOR[b] }} />;
            })}
          </div>
          <div className="flex gap-2 mt-1 flex-wrap">
            {BANDS.filter(b => summary.bandCounts[b] > 0).map(b => (
              <span key={b} className="text-[10px] font-mono flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: BAND_COLOR[b] }} />
                {summary.bandCounts[b]} {b.toLowerCase()}
              </span>
            ))}
          </div>
        </WithPopover>

        <div className="flex items-center gap-1.5 self-start">
          <button data-ui="action"
            onClick={() => setShowCalc(true)}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--wr-text-secondary)', backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}
            title="Show how Exposure is calculated"
          >
            <Calculator className="w-3 h-3" /> Exposure math
          </button>
          <button data-ui="action"
            onClick={() => setShowGrid(v => !v)}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--wr-text-secondary)', backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}
            title="Show the full likelihood × impact matrix"
          >
            <Grid3x3 className="w-3 h-3" /> Matrix {showGrid ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {showCalc && (
        <ExposureCalculationModal
          points={points}
          avgExposure={summary.avgExposure}
          peak={summary.peak}
          onClose={() => setShowCalc(false)}
        />
      )}

      {/* Full 5×5 matrix — collapsed by default */}
      {showGrid && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--wr-border)' }}>
          <p className="text-[10px] mt-2 mb-2 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            Each cell counts the SMEs whose top {round === 1 ? 'Round 1' : 'Round 2'} risk lands there. Likelihood (rows) × Impact (cols).
          </p>
          <div className="flex gap-2">
            <div className="flex items-center">
              <span className="text-[10px] font-mono" style={{ color: 'var(--wr-text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>LIKELIHOOD →</span>
            </div>
            <div className="flex-1 max-w-md">
              <div className="grid" style={{ gridTemplateColumns: 'auto repeat(5, 1fr)', gap: 3 }}>
                {rows.map(l => (
                  <Fragment key={`row-${l}`}>
                    <div className="flex items-center justify-end pr-1">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--wr-text-muted)' }}>{l}</span>
                    </div>
                    {cols.map(i => {
                      const key = `${l}-${i}`;
                      const pts = cellPoints[key] || [];
                      const bg = matrixCellColor(l, i);
                      const isHover = hover === key;
                      return (
                        <div data-ui="surface"
                          key={key}
                          onMouseEnter={() => pts.length && setHover(key)}
                          onMouseLeave={() => setHover(null)}
                          className="relative rounded flex items-center justify-center"
                          style={{
                            aspectRatio: '1.8', backgroundColor: `${bg}22`,
                            border: `1px solid ${bg}${pts.length ? '99' : '33'}`,
                            outline: isHover ? `2px solid ${bg}` : 'none',
                          }}
                        >
                          {pts.length > 0 && <span className="text-xs font-bold font-mono" style={{ color: bg }}>{pts.length}</span>}
                          {isHover && (
                            <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-1 rounded p-2 w-48 pointer-events-none"
                              style={{ backgroundColor: 'var(--wr-bg-card)', border: `1px solid ${bg}`, boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
                              <p className="text-xs font-mono mb-1" style={{ color: bg }}>
                                {likelihoodLabel(l)} × {impactLabel(i)} = {riskScore(l, i)}
                              </p>
                              {pts.map((p, idx) => (
                                <p key={idx} className="text-xs truncate" style={{ color: 'var(--wr-text-secondary)' }}>
                                  {p.name}{p.conf != null ? ` · ${p.conf}%` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
                <div />
                {cols.map(i => (
                  <div key={`xnum-${i}`} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--wr-text-muted)' }}>{i}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-[10px] font-mono mt-1" style={{ color: 'var(--wr-text-muted)' }}>IMPACT →</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
