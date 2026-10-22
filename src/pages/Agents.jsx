import {useBackgroundWork} from '@/components/layout/BackgroundWork';
import {loadDomainHierarchy,descendantDomainIds,domainPath} from '@/lib/domainHierarchy';
import {distinctDomainColors} from '@/lib/domainColors';
import DomainFilterTree from '@/components/agents/DomainFilterTree';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Bot, Plus, Search, Sparkles, Trash2, Edit2, Copy, Upload, Trash, Wand2, Download, FileText } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import WrButton from '@/components/ui/WrButton';
import SeverityBadge, { agentDefaultSeverityTitle } from '@/components/ui/SeverityBadge';
import { VectorBars } from '@/components/ui/VectorBar';
import AgentFormModal from '@/components/agents/AgentFormModal';
import AgentImportModal from '@/components/agents/AgentImportModal';
import BulkDeleteModal from '@/components/agents/BulkDeleteModal';
import DomainAssignModal from '@/components/agents/DomainAssignModal';
import { downloadPersonaExport } from '@/lib/agentExport';
import { exportPersonasPdf } from '@/lib/personaPdf';

export default function Agents() {
  const { db, workspace } = useWorkspace();
  const [agents, setAgents] = useState([]);
  const [domains, setDomains] = useState([]);
  const [modal, setModal] = useState(null); // null | 'new' | 'ai' | 'import' | agent object
  const [showImport, setShowImport] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [aiSeed, setAiSeed] = useState(null);
  const [pdfState, setPdfState] = useState({ busy: false, error: null });
 useBackgroundWork(pdfState.busy,'SME export');

  // Deep links from the Threat Map: ?domain=<id> filters, ?q= searches,
  // ?generate=1&expert_type=&domain_id= opens the AI-generate modal pre-seeded
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const domain = searchParams.get('domain');
    const q = searchParams.get('q');
    if (domain) setFilterDomain(domain);
    if (q) setSearch(q);
    if (searchParams.get('generate')) {
      setAiSeed({
        expert_type: searchParams.get('expert_type') || '',
        domain_id: searchParams.get('domain_id') || '',
      });
      setModal('ai');
    }
    if (domain || q || searchParams.get('generate')) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoadingRef = useRef(false);
  const load = async (retries = 3) => {
    if (isLoadingRef.current || !db) return;
    isLoadingRef.current = true;
    setLoading(true);
    try {
      const [a, d] = await Promise.all([db.Agent.list(), db.Domain.list()]);
      setAgents(a);
      setDomains(distinctDomainColors(await loadDomainHierarchy(db,d)));
    } catch (err) {
      if (retries > 0 && err?.message?.includes('Rate limit')) {
        isLoadingRef.current = false;
        await new Promise(r => setTimeout(r, 1500));
        return load(retries - 1);
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  useEffect(() => { load(); }, [db]);

  const handleSave = async (form) => {
    if (form.id) await db.Agent.update(form.id, form);
    else await db.Agent.create(form);
    setModal(null);
    load();
  };

  const handleClone = async (agent) => {
    const { id, created_at, workspace_id, created_by, ...rest } = agent;
    await db.Agent.create({ ...rest, name: `${rest.name} (Copy)` });
    load();
  };

  const handleDelete = async (agent) => {
    if (!confirm(`Delete SME "${agent.name}"?`)) return;
    await db.Agent.delete(agent.id);
    load();
  };

  const toggleSelect = (id) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelected(newSet);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(a => a.id)));
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setShowBulkDelete(false);
    setSelected(new Set());
    await Promise.all(ids.map(id => db.Agent.delete(id)));
    load();
  };

  const filterIds=descendantDomainIds(domains,filterDomain);
  const filtered = agents.filter(a => {
    const matchSearch = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.discipline?.toLowerCase().includes(search.toLowerCase());
    const matchDomain = !filterDomain || filterIds.has(a.domain_id);
    return matchSearch && matchDomain;
  });

  const domainById = id => domains.find(d => d.id === id);

  // Export the personas currently in view (respects search/domain filters) as a
  // portable JSON file — no ids or workspace refs, so it can be reimported
  // anywhere.
  const handleExport = () => {
    const toExport = filtered;
    downloadPersonaExport(toExport, domains);
  };

  // Export personas to a formatted PDF (R-N13). Given a list, exports exactly
  // that; otherwise the selection if any, else the agents currently in view.
  // Every page carries the handling marking. Failures are shown, not swallowed.
  const pdfTargets = () => (selected.size ? filtered.filter(a => selected.has(a.id)) : filtered);
  const handleExportPdf = async (list) => {
    const toExport = list?.length ? list : pdfTargets();
    if (!toExport.length) return;
    setPdfState({ busy: true, error: null });
    try {
      await exportPersonasPdf(toExport, domains);
      setPdfState({ busy: false, error: null });
    } catch (err) {
      setPdfState({ busy: false, error: `PDF export failed: ${err?.message || err}. Retry with Export PDF.` });
    }
  };

  // Build the filter list from domain_ids that agents actually reference.
  // Resolves name/color from loaded workspace domains where possible;
  // falls back to discipline-based label for agents with unresolved domain_ids.
  const domainMap = Object.fromEntries(domains.map(d => [d.id, d]));
  const filterDomains = [
    ...domains.filter(d=>d.parent_domain_id||domains.some(c=>c.parent_domain_id===d.id)),
    ...new Map(
      agents
        .filter(a => a.domain_id)
        .map(a => {
          const resolved = domainMap[a.domain_id];
          return [
            a.domain_id,
            resolved || { id: a.domain_id, name: a.discipline?.split(/[\/,]/)[0]?.trim() || 'Other', color: '#546E7A' },
          ];
        })
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      <PageHeader
        icon={Bot}
        title="SME"
        subtitle={`${agents.length} SMEs in your library`}
        actions={
          <div className="flex gap-2">
            <WrButton variant="outline" onClick={() => setShowAssign(true)}><Wand2 className="w-4 h-4" /> Organize domains</WrButton>
            <WrButton variant="outline" onClick={() => setShowImport(true)}><Upload className="w-4 h-4" /> Import</WrButton>
            <WrButton variant="outline" onClick={handleExport} disabled={!agents.length}
              title={filtered.length < agents.length
                ? `Export the ${filtered.length} filtered SMEs as JSON`
                : 'Export all SME personas as JSON'}>
              <Download className="w-4 h-4" /> Export
            </WrButton>
            <WrButton variant="outline" onClick={() => handleExportPdf()} disabled={!agents.length || pdfState.busy}
              title={selected.size
                ? `Export the ${selected.size} selected SMEs as a PDF`
                : filtered.length < agents.length
                  ? `Export the ${filtered.length} filtered SMEs as a PDF`
                  : 'Export all SME personas as a PDF'}>
              <FileText className="w-4 h-4" /> {pdfState.busy ? 'Building PDF…' : 'Export PDF'}
            </WrButton>
            <WrButton variant="outline" onClick={() => setModal('ai')}><Sparkles className="w-4 h-4" /> AI Generate</WrButton>
            <WrButton onClick={() => setModal('new')}><Plus className="w-4 h-4" /> New SME</WrButton>
          </div>
        }
      />

      <div className="flex">
        {/* Filter Sidebar */}
        <div className="w-52 flex-shrink-0 border-r p-4 sticky top-0 h-screen flex flex-col" style={{ borderColor: 'var(--wr-border)' }}>
          <div data-ui="surface" className="flex items-center gap-2 px-2 py-1.5 rounded flex-shrink-0 mb-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 text-xs outline-none bg-transparent"
              style={{ color: 'var(--wr-text-primary)' }}
            />
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <p className="text-xs font-bold tracking-widest mb-2 font-mono flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>DOMAIN</p>
            <DomainFilterTree domains={[...new Map(filterDomains.map(d=>[d.id,d])).values()]} agents={agents} value={filterDomain} onChange={setFilterDomain}/>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 min-w-0 p-4">
          {pdfState.error && (
            <div data-ui="surface" className="mb-4 flex items-center gap-3 px-4 py-3 rounded text-sm" role="alert" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)', color: '#C0392B' }}>
              <span className="flex-1">{pdfState.error}</span>
              <button data-ui="action" onClick={() => setPdfState({ busy: false, error: null })} className="text-xs px-3 py-1 rounded" style={{ backgroundColor: 'var(--wr-border)', color: 'var(--wr-text-secondary)' }}>
                Dismiss
              </button>
            </div>
          )}
          {selected.size > 0 && (
            <div data-ui="surface" className="mb-4 flex items-center gap-3 px-4 py-3 rounded" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)' }}>
              <span className="text-sm font-medium" style={{ color: '#C0392B' }}>{selected.size} SME{selected.size !== 1 ? 's' : ''} selected</span>
              {selected.size < filtered.length && (
                <button data-ui="action" onClick={() => setSelected(new Set(filtered.map(a => a.id)))} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(240,165,0,0.2)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)' }}>
                  Select all {filtered.length}
                </button>
              )}
              <button data-ui="action" onClick={() => setShowBulkDelete(true)} className="ml-auto flex items-center gap-2 text-xs px-3 py-1 rounded" style={{ backgroundColor: 'rgba(192,57,43,0.2)', color: '#C0392B' }}>
                <Trash className="w-3 h-3" /> Delete Selected
              </button>
              <button data-ui="action" onClick={() => setSelected(new Set())} className="text-xs px-3 py-1 rounded" style={{ backgroundColor: 'var(--wr-border)', color: 'var(--wr-text-secondary)' }}>
                Cancel
              </button>
            </div>
          )}
          {loading ? (
            <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill, minmax(min(100%, 280px), 1fr))"}}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-52 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No SMEs found"
              description={agents.length === 0
                ? "SMEs are the expert archetypes that power every AgentDebate session. Build them manually or let AI generate a profile."
                : "No SMEs match your current filters."}
              action={agents.length === 0 ? () => setModal('new') : null}
              actionLabel="Create First SME"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(agent => {
                const domain = domainById(agent.domain_id);
                const color = domain?.color || '#94A3B8';
                const isSelected = selected.has(agent.id);
                return (
                  <div data-ui="surface"
                    key={agent.id}
                    className="sme-card min-w-0 rounded overflow-hidden cursor-pointer transition-all"
                    style={{ 
                      backgroundColor: isSelected ? 'rgba(240,165,0,0.12)' : 'var(--wr-bg-card)',
                      border: isSelected ? '2px solid var(--wr-amber)' : '1px solid '+color+'66',
                      opacity: isSelected ? 1 : 1
                    }}
                    onClick={() => toggleSelect(agent.id)}
                  >
                    <div className="h-1.5" aria-hidden="true" style={{ backgroundColor: color }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</h3>
                          <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0"><SeverityBadge severity={agent.severity_default} size="xs" title={agentDefaultSeverityTitle(agent.severity_default)} />{agent.is_ai_generated&&<span className="text-[10px]" style={{color:"var(--wr-text-muted)"}}>AI generated</span>}</div>
                      </div>

                      <p className="flex items-center gap-2 text-xs mt-3" style={{color:'var(--wr-text-secondary)'}}><span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:color}}/>{domain?domainPath(domains,domain.id):'Unassigned domain'}</p>
                      <div className="mt-3">
                        <VectorBars agent={agent} />
                      </div>

                      {agent.cognitive_bias && (
                        <p className="text-xs mt-3 italic line-clamp-2" style={{ color: 'var(--wr-text-muted)' }}>
                          "{agent.cognitive_bias}"
                        </p>
                      )}

                      {agent.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {agent.tags.slice(0, 3).map(t => (
                            <span data-ui="badge" key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="sme-card-actions mt-3 pt-3 border-t" aria-label={'Actions for '+agent.name} role="group" style={{borderColor:'var(--wr-border)'}} onClick={e=>e.stopPropagation()}>
                        <button type="button" data-ui="toolbar-action" className="sme-card-edit" onClick={()=>setModal(agent)}><Edit2 aria-hidden="true"/> Edit</button>
                        <button type="button" data-ui="toolbar-action" onClick={()=>handleClone(agent)}><Copy aria-hidden="true"/> Clone</button>
                        <button type="button" data-ui="toolbar-action" onClick={()=>handleExportPdf([agent])} disabled={pdfState.busy} title="Export this persona as a PDF"><FileText aria-hidden="true"/> PDF</button>
                        <button type="button" data-ui="toolbar-action" className="sme-card-delete" onClick={()=>handleDelete(agent)}><Trash2 aria-hidden="true"/> Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <AgentImportModal
          existingDomains={domains}
          onDone={load}
          onClose={() => setShowImport(false)}
        />
      )}

      {showAssign && (
        <DomainAssignModal
          agents={agents}
          domains={domains}
          onDone={load}
          onClose={() => setShowAssign(false)}
        />
      )}

      {(modal === 'new' || modal === 'ai' || (modal && typeof modal === 'object')) && (
        <AgentFormModal
          agent={typeof modal === 'object' ? modal : null}
          mode={modal === 'ai' ? 'ai' : 'manual'}
          aiSeed={modal === 'ai' ? aiSeed : null}
          domains={domains}
          onSave={handleSave}
          onClose={() => { setModal(null); setAiSeed(null); }}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteModal
          count={selected.size}
          agents={filtered.filter(a => selected.has(a.id))}
          filteredAgents={filtered}
          domains={domains}
          onSelectAll={() => setSelected(new Set(filtered.map(a => a.id)))}
          onConfirm={handleBulkDelete}
          onClose={() => setShowBulkDelete(false)}
        />
      )}
    </div>
  );
}