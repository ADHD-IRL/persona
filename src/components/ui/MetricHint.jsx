import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

// A small, self-contained explanatory popover for a metric or number.
// Hover or keyboard-focus the wrapped content to reveal a titled description.
// Mirrors the hover-popover style used in RiskMatrix so the whole app reads
// the same, without depending on a Radix TooltipProvider being mounted.
//
// The root is a single <div> so callers can pass the layout classes the
// wrapped element already used (flex column, padding, etc.) and the tooltip
// slots in without disturbing surrounding layout.
export default function MetricHint({
  title,
  body,
  children,
  align = 'left',
  width = 'w-64',
  className = '',
  style,
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={`relative ${className}`}
      style={{ cursor: 'help', ...style }}
      tabIndex={0}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <div data-ui="surface"
          className={`absolute z-40 ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 ${width} rounded-lg p-3 text-left pointer-events-none`}
          style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', boxShadow: '0 8px 28px rgba(0,0,0,0.45)' }}
        >
          <p className="text-[11px] font-bold font-mono tracking-wider mb-1.5" style={{ color: 'var(--wr-amber)' }}>{title}</p>
          <div className="text-[11px] leading-relaxed space-y-1.5" style={{ color: 'var(--wr-text-secondary)' }}>{body}</div>
        </div>
      )}
    </div>
  );
}

// A tiny inline "?" affordance to signal that a label carries an explanation.
export function HintDot({ className = '' }) {
  return <HelpCircle className={`w-2.5 h-2.5 opacity-50 ${className}`} />;
}
