import { useState } from 'react';
import { AlertTriangle, Download, Loader2, Trash2, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { fetchAll, buildArchiveMarkdown, resetWorkspace, downloadMarkdown, RESET_CLEARS, RESET_KEEPS } from '@/lib/systemArchive';

const CONFIRM_PHRASE = 'RESET';

export default function DangerZone() {
  const { db, workspace } = useWorkspace();
  const [archiving, setArchiving] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [resetting, setResetting] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState(null);

  const slug = (workspace?.name || 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = () => new Date().toISOString().slice(0, 10);

  const runArchive = async () => {
    if (!db) return;
    setArchiving(true);
    setArchiveMsg('');
    try {
      const data = await fetchAll(db);
      const md = buildArchiveMarkdown(data, workspace);
      const total = Object.values(data).reduce((n, a) => n + a.length, 0);
      downloadMarkdown(`agentdebate-archive-${slug}-${stamp()}.md`, md);
      setArchiveMsg(`Archived ${total} records.`);
    } catch (e) {
      setArchiveMsg(`Archive failed: ${e.message}`);
    } finally {
      setArchiving(false);
    }
  };

  const runReset = async () => {
    if (!db || phrase !== CONFIRM_PHRASE) return;
    setResetting(true);
    setProgress('');
    try {
      const { deleted } = await resetWorkspace(db, (name) => setProgress(`Clearing ${name}…`));
      setDone(deleted);
    } catch (e) {
      setProgress(`Reset failed: ${e.message}`);
    } finally {
      setResetting(false);
    }
  };

  const closeConfirm = () => {
    if (resetting) return;
    setShowConfirm(false);
    setPhrase('');
    if (done != null) window.location.reload();
  };

  return (
    <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid rgba(192,57,43,0.35)' }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4" style={{ color: '#C0392B' }} />
        <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: '#C0392B' }}>DANGER ZONE</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
        Export everything to a markdown file, or reset your analysis library to just its domains and SMEs.
      </p>

      {/* Archive */}
      <div className="flex items-center justify-between gap-3 py-3 border-t" style={{ borderColor: 'var(--wr-border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>Archive everything</p>
          <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
            Download a single markdown file with every session, assessment, synthesis, threat, chain, mitigation, decision, and knowledge doc.
          </p>
          {archiveMsg && <p className="text-xs mt-1" style={{ color: archiveMsg.startsWith('Archive failed') ? '#C0392B' : '#27AE60' }}>{archiveMsg}</p>}
        </div>
        <WrButton onClick={runArchive} disabled={archiving} variant="secondary">
          {archiving ? <><Loader2 className="w-4 h-4 animate-spin" /> Building…</> : <><Download className="w-4 h-4" /> Archive</>}
        </WrButton>
      </div>

      {/* Reset */}
      <div className="flex items-center justify-between gap-3 py-3 border-t" style={{ borderColor: 'var(--wr-border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#C0392B' }}>Danger-close reset</p>
          <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
            Permanently delete all analysis data. <strong style={{ color: 'var(--wr-text-secondary)' }}>Keeps domains and agents.</strong> Cannot be undone.
          </p>
        </div>
        <button data-ui="action"
          onClick={() => { setDone(null); setShowConfirm(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-bold font-mono whitespace-nowrap transition-colors"
          style={{ backgroundColor: 'rgba(192,57,43,0.12)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.4)' }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Reset analysis library
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <div data-ui="surface" className="w-[520px] max-w-full max-h-[90vh] overflow-y-auto rounded-lg" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid rgba(192,57,43,0.5)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--wr-border)' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" style={{ color: '#C0392B' }} />
                <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: '#C0392B' }}>DANGER-CLOSE RESET</h3>
              </div>
              <button aria-label="Close" data-ui="icon" onClick={closeConfirm} disabled={resetting}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
            </div>

            <div className="p-5 space-y-4">
              {done == null ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div data-ui="surface" className="rounded p-3" style={{ backgroundColor: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.25)' }}>
                      <p className="text-xs font-bold font-mono mb-1.5" style={{ color: '#C0392B' }}>WILL DELETE</p>
                      <ul className="space-y-0.5">
                        {RESET_CLEARS.map(x => <li key={x} className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>• {x}</li>)}
                      </ul>
                    </div>
                    <div data-ui="surface" className="rounded p-3" style={{ backgroundColor: 'rgba(39,174,96,0.06)', border: '1px solid rgba(39,174,96,0.25)' }}>
                      <p className="text-xs font-bold font-mono mb-1.5" style={{ color: '#27AE60' }}>WILL KEEP</p>
                      <ul className="space-y-0.5">
                        {RESET_KEEPS.map(x => <li key={x} className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>• {x}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div data-ui="surface" className="rounded p-3 flex items-center justify-between gap-3" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>
                      Download a full archive first — strongly recommended.
                    </p>
                    <WrButton onClick={runArchive} disabled={archiving} variant="secondary">
                      {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4" /> Archive</>}
                    </WrButton>
                  </div>
                  {archiveMsg && <p className="text-xs" style={{ color: archiveMsg.startsWith('Archive failed') ? '#C0392B' : '#27AE60' }}>{archiveMsg}</p>}

                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--wr-text-secondary)' }}>
                      Type <span className="font-mono font-bold" style={{ color: '#C0392B' }}>{CONFIRM_PHRASE}</span> to confirm this is irreversible:
                    </label>
                    <input
                      value={phrase}
                      onChange={e => setPhrase(e.target.value)}
                      placeholder={CONFIRM_PHRASE}
                      autoFocus
                      disabled={resetting}
                      className="w-full px-3 py-2 rounded text-sm font-mono"
                      style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)', outline: 'none' }}
                    />
                  </div>

                  {progress && <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{progress}</p>}

                  <div className="flex justify-end gap-2">
                    <WrButton variant="secondary" onClick={closeConfirm} disabled={resetting}>Cancel</WrButton>
                    <button data-ui="action"
                      onClick={runReset}
                      disabled={phrase !== CONFIRM_PHRASE || resetting}
                      className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-bold font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#C0392B', color: '#fff' }}
                    >
                      {resetting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resetting…</> : <><Trash2 className="w-3.5 h-3.5" /> Delete everything</>}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-6 gap-3 text-center">
                  <CheckCircle2 className="w-10 h-10" style={{ color: '#27AE60' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>Analysis library reset.</p>
                  <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                    Deleted {done} record{done !== 1 ? 's' : ''}. Domains and agents were kept.
                  </p>
                  <WrButton onClick={closeConfirm}>Reload</WrButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
