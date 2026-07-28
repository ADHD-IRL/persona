import { ShieldCheck, Scissors } from 'lucide-react';
import { riskScore, riskBandFromScore } from '@/lib/risk';

const STATUSES = ['proposed', 'accepted', 'in_progress', 'implemented', 'verified', 'rejected'];
const CTRL_COLOR = { PREVENTIVE: '#2E86AB', DETECTIVE: '#9B59B6', RESPONSIVE: '#D68910' };
const EFFORT_COLOR = { LOW: '#27AE60', MEDIUM: '#D68910', HIGH: '#C0392B' };

function Pill({ label, color }) {
  if (!label) return null;
  return (
    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}>
      {label}
    </span>
  );
}

function RiskChip({ l, i, muted }) {
  const s = riskScore(l, i);
  if (s == null) return <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>—</span>;
  const band = riskBandFromScore(s);
  return (
    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: muted ? 'var(--wr-bg-secondary)' : `${band.color}18`, color: band.color, border: `1px solid ${band.color}44` }}>
      {s}
    </span>
  );
}

// In-session mitigation register — auto-populated by Chain Breaker, editable here.
export default function SessionMitigations({ db, mitigations = [], onChange }) {
  const setStatus = async (m, status) => {
    try { await db.Mitigation.update(m.id, { status }); onChange?.(); } catch { /* ignore */ }
  };

  // Net risk reduction across mitigations that carry both inherent and residual.
  const scored = mitigations.filter(m => m.inherent_likelihood && m.inherent_impact);
  const inherentTot = scored.reduce((a, m) => a + riskScore(m.inherent_likelihood, m.inherent_impact), 0);
  const residualTot = scored.reduce((a, m) => a + (riskScore(m.residual_likelihood, m.residual_impact) ?? riskScore(m.inherent_likelihood, m.inherent_impact)), 0);
  const netReduction = inherentTot - residualTot;

  if (!mitigations.length) {
    return (
      <div className="rounded-2xl py-14 text-center" style={{ border: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-card)' }}>
        <ShieldCheck className="w-7 h-7 mx-auto mb-3" style={{ color: 'var(--wr-text-muted)', opacity: 0.4 }} />
        <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>No mitigations yet.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>Go to the Kill Chains tab and run “Analyze all chains” — mitigations are generated automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="rounded-xl p-4 flex items-center gap-6 flex-wrap" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div>
          <p className="text-[10px] font-mono tracking-wider" style={{ color: 'var(--wr-text-muted)' }}>MITIGATIONS</p>
          <p className="text-lg font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{mitigations.length}</p>
        </div>
        <div className="w-px self-stretch" style={{ backgroundColor: 'var(--wr-border)' }} />
        <div>
          <p className="text-[10px] font-mono tracking-wider" style={{ color: 'var(--wr-text-muted)' }}>NET RISK REDUCTION</p>
          <p className="text-lg font-bold font-mono" style={{ color: netReduction > 0 ? '#27AE60' : 'var(--wr-text-primary)' }}>
            {netReduction > 0 ? `−${netReduction}` : '0'}
            <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}> pts</span>
          </p>
        </div>
        <p className="text-xs flex-1 min-w-[180px]" style={{ color: 'var(--wr-text-muted)' }}>
          Auto-generated from the kill-chain break analysis. Set each mitigation's residual risk in the register to grow net reduction.
        </p>
      </div>

      {/* Rows */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 text-[10px] font-mono font-bold tracking-wider" style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)' }}>
          <span>MITIGATION</span><span>STATUS</span><span className="text-center">INHERENT</span><span className="text-center">RESIDUAL</span>
        </div>
        <div style={{ backgroundColor: 'var(--wr-bg-card)' }}>
          {mitigations.map(m => (
            <div key={m.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center border-t" style={{ borderColor: 'var(--wr-border)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--wr-text-primary)' }}>{m.title}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Pill label={m.control_type} color={CTRL_COLOR[m.control_type] || 'var(--wr-text-muted)'} />
                  {m.effort && <Pill label={`${m.effort} EFFORT`} color={EFFORT_COLOR[m.effort] || 'var(--wr-text-muted)'} />}
                  {m.time_to_deploy && <Pill label={m.time_to_deploy} color="#546E7A" />}
                  {m.source === 'chain_breaker' && <Pill label="AUTO" color="#9B59B6" />}
                  {m.breaks_steps?.length > 0 && (
                    <span className="text-[10px] font-mono flex items-center gap-0.5" style={{ color: 'var(--wr-text-muted)' }}>
                      <Scissors className="w-2.5 h-2.5" /> breaks {m.breaks_steps.join(', ')}
                    </span>
                  )}
                </div>
                {m.effect && <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>{m.effect}</p>}
              </div>
              <select
                value={m.status || 'proposed'}
                onChange={e => setStatus(m, e.target.value)}
                className="text-xs px-2 py-1 rounded outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              <div className="text-center"><RiskChip l={m.inherent_likelihood} i={m.inherent_impact} /></div>
              <div className="text-center"><RiskChip l={m.residual_likelihood} i={m.residual_impact} muted /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
