import { AlertCircle, Trash2 } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';

export default function BulkDeleteModal({ count, agents, domains, filteredAgents, onSelectAll, onConfirm, onClose }) {
  const domainMap = Object.fromEntries(domains.map(d => [d.id, d]));

  const byDomain = {};
  agents.forEach(a => {
    const domName = domainMap[a.domain_id]?.name || 'No Domain';
    if (!byDomain[domName]) byDomain[domName] = 0;
    byDomain[domName]++;
  });

  const allFilteredSelected = count === filteredAgents.length && filteredAgents.length > 0;
  const canSelectMore = filteredAgents.length > count;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div data-ui="surface" className="rounded-lg max-w-md w-full p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded flex items-center justify-center" style={{ backgroundColor: 'rgba(192,57,43,0.2)' }}>
            <AlertCircle className="w-5 h-5" style={{ color: '#C0392B' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--wr-text-primary)' }}>Delete {count} SME{count !== 1 ? 's' : ''}?</h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--wr-text-secondary)' }}>
          This action cannot be undone. The selected SMEs will be permanently removed from the library.
        </p>

        {count <= 10 ? (
          <div className="mb-4 space-y-1.5 max-h-40 overflow-y-auto">
            {agents.map(a => {
              const domain = domainMap[a.domain_id];
              return (
                <div key={a.id} className="flex items-start gap-2 text-xs p-2 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
                  <span className="text-xs font-mono flex-shrink-0 w-2 h-2 mt-1 rounded-full" style={{ backgroundColor: domain?.color || '#F0A500' }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{a.name}</p>
                    <p style={{ color: 'var(--wr-text-muted)' }}>{a.discipline}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            {Object.entries(byDomain).map(([domName, cnt]) => (
              <div key={domName} className="text-xs p-2 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
                <span style={{ color: 'var(--wr-text-secondary)' }}>{cnt} SME{cnt !== 1 ? 's' : ''} from </span>
                <span className="font-medium" style={{ color: 'var(--wr-text-primary)' }}>{domName}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
          <WrButton variant="danger" onClick={onConfirm}>
            <Trash2 className="w-4 h-4" /> Delete {count}
          </WrButton>
        </div>
      </div>
    </div>
  );
}