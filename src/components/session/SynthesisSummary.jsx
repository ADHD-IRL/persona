import { CheckCircle2, Link2, ShieldAlert, BookOpen, Users } from 'lucide-react';
import ChainFlowGraph from '@/components/chainbreaker/ChainFlowGraph';

const SEV_COLOR = {
  CRITICAL: '#C0392B',
  HIGH: '#D68910',
  MEDIUM: '#2E86AB',
  LOW: '#27AE60',
};

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function TileCard({ icon: Icon, iconColor, label, children }) {
  return (
    <div data-ui="surface"
      className="flex-1 min-w-[140px] rounded-2xl p-4"
      style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: 'var(--wr-text-muted)' }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

export default function SynthesisSummary({ synthesis, sessionAgents, agents, threats, sessionSources, onGoToThreats }) {
  if (!synthesis?.raw_text) return null;

  const chains = toArray(synthesis.compound_chains);

  // Count agents who have r2 assessments (contributed to synthesis)
  const contributors = sessionAgents
    .filter(sa => sa.round2_rebuttal)
    .map(sa => agents.find(a => a.id === sa.agent_id))
    .filter(Boolean);

  // Severity breakdown of threats
  const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const t of threats) {
    const sev = (t.severity || '').toUpperCase();
    if (sev in sevCounts) sevCounts[sev]++;
  }
  const totalThreats = threats.length;

  // Sources by type
  const sourceTypes = {};
  for (const s of sessionSources) {
    const t = s.source_type || 'other';
    sourceTypes[t] = (sourceTypes[t] || 0) + 1;
  }
  const sourceTypeList = Object.entries(sourceTypes).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div data-ui="surface"
      className="mb-6 rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-secondary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-5 py-3 border-b"
        style={{ borderColor: 'var(--wr-border)', backgroundColor: 'rgba(39,174,96,0.06)' }}
      >
        <CheckCircle2 className="w-4 h-4" style={{ color: '#27AE60' }} />
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: '#27AE60' }}>
          SYNTHESIS COMPLETE
        </span>
        <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
          — analysis saved
        </span>
      </div>

      {/* Tiles */}
      <div className="flex flex-wrap gap-3 p-4">
        {/* Agents tile */}
        <TileCard icon={Users} iconColor="#9B59B6" label="CONTRIBUTORS">
          <div className="flex flex-wrap gap-1.5">
            {contributors.map(agent => (
              <span data-ui="badge"
                key={agent.id}
                className="text-xs px-1.5 py-0.5 rounded-full font-mono"
                style={{
                  backgroundColor: `${agent.domain_color || '#546E7A'}20`,
                  color: agent.domain_color || '#546E7A',
                  border: `1px solid ${agent.domain_color || '#546E7A'}44`,
                }}
              >
                {agent.name.split(' ')[0]}
              </span>
            ))}
          </div>
          <p className="text-xs mt-2 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            {contributors.length} agent{contributors.length !== 1 ? 's' : ''}
          </p>
        </TileCard>

        {/* Chains tile */}
        <TileCard icon={Link2} iconColor="#2E86AB" label="COMPOUND CHAINS">
          {chains.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>None identified</p>
          ) : (
            <div className="space-y-1">
              {chains.slice(0, 4).map((c, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span
                    className="text-xs font-bold font-mono flex-shrink-0"
                    style={{ color: '#2E86AB' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-xs leading-tight" style={{ color: 'var(--wr-text-secondary)' }}>
                    {c.chain_name || c.name || `Chain ${i + 1}`}
                  </span>
                </div>
              ))}
              {chains.length > 4 && (
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                  +{chains.length - 4} more
                </p>
              )}
            </div>
          )}
          <p className="text-xs mt-2 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            {chains.length} chain{chains.length !== 1 ? 's' : ''} saved
          </p>
        </TileCard>

        {/* Threats tile */}
        <TileCard icon={ShieldAlert} iconColor="#D68910" label="THREATS">
          {totalThreats === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>No threats in catalog</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {SEV_ORDER.filter(s => sevCounts[s] > 0).map(sev => (
                <span data-ui="badge"
                  key={sev}
                  className="text-xs px-2 py-0.5 rounded-full font-mono font-bold"
                  style={{
                    backgroundColor: `${SEV_COLOR[sev]}18`,
                    color: SEV_COLOR[sev],
                    border: `1px solid ${SEV_COLOR[sev]}44`,
                  }}
                >
                  {sevCounts[sev]} {sev}
                </span>
              ))}
            </div>
          )}
          {totalThreats === 0 && onGoToThreats ? (
            <button data-ui="action" onClick={onGoToThreats} className="text-xs mt-2 font-mono font-bold" style={{ color: 'var(--wr-amber)' }}>
              Extract from synthesis →
            </button>
          ) : (
            <p className="text-xs mt-2 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              {totalThreats} threat{totalThreats !== 1 ? 's' : ''} in scenario
            </p>
          )}
        </TileCard>

        {/* Sources tile */}
        <TileCard icon={BookOpen} iconColor="#9B59B6" label="SOURCES">
          {sessionSources.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>No sources captured</p>
          ) : (
            <div className="space-y-1">
              {sourceTypeList.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-xs font-mono" style={{ color: 'var(--wr-text-secondary)' }}>{type}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>{count}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs mt-2 font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            {sessionSources.length} source{sessionSources.length !== 1 ? 's' : ''} cited
          </p>
        </TileCard>
      </div>

      {/* Interactive kill-chain rails — one per compound chain identified */}
      {chains.length > 0 && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5" style={{ color: '#2E86AB' }} />
            <span className="text-xs font-mono font-bold tracking-wider" style={{ color: 'var(--wr-text-muted)' }}>
              KILL CHAINS — click any step to see where to break the chain
            </span>
          </div>
          {chains.map((c, i) => (
            <div key={i}>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--wr-text-secondary)' }}>
                {c.chain_name || c.name || `Chain ${i + 1}`}
              </p>
              <ChainFlowGraph chain={c} defaultLens="domain" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
