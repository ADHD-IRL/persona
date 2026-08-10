import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Bot, Plus, Search, Sparkles, Trash2, Edit2, Copy, Upload, Trash, Wand2, Download } from 'lucide-react';
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
      setDomains(d);
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
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
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

  const filtered = agents.filter(a => {
    const matchSearch = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.discipline?.toLowerCase().includes(search.toLowerCase());
    const matchDomain = !filterDomain || a.domain_id === filterDomain;
    return matchSearch && matchDomain;
  });

  const domainById = id => domains.find(d => d.id === id);

  // Export the personas currently in view (respects search/domain filters) as a
  // portable JSON file — no ids or workspace refs, so it can be reimported
  // anywhere.
  const handleExport = () => {
    const toExport = filtered.length ? filtered : agents;
    downloadPersonaExport(toExport, domains);
  };

  // Build the filter list from domain_ids that agents actually reference.
  // Resolves name/color from loaded workspace domains where possible;
  // falls back to discipline-based label for agents with unresolved domain_ids.
  const domainMap = Object.fromEntries(domains.map(d => [d.id, d]));
  const filterDomains = [
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
        title="AGENTS"
        subtitle={`${agents.length} agents in workspace`}
        actions={
          <div className="flex gap-2">
            <WrButton variant="outline" onClick={() => setShowAssign(true)}><Wand2 className="w-4 h-4" /> Assign Domains</WrButton>
            <WrButton variant="outline" onClick={() => setShowImport(true)}><Upload className="w-4 h-4" /> Import</WrButton>
            <WrButton variant="outline" onClick={handleExport} disabled={!agents.length}
              title={filtered.length < agents.length
                ? `Export the ${filtered.length} filtered agents as JSON`
                : 'Export all agent personas as JSON'}>
              <Download className="w-4 h-4" /> Export
            </WrButton>
            <WrButton variant="outline" onClick={() => setModal('ai')}><Sparkles className="w-4 h-4" /> AI Generate</WrButton>
            <WrButton onClick={() => setModal('new')}><Plus className="w-4 h-4" /> New Agent</WrButton>
          </div>
        }
      />

      <div className="flex">
        {/* Filter Sidebar */}
        <div className="w-52 flex-shrink-0 border-r p-4 sticky top-0 h-screen flex flex-col" style={{ borderColor: 'var(--wr-border)' }}>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded flex-shrink-0 mb-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
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
            <div className="space-y-1 flex-1 min-h-0 overflow-y-auto pr-1">
              <button
                onClick={() => setFilterDomain('')}
                className="w-full text-left text-xs px-2 py-1 rounded transition-colors"
                style={{ color: !filterDomain ? 'var(--wr-amber)' : 'var(--wr-text-secondary)', backgroundColor: !filterDomain ? 'rgba(240,165,0,0.08)' : 'transparent' }}
              >
                All Domains <span style={{ color: 'var(--wr-text-muted)' }}>({agents.filter(a => a.domain_id).length})</span>
              </button>
              {filterDomains.map(d => (
                <button
                  key={d.id}
                  onClick={() => setFilterDomain(d.id)}
                  className="w-full text-left text-xs px-2 py-1 rounded transition-colors flex items-center gap-2"
                  style={{ color: filterDomain === d.id ? 'var(--wr-amber)' : 'var(--wr-text-secondary)', backgroundColor: filterDomain === d.id ? 'rgba(240,165,0,0.08)' : 'transparent' }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  {d.name} <span style={{ color: 'var(--wr-text-muted)' }}>({agents.filter(a => a.domain_id === d.id).length})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 p-4">
          {selected.size > 0 && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)' }}>
              <span className="text-sm font-medium" style={{ color: '#C0392B' }}>{selected.size} agent{selected.size !== 1 ? 's' : ''} selected</span>
              {selected.size < filtered.length && (
                <button onClick={() => setSelected(new Set(filtered.map(a => a.id)))} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(240,165,0,0.2)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)' }}>
                  Select all {filtered.length}
                </button>
              )}
              <button onClick={() => setShowBulkDelete(true)} className="ml-auto flex items-center gap-2 text-xs px-3 py-1 rounded" style={{ backgroundColor: 'rgba(192,57,43,0.2)', color: '#C0392B' }}>
                <Trash className="w-3 h-3" /> Delete Selected
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs px-3 py-1 rounded" style={{ backgroundColor: 'var(--wr-border)', color: 'var(--wr-text-secondary)' }}>
                Cancel
              </button>
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-52 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agents found"
              description={agents.length === 0
                ? "Agents are the expert archetypes that power every AgentDebate session. Build them manually or let AI generate a profile."
                : "No agents match your current filters."}
              action={agents.length === 0 ? () => setModal('new') : null}
              actionLabel="Create First Agent"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(agent => {
                const domain = domainById(agent.domain_id);
                const color = domain?.color || '#F0A500';
                const isSelected = selected.has(agent.id);
                return (
                  <div
                    key={agent.id}
                    className="rounded overflow-hidden cursor-pointer transition-all"
                    style={{ 
                      backgroundColor: isSelected ? 'rgba(240,165,0,0.12)' : 'var(--wr-bg-card)',
                      border: isSelected ? '2px solid var(--wr-amber)' : '1px solid var(--wr-border)',
                      opacity: isSelected ? 1 : 1
                    }}
                    onClick={() => toggleSelect(agent.id)}
                  >
                    <div className="h-1" style={{ backgroundColor: color }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</h3>
                          <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</p>
                        </div>
                        <SeverityBadge severity={agent.severity_default} size="xs" title={agentDefaultSeverityTitle(agent.severity_default)} />
                      </div>

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
                            <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1 mt-3 pt-3 border-t" style={{ borderColor: 'var(--wr-border)' }}>
                        <button
                          onClick={() => setModal(agent)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors hover:bg-white/5"
                          style={{ color: 'var(--wr-text-muted)' }}
                        >
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleClone(agent)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors hover:bg-white/5"
                          style={{ color: 'var(--wr-text-muted)' }}
                        >
                          <Copy className="w-3 h-3" /> Clone
                        </button>
                        <button
                          onClick={() => handleDelete(agent)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors hover:bg-red-900/20 ml-auto"
                          style={{ color: '#C0392B' }}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                        {agent.is_ai_generated && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(123,45,139,0.2)', color: '#9B59B6' }}>
                            AI
                          </span>
                        )}
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