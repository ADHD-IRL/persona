import { useState, useMemo } from 'react';
import { X, Loader2, Sparkles, CheckCircle2, Wand2 } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import ProcessingBar from '@/components/ui/ProcessingBar';
import { useElapsed } from '@/hooks/useElapsed';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { assignDomainsToAgents } from '@/lib/llm';

const NEW_DOMAIN_COLORS = ['#F0A500', '#2E86AB', '#27AE60', '#C0392B', '#7B2D8B', '#E67E22', '#16A085', '#8E44AD'];

// Reviews agents' personas and assigns a best-fit domain. AI proposes, the user
// reviews/overrides in a preview table, then it commits — creating any new
// domains and updating each agent's domain_id.
export default function DomainAssignModal({ agents, domains, onClose, onDone }) {
  const { db } = useWorkspace();
  const [scope, setScope] = useState('unassigned'); // 'unassigned' | 'all'
  const [phase, setPhase] = useState('config');      // config | running | review | committing | done
  const [rows, setRows] = useState([]);              // { agent, current, choice, isNew, why, include }
  const [error, setError] = useState('');
  const [committedCount, setCommittedCount] = useState(0);
  const running = phase === 'running';
  const elapsed = useElapsed(running);

  const domainByName = useMemo(() => {
    const m = {};
    for (const d of domains) m[d.name.toLowerCase().trim()] = d;
    return m;
  }, [domains]);

  const unassignedCount = agents.filter(a => !a.domain_id).length;

  const run = async () => {
    setError('');
    const targets = scope === 'unassigned' ? agents.filter(a => !a.domain_id) : agents;
    if (!targets.length) { setError('No SMEs to organize.'); return; }
    setPhase('running');
    try {
      // Results are aligned to input order — suggestions[k] is for targets[k].
      const suggestions = await assignDomainsToAgents({ agents: targets, domains });
      const built = targets.map((a, k) => {
        const s = suggestions[k];
        const choice = (s?.domain || '').trim();
        const existing = domainByName[choice.toLowerCase()];
        const current = a.domain_id ? (domains.find(d => d.id === a.domain_id)?.name || '—') : null;
        return {
          agent: a,
          current,
          choice: choice || (current || ''),
          isNew: choice ? !existing : false,
          why: s?.why || '',
          include: !!choice,
        };
      });
      setRows(built);
      setPhase('review');
    } catch (e) {
      setError(e.message || 'Domain organization failed.');
      setPhase('config');
    }
  };

  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onChoiceChange = (i, value) => {
    const existing = domainByName[value.toLowerCase().trim()];
    setRow(i, { choice: value, isNew: value ? !existing : false });
  };

  // All distinct domain options for the dropdowns: existing + any AI-proposed new ones.
  const options = useMemo(() => {
    const names = new Set(domains.map(d => d.name));
    for (const r of rows) if (r.choice) names.add(r.choice);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [domains, rows]);

  const includedCount = rows.filter(r => r.include && r.choice).length;

  const commit = async () => {
    setPhase('committing');
    const createdByName = {};
    let count = 0;
    try {
      const freshDomains = await db.Domain.list();
      const resolve = async (name) => {
        const key = name.toLowerCase().trim();
        if (createdByName[key]) return createdByName[key];
        const existing = freshDomains.find(d => d.name.toLowerCase().trim() === key);
        if (existing) { createdByName[key] = existing.id; return existing.id; }
        const color = NEW_DOMAIN_COLORS[Object.keys(createdByName).length % NEW_DOMAIN_COLORS.length];
        const created = await db.Domain.create({ name, color, description: 'Suggested from SME personas' });
        createdByName[key] = created.id;
        return created.id;
      };
      for (const r of rows) {
        if (!r.include || !r.choice) continue;
        const domainId = await resolve(r.choice);
        if (r.agent.domain_id !== domainId) {
          const saved = await db.Agent.update(r.agent.id, { domain_id: domainId });
          // Verify the write actually stuck (a silent no-op would otherwise
          // look like success and vanish on the next load).
          if (!saved || saved.domain_id !== domainId) {
            throw new Error(`Could not save the domain for "${r.agent.name}". Check your permissions and try again.`);
          }
        }
        count++;
      }
      setCommittedCount(count);
      setPhase('done');
    } catch (e) {
      setError(e.message || 'Commit failed.');
      setPhase('review');
    }
  };

  const close = () => { if (phase === 'done') onDone?.(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div data-ui="surface" className="w-[720px] max-w-full max-h-[90vh] overflow-hidden flex flex-col rounded-lg" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--wr-border)' }}>
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>ORGANIZE SME DOMAINS</h2>
          </div>
          <button aria-label="Close" data-ui="icon" onClick={close}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>

        <div className="p-6 overflow-y-auto">
          {(phase === 'config' || phase === 'running') && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--wr-text-secondary)' }}>
                The model reads each SME’s persona, discipline, and focus and suggests the best-fit domain — reusing your existing domains where they fit and proposing broad new ones only where nothing does. You review and override everything before anything is saved.
              </p>
              <div data-ui="surface" className="rounded p-3 space-y-2" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                {[
                  ['unassigned', `Only SMEs without a domain (${unassignedCount})`, 'SMEs that currently have no domain.'],
                  ['all', `All SMEs (${agents.length})`, 'Review every SME, including those already categorized.'],
                ].map(([val, label, desc]) => (
                  <label key={val} className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="scope" checked={scope === val} onChange={() => setScope(val)} disabled={running} className="mt-0.5 accent-amber-500" />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--wr-text-primary)' }}>{label}</p>
                      <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {error && <p className="text-xs" style={{ color: '#C0392B' }}>{error}</p>}
              {running && <ProcessingBar label="Reviewing personas and matching domains…" elapsedMs={elapsed} sublabel="Usually 10–30 seconds depending on panel size." />}
            </div>
          )}

          {(phase === 'review' || phase === 'committing') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                  {includedCount} OF {rows.length} WILL BE UPDATED
                </p>
                <div className="flex gap-3 text-xs">
                  <button data-ui="action" onClick={() => setRows(rs => rs.map(r => ({ ...r, include: true })))} style={{ color: 'var(--wr-amber)' }}>Select all</button>
                  <button data-ui="action" onClick={() => setRows(rs => rs.map(r => ({ ...r, include: false })))} style={{ color: 'var(--wr-text-muted)' }}>Select none</button>
                </div>
              </div>
              <div data-ui="surface" className="rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
                <div className="grid grid-cols-[24px_1fr_1fr] gap-2 px-3 py-2 text-[10px] font-mono font-bold tracking-wider" style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)' }}>
                  <span></span><span>AGENT</span><span>DOMAIN</span>
                </div>
                <div className="max-h-[46vh] overflow-y-auto">
                  {rows.map((r, i) => (
                    <div key={r.agent.id} className="grid grid-cols-[24px_1fr_1fr] gap-2 px-3 py-2 items-center border-t" style={{ borderColor: 'var(--wr-border)', opacity: r.include ? 1 : 0.5 }}>
                      <input type="checkbox" checked={r.include} onChange={e => setRow(i, { include: e.target.checked })} className="accent-amber-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{r.agent.name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>
                          {r.agent.discipline || '—'}{r.current ? ` · now: ${r.current}` : ' · no domain'}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={r.choice}
                            onChange={e => onChoiceChange(i, e.target.value)}
                            disabled={phase === 'committing'}
                            className="flex-1 min-w-0 px-2 py-1 text-xs rounded outline-none"
                            style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
                          >
                            <option value="">— no domain —</option>
                            {options.map(name => <option key={name} value={name}>{name}</option>)}
                          </select>
                          {r.isNew && r.choice && (
                            <span data-ui="badge" className="text-[9px] font-mono font-bold px-1 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: 'rgba(39,174,96,0.15)', color: '#27AE60' }}>NEW</span>
                          )}
                        </div>
                        {r.why && <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--wr-text-muted)' }}>{r.why}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--wr-text-muted)' }}>
                Domains marked <span className="font-mono font-bold" style={{ color: '#27AE60' }}>NEW</span> will be created on commit. Type in a select to switch any agent to a different domain.
              </p>
              {error && <p className="text-xs" style={{ color: '#C0392B' }}>{error}</p>}
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <CheckCircle2 className="w-10 h-10" style={{ color: '#27AE60' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>Domains saved.</p>
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{committedCount} agent{committedCount !== 1 ? 's' : ''} updated.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--wr-border)', backgroundColor: 'var(--wr-bg-card)' }}>
          {phase === 'config' && (
            <>
              <WrButton variant="secondary" onClick={close}>Cancel</WrButton>
              <WrButton onClick={run}><Sparkles className="w-4 h-4" /> Review & Suggest</WrButton>
            </>
          )}
          {phase === 'running' && <WrButton disabled><Loader2 className="w-4 h-4 animate-spin" /> Reviewing…</WrButton>}
          {phase === 'review' && (
            <>
              <WrButton variant="secondary" onClick={close}>Cancel</WrButton>
              <WrButton onClick={commit} disabled={!includedCount}>Apply to {includedCount} agent{includedCount !== 1 ? 's' : ''}</WrButton>
            </>
          )}
          {phase === 'committing' && <WrButton disabled><Loader2 className="w-4 h-4 animate-spin" /> Applying…</WrButton>}
          {phase === 'done' && <WrButton onClick={close}>Done</WrButton>}
        </div>
      </div>
    </div>
  );
}
