import {useBackgroundWork} from '@/components/layout/BackgroundWork';
import MarkdownContent from '@/components/ui/MarkdownContent';
import {loadDomainHierarchy} from '@/lib/domainHierarchy';
import {distinctDomainColors,DOMAIN_PALETTE,nextDomainColor} from '@/lib/domainColors';
import { useState, useEffect } from 'react';
import { queued } from '@/lib/apiQueue';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Globe, Plus, X, RefreshCw, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DomainCoverage from '@/components/domains/DomainCoverage';
import { domainCoverage, normalizeDomainName } from '@/lib/domainCoverage';
import WrButton from '@/components/ui/WrButton';
import { WrInput } from '@/components/ui/WrInput';

const PRESET_COLORS = DOMAIN_PALETTE;
const DOMAIN_COLORS = ['#F0A500','#2E86AB','#27AE60','#C0392B','#7B2D8B','#E67E22','#16A085','#8E44AD'];

// ── Domain edit modal ─────────────────────────────────────────────────────────
function DomainModal({ domain, domains, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', description: '', color: nextDomainColor(domains.map(d=>d.color)), icon: 'Globe', ...domain });
  const [saving, setSaving] = useState(false);
 useBackgroundWork(saving,'Domain update');
  const [error, setError] = useState('');
  const save = async () => { setSaving(true); setError(''); try { await onSave(form); } catch (e) { setError(e.message); } finally { setSaving(false); } };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" role="dialog" aria-label={domain?.id ? 'Edit domain' : 'New domain'} aria-modal="true" className="w-[480px] max-w-[95vw] rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
            {domain?.id ? 'EDIT DOMAIN' : 'NEW DOMAIN'}
          </h2>
          <button data-ui="icon" aria-label="Close domain editor" disabled={saving} onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>
        <div className="space-y-4">
          <WrInput label="NAME" value={form.name} onChange={v => set('name', v)} placeholder="Domain name" />
          <WrInput label="DESCRIPTION" value={form.description} onChange={v => set('description', v)} placeholder="Describe this domain..." rows={3} />
          <div>
            <label className="block text-xs font-medium mb-2 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>COLOR</label>
            <div className="flex gap-2">
              {[...new Set([...PRESET_COLORS,form.color])].map(c => (
                <button type="button" data-ui="icon" aria-label={'Use domain color '+c} aria-pressed={form.color===c} disabled={domains.some(d=>d.id!==form.id&&d.color===c)} title={domains.some(d=>d.id!==form.id&&d.color===c)?'Already used by another domain':c} key={c} onClick={() => set('color', c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110 disabled:opacity-25 disabled:cursor-not-allowed"
                  style={{ backgroundColor: c, outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
              ))}
            </div>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-red-300 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <WrButton variant="secondary" disabled={saving} onClick={onClose}>Cancel</WrButton>
          <WrButton onClick={save} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save domain'}</WrButton>
        </div>
      </div>
    </div>
  );
}

// ── Duplicate merge modal ─────────────────────────────────────────────────────
function DuplicateModal({ group, agentCounts, onMerge, onClose }) {
  const [keepId, setKeepId] = useState(() =>
    group.reduce((best, d) =>
      (agentCounts[d.id] || 0) > (agentCounts[best.id] || 0) ? d : best
    ).id
  );
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');
  const toDelete = group.filter(d => d.id !== keepId);

  const handleMerge = async () => {
    setMerging(true);
    setError('');
    try { await onMerge(keepId, toDelete); } catch (e) { setError(e.message); } finally { setMerging(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" className="w-[520px] rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: '#E67E22' }} />
            <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
              DUPLICATE DOMAINS
            </h2>
          </div>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--wr-text-muted)' }}>
          These domains share the same name. Select which one to keep — the others will be deleted
          and linked SMEs, scenarios, threats, chains, and sessions moved to the kept domain.
        </p>

        <div className="space-y-2 mb-5">
          {group.map(d => {
            const count = agentCounts[d.id] || 0;
            const isKeep = d.id === keepId;
            return (
              <button data-ui="card" key={d.id} disabled={merging} onClick={() => setKeepId(d.id)}
                className="w-full flex items-center gap-3 p-3 rounded text-left transition-all"
                style={{
                  backgroundColor: isKeep ? 'rgba(240,165,0,0.08)' : 'var(--wr-bg-secondary)',
                  border: `1px solid ${isKeep ? 'rgba(240,165,0,0.4)' : 'var(--wr-border)'}`,
                }}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color || '#F0A500' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{d.name}</p>
                  {d.description && (
                    <MarkdownContent className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{d.description}</MarkdownContent>
                  )}
                </div>
                <div className="flex-shrink-0 text-right mr-2">
                  <p className="text-sm font-bold font-mono" style={{ color: d.color || '#F0A500' }}>{count}</p>
                  <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>agents</p>
                </div>
                <span data-ui="badge" className="flex-shrink-0 text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: isKeep ? 'rgba(240,165,0,0.15)' : 'rgba(192,57,43,0.1)',
                    color: isKeep ? 'var(--wr-amber)' : '#C0392B',
                    border: `1px solid ${isKeep ? 'rgba(240,165,0,0.3)' : 'rgba(192,57,43,0.3)'}`,
                  }}>
                  {isKeep ? 'KEEP' : 'DELETE'}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs mb-5 px-1" style={{ color: 'var(--wr-text-muted)' }}>
          {toDelete.length} domain{toDelete.length !== 1 ? 's' : ''} will be deleted.
          {toDelete.reduce((s, d) => s + (agentCounts[d.id] || 0), 0) > 0 &&
            ` ${toDelete.reduce((s, d) => s + (agentCounts[d.id] || 0), 0)} agent${toDelete.reduce((s, d) => s + (agentCounts[d.id] || 0), 0) !== 1 ? 's' : ''} will be reassigned.`}
        </p>

        {error && <p role="alert" className="text-sm text-red-300 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <WrButton variant="secondary" onClick={onClose} disabled={merging}>Cancel</WrButton>
          <WrButton onClick={handleMerge} disabled={merging}>
            {merging ? 'Merging...' : `Keep "${group.find(d => d.id === keepId)?.name}" & Delete ${toDelete.length} Duplicate${toDelete.length !== 1 ? 's' : ''}`}
          </WrButton>
        </div>
      </div>
    </div>
  );
}

// ── Sync preview modal ────────────────────────────────────────────────────────
function SyncPreviewModal({ preview, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => new Set(preview.newDomains.map(d => d.name)));
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const allSelected = selected.size === preview.newDomains.length;

  const toggle = (name) => setSelected(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(preview.newDomains.map(d => d.name)));

  const handleConfirm = async () => {
    setCommitting(true);
    setError('');
    try { await onConfirm([...selected]); } catch (e) { setError(e.message); } finally { setCommitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" className="w-[520px] max-h-[80vh] flex flex-col rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
              SYNC PREVIEW
            </h2>
          </div>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>
        <p className="text-xs mb-4 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>
          These domains will be created from agent disciplines. Uncheck any you don't want —
          agents matching an unchecked domain will be left unassigned.
        </p>

        {preview.newDomains.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2 px-1 flex-shrink-0">
              <span className="text-xs font-bold font-mono tracking-widest" style={{ color: 'var(--wr-text-muted)' }}>
                {selected.size} OF {preview.newDomains.length} SELECTED
              </span>
              <button data-ui="action" onClick={toggleAll} className="text-xs underline" style={{ color: 'var(--wr-amber)' }}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="space-y-1.5 mb-4 overflow-y-auto min-h-0 pr-1">
              {preview.newDomains.map(d => {
                const isChecked = selected.has(d.name);
                return (
                  <label key={d.name}
                    className="w-full flex items-center gap-3 p-2.5 rounded cursor-pointer transition-all"
                    style={{
                      backgroundColor: isChecked ? 'rgba(240,165,0,0.08)' : 'var(--wr-bg-secondary)',
                      border: `1px solid ${isChecked ? 'rgba(240,165,0,0.4)' : 'var(--wr-border)'}`,
                      opacity: isChecked ? 1 : 0.6,
                    }}
                  >
                    <input type="checkbox" checked={isChecked} onChange={() => toggle(d.name)} className="flex-shrink-0 accent-amber-500" />
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--wr-text-primary)' }}>{d.name}</span>
                    <span className="flex-shrink-0 text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                      {d.agentCount} agent{d.agentCount !== 1 ? 's' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        {preview.existingAssignments > 0 && (
          <p className="text-xs mb-4 px-1 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>
            {preview.existingAssignments} agent{preview.existingAssignments !== 1 ? 's' : ''} will also be linked to existing domains.
          </p>
        )}

        {error && <p role="alert" className="text-sm text-red-300 mb-3">{error}</p>}
        <div className="flex justify-end gap-2 flex-shrink-0">
          <WrButton variant="secondary" onClick={onClose} disabled={committing}>Cancel</WrButton>
          <WrButton onClick={handleConfirm} disabled={committing || (selected.size === 0 && preview.existingAssignments === 0)}>
            {committing ? 'Syncing...' : selected.size > 0
              ? `Create ${selected.size} Domain${selected.size !== 1 ? 's' : ''} & Sync`
              : 'Sync Assignments Only'}
          </WrButton>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Domains() {
  const { db, workspace } = useWorkspace();
  const canWrite = ['admin', 'analyst'].includes(workspace?.role);
  const canDelete = workspace?.role === 'admin';
  const [allAgents, setAllAgents] = useState([]);
  const [allScenarios, setAllScenarios] = useState([]);
  const [error, setError] = useState('');
  const [domains, setDomains]             = useState([]);
  const [agentCounts, setAgentCounts]     = useState({});
  const [duplicates, setDuplicates]       = useState([]); // array of duplicate groups
  const [modal, setModal]               = useState(null);
  const [dupModal, setDupModal]         = useState(null); // duplicate group being reviewed
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [syncResult, setSyncResult]     = useState(null);
  const [syncPreview, setSyncPreview]   = useState(null); // { newDomains, existingAssignments }

  const load = async () => {
    if (!db) return;
    try {
      const [doms, agents, scenarios] = await Promise.all([db.Domain.list(), db.Agent.list(), db.Scenario.list()]);
      const colored=distinctDomainColors(await loadDomainHierarchy(db,doms));
      const coverage = domainCoverage(colored, agents, scenarios);
      setDomains(colored); setAllAgents(agents); setAllScenarios(scenarios);
      setAgentCounts(Object.fromEntries(coverage.rows.map(d => [d.id, d.count])));
      setDuplicates(coverage.duplicates); setError('');
    } catch (e) { setError(e.message); throw e; }
    finally { setLoading(false); }
  };
  useEffect(() => { load().catch(() => {}); }, [db]);

  const handleSave = async form => {
    const name = form.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Enter a domain name.');
    const fresh = await db.Domain.list();
    if (fresh.some(d => d.id !== form.id && normalizeDomainName(d.name) === normalizeDomainName(name))) throw new Error('A domain with this name already exists. Use it or choose a different name.');
    const payload = { name, description: form.description || '', color: form.color || '#2E75B6', icon: form.icon || 'Globe' };
    if (form.id) await db.Domain.update(form.id, payload); else await db.Domain.create(payload);
    setModal(null); await load();
  };

  // Broad discipline name for an agent lacking a valid domain, or null
  const broadDiscipline = (agent) => {
    if (!agent.discipline) return null;
    return agent.discipline.split(/[\/,]/)[0].trim() || null;
  };

  // Sync step 1 (read-only): compute what a sync would do and open the preview modal
  const previewSyncUnsafe = async () => {
    setSyncing(true);
    setSyncResult(null);
    const currentDomains = await queued(() => db.Domain.list());
    const agents = await queued(() => db.Agent.list());

    const existingIds   = new Set(currentDomains.map(d => d.id));
    const existingNames = new Map(currentDomains.map(d => [normalizeDomainName(d.name), d.id]));

    // Count orphaned agents per broad discipline
    const candidateCounts = new Map(); // broad name → agent count
    let existingAssignments = 0;
    agents.forEach(a => {
      if (!a.domain_id || !existingIds.has(a.domain_id)) {
        const broad = broadDiscipline(a);
        if (!broad) return;
        if (existingNames.has(normalizeDomainName(broad))) {
          existingAssignments++;
        } else {
          candidateCounts.set(broad, (candidateCounts.get(broad) || 0) + 1);
        }
      }
    });

    if (candidateCounts.size === 0 && existingAssignments === 0) {
      setSyncResult({ created: 0, names: [], reassigned: 0 });
      setSyncing(false);
      return;
    }

    let colorIdx = currentDomains.length;
    const newDomains = [...candidateCounts.entries()].map(([name, agentCount]) => ({
      name,
      agentCount,
      color: DOMAIN_COLORS[colorIdx++ % DOMAIN_COLORS.length],
    })).sort((a, b) => b.agentCount - a.agentCount || a.name.localeCompare(b.name));

    setSyncPreview({ newDomains, existingAssignments });
    setSyncing(false);
  };

  const previewSync = async () => { try { await previewSyncUnsafe(); } catch (e) { setError(e.message); } finally { setSyncing(false); } };

  // Sync step 2 (writes): create only the selected domains, then assign orphaned agents
  const commitSync = async (selectedNames) => {
    const selectedSet = new Set(selectedNames.map(n => normalizeDomainName(n)));
    const preview = syncPreview;
    const currentDomains = await queued(() => db.Domain.list());
    const agents = await queued(() => db.Agent.list());

    const existingIds = new Set(currentDomains.map(d => d.id));
    const domainCache = new Map(currentDomains.map(d => [normalizeDomainName(d.name), d.id]));

    let created = 0;
    const createdNames = [];
    for (const cand of preview.newDomains) {
      if (!selectedSet.has(normalizeDomainName(cand.name))) continue;
      if (domainCache.has(normalizeDomainName(cand.name))) continue;
      const newDomain = await db.Domain.create({
        name: cand.name,
        color: cand.color,
        description: 'Auto-created from agent discipline sync.',
      });
      domainCache.set(normalizeDomainName(cand.name), newDomain.id);
      createdNames.push(cand.name);
      created++;
    }

    // Assign domain_id to orphaned agents whose discipline maps to an existing or newly created domain
    let reassigned = 0;
    for (const agent of agents) {
      if (!agent.domain_id || !existingIds.has(agent.domain_id)) {
        const broad = broadDiscipline(agent);
        if (!broad) continue;
        const newId = domainCache.get(normalizeDomainName(broad));
        if (newId) {
          await db.Agent.update(agent.id, { domain_id: newId });
          reassigned++;
        }
      }
    }

    setSyncResult({ created, names: createdNames, reassigned });
    setSyncPreview(null);
    await load();
  };

  // Reassign every domain-bearing entity before deleting duplicate records.
  const handleMergeDuplicates = async (keepId, toDelete) => {
    const ids = new Set(toDelete.map(d => d.id));
    if(domains.some(d=>ids.has(d.id)&&d.parent_domain_id||ids.has(d.parent_domain_id)))throw new Error('This domain participates in an umbrella category. Update the hierarchy before merging it.');
    for (const entity of ['Agent', 'Scenario', 'Threat', 'Chain', 'Session']) {
      for (const row of await db[entity].list()) if (ids.has(row.domain_id)) await db[entity].update(row.id, { domain_id: keepId });
    }
    const existing = new Set((await db.Domain.list()).map(d => d.id));
    for (const domain of toDelete) if (existing.has(domain.id)) await db.Domain.delete(domain.id);
    setDupModal(null); await load();
  };
  const handleDelete = async id => {
    try {
      if(domains.some(d=>d.parent_domain_id===id))throw new Error('This umbrella domain has child domains. Keep or reorganize its children before deleting it.');
      const linked = [];
      for (const entity of ['Agent', 'Scenario', 'Threat', 'Chain', 'Session']) {
        const count = (await db[entity].filter({ domain_id: id })).length;
        if (count) linked.push(count + ' ' + entity.toLowerCase() + ' records');
      }
      if (linked.length) throw new Error('This domain still has ' + linked.join(', ') + '. Reassign linked records before deleting it.');
      if (!window.confirm('Delete the empty domain "' + domains.find(d => d.id === id)?.name + '"?')) return;
      await db.Domain.delete(id); await load();
    } catch (e) { setError(e.message); }
  };
  return <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
    <PageHeader icon={Globe} title="DOMAINS" subtitle="See SME distribution, find gaps, and organize your expert library" actions={<div className="flex gap-2"><WrButton variant="secondary" onClick={() => load().catch(() => {})}><RefreshCw className="w-4 h-4" />Refresh</WrButton><WrButton disabled={!canWrite} onClick={() => setModal('new')}><Plus className="w-4 h-4" />New domain</WrButton></div>} />
    <div className="p-6 space-y-5">
      {error && <p role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-sm text-red-200">{error}</p>}
      {loading ? <p role="status" className="text-slate-300">Loading domains and SMEs…</p> : <DomainCoverage domains={domains} agents={allAgents} scenarios={allScenarios} db={db} onReload={load} onEdit={setModal} onDelete={handleDelete} canWrite={canWrite} canDelete={canDelete} />}
      <details className="rounded border border-slate-700 p-4 text-slate-200"><summary className="cursor-pointer font-semibold">Domain cleanup {duplicates.length > 0 ? '· ' + duplicates.length + ' duplicate name groups' : ''}</summary><div className="mt-4 space-y-3 text-sm"><p>Use existing broad domains where possible. Discipline sync can propose new domains; review the list before creating them.</p><WrButton variant="secondary" onClick={previewSync} disabled={!canWrite || syncing}>{syncing ? 'Scanning…' : 'Preview discipline sync'}</WrButton>{duplicates.map(group => <div key={group[0].id} className="flex items-center justify-between gap-3"><span>{group[0].name} · {group.length} domains with the same name</span><WrButton variant="secondary" disabled={!canDelete} onClick={() => setDupModal(group)}>Review duplicates</WrButton></div>)}</div></details>
      {syncResult && <p role="status" className="text-sm text-amber-300">{syncResult.created} domains created · {syncResult.reassigned} SMEs assigned.{!syncResult.created && !syncResult.reassigned ? ' No discipline-based changes found. Use Unassigned SMEs to assign unmatched profiles manually.' : ''}</p>}
    </div>
    {modal && <DomainModal domains={domains} domain={modal === 'new' ? null : modal} onSave={handleSave} onClose={() => setModal(null)} />}
    {dupModal && <DuplicateModal group={dupModal} agentCounts={agentCounts} onMerge={handleMergeDuplicates} onClose={() => setDupModal(null)} />}
    {syncPreview && <SyncPreviewModal preview={syncPreview} onConfirm={commitSync} onClose={() => setSyncPreview(null)} />}
  </div>;
}
