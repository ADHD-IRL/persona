import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { GitBranch, Plus, X, ChevronRight, Trash2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import WrButton from '@/components/ui/WrButton';
import { WrInput } from '@/components/ui/WrInput';

const STATUS_COLOR = { framing: '#8A9BB5', analyzing: '#D68910', decided: '#27AE60', archived: '#5A7A96' };

function NewDecisionModal({ onCreate, onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);

  const setOpt = (i, v) => setOptions(o => o.map((x, j) => j === i ? v : x));
  const valid = title.trim() && options.filter(o => o.trim()).length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" className="w-[560px] max-h-[90vh] overflow-y-auto rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>NEW DECISION</h2>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>
        <div className="space-y-4">
          <WrInput label="DECISION" value={title} onChange={setTitle} placeholder="e.g. Which authentication architecture for the new platform?" />
          <WrInput label="CONTEXT (optional)" value={description} onChange={setDescription} rows={3} placeholder="What's being decided and why it matters..." />
          <WrInput label="ACCEPTANCE CRITERIA (optional)" value={criteria} onChange={setCriteria} rows={2} placeholder="What would make an option acceptable — cost ceiling, risk appetite, timeline..." />
          <div>
            <label className="block text-xs font-medium mb-2 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>OPTIONS BEING COMPARED (2-4)</label>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold w-5 flex-shrink-0" style={{ color: 'var(--wr-amber)' }}>{String.fromCharCode(65 + i)}</span>
                  <input value={o} onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 text-sm px-3 py-2 rounded outline-none" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
                  {options.length > 2 && <button aria-label="Close" data-ui="icon" onClick={() => setOptions(o2 => o2.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" style={{ color: 'var(--wr-text-muted)' }} /></button>}
                </div>
              ))}
            </div>
            {options.length < 4 && (
              <button data-ui="action" onClick={() => setOptions(o => [...o, ''])} className="mt-2 text-xs font-mono flex items-center gap-1" style={{ color: 'var(--wr-amber)' }}>
                <Plus className="w-3 h-3" /> Add option
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
          <WrButton disabled={!valid || busy} onClick={async () => { setBusy(true); await onCreate({ title, description, acceptance_criteria: criteria, options: options.filter(o => o.trim()) }); }}>
            {busy ? 'Creating…' : 'Create Decision'}
          </WrButton>
        </div>
      </div>
    </div>
  );
}

export default function Decisions() {
  const { db } = useWorkspace();
  const [decisions, setDecisions] = useState([]);
  const [optionCounts, setOptionCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = async () => {
    if (!db) return;
    const [ds, opts] = await Promise.all([db.Decision.list('-created_at'), db.DecisionOption.list()]);
    setDecisions(ds);
    const counts = {};
    opts.forEach(o => { counts[o.decision_id] = (counts[o.decision_id] || 0) + 1; });
    setOptionCounts(counts);
    setLoading(false);
  };
  useEffect(() => { load(); }, [db]);

  const create = async ({ title, description, acceptance_criteria, options }) => {
    const d = await db.Decision.create({ title, description, acceptance_criteria, status: 'framing' });
    await Promise.all(options.map((name, i) => db.DecisionOption.create({ decision_id: d.id, name, sort_order: i })));
    setModal(false);
    load();
  };

  // DB cascades a decision's options and assumptions (migration 013) and nulls
  // the link on any sessions, so deleting the decision row is sufficient.
  const handleDelete = async (d) => {
    if (!confirm(`Delete decision "${d.title}"? Its options and assumptions are removed too. This cannot be undone.`)) return;
    await db.Decision.delete(d.id);
    setDecisions(prev => prev.filter(x => x.id !== d.id));
    setOptionCounts(prev => { const next = { ...prev }; delete next[d.id]; return next; });
  };

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      <PageHeader icon={GitBranch} title="DECISIONS" subtitle="Frame a design decision, compare options by risk, record what was chosen"
        actions={<WrButton onClick={() => setModal(true)}><Plus className="w-4 h-4" /> New Decision</WrButton>} />

      {loading ? (
        <div className="p-6"><div className="h-40 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} /></div>
      ) : decisions.length === 0 ? (
        <EmptyState icon={GitBranch} title="No decisions yet"
          description="A Decision frames a design choice: the options on the table and the assumptions they rest on. One click runs the expert panel against every option and returns a reasoned recommendation; then record what you chose."
          action={() => setModal(true)} actionLabel="Frame First Decision" />
      ) : (
        <div className="p-6 grid grid-cols-2 gap-4">
          {decisions.map(d => (
            <div key={d.id} className="relative group">
              <Link data-ui="card" to={`/decisions/${d.id}`} className="block rounded-lg p-5 transition-colors hover:bg-white/5"
                style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', textDecoration: 'none' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span data-ui="badge" className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${STATUS_COLOR[d.status]}1f`, color: STATUS_COLOR[d.status] }}>
                    {d.status.toUpperCase()}
                  </span>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} />
                </div>
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--wr-text-primary)' }}>{d.title}</p>
                {d.description && <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--wr-text-muted)' }}>{d.description}</p>}
                <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{optionCounts[d.id] || 0} options</p>
              </Link>
              <button data-ui="icon"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(d); }}
                title="Delete decision"
                aria-label={`Delete decision ${d.title}`}
                className="absolute bottom-4 right-4 p-1.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                style={{ color: '#C0392B', backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && <NewDecisionModal onCreate={create} onClose={() => setModal(false)} />}
    </div>
  );
}
