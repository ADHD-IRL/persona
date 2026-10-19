import { useMemo, useState, useCallback } from 'react';
import { SEV_ORDER as SEVERITIES, SEV_COLORS, categoriesOf, normSev } from './mapUtils';

const TOOLTIP_W = 340;
const TOOLTIP_H = 360; // conservative max height estimate

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

// groups: from buildGroups() — rows. onSelect({ group, category }) opens drill-down.
export default function ThreatHeatmap({ groups, axisLabel, onSelect }) {
  const [hovered, setHovered] = useState(null); // { groupId, cat }
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showEmpty, setShowEmpty] = useState(false);

  const handleMouseMove = useCallback((e) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = e.clientX + 18;
    const y = e.clientY + 18;
    setTooltipPos({
      x: x + TOOLTIP_W > vw ? e.clientX - TOOLTIP_W - 10 : x,
      y: y + TOOLTIP_H > vh ? e.clientY - TOOLTIP_H - 10 : y,
    });
  }, []);

  // Rows with no threats are hidden by default — they turn the map into a wall of blanks
  const visibleGroups = useMemo(
    () => (showEmpty ? groups : groups.filter(g => g.total > 0)),
    [groups, showEmpty]
  );
  const emptyCount = groups.length - groups.filter(g => g.total > 0).length;

  const categories = useMemo(
    () => categoriesOf(groups.flatMap(g => g.threats)),
    [groups]
  );

  // cell data per group × category
  const heatData = useMemo(() => {
    const map = {};
    visibleGroups.forEach(g => {
      map[g.id] = {};
      categories.forEach(cat => {
        const cellThreats = g.threats.filter(t => (t.category || 'Uncategorized') === cat);
        const severities = {};
        let maxSev = null;
        cellThreats.forEach(t => {
          const sev = normSev(t.severity);
          severities[sev] = (severities[sev] || 0) + 1;
          if (!maxSev || SEVERITIES.indexOf(sev) < SEVERITIES.indexOf(maxSev)) maxSev = sev;
        });
        map[g.id][cat] = {
          count: cellThreats.length,
          maxSev,
          severities,
          threatList: cellThreats.map(t => ({ name: t.name || 'Unnamed', severity: normSev(t.severity) })),
        };
      });
    });
    return map;
  }, [visibleGroups, categories]);

  const maxCount = useMemo(() => {
    let m = 0;
    visibleGroups.forEach(g => categories.forEach(c => {
      if (heatData[g.id]?.[c]?.count > m) m = heatData[g.id][c].count;
    }));
    return Math.max(m, 1);
  }, [heatData, visibleGroups, categories]);

  const catTotals = useMemo(() => {
    const t = {};
    categories.forEach(cat => {
      t[cat] = visibleGroups.reduce((s, g) => s + (heatData[g.id]?.[cat]?.count || 0), 0);
    });
    return t;
  }, [heatData, visibleGroups, categories]);

  // Use rgba background so text stays fully opaque at all intensity levels
  const getCellBg = (groupId, cat) => {
    const cell = heatData[groupId]?.[cat];
    if (!cell || cell.count === 0) return 'transparent';
    const intensity = 0.15 + (cell.count / maxCount) * 0.65;
    return hexToRgba(SEV_COLORS[cell.maxSev], intensity);
  };

  const hoveredGroup = hovered ? visibleGroups.find(g => g.id === hovered.groupId) : null;
  const hoveredCell = hovered ? heatData[hovered.groupId]?.[hovered.cat] : null;

  return (
    <div>
      {/* Header + Legend */}
      <div className="mb-4 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            THREAT CONCENTRATION HEATMAP
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>
            Rows = {axisLabel}s · Columns = threat categories · Color = highest severity · Intensity = volume · Click a cell to drill down
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-4">
          {SEVERITIES.map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SEV_COLORS[s] }} />
              <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{s}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pl-3" style={{ borderLeft: '1px solid var(--wr-border)' }}>
            <div className="w-16 h-3 rounded-sm" style={{ background: 'linear-gradient(to right, rgba(46,134,171,0.15), rgba(46,134,171,0.8))' }} />
            <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>low → high volume</span>
          </div>
          {emptyCount > 0 && (
            <label className="flex items-center gap-1.5 pl-3 cursor-pointer" style={{ borderLeft: '1px solid var(--wr-border)' }}>
              <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />
              <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                show {emptyCount} empty row{emptyCount !== 1 ? 's' : ''}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Heatmap Table */}
      <div data-ui="surface" className="rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-card)' }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th
                  className="text-left px-4 py-3 text-xs font-mono font-bold sticky left-0 z-10"
                  style={{
                    color: 'var(--wr-text-muted)',
                    backgroundColor: 'var(--wr-bg-card)',
                    borderBottom: '1px solid var(--wr-border)',
                    borderRight: '1px solid var(--wr-border)',
                    minWidth: '160px',
                    maxWidth: '200px',
                  }}
                >
                  {axisLabel.toUpperCase()}
                </th>
                {categories.map(cat => (
                  <th
                    key={cat}
                    title={cat}
                    className="px-2 py-2 text-center"
                    style={{
                      backgroundColor: 'var(--wr-bg-card)',
                      borderBottom: '1px solid var(--wr-border)',
                      borderLeft: '1px solid var(--wr-border)',
                      minWidth: '80px',
                      maxWidth: '130px',
                    }}
                  >
                    <div
                      className="text-xs font-mono font-bold mx-auto"
                      style={{
                        color: 'var(--wr-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '120px',
                      }}
                    >
                      {cat}
                    </div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>
                      {catTotals[cat]} threat{catTotals[cat] !== 1 ? 's' : ''}
                    </div>
                  </th>
                ))}
                <th
                  className="px-3 py-3 text-center text-xs font-mono font-bold"
                  style={{
                    color: 'var(--wr-text-muted)',
                    backgroundColor: 'var(--wr-bg-card)',
                    borderBottom: '1px solid var(--wr-border)',
                    borderLeft: '2px solid var(--wr-border)',
                    minWidth: '64px',
                  }}
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g) => (
                <tr key={g.id} style={{ borderTop: '1px solid var(--wr-border)', opacity: g.isUnassigned ? 0.75 : 1 }}>
                  <td
                    title={g.isUnassigned ? 'Threats with no domain assignment' : g.name}
                    className="px-4 py-2 text-xs font-mono font-medium sticky left-0 z-10 cursor-pointer"
                    onClick={() => onSelect?.({ group: g, category: null })}
                    style={{
                      color: g.isUnassigned ? 'var(--wr-text-muted)' : 'var(--wr-text-secondary)',
                      fontStyle: g.isUnassigned ? 'italic' : 'normal',
                      backgroundColor: 'var(--wr-bg-card)',
                      borderRight: '1px solid var(--wr-border)',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.color && <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: g.color }} />}
                    {g.name}
                  </td>
                  {categories.map(cat => {
                    const cell = heatData[g.id]?.[cat];
                    const isActive = hovered?.groupId === g.id && hovered?.cat === cat;
                    return (
                      <td
                        key={cat}
                        className="px-1 py-1.5 text-center"
                        style={{ borderLeft: '1px solid rgba(255,255,255,0.04)', cursor: cell?.count > 0 ? 'pointer' : 'default' }}
                        onMouseEnter={() => setHovered({ groupId: g.id, cat })}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => cell?.count > 0 && onSelect?.({ group: g, category: cat })}
                      >
                        <div
                          className="mx-1 rounded flex items-center justify-center transition-all duration-150"
                          style={{
                            height: '34px',
                            backgroundColor: getCellBg(g.id, cat),
                            outline: isActive ? '2px solid rgba(240,165,0,0.7)' : '2px solid transparent',
                            outlineOffset: '1px',
                          }}
                        >
                          {cell?.count > 0 && (
                            <span
                              className="text-sm font-bold font-mono"
                              style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                            >
                              {cell.count}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td
                    className="px-3 py-2 text-center cursor-pointer"
                    style={{ borderLeft: '2px solid var(--wr-border)' }}
                    onClick={() => g.total > 0 && onSelect?.({ group: g, category: null })}
                  >
                    <span
                      className="text-sm font-bold font-mono"
                      style={{ color: g.total > 0 ? 'var(--wr-text-primary)' : 'var(--wr-text-muted)' }}
                    >
                      {g.total || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visibleGroups.length === 0 && (
          <div className="py-12 text-center text-sm px-6" style={{ color: 'var(--wr-text-muted)' }}>
            {groups.length === 0
              ? 'Nothing to map yet. Add agents and threats, then assign domains to both.'
              : `All ${groups.length} ${axisLabel}s have zero mapped threats. Threats link to ${axisLabel}s through their domain assignment — check that your threats have a domain set.`}
          </div>
        )}
      </div>

      {/* Floating tooltip — fixed position, follows cursor, never clipped by table overflow */}
      {hoveredCell && hoveredCell.count > 0 && (
        <div data-ui="surface"
          className="rounded p-3 pointer-events-none"
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y,
            width: TOOLTIP_W,
            zIndex: 9999,
            backgroundColor: 'var(--wr-bg-card)',
            border: '1px solid rgba(240,165,0,0.4)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="mb-2 pb-2" style={{ borderBottom: '1px solid var(--wr-border)' }}>
            <p className="text-xs font-bold font-mono" style={{ color: 'var(--wr-amber)' }}>
              {hoveredGroup?.name}
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              {hovered.cat} · click cell for details
            </p>
          </div>

          {/* Severity breakdown */}
          <div className="flex items-center gap-3 mb-2">
            {SEVERITIES.map(s => hoveredCell.severities[s] > 0 && (
              <div key={s} className="text-center">
                <div className="text-sm font-bold font-mono" style={{ color: SEV_COLORS[s] }}>
                  {hoveredCell.severities[s]}
                </div>
                <div className="text-xs font-mono leading-none mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>
                  {s.slice(0, 4)}
                </div>
              </div>
            ))}
            <div className="ml-auto text-center">
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>
                {hoveredCell.count}
              </div>
              <div className="text-xs font-mono leading-none mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>
                TOTAL
              </div>
            </div>
          </div>

          {/* Threat list — full titles, scrollable */}
          {hoveredCell.threatList.length > 0 && (
            <div className="pt-2" style={{ borderTop: '1px solid var(--wr-border)' }}>
              <p className="text-xs font-mono mb-1.5" style={{ color: 'var(--wr-text-muted)' }}>
                THREATS ({hoveredCell.threatList.length})
              </p>
              <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 180 }}>
                {hoveredCell.threatList.map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div
                      className="flex-shrink-0 rounded-sm mt-0.5"
                      style={{
                        width: 3,
                        height: 12,
                        backgroundColor: SEV_COLORS[t.severity],
                      }}
                    />
                    <span
                      className="text-xs leading-snug"
                      style={{ color: 'var(--wr-text-secondary)' }}
                    >
                      {t.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
