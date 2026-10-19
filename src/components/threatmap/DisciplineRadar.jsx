import { useState, useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import { Info, TrendingUp } from 'lucide-react';

const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#E67E22', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const SEV_ORDER  = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const MAX_RADAR  = 12; // radar gets cluttered beyond ~12 axes

function getRisk(score) {
  if (score >= 30) return { label: 'CRITICAL', color: '#C0392B', bg: 'rgba(192,57,43,0.15)' };
  if (score >= 15) return { label: 'HIGH',     color: '#E67E22', bg: 'rgba(230,126,34,0.15)' };
  if (score >= 5)  return { label: 'MEDIUM',   color: '#2E86AB', bg: 'rgba(46,134,171,0.15)' };
  return           { label: 'LOW',      color: '#27AE60', bg: 'rgba(39,174,96,0.15)' };
}

// ── Info tooltip ──────────────────────────────────────────────────────────────
function InfoTip({ children, align = 'right' }) {
  const [show, setShow] = useState(false);
  const pos = align === 'right'
    ? { left: 22, top: -4 }
    : { right: 22, top: -4 };
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <Info
        className="w-3.5 h-3.5 cursor-help flex-shrink-0"
        style={{ color: 'var(--wr-text-muted)' }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div style={{
          position: 'absolute', zIndex: 60, width: 240,
          padding: '10px 12px', borderRadius: 6,
          backgroundColor: '#0D1B2A', border: '1px solid var(--wr-border)',
          color: 'var(--wr-text-secondary)', fontSize: 11, lineHeight: 1.6,
          pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          ...pos,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Radar hover tooltip ───────────────────────────────────────────────────────
function RadarTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const risk = getRisk(d.score);
  return (
    <div style={{
      backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)',
      borderRadius: 6, padding: '10px 14px', minWidth: 190,
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    }}>
      <p style={{ color: 'var(--wr-amber)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
        {d.fullDiscipline}
      </p>
      <span style={{
        display: 'inline-block', backgroundColor: risk.bg, borderRadius: 3,
        padding: '1px 6px', marginBottom: 8,
        color: risk.color, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
      }}>
        {risk.label} RISK
      </span>
      <div style={{ fontSize: 11 }}>
        {SEV_ORDER.map(s => d[s] > 0 && (
          <div key={s} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: SEV_COLORS[s] }}>{s}</span>
            <span style={{ color: 'var(--wr-text-primary)', fontWeight: 600 }}>{d[s]}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--wr-border)',
        }}>
          <span style={{ color: 'var(--wr-text-muted)' }}>Exposure Score</span>
          <span style={{ color: risk.color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{d.score}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--wr-text-muted)' }}>Agents</span>
          <span style={{ color: 'var(--wr-text-secondary)' }}>{d.agentCount}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DisciplineRadar({ groups, axisLabel }) {
  // groups come pre-scored and pre-sorted from buildGroups()
  const allData = useMemo(() => {
    return groups.map(g => ({
      discipline:     g.name.length > 18 ? g.name.slice(0, 16) + '…' : g.name,
      fullDiscipline: g.name,
      score: g.score,
      agentCount: g.agents.length,
      total: g.total,
      isUnassigned: g.isUnassigned,
      ...g.counts,
    }));
  }, [groups]);

  // Radar only shows top N to stay legible
  const radarData  = allData.slice(0, MAX_RADAR);
  const hasRadar   = radarData.length >= 3;
  const hasOverflow = allData.length > MAX_RADAR;

  if (allData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded"
        style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>
          Nothing to chart yet. Add agents and threats with domain assignments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header row */}
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
          {axisLabel.toUpperCase()} THREAT EXPOSURE
        </h2>
        <InfoTip>
          <span style={{ color: 'var(--wr-amber)', fontWeight: 700 }}>How to read this chart</span>
          <br />
          Each spoke is one {axisLabel}. The further the shape extends along a spoke, the greater its threat exposure.
          <br /><br />
          <span style={{ fontWeight: 600 }}>Exposure Score</span> = Critical×4 + High×3 + Medium×2 + Low×1
          <br /><br />
          Risk bands:&nbsp;
          <span style={{ color: '#C0392B', fontWeight: 700 }}>CRITICAL</span> ≥ 30 ·&nbsp;
          <span style={{ color: '#E67E22', fontWeight: 700 }}>HIGH</span> ≥ 15 ·&nbsp;
          <span style={{ color: '#2E86AB', fontWeight: 700 }}>MEDIUM</span> ≥ 5 ·&nbsp;
          <span style={{ color: '#27AE60', fontWeight: 700 }}>LOW</span> &lt; 5
        </InfoTip>
        {hasOverflow && (
          <span className="text-xs ml-auto" style={{ color: 'var(--wr-text-muted)' }}>
            Radar: top {MAX_RADAR} of {allData.length} · all shown in ranking
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* ── Left: Radar chart ──────────────────────────────────────────── */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <p className="text-xs mb-1 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            {hasOverflow ? `TOP ${MAX_RADAR} BY SCORE` : `ALL ${axisLabel.toUpperCase()}S`}
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>
            Hover a spoke to see the breakdown
          </p>

          {!hasRadar ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-1">
                <p className="text-sm" style={{ color: 'var(--wr-text-secondary)' }}>
                  Need at least 3 rows to render a radar
                </p>
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                  {allData.length} found — see the Risk Ranking panel →
                </p>
              </div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={380}>
                <RadarChart data={radarData} margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
                  <PolarGrid stroke="rgba(255,255,255,0.07)" />
                  <PolarAngleAxis
                    dataKey="discipline"
                    tick={{ fill: 'var(--wr-text-secondary)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  <PolarRadiusAxis
                    tickCount={4}
                    tick={{ fill: 'var(--wr-text-muted)', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Radar
                    name="Exposure"
                    dataKey="score"
                    stroke="#F0A500"
                    fill="#F0A500"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    dot={{ fill: '#F0A500', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#F0A500', stroke: '#fff', strokeWidth: 1 }}
                  />
                  <Tooltip content={<RadarTip />} />
                </RadarChart>
              </ResponsiveContainer>

              {/* Score band legend */}
              <div className="flex justify-center gap-4 mt-2">
                {[
                  { label: 'CRITICAL', color: '#C0392B', range: '≥30' },
                  { label: 'HIGH',     color: '#E67E22', range: '≥15' },
                  { label: 'MEDIUM',   color: '#2E86AB', range: '≥5'  },
                  { label: 'LOW',      color: '#27AE60', range: '<5'   },
                ].map(({ label, color, range }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{label}</span>
                    <span className="text-xs" style={{ color: 'var(--wr-text-muted)', opacity: 0.5 }}>{range}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right: Risk ranking ────────────────────────────────────────── */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
            <span className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>RISK RANKING</span>
            <InfoTip align="left">
              Ranked by exposure score (highest risk first).
              <br /><br />
              The colored bar shows the <span style={{ fontWeight: 600 }}>severity mix</span>:
              <br />
              <span style={{ color: '#C0392B' }}>■</span> Critical &nbsp;
              <span style={{ color: '#E67E22' }}>■</span> High &nbsp;
              <span style={{ color: '#2E86AB' }}>■</span> Medium &nbsp;
              <span style={{ color: '#27AE60' }}>■</span> Low
            </InfoTip>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>Score = C×4 + H×3 + M×2 + L×1</p>

          <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 380 }}>
            {allData.map((d, i) => {
              const risk  = getRisk(d.score);
              const total = SEV_ORDER.reduce((s, k) => s + d[k], 0);
              const pct   = v => total ? (v / total) * 100 : 0;
              return (
                <div data-ui="surface" key={d.fullDiscipline} className="rounded p-2.5"
                  style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>

                  {/* Rank · name · badge · score */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono font-bold flex-shrink-0"
                      style={{ color: 'var(--wr-text-muted)', minWidth: 16 }}>
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold flex-1 truncate"
                      style={{ color: 'var(--wr-text-primary)' }}
                      title={d.fullDiscipline}>
                      {d.fullDiscipline}
                    </span>
                    <span data-ui="badge" className="text-xs font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: risk.bg, color: risk.color }}>
                      {risk.label}
                    </span>
                    <span className="text-xs font-mono font-bold flex-shrink-0 text-right"
                      style={{ color: risk.color, minWidth: 24 }}>
                      {d.score}
                    </span>
                  </div>

                  {/* Severity bar */}
                  {total > 0 && (
                    <div className="flex rounded overflow-hidden mb-1.5"
                      style={{ height: 4, gap: 1, marginLeft: 20 }}>
                      {SEV_ORDER.map(s => d[s] > 0 && (
                        <div key={s} style={{ width: `${pct(d[s])}%`, backgroundColor: SEV_COLORS[s] }} />
                      ))}
                    </div>
                  )}

                  {/* Severity counts + agent count */}
                  <div className="flex items-center gap-3" style={{ marginLeft: 20 }}>
                    {SEV_ORDER.map(s => d[s] > 0 && (
                      <span key={s} className="text-xs font-mono" style={{ color: SEV_COLORS[s] }}>
                        {d[s]}{s[0]}
                      </span>
                    ))}
                    <span className="text-xs ml-auto" style={{ color: 'var(--wr-text-muted)' }}>
                      {d.agentCount} agent{d.agentCount !== 1 ? 's' : ''}
                    </span>
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
