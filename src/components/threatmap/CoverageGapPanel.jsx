import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Users, Sparkles, Info } from 'lucide-react';
import { SEV_COLORS, riskBand, UNASSIGNED_ID } from './mapUtils';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Coverage = threat load vs agent bench, per group.
// A gap is a group with real threat load but no/thin agent coverage.
export default function CoverageGapPanel({ groups, axisLabel, onSelect }) {
  const navigate = useNavigate();

  const analysis = useMemo(() => {
    const real = groups.filter(g => !g.isUnassigned);
    // Gaps: threat load present, bench of 0-1 agents — can't run a credible panel
    const gaps = real
      .filter(g => g.score > 0 && g.agents.length <= 1)
      .sort((a, b) => b.score - a.score);
    // Stretched: critical/high load with below-median bench
    const benches = real.map(g => g.agents.length).sort((x, y) => x - y);
    const medianBench = benches.length ? benches[Math.floor(benches.length / 2)] : 0;
    const stretched = real
      .filter(g => !gaps.includes(g) && (g.counts.CRITICAL > 0 || g.score >= 15) && g.agents.length < medianBench)
      .sort((a, b) => b.score - a.score);
    // Well covered: threats present, healthy bench
    const covered = real
      .filter(g => g.total > 0 && !gaps.includes(g) && !stretched.includes(g))
      .sort((a, b) => b.score - a.score);
    // Idle bench: agents but zero threats mapped
    const idle = real
      .filter(g => g.total === 0 && g.agents.length > 0)
      .sort((a, b) => b.agents.length - a.agents.length);
    return { gaps, stretched, covered, idle };
  }, [groups]);

  const generateSme = (g) => {
    const params = new URLSearchParams({ generate: '1', expert_type: `${g.name} analyst` });
    if (axisLabel === 'domain' && g.id !== UNASSIGNED_ID) params.set('domain_id', g.id);
    navigate(`/agents?${params.toString()}`);
  };

  const GroupRow = ({ g, showGenerate }) => {
    const band = riskBand(g.score);
    return (
      <div className="flex items-center justify-between gap-2">
        <button data-ui="action"
          className="text-xs truncate flex-1 text-left hover:underline"
          title={g.name}
          style={{ color: 'var(--wr-text-secondary)' }}
          onClick={() => onSelect?.({ group: g, category: null })}
        >
          {g.name}
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {g.counts.CRITICAL > 0 && (
            <span data-ui="badge" className="text-xs px-1.5 py-0.5 rounded font-mono font-bold"
              style={{ backgroundColor: hexToRgba(SEV_COLORS.CRITICAL, 0.2), color: SEV_COLORS.CRITICAL }}>
              {g.counts.CRITICAL} CRIT
            </span>
          )}
          <span className="text-xs font-mono" style={{ color: band.color }}>score {g.score}</span>
          <span className="text-xs font-mono flex items-center gap-0.5" style={{ color: 'var(--wr-text-muted)' }}>
            <Users className="w-3 h-3" /> {g.agents.length}
          </span>
          {showGenerate && (
            <button data-ui="action"
              onClick={() => generateSme(g)}
              className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1 font-mono font-bold"
              style={{ backgroundColor: 'rgba(240,165,0,0.12)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)' }}
              title={`AI-generate an SME for ${g.name}`}
            >
              <Sparkles className="w-3 h-3" /> SME
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
          PANEL COVERAGE — THREAT LOAD vs AGENT BENCH
        </h2>
        <div className="relative group">
          <Info className="w-3.5 h-3.5 cursor-help" style={{ color: 'var(--wr-text-muted)' }} />
          <div data-ui="surface"
            className="absolute left-5 top-0 z-20 rounded px-3 py-2 text-xs font-mono hidden group-hover:block pointer-events-none"
            style={{
              backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)',
              minWidth: '260px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', color: 'var(--wr-text-secondary)',
            }}
          >
            For each {axisLabel}: threat load (score = C×4 + H×3 + M×2 + L×1) is compared
            against the agent bench (how many agents cover it).<br /><br />
            <span style={{ color: SEV_COLORS.CRITICAL }}>Gap</span> = threats but ≤1 agent ·{' '}
            <span style={{ color: SEV_COLORS.HIGH }}>Stretched</span> = heavy load, thin bench ·{' '}
            <span style={{ color: SEV_COLORS.LOW }}>Covered</span> = healthy bench
          </div>
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)', opacity: 0.7 }}>
        Can your agent panel actually cover your threat landscape? Click a row to inspect · Generate an SME to close a gap.
      </p>

      <div className="grid grid-cols-3 gap-4">
        {/* Coverage gaps */}
        <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid rgba(192,57,43,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: SEV_COLORS.CRITICAL }} />
            <span className="text-xs font-bold font-mono" style={{ color: SEV_COLORS.CRITICAL }}>COVERAGE GAPS</span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>
            Threat load with no or one agent — the panel can't credibly cover these
          </p>
          {analysis.gaps.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>No uncovered {axisLabel}s — every threat area has a bench</p>
          ) : (
            <div className="space-y-2">
              {analysis.gaps.map(g => <GroupRow key={g.id} g={g} showGenerate />)}
            </div>
          )}
        </div>

        {/* Stretched */}
        <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid rgba(214,137,16,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 flex-shrink-0" style={{ color: SEV_COLORS.HIGH }} />
            <span className="text-xs font-bold font-mono" style={{ color: SEV_COLORS.HIGH }}>STRETCHED BENCH</span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>
            Critical or heavy threat load carried by a below-median bench
          </p>
          {analysis.stretched.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>No stretched {axisLabel}s</p>
          ) : (
            <div className="space-y-2">
              {analysis.stretched.map(g => <GroupRow key={g.id} g={g} showGenerate />)}
            </div>
          )}
        </div>

        {/* Covered + idle */}
        <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid rgba(39,174,96,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: SEV_COLORS.LOW }} />
            <span className="text-xs font-bold font-mono" style={{ color: SEV_COLORS.LOW }}>COVERED</span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>
            Threat areas with a healthy agent bench
          </p>
          {analysis.covered.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>Nothing fully covered yet</p>
          ) : (
            <div className="space-y-2">
              {analysis.covered.map(g => <GroupRow key={g.id} g={g} />)}
            </div>
          )}
          {analysis.idle.length > 0 && (
            <>
              <p className="text-xs font-bold font-mono mt-4 mb-2" style={{ color: 'var(--wr-text-muted)' }}>
                IDLE BENCH (agents, no mapped threats)
              </p>
              <div className="space-y-1.5">
                {analysis.idle.map(g => (
                  <div key={g.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate flex-1" title={g.name} style={{ color: 'var(--wr-text-muted)' }}>{g.name}</span>
                    <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>
                      {g.agents.length} agent{g.agents.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
