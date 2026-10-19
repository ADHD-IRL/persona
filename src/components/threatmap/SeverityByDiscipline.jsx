import { useState, useMemo } from 'react';
import { Info, TrendingUp, LayoutGrid } from 'lucide-react';
import { categoriesOf } from './mapUtils';

const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#E67E22', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const SEV_BG     = {
  CRITICAL: 'rgba(192,57,43,0.18)',
  HIGH:     'rgba(230,126,34,0.18)',
  MEDIUM:   'rgba(46,134,171,0.18)',
  LOW:      'rgba(39,174,96,0.18)',
};
const SEV_ORDER  = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// ── Info tooltip ──────────────────────────────────────────────────────────────
function InfoTip({ children, align = 'right' }) {
  const [show, setShow] = useState(false);
  const pos = align === 'right' ? { left: 22, top: -4 } : { right: 22, top: -4 };
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

// ── Main component ────────────────────────────────────────────────────────────
export default function SeverityByDiscipline({ groups, axisLabel, onSelect }) {
  const [hoveredCell, setHoveredCell]       = useState(null);
  const [cellTooltipPos, setCellTooltipPos] = useState({ x: 0, y: 0 });

  const threats = useMemo(() => groups.flatMap(g => g.threats), [groups]);
  const categories = useMemo(() => categoriesOf(threats), [threats]);

  // Overall severity totals
  const summaryStats = useMemo(() =>
    SEV_ORDER.map(s => ({ s, count: threats.filter(t => t.severity === s).length })),
    [threats]
  );

  // Rows come pre-scored/sorted from buildGroups()
  const discData = useMemo(() =>
    groups.map(g => ({ disc: g.name, group: g, counts: g.counts, score: g.score, total: g.total })),
    [groups]
  );

  const maxTotal = Math.max(...discData.map(d => d.total), 1);

  // Group × Category intersection matrix
  const matrixData = useMemo(() => {
    return discData.map(({ disc, group }) => ({
      disc,
      group,
      cells: categories.map(cat => {
        const rel = group.threats.filter(t => (t.category || 'Uncategorized') === cat);
        const counts = Object.fromEntries(SEV_ORDER.map(s => [s, rel.filter(t => t.severity === s).length]));
        const topSev = SEV_ORDER.find(s => counts[s] > 0) || null;
        return { cat, topSev, counts, total: rel.length };
      }),
    }));
  }, [discData, categories]);

  if (groups.length === 0) {
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

      {/* ── 1. Summary severity cards ─────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {summaryStats.map(({ s, count }) => {
          const pct = threats.length ? Math.round((count / threats.length) * 100) : 0;
          return (
            <div data-ui="surface" key={s} className="rounded p-4"
              style={{ backgroundColor: 'var(--wr-bg-card)', border: `1px solid ${SEV_COLORS[s]}40` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono font-bold tracking-wider" style={{ color: SEV_COLORS[s] }}>
                  {s}
                </span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SEV_COLORS[s] }} />
              </div>
              <p className="text-3xl font-bold font-mono leading-none" style={{ color: SEV_COLORS[s] }}>{count}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>threats</p>
                <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{pct}%</p>
              </div>
              {/* Mini bar */}
              <div className="mt-2 rounded-full overflow-hidden" style={{ height: 3, backgroundColor: 'var(--wr-bg-secondary)' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: SEV_COLORS[s] }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2. Discipline severity breakdown (horizontal bars) ────────── */}
      <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
          <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            SEVERITY BY {axisLabel.toUpperCase()}
          </h2>
          <InfoTip>
            <span style={{ color: 'var(--wr-amber)', fontWeight: 700 }}>How to read</span><br />
            Each row is one {axisLabel}. The bar shows how many threats it faces, split by severity.<br /><br />
            Rows are sorted by <span style={{ fontWeight: 600 }}>exposure score</span>:<br />
            Critical×4 + High×3 + Medium×2 + Low×1<br /><br />
            Bar length is proportional to the highest-count discipline. Numbers inside segments show the count.
          </InfoTip>
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>
          Sorted by risk exposure · bar length proportional to threat count
        </p>

        <div className="space-y-2">
          {discData.map(({ disc, group, counts, total }) => (
            <div key={disc} className="flex items-center gap-3" style={{ cursor: total > 0 ? 'pointer' : 'default' }}
              onClick={() => total > 0 && onSelect?.({ group, category: null })}>
              {/* Label */}
              <div className="flex-shrink-0 text-right" style={{ width: 148 }}>
                <span className="text-xs font-mono" style={{ color: 'var(--wr-text-secondary)' }}
                  title={disc}>
                  {disc.length > 20 ? disc.slice(0, 18) + '…' : disc}
                </span>
              </div>

              {/* Bar */}
              <div className="flex-1 relative rounded" style={{ height: 22, backgroundColor: 'var(--wr-bg-secondary)' }}>
                {total > 0 && (
                  <div className="absolute left-0 top-0 bottom-0 flex rounded overflow-hidden"
                    style={{ width: `${(total / maxTotal) * 100}%` }}>
                    {SEV_ORDER.map(s => counts[s] > 0 && (
                      <div key={s}
                        style={{
                          flex: counts[s],
                          backgroundColor: SEV_COLORS[s],
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        title={`${s}: ${counts[s]}`}
                      >
                        {(counts[s] / total) > 0.08 && (
                          <span style={{
                            color: 'rgba(255,255,255,0.9)', fontSize: 9,
                            fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                          }}>
                            {counts[s]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total count */}
              <div className="flex-shrink-0 text-right" style={{ width: 28 }}>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>{total}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t" style={{ borderColor: 'var(--wr-border)' }}>
          {SEV_ORDER.map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SEV_COLORS[s] }} />
              <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{s}</span>
            </div>
          ))}
          <span className="text-xs ml-auto" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>
            Counts shown inside segments
          </span>
        </div>
      </div>

      {/* ── 3. Discipline × Category matrix ──────────────────────────── */}
      {categories.length > 0 && (
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              {axisLabel.toUpperCase()} × CATEGORY MAP
            </h2>
            <InfoTip>
              <span style={{ color: 'var(--wr-amber)', fontWeight: 700 }}>How to read</span><br />
              Rows = {axisLabel}s · Columns = threat categories.<br />
              Each cell shows the <span style={{ fontWeight: 600 }}>highest severity</span> at that intersection and the total count.<br /><br />
              <span style={{ color: '#C0392B' }}>■</span> Critical &nbsp;
              <span style={{ color: '#E67E22' }}>■</span> High &nbsp;
              <span style={{ color: '#2E86AB' }}>■</span> Medium &nbsp;
              <span style={{ color: '#27AE60' }}>■</span> Low<br /><br />
              <span style={{ fontWeight: 600 }}>Empty (dark) cells</span> = no threats recorded at that intersection — a potential <span style={{ fontWeight: 600 }}>coverage gap</span>.
            </InfoTip>
          </div>
          <p className="text-xs mb-5" style={{ color: 'var(--wr-text-muted)', opacity: 0.6 }}>
            Cell color = highest severity · number = threat count · empty = coverage gap
          </p>

          <div className="overflow-x-auto">
            <table style={{ borderCollapse: 'separate', borderSpacing: '3px', minWidth: '100%' }}>
              <thead>
                <tr>
                  {/* Corner spacer */}
                  <th style={{ width: 156 }} />
                  {categories.map(cat => (
                    <th key={cat} style={{ padding: '0 2px 8px', verticalAlign: 'bottom', textAlign: 'center' }}>
                      <div style={{
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        fontSize: 9,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--wr-text-muted)',
                        whiteSpace: 'nowrap',
                        maxHeight: 84,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                        title={cat}
                      >
                        {cat.length > 18 ? cat.slice(0, 16) + '…' : cat}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixData.map(({ disc, group, cells }) => (
                  <tr key={disc}>
                    {/* Discipline label */}
                    <td style={{ paddingRight: 10, textAlign: 'right', verticalAlign: 'middle' }}>
                      <span style={{
                        fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--wr-text-secondary)', whiteSpace: 'nowrap',
                      }}
                        title={disc}
                      >
                        {disc.length > 20 ? disc.slice(0, 18) + '…' : disc}
                      </span>
                    </td>

                    {/* Cells */}
                    {cells.map(({ cat, topSev, counts, total }) => (
                      <td key={cat} style={{ padding: 0 }}>
                        <div
                          style={{
                            width: 32, height: 32, borderRadius: 4,
                            backgroundColor: topSev ? SEV_BG[topSev] : 'rgba(255,255,255,0.03)',
                            border: topSev
                              ? `1px solid ${SEV_COLORS[topSev]}55`
                              : '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: total > 0 ? 'pointer' : 'default',
                          }}
                          onClick={() => total > 0 && onSelect?.({ group, category: cat })}
                          onMouseEnter={e => {
                            if (total > 0) {
                              setHoveredCell({ disc, cat, counts, total, topSev });
                              setCellTooltipPos({ x: e.clientX, y: e.clientY });
                            }
                          }}
                          onMouseMove={e => {
                            if (total > 0) setCellTooltipPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          {topSev && (
                            <span style={{
                              fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                              fontWeight: 700, color: SEV_COLORS[topSev],
                            }}>
                              {total}
                            </span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Matrix legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t" style={{ borderColor: 'var(--wr-border)' }}>
            {SEV_ORDER.map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded" style={{
                  backgroundColor: SEV_BG[s],
                  border: `1px solid ${SEV_COLORS[s]}55`,
                }} />
                <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{s}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded" style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }} />
              <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>NO THREATS</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating cell tooltip ──────────────────────────────────────── */}
      {hoveredCell && (() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const tw = 190, th = 140;
        const x = cellTooltipPos.x + 14;
        const y = cellTooltipPos.y + 14;
        return (
          <div style={{
            position: 'fixed',
            left: x + tw > vw ? cellTooltipPos.x - tw - 8 : x,
            top:  y + th > vh ? cellTooltipPos.y - th - 8 : y,
            zIndex: 9999, pointerEvents: 'none',
            backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)',
            borderRadius: 6, padding: '10px 12px', minWidth: tw,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            <p style={{ color: 'var(--wr-amber)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, marginBottom: 2 }}>
              {hoveredCell.disc}
            </p>
            <p style={{ color: 'var(--wr-text-muted)', fontSize: 10, marginBottom: 8 }}>
              {hoveredCell.cat}
            </p>
            {SEV_ORDER.map(s => hoveredCell.counts[s] > 0 && (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: SEV_COLORS[s] }}>{s}</span>
                <span style={{ color: 'var(--wr-text-primary)', fontWeight: 600 }}>{hoveredCell.counts[s]}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 11,
              marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--wr-border)',
            }}>
              <span style={{ color: 'var(--wr-text-muted)' }}>Total</span>
              <span style={{ color: 'var(--wr-text-primary)', fontWeight: 700 }}>{hoveredCell.total}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
