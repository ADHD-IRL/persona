import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Loader2, X, Check } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import { useWorkspace } from '@/lib/WorkspaceContext';

const LAST_PANEL_KEY = 'agd_last_panel_agents';

function stamp() {
  const d = new Date();
  const day = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${time}`;
}

// Zero-ceremony entry into a live event: creates a panel session behind the
// scenes (no form, no scenario) and drops straight into the room. The session
// still exists, so the transcript and every downstream artifact are captured.
export default function ConvenePanelButton({ variant, size = 'sm', className }) {
  const { db } = useWorkspace();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const open = async () => {
    if (!db) return;
    setPicking(true);
    setLoading(true);
    try {
      const list = await db.Agent.list();
      setAgents(list);
      // Pre-select the last panel you convened, else everyone (capped) so a
      // single click still works.
      let preset = [];
      try { preset = JSON.parse(localStorage.getItem(LAST_PANEL_KEY) || '[]'); } catch { preset = []; }
      const valid = preset.filter(pid => list.some(a => a.id === pid));
      setSelected(new Set(valid.length ? valid : list.slice(0, 8).map(a => a.id)));
    } finally {
      setLoading(false);
    }
  };

  const convene = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setCreating(true);
    try {
      const session = await db.Session.create({
        name: `Live Event — ${stamp()}`,
        mode: 'panel',
        status: 'pending',
        agent_ids: ids,
      });
      for (const agentId of ids) {
        await db.SessionAgent.create({ session_id: session.id, agent_id: agentId, status: 'pending' });
      }
      try { localStorage.setItem(LAST_PANEL_KEY, JSON.stringify(ids)); } catch { /* optional */ }
      navigate(`/sessions/${session.id}/panel`);
    } catch (e) {
      setCreating(false);
      alert(`Could not convene the panel: ${e.message}`);
    }
  };

  const toggle = (id) => setSelected(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <>
      <WrButton variant={variant} size={size} className={className} onClick={open}
        style={{ backgroundColor: 'rgba(155,89,182,0.15)', borderColor: 'rgba(155,89,182,0.4)', color: '#9B59B6' }}>
        <Users className="w-3.5 h-3.5" /> Convene Panel
      </WrButton>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <div className="w-[520px] max-w-full max-h-[85vh] flex flex-col rounded-lg overflow-hidden"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--wr-border)' }}>
              <div>
                <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: '#9B59B6' }}>CONVENE PANEL</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>
                  Who's in the room? You can change this later.
                </p>
              </div>
              <button onClick={() => setPicking(false)}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: 'var(--wr-text-muted)' }} /></div>
              ) : agents.length === 0 ? (
                <p className="p-4 text-sm" style={{ color: 'var(--wr-text-muted)' }}>
                  No SMEs yet — build your panel on the Agents page first.
                </p>
              ) : agents.map(a => {
                const on = selected.has(a.id);
                return (
                  <button key={a.id} onClick={() => toggle(a.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5">
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{ border: `1.5px solid ${on ? '#9B59B6' : 'var(--wr-border-strong)'}`, backgroundColor: on ? '#9B59B6' : 'transparent' }}>
                      {on && <Check className="w-3 h-3" style={{ color: '#fff' }} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--wr-text-primary)' }}>{a.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{a.discipline || '—'}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--wr-border)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{selected.size} selected</span>
              <div className="flex gap-2">
                <WrButton variant="secondary" onClick={() => setPicking(false)}>Cancel</WrButton>
                <WrButton onClick={convene} disabled={!selected.size || creating}>
                  {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Convening…</> : <><Users className="w-4 h-4" /> Enter room</>}
                </WrButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
