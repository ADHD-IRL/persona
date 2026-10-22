import { useMemo } from 'react';

// bars: optional number[] of 0-1 heights (48 values). If omitted, uses static sine pattern.
// isActive: drives CSS animation when no real bars provided
export default function Waveform({ bars, color = '#F0A500', barCount = 32, height = 28, isActive = false }) {
  const staticHeights = useMemo(
    () => Array.from({ length: barCount }, (_, i) => 0.2 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.3)) * 0.78),
    [barCount]
  );

  const heights = bars
    ? Array.from({ length: barCount }, (_, i) => bars[Math.floor(i * bars.length / barCount)] ?? 0.2)
    : staticHeights;

  return (
    <div
      aria-hidden="true"
      style={{ display: 'flex', alignItems: 'center', gap: 1.5, height, flexShrink: 0 }}
    >
      {heights.map((h, i) => {
        const delay = `${(i * 0.04).toFixed(2)}s`;
        const dur   = `${(0.75 + (i % 5) * 0.1).toFixed(2)}s`;
        return (
          <div
            key={i}
            style={{
              width: 2,
              height: `${Math.max(h * 100, 8)}%`,
              backgroundColor: color,
              borderRadius: 1,
              transformOrigin: 'center',
              opacity: isActive || bars ? 1 : 0.35,
              animation: isActive && !bars ? `bounce1 ${dur} ease-in-out ${delay} infinite` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
