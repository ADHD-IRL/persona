import { Mic } from 'lucide-react';
function hexToHue(hex) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 210;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else                h = ((r - g) / d + 4) * 60;
  return Math.round(h);
}

function SpeakingBars({ color = '#fff', size = 10 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: size }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 2, height: size, backgroundColor: color, borderRadius: 1,
          transformOrigin: 'center',
          animation: `bounce1 0.9s ease-in-out ${i * 0.12}s infinite`,
        }} />
      ))}
    </div>
  );
}

function ThinkingDots({ size = 6 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[0, 1, 2].map(i => (
        <span key={i} className="pulse-dot" style={{
          width: size, height: size, borderRadius: '50%',
          backgroundColor: 'var(--wr-amber)',
          display: 'inline-block',
          animationDelay: `${i * 0.18}s`,
        }} />
      ))}
    </div>
  );
}

export default function AgentAvatar({ agent, color, size = 40, status = 'idle', active = false, onClick, showLabel = false }) {
  const hue    = agent?.hue ?? hexToHue(color || agent?.color || '#2E86AB');
  const aColor = color || agent?.color || '#2E86AB';
  const initials = (agent?.name || '??').split(' ').map(s => s[0]).slice(0, 2).join('');

  const boxShadow =
    status === 'listening' ? '0 0 0 3px rgba(240,165,0,0.55), 0 0 24px rgba(240,165,0,0.35)' :
    status === 'thinking'  ? '0 0 0 3px rgba(240,165,0,0.35)' :
    active                 ? `0 0 0 2px ${aColor}` :
    'none';

  const wrap = (content) => onClick
    ? <button type="button" data-ui="avatar" aria-label={'Address '+agent.name} aria-pressed={active} onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{content}</button>
    : <div style={{ display: 'inline-block' }}>{content}</div>;

  return wrap(
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        {/* Speaking rings */}
        {status === 'speaking' && (
          <>
            <div className="agent-ring-1" style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: `2px solid ${aColor}`, pointerEvents: 'none',
            }} />
            <div className="agent-ring-2" style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: `2px solid ${aColor}`, pointerEvents: 'none',
            }} />
          </>
        )}

        {/* Avatar circle */}
        <div style={{
          width: size, height: size, borderRadius: '50%', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `conic-gradient(from 210deg, oklch(0.58 0.14 ${hue}), oklch(0.38 0.10 ${(hue + 30) % 360}), oklch(0.28 0.08 ${(hue + 60) % 360}), oklch(0.58 0.14 ${hue}))`,
          boxShadow,
          border: '2px solid var(--wr-bg-primary)',
          transition: 'all 0.25s',
          overflow: 'hidden',
        }}>
          {/* Sheen overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.15) 100%)',
          }} />
          <span style={{
            position: 'relative', zIndex: 1,
            fontSize: size * 0.32, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
            color: '#E8EDF5', letterSpacing: '0.02em',
          }}>
            {initials}
          </span>

          {/* Status badge */}
          {status === 'speaking' && (
            <div style={{
              position: 'absolute', bottom: -2, right: -2, zIndex: 2,
              width: size * 0.32, height: size * 0.32, borderRadius: '50%',
              backgroundColor: aColor, border: '2px solid var(--wr-bg-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SpeakingBars color="#fff" size={size * 0.16} />
            </div>
          )}
          {status === 'listening' && (
            <div className="pulse-dot" style={{
              position: 'absolute', bottom: -2, right: -2, zIndex: 2,
              width: size * 0.32, height: size * 0.32, borderRadius: '50%',
              backgroundColor: '#F0A500', border: '2px solid var(--wr-bg-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mic style={{ width: size * 0.16, height: size * 0.16, color: '#0D1B2A' }} />
            </div>
          )}
          {status === 'thinking' && (
            <div style={{
              position: 'absolute', bottom: -2, right: -2, zIndex: 2,
              width: size * 0.32, height: size * 0.32, borderRadius: '50%',
              backgroundColor: 'var(--wr-bg-card)', border: '2px solid var(--wr-bg-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ThinkingDots size={size * 0.12} />
            </div>
          )}
        </div>
      </div>

      {showLabel && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--wr-text-primary)' }}>
            {agent.name.split(' ')[0]}
          </p>
          <p style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', color: 'var(--wr-text-muted)', maxWidth: size + 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(agent.discipline || '').split(' · ')[0].split(' — ')[0]}
          </p>
        </div>
      )}
    </div>
  );
}
