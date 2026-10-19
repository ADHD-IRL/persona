import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, Bot, AlertTriangle } from 'lucide-react';
import { SEV_ORDER, SEV_COLORS, UNASSIGNED_ID } from './mapUtils';

// Slide-in panel showing the threats and agents behind a clicked map slice.
// selection: { group, category|null, axis }
export default function DrillDownPanel({ selection, onClose }) {
  const navigate = useNavigate();
  const { group, category, axis } = selection;

  const threats = category
    ? group.threats.filter(t => (t.category || 'Uncategorized') === category)
    : group.threats;

  const sevSorted = [...threats].sort(
    (a, b) => SEV_ORDER.indexOf(a.severity || 'MEDIUM') - SEV_ORDER.indexOf(b.severity || 'MEDIUM')
  );

  const openThreats = () => {
    const params = new URLSearchParams();
    if (category && category !== 'Uncategorized') params.set('category', category);
    navigate(`/threats?${params.toString()}`);
  };

  const openAgents = () => {
    const params = new URLSearchParams();
    if (axis === 'domain' && group.id !== UNASSIGNED_ID) params.set('domain', group.id);
    if (axis === 'discipline') params.set('q', group.name);
    navigate(`/agents?${params.toString()}`);
  };

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-50 flex flex-col shadow-2xl"
      style={{ width: 400, backgroundColor: 'var(--wr-bg-card)', borderLeft: '1px solid var(--wr-border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--wr-border)' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {group.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />}
            <h2 className="text-sm font-bold font-mono truncate" style={{ color: 'var(--wr-amber)' }}>{group.name}</h2>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>
            {category ? `Category: ${category}` : axis === 'domain' ? 'Domain slice' : 'Discipline slice'}
            {' · '}{threats.length} threat{threats.length !== 1 ? 's' : ''} · {group.agents.length} SME{group.agents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button aria-label="Close" data-ui="icon" onClick={onClose} className="flex-shrink-0 ml-2"><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Threats */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold tracking-widest font-mono flex items-center gap-1.5" style={{ color: 'var(--wr-text-muted)' }}>
              <AlertTriangle className="w-3.5 h-3.5" /> THREATS ({threats.length})
            </p>
            <button data-ui="action" onClick={openThreats} className="text-xs flex items-center gap-1 underline" style={{ color: 'var(--wr-amber)' }}>
              Open in Threats <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          {sevSorted.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>No threats in this slice.</p>
          ) : (
            <div className="space-y-1.5">
              {sevSorted.map(t => (
                <div data-ui="surface" key={t.id} className="rounded p-2.5" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                  <div className="flex items-start gap-2">
                    <span data-ui="badge"
                      className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-mono font-bold"
                      style={{ backgroundColor: `${SEV_COLORS[t.severity || 'MEDIUM']}22`, color: SEV_COLORS[t.severity || 'MEDIUM'] }}
                    >
                      {(t.severity || 'MEDIUM').slice(0, 4)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-snug" style={{ color: 'var(--wr-text-primary)' }}>{t.name || 'Unnamed threat'}</p>
                      {t.category && <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>{t.category}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agents */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold tracking-widest font-mono flex items-center gap-1.5" style={{ color: 'var(--wr-text-muted)' }}>
              <Bot className="w-3.5 h-3.5" /> SMEs ({group.agents.length})
            </p>
            {group.agents.length > 0 && (
              <button data-ui="action" onClick={openAgents} className="text-xs flex items-center gap-1 underline" style={{ color: 'var(--wr-amber)' }}>
                Open in SMEs <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
          {group.agents.length === 0 ? (
            <div data-ui="surface" className="rounded p-3 text-xs" style={{ backgroundColor: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.25)', color: '#C0392B' }}>
              No SMEs cover this slice — this is a coverage gap.
            </div>
          ) : (
            <div className="space-y-1.5">
              {group.agents.map(a => (
                <div data-ui="surface" key={a.id} className="rounded p-2.5 flex items-center gap-2" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{a.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{a.discipline}</p>
                  </div>
                  <span data-ui="badge"
                    className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-mono font-bold"
                    style={{ backgroundColor: `${SEV_COLORS[a.severity_default || 'MEDIUM']}22`, color: SEV_COLORS[a.severity_default || 'MEDIUM'] }}
                    title="SME default severity (baseline risk posture)"
                  >
                    {(a.severity_default || 'MED').slice(0, 4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
