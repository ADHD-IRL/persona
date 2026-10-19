import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Scissors, ShieldCheck, FlaskConical, FileText, GitBranch, ArrowRight, CheckCircle2 } from 'lucide-react';

// Guided post-synthesis actions. Each step shows live status from the session's
// data and stays inside this session, so a completed analysis flows forward
// into threats → chains → mitigations → simulation → report → decision.
export default function NextSteps({
  sessionId,
  decisionId,
  threatsCount = 0,
  chainsCount = 0,
  mitigationsCount = 0,
  onCatalogThreats,
  onBreakChains,             // in-session tab switch (falls back to navigation)
  onTrackMitigations,
}) {
  const navigate = useNavigate();

  const steps = [
    {
      icon: AlertTriangle, color: '#C0392B',
      title: 'Catalog the threats',
      done: threatsCount > 0,
      status: threatsCount > 0 ? `${threatsCount} in the register` : 'Extract from the synthesis',
      cta: threatsCount > 0 ? 'Review' : 'Extract',
      onClick: onCatalogThreats,
    },
    {
      icon: Scissors, color: '#D68910',
      title: 'Break the kill chains',
      done: false,
      status: chainsCount > 0 ? `${chainsCount} chain${chainsCount !== 1 ? 's' : ''} extracted` : 'No chains found in synthesis',
      cta: chainsCount > 0 ? 'Analyze' : null,
      onClick: chainsCount > 0 ? (onBreakChains || (() => navigate(`/chain-breaker?session=${sessionId}`))) : null,
    },
    {
      icon: ShieldCheck, color: '#27AE60',
      title: 'Track the mitigations',
      done: mitigationsCount > 0,
      status: mitigationsCount > 0 ? `${mitigationsCount} registered` : 'Auto-generated when you break the chains',
      cta: 'Open register',
      onClick: onTrackMitigations || (() => navigate(`/sessions/${sessionId}`)),
    },
    {
      icon: FlaskConical, color: '#2E86AB',
      title: 'Simulate countermeasures',
      done: false,
      status: mitigationsCount > 0 || chainsCount > 0 ? 'Toggle controls and watch the risk score move' : 'Break the chains first',
      cta: mitigationsCount > 0 || chainsCount > 0 ? 'Simulate' : null,
      onClick: mitigationsCount > 0 || chainsCount > 0 ? (() => navigate(`/simulator/${sessionId}`)) : null,
    },
    {
      icon: FileText, color: '#546E7A',
      title: 'Generate the report',
      done: false,
      status: 'Executive PDF for this session',
      cta: 'Build',
      onClick: () => navigate(`/reports?session=${sessionId}`),
    },
    ...(decisionId ? [{
      icon: GitBranch, color: '#9B59B6',
      title: 'Record the decision',
      done: false,
      status: 'Compare options and make the call',
      cta: 'Go to decision',
      onClick: () => navigate(`/decisions/${decisionId}`),
    }] : []),
  ];

  return (
    <div data-ui="surface" className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--wr-border)' }}>
        <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>NEXT STEPS</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>
          Turn this analysis into a connected set of outputs — threats, chains, mitigations, a simulation, a report, and a decision.
        </p>
      </div>
      <div>
        {steps.map((s, i) => {
          const Icon = s.icon;
          const clickable = !!s.onClick;
          return (
            <div key={i} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: i ? '1px solid var(--wr-border)' : 'none' }}>
              {s.done
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#27AE60' }} />
                : <Icon className="w-4 h-4 flex-shrink-0" style={{ color: s.color }} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--wr-text-primary)' }}>{s.title}</p>
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{s.status}</p>
              </div>
              {clickable ? (
                <button data-ui="action" onClick={s.onClick}
                  className="flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded flex-shrink-0"
                  style={{ backgroundColor: `${s.color}18`, color: s.color, border: `1px solid ${s.color}44` }}>
                  {s.cta} <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
