import { getPosture } from '@/lib/scrsEngine';
import MetricHint, { HintDot } from '@/components/ui/MetricHint';
import { RISK_HINTS } from '@/lib/riskGlossary';

/**
 * Circular SCRS gauge dial — 0 to 100.
 * Uses SVG arc path for the needle sweep.
 */
export default function SCRSGauge({ scrs, size = 200, showLabel = true }) {
  const posture = getPosture(scrs ?? 0);
  const pct     = (scrs ?? 0) / 100;

  // SVG arc constants
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.38;
  const strokeWidth = size * 0.07;

  // Arc spans 240° (from 150° to 390° / -210° to 30° in standard coords)
  const startAngle = 150;
  const endAngle   = 390;
  const spanAngle  = endAngle - startAngle; // 240°

  function polarToXY(angle, radius) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  }

  function arcPath(from, to, radius) {
    const s     = polarToXY(from, radius);
    const e     = polarToXY(to, radius);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const fillAngle = startAngle + spanAngle * pct;

  // Color stops for the track
  const STOPS = [
    { pct: 0,    color: '#27AE60' }, // LOW
    { pct: 0.40, color: '#2E86AB' }, // MEDIUM
    { pct: 0.60, color: '#D68910' }, // HIGH
    { pct: 0.80, color: '#C0392B' }, // CRITICAL
  ];

  return (
    <MetricHint title={RISK_HINTS.SCRS.title} body={RISK_HINTS.SCRS.body} align="left" className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'visible' }}>

        {/* Background track */}
        <path
          d={arcPath(startAngle, endAngle, r)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Filled arc */}
        {pct > 0 && (
          <path
            d={arcPath(startAngle, fillAngle, r)}
            fill="none"
            stroke={posture.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        )}

        {/* Score text */}
        <text x={cx} y={cy + size * 0.04} textAnchor="middle"
          style={{
            fill: posture.color,
            fontSize: size * 0.22,
            fontWeight: 700,
            fontFamily: 'monospace',
            transition: 'fill 0.4s ease',
          }}>
          {scrs ?? 0}
        </text>
        <text x={cx} y={cy + size * 0.17} textAnchor="middle"
          style={{ fill: 'rgba(255,255,255,0.4)', fontSize: size * 0.07 }}>
          / 100
        </text>
      </svg>

      {showLabel && (
        <div className="mt-1 text-center">
          <span className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded"
            style={{
              color: posture.color,
              backgroundColor: posture.bg,
              border: `1px solid ${posture.border}`,
            }}>
            {posture.label}<HintDot />
          </span>
          <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>
            {posture.description}
          </p>
        </div>
      )}
    </MetricHint>
  );
}
