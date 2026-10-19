import { useState, useEffect } from 'react';
import { queued } from '@/lib/apiQueue';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Target, Plus, X, Sparkles, Search, ChevronRight, Download, FileText, Link2, Trash2 } from 'lucide-react';
import { scenarioAiAssist, fetchUrlScenario } from '@/lib/llm';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import WrButton from '@/components/ui/WrButton';
import { WrInput, WrSelect } from '@/components/ui/WrInput';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import SynthesisDocument from '@/components/session/SynthesisDocument';

const STATUS_COLOR = { draft: '#546E7A', active: '#27AE60', archived: '#C0392B' };

// Minimal, self-contained markdown → HTML for the print/PDF export window
// (the in-app view uses the SynthesisDocument renderer; this standalone HTML
// document can't use React components).
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineMd(s) {
  let t = escapeHtml(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/`([^`]+?)`/g, '<code>$1</code>');
  t = t.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
  return t;
}
function mdToHtml(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^###\s+/.test(line))      { out.push(`<h3>${inlineMd(line.replace(/^###\s+/, ''))}</h3>`); i++; continue; }
    if (/^##\s+/.test(line))       { out.push(`<h2>${inlineMd(line.replace(/^##\s+/, ''))}</h2>`); i++; continue; }
    if (/^#\s+/.test(line))        { out.push(`<h1>${inlineMd(line.replace(/^#\s+/, ''))}</h1>`); i++; continue; }
    if (/^---+$/.test(line.trim())) { out.push('<hr/>'); i++; continue; }
    if (/^>\s?/.test(line))        { out.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(`<li>${inlineMd(lines[i].replace(/^[-*]\s+/, ''))}</li>`); i++; }
      out.push(`<ul>${items.join('')}</ul>`); continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(`<li>${inlineMd(lines[i].replace(/^\d+\.\s+/, ''))}</li>`); i++; }
      out.push(`<ol>${items.join('')}</ol>`); continue;
    }
    if (line.trim() === '') { i++; continue; }
    out.push(`<p>${inlineMd(line)}</p>`); i++;
  }
  return out.join('\n');
}

function ScenarioModal({ scenario, domains, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', description: '', domain_id: '', context_document: '', status: 'draft', tags: [], ...scenario });
  const [aiLoading, setAiLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const aiAssist = async () => {
    if (!form.context_document) return;
    setAiLoading(true);
    try {
      const res = await scenarioAiAssist({ context: form.context_document });
      set('context_document', res.improved);
    } finally {
      setAiLoading(false);
    }
  };

  const fetchFromUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlError('');
    setUrlLoading(true);
    try {
      const res = await fetchUrlScenario({ url: urlInput.trim() });
      set('context_document', res.context);
      setUrlInput('');
    } catch (e) {
      setUrlError('Failed to fetch URL. Check it is publicly accessible.');
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" className="w-[640px] max-h-[90vh] overflow-y-auto rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
            {scenario?.id ? 'EDIT SCENARIO' : 'NEW SCENARIO'}
          </h2>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>
        <div className="space-y-4">
          <WrInput label="NAME" value={form.name} onChange={v => set('name', v)} placeholder="Scenario name" />
          <WrSelect label="DOMAIN" value={form.domain_id} onChange={v => set('domain_id', v)}>
            <option value="">Select domain...</option>
            {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </WrSelect>
          <WrInput label="DESCRIPTION" value={form.description} onChange={v => set('description', v)} placeholder="Brief description..." rows={2} />
          <WrSelect label="STATUS" value={form.status} onChange={v => set('status', v)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </WrSelect>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>CONTEXT DOCUMENT</label>
              <Tooltip>
              <TooltipTrigger asChild>
                <button data-ui="action" onClick={aiAssist} disabled={aiLoading} className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)', backgroundColor: 'rgba(240,165,0,0.05)' }}>
                  <Sparkles className="w-3 h-3" />
                  {aiLoading ? 'Improving...' : 'AI Assist'}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Use AI to expand and improve the context document</TooltipContent>
            </Tooltip>
            </div>
            {/* URL Ingestion */}
            <div className="flex gap-2 mb-2">
              <div data-ui="surface" className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
                <input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchFromUrl()}
                  placeholder="Paste URL to auto-populate from web..."
                  className="flex-1 text-xs outline-none bg-transparent"
                  style={{ color: 'var(--wr-text-primary)' }}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button data-ui="action"
                    onClick={fetchFromUrl}
                    disabled={urlLoading || !urlInput.trim()}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
                    style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)' }}>
                    <Link2 className="w-3 h-3" />
                    {urlLoading ? 'Fetching...' : 'Fetch'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Fetch and extract text from this URL into the context document</TooltipContent>
              </Tooltip>
            </div>
            {urlError && <p className="text-xs mb-2" style={{ color: '#C0392B' }}>{urlError}</p>}
            <textarea
              value={form.context_document}
              onChange={e => set('context_document', e.target.value)}
              rows={8}
              placeholder="Write the full scenario briefing document that all agents will read..."
              className="w-full px-3 py-2 text-sm outline-none resize-none rounded"
              style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
            />
            <p className="text-xs mt-1 text-right" style={{ color: 'var(--wr-text-muted)' }}>{form.context_document?.length || 0} characters</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
          <WrButton onClick={() => onSave(form)}>Save Scenario</WrButton>
        </div>
      </div>
    </div>
  );
}

export default function Scenarios() {
  const { db } = useWorkspace();
  const [scenarios, setScenarios] = useState([]);
  const [domains, setDomains] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!db) return;
    const scen = await queued(() => db.Scenario.list());
    const doms = await queued(() => db.Domain.list());
    setScenarios(scen);
    setDomains(doms);
    setLoading(false);
  };

  useEffect(() => { load(); }, [db]);

  const handleSave = async (form) => {
    const originalScenario = modal === 'new' ? null : modal;
    if (form.id && form.name === originalScenario?.name) {
      // Name unchanged — update in place
      await db.Scenario.update(form.id, form);
    } else if (form.id) {
      // Name changed — create a new scenario, leave the original intact
      const { id: _dropped, ...rest } = form;
      await db.Scenario.create(rest);
    } else {
      await db.Scenario.create(form);
    }
    setModal(null);
    load();
  };

  const handleDelete = async (scen) => {
    if (!confirm(`Delete scenario "${scen.name}"? This cannot be undone.`)) return;
    await db.Scenario.delete(scen.id);
    setScenarios(prev => prev.filter(s => s.id !== scen.id));
    setSelected(null);
  };

  const domainById = (id) => domains.find(d => d.id === id);
  const filtered = scenarios.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()));

  const exportMarkdown = (scen) => {
    const domain = domainById(scen.domain_id);
    const lines = [
      `# OPERATIONAL BRIEF`,
      `## ${scen.name}`,
      '',
      domain ? `**Domain:** ${domain.name}` : '',
      `**Status:** ${scen.status?.toUpperCase()}`,
      `**Exported:** ${new Date().toLocaleDateString()}`,
      '',
      scen.description ? `### Overview\n${scen.description}\n` : '',
      scen.context_document ? `### Context Document\n${scen.context_document}` : '',
    ].filter(l => l !== undefined);
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brief-${scen.name.replace(/\s+/g,'-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = (scen) => {
    const domain = domainById(scen.domain_id);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${scen.name} — Operational Brief</title>
      <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 60px auto; color: #1a1a1a; line-height: 1.7; }
        h1 { font-size: 28px; border-bottom: 3px solid #F0A500; padding-bottom: 10px; margin-bottom: 4px; }
        h2 { font-size: 20px; color: #444; margin-top: 0; }
        h3.section { font-size: 15px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-top: 32px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .meta { font-size: 13px; color: #666; margin-bottom: 32px; display: flex; gap: 24px; }
        .badge { background: #f5f5f5; border: 1px solid #ddd; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        .doc { font-size: 14px; line-height: 1.8; }
        .doc h1 { font-size: 20px; border: none; padding: 0; margin: 24px 0 8px; }
        .doc h2 { font-size: 17px; color: #333; margin: 20px 0 6px; }
        .doc h3 { font-size: 15px; color: #444; text-transform: none; letter-spacing: 0; border: none; padding: 0; margin: 16px 0 4px; }
        .doc p { margin: 8px 0; }
        .doc ul, .doc ol { margin: 8px 0; padding-left: 24px; }
        .doc li { margin: 3px 0; }
        .doc blockquote { border-left: 3px solid #F0A500; margin: 12px 0; padding: 4px 0 4px 14px; color: #555; font-style: italic; }
        .doc code { background: #f5f5f5; border-radius: 3px; padding: 1px 5px; font-size: 13px; }
        .doc hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
        .footer { margin-top: 60px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
      </style></head><body>
      <h1>${escapeHtml(scen.name)}</h1>
      <h2>Operational Brief</h2>
      <div class="meta">
        ${domain ? `<span>Domain: <span class="badge">${escapeHtml(domain.name)}</span></span>` : ''}
        <span>Status: <span class="badge">${escapeHtml(scen.status?.toUpperCase())}</span></span>
        <span>Exported: ${new Date().toLocaleDateString()}</span>
      </div>
      ${scen.description ? `<h3 class="section">Overview</h3><div class="doc">${mdToHtml(scen.description)}</div>` : ''}
      ${scen.context_document ? `<h3 class="section">Context Document</h3><div class="doc">${mdToHtml(scen.context_document)}</div>` : ''}
      <div class="footer">Generated by AgentDebate — Structured Red Team Intelligence Platform</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        icon={Target}
        title="SCENARIOS"
        subtitle="Define situations for analysis"
        actions={<WrButton onClick={() => setModal('new')}><Plus className="w-4 h-4" /> New Scenario</WrButton>}
      />

      <div className="flex flex-1">
        {/* Left list */}
        <div className="w-72 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--wr-border)' }}>
          <div className="p-3 border-b" style={{ borderColor: 'var(--wr-border)' }}>
            <div data-ui="surface" className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
              <Search className="w-3.5 h-3.5" style={{ color: 'var(--wr-text-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search scenarios..."
                className="flex-1 text-sm outline-none bg-transparent" style={{ color: 'var(--wr-text-primary)' }} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && !loading && (
              <div className="p-4 text-sm text-center" style={{ color: 'var(--wr-text-muted)' }}>
                {scenarios.length === 0 ? 'No scenarios yet' : 'No results'}
              </div>
            )}
            {filtered.map(s => {
              const dom = domainById(s.domain_id);
              return (
                <div key={s.id} className="relative group">
                  <button data-ui="card" onClick={() => setSelected(s)}
                    className="w-full text-left p-3 pr-9 border-b transition-colors hover:bg-white/3"
                    style={{
                      borderColor: 'var(--wr-border)',
                      backgroundColor: selected?.id === s.id ? 'var(--wr-bg-card)' : 'transparent',
                      borderLeft: selected?.id === s.id ? `2px solid var(--wr-amber)` : '2px solid transparent',
                    }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--wr-text-primary)' }}>{s.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {dom && <span data-ui="badge" className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${dom.color}22`, color: dom.color }}>{dom.name}</span>}
                      <span data-ui="badge" className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: `${STATUS_COLOR[s.status]}22`, color: STATUS_COLOR[s.status] }}>
                        {s.status?.toUpperCase()}
                      </span>
                    </div>
                  </button>
                  <button data-ui="icon"
                    onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                    title="Delete scenario"
                    aria-label={`Delete scenario ${s.name}`}
                    className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    style={{ color: '#C0392B', backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right detail */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!selected ? (
            <EmptyState
              icon={Target}
              title="Select a scenario"
              description="Choose a scenario from the list or create a new one."
              action={() => setModal('new')}
              actionLabel="New Scenario"
            />
          ) : (
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold break-words" style={{ color: 'var(--wr-text-primary)' }}>{selected.name}</h2>
                  <p className="text-sm mt-1 break-words" style={{ color: 'var(--wr-text-secondary)' }}>{selected.description}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <WrButton variant="secondary" size="sm" onClick={() => setModal(selected)}>Edit</WrButton>
                  <WrButton variant="outline" size="sm" onClick={() => handleDelete(selected)}
                    style={{ color: '#C0392B', borderColor: 'rgba(192,57,43,0.4)' }}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </WrButton>
                  <WrButton variant="outline" size="sm" onClick={() => exportMarkdown(selected)}>
                    <Download className="w-3.5 h-3.5" /> Markdown
                  </WrButton>
                  <WrButton variant="outline" size="sm" onClick={() => exportPdf(selected)}>
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </WrButton>
                  <WrButton asChild size="sm"><Link data-ui="action" to={`/analysis?scenario=${selected.id}`}><ChevronRight className="w-3.5 h-3.5" /> Start session with this scenario</Link></WrButton>
                </div>
              </div>
              {selected.context_document && (
                <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                  <h3 className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>CONTEXT DOCUMENT</h3>
                  <SynthesisDocument text={selected.context_document} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <ScenarioModal
          scenario={modal === 'new' ? null : modal}
          domains={domains}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}