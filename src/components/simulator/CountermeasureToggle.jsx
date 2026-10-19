import { estimateCMDelta } from '@/lib/scrsEngine';

const LEV_COLOR = { HIGH: '#C0392B', MEDIUM: '#D68910', LOW: '#2E86AB' };
const DIF_COLOR = { EASY: '#27AE60', MODERATE: '#D68910', HARD: '#C0392B' };

export default function CountermeasureToggle({ cm, applied, onToggle, totalHighSteps }) {
  const delta    = estimateCMDelta(cm, totalHighSteps);
  const levColor = LEV_COLOR[cm.leverage] || '#546E7A';
  const difColor = DIF_COLOR[cm.difficulty] || '#546E7A';

  return (
    <label className="flex items-start gap-3 py-2.5 px-3 rounded cursor-pointer transition-all hover:brightness-110"
      style={{
        backgroundColor: applied ? 'rgba(39,174,96,0.06)' : 'var(--wr-bg-secondary)',
        border: `1px solid ${applied ? 'rgba(39,174,96,0.25)' : 'var(--wr-border)'}`,
      }}>
      <input
        type="checkbox"
        checked={applied}
        onChange={() => onToggle(cm)}
        className="mt-0.5 flex-shrink-0 accent-green-500"
        style={{ width: 14, height: 14 }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug"
          style={{ color: applied ? 'var(--wr-text-muted)' : 'var(--wr-text-secondary)',
            textDecoration: applied ? 'line-through' : 'none' }}>
          {cm.text}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span data-ui="badge" className="text-xs font-bold font-mono px-1.5 py-0.5 rounded"
            style={{ color: levColor, backgroundColor: `${levColor}15`, border: `1px solid ${levColor}30` }}>
            {cm.leverage}
          </span>
          <span data-ui="badge" className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ color: difColor, backgroundColor: `${difColor}10` }}>
            {cm.difficulty}
          </span>
          {delta > 0 && (
            <span className="text-xs font-mono" style={{ color: '#27AE60' }}>
              −{delta} pts
            </span>
          )}
        </div>
      </div>
      {applied && (
        <span className="text-xs font-bold flex-shrink-0" style={{ color: '#27AE60' }}>✓</span>
      )}
    </label>
  );
}
