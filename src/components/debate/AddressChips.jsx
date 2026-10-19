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

function MiniAvatar({ color }) {
  const hue = hexToHue(color);
  return (
    <span aria-hidden style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
      background: `conic-gradient(from 210deg, oklch(0.58 0.14 ${hue}), oklch(0.38 0.10 ${(hue+30)%360}), oklch(0.28 0.08 ${(hue+60)%360}), oklch(0.58 0.14 ${hue}))`,
      border: '1px solid var(--wr-bg-primary)',
    }} />
  );
}

export default function AddressChips({ agents = [], colors = {}, targetAgentId, onSelect }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      padding: '8px 14px', borderBottom: '1px solid var(--wr-border)',
    }}>
      <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--wr-text-muted)', marginRight: 2 }}>
        ADDRESS
      </span>

      {/* ALL chip */}
      <Chip
        active={!targetAgentId}
        color="var(--wr-amber)"
        activeBg="rgba(240,165,0,0.12)"
        activeBorder="rgba(240,165,0,0.35)"
        onClick={() => onSelect(null)}
      >
        ALL · room
      </Chip>

      {/* Per-agent chips */}
      {agents.map(a => {
        const color = colors[a.id] || a.color || '#8A9BB5';
        const active = targetAgentId === a.id;
        return (
          <Chip
            key={a.id}
            active={active}
            color={color}
            activeBg={`${color}18`}
            activeBorder={`${color}55`}
            onClick={() => onSelect(active ? null : a.id)}
          >
            <MiniAvatar color={color} />
            {a.name.split(' ')[0]}
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({ active, color, activeBg, activeBorder, onClick, children }) {
  return (
    <button data-ui="action"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
        fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
        backgroundColor: active ? activeBg : 'transparent',
        color: active ? color : 'var(--wr-text-muted)',
        outline: active ? `1px solid ${activeBorder}` : '1px solid var(--wr-border)',
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  );
}
