import { useState, useEffect } from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { BookMarked, Plus, X, Trash2, FileText, Upload } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import WrButton from '@/components/ui/WrButton';
import { WrInput } from '@/components/ui/WrInput';
import { chunkText } from '@/lib/knowledge';

const SOURCE_TYPES = ['design-doc', 'incident', 'standard', 'assessment', 'other'];

function AddDocModal({ onAdd, onClose }) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('design-doc');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result || ''));
    reader.readAsText(file);
  };

  const valid = title.trim() && content.trim();
  const chunkCount = valid ? chunkText(content).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" className="w-[600px] max-h-[90vh] overflow-y-auto rounded-lg p-6" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>ADD KNOWLEDGE DOCUMENT</h2>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>
        <div className="space-y-4">
          <WrInput label="TITLE" value={title} onChange={setTitle} placeholder="e.g. Platform Auth Design v3, 2023 Vendor Breach Postmortem" />
          <div>
            <label className="block text-xs font-medium mb-2 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>SOURCE TYPE</label>
            <div className="flex gap-2 flex-wrap">
              {SOURCE_TYPES.map(t => (
                <button data-ui="action" key={t} onClick={() => setSource(t)} className="text-xs font-mono px-2.5 py-1 rounded"
                  style={{ backgroundColor: source === t ? 'var(--wr-amber)' : 'var(--wr-bg-secondary)', color: source === t ? '#0D1B2A' : 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>CONTENT</label>
              <label className="text-xs font-mono flex items-center gap-1 cursor-pointer" style={{ color: 'var(--wr-amber)' }}>
                <Upload className="w-3 h-3" /> Upload .txt/.md
                <input type="file" accept=".txt,.md,.markdown,text/plain" onChange={onFile} className="hidden" />
              </label>
            </div>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={10}
              placeholder="Paste the document text — design notes, incident reports, standards, prior assessments…"
              className="w-full text-sm px-3 py-2 rounded outline-none resize-none font-mono"
              style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
            {valid && <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>{content.length.toLocaleString()} chars → {chunkCount} chunk{chunkCount !== 1 ? 's' : ''}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
          <WrButton disabled={!valid || busy} onClick={async () => { setBusy(true); await onAdd({ title, source, content }); }}>
            {busy ? 'Ingesting…' : 'Add to Knowledge Base'}
          </WrButton>
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeBase() {
  const { db } = useWorkspace();
  const [docs, setDocs] = useState([]);
  const [chunkCounts, setChunkCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = async () => {
    if (!db) return;
    const [d, chunks] = await Promise.all([db.KnowledgeDocument.list('-created_at'), db.KnowledgeChunk.list()]);
    setDocs(d);
    const counts = {};
    chunks.forEach(c => { counts[c.document_id] = (counts[c.document_id] || 0) + 1; });
    setChunkCounts(counts);
    setLoading(false);
  };
  useEffect(() => { load(); }, [db]);

  const add = async ({ title, source, content }) => {
    const doc = await db.KnowledgeDocument.create({ title, source, content });
    const chunks = chunkText(content);
    for (const ch of chunks) {
      await db.KnowledgeChunk.create({ document_id: doc.id, title, content: ch.content, chunk_index: ch.chunk_index });
    }
    setModal(false);
    load();
  };

  const remove = async (doc) => {
    if (!confirm(`Delete "${doc.title}" and its chunks?`)) return;
    const chunks = (await db.KnowledgeChunk.list()).filter(c => c.document_id === doc.id);
    await Promise.all(chunks.map(c => db.KnowledgeChunk.delete(c.id)));
    await db.KnowledgeDocument.delete(doc.id);
    load();
  };

  const totalChunks = Object.values(chunkCounts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      <PageHeader icon={BookMarked} title="KNOWLEDGE BASE" subtitle="Ground agent analysis in your own documents, incidents, and standards"
        actions={<WrButton onClick={() => setModal(true)}><Plus className="w-4 h-4" /> Add Document</WrButton>} />

      <div className="p-6 space-y-4">
        <div data-ui="surface" className="rounded px-4 py-3 text-xs" style={{ backgroundColor: 'rgba(46,134,171,0.08)', border: '1px solid rgba(46,134,171,0.3)', color: 'var(--wr-text-secondary)' }}>
          Documents added here are chunked and retrieved automatically at analysis time — the most relevant passages are injected into every agent's prompt so their assessments are grounded in your material and cite it in the evidence ledger. {docs.length > 0 && <span className="font-mono" style={{ color: '#2E86AB' }}>{docs.length} docs · {totalChunks} chunks indexed.</span>}
        </div>

        {loading ? (
          <div className="h-40 rounded animate-pulse" style={{ backgroundColor: 'var(--wr-bg-card)' }} />
        ) : docs.length === 0 ? (
          <EmptyState icon={BookMarked} title="No documents yet"
            description="Add design docs, incident postmortems, standards, or prior assessments. Agents will retrieve and cite them during analysis instead of relying on general knowledge alone."
            action={() => setModal(true)} actionLabel="Add First Document" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {docs.map(d => (
              <div data-ui="surface" key={d.id} className="rounded-lg p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--wr-amber)' }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--wr-text-primary)' }}>{d.title}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                        {d.source} · {chunkCounts[d.id] || 0} chunks · {(d.content?.length || 0).toLocaleString()} chars
                      </p>
                    </div>
                  </div>
                  <button aria-label="Delete" data-ui="icon" onClick={() => remove(d)}><Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--wr-text-muted)' }} /></button>
                </div>
                {d.content && <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--wr-text-muted)' }}>{d.content.slice(0, 160)}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && <AddDocModal onAdd={add} onClose={() => setModal(false)} />}
    </div>
  );
}
