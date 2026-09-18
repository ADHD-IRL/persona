import { Check } from 'lucide-react';

// The session's analysis lifecycle as a stepper. In the session workspace this
// IS the primary navigation: each stage maps onto the content below it.
// `current` is the active stage key, `done` a Set of completed keys, and
// `badges` an optional { key: text } map (e.g. round progress "3/5").
export const STAGES = [
  { key: 'setup',     label: 'Setup' },
  { key: 'round1',    label: 'Round 1' },
  { key: 'round2',    label: 'Round 2' },
  { key: 'synthesis', label: 'Synthesis' },
  { key: 'findings',  label: 'Findings' },
  { key: 'act',       label: 'Act' },
];

export default function AnalysisStages({
  stages = STAGES,
  current,
  done = new Set(),
  badges = {},
  onNavigate,
  size = 'sm',
}) {
  const lg = size === 'lg';
  return (
    <div className={`flex items-center ${lg ? 'gap-1.5' : 'gap-1'} flex-wrap`}>
      {stages.map((s, i) => {
        const isDone    = done.has(s.key);
        const isCurrent = current === s.key;
        const color = isCurrent ? 'var(--wr-amber)' : isDone ? '#27AE60' : 'var(--wr-text-muted)';
        const badge = badges[s.key];
        return (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className={lg ? 'text-sm px-0.5' : 'text-xs'} style={{ color: 'var(--wr-border)' }}>›</span>}
            <button
              onClick={() => onNavigate?.(s.key)}
              className={`flex items-center gap-1.5 rounded font-mono transition-colors ${lg ? 'px-3 py-1.5 text-xs tracking-widest' : 'px-1.5 py-0.5 text-xs'}`}
              style={{
                color,
                backgroundColor: isCurrent ? 'rgba(240,165,0,0.12)' : 'transparent',
                border: isCurrent ? '1px solid rgba(240,165,0,0.3)' : '1px solid transparent',
                cursor: onNavigate ? 'pointer' : 'default',
                fontWeight: isCurrent || lg ? 700 : 400,
              }}
            >
              {lg && (
                <span className="inline-flex items-center justify-center rounded-full flex-shrink-0"
                  style={{
                    width: 16, height: 16, fontSize: 9,
                    backgroundColor: isDone ? 'rgba(39,174,96,0.18)' : isCurrent ? 'rgba(240,165,0,0.2)' : 'var(--wr-bg-secondary)',
                    border: `1px solid ${isDone ? 'rgba(39,174,96,0.5)' : isCurrent ? 'rgba(240,165,0,0.5)' : 'var(--wr-border)'}`,
                    color,
                  }}>
                  {isDone ? <Check className="w-2.5 h-2.5" /> : i + 1}
                </span>
              )}
              {!lg && isDone && !isCurrent && <Check className="w-2.5 h-2.5" />}
              {lg ? s.label.toUpperCase() : s.label}
              {badge && (
                <span className="font-mono font-bold px-1 rounded-sm"
                  style={{
                    fontSize: 9, lineHeight: 1.6,
                    backgroundColor: badge === '✓' ? 'rgba(39,174,96,0.15)' : 'rgba(240,165,0,0.12)',
                    color: badge === '✓' ? '#27AE60' : 'var(--wr-amber)',
                  }}>
                  {badge}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
