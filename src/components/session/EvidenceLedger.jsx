import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, ShieldCheck, Bot } from 'lucide-react';
import { TIER_COLORS, TIER_LABELS, SOURCE_TYPE_LABELS } from '@/lib/sources';

const TIER_ORDER = ['authoritative', 'credible', 'speculative', 'unverified'];
const TIER_WEIGHT = { authoritative: 3, credible: 2, speculative: 1, unverified: 1 };

// Per-SME evidence ledger for a session: what each agent referenced to
// support its assessments, with a credibility mix bar and quality score.
export default function EvidenceLedger({ sources, agents }) {
  const [open, setOpen] = useState({});

  const ledger = useMemo(() => {
    const byAgent = new Map();
    for (const s of sources) {
      const key = s.agent_id || '__facilitator__';
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key).push(s);
    }
    const rows = [];
    for (const [agentId, list] of byAgent.entries()) {
      const agent = agents.find(a => a.id === agentId);
      const tierCounts = { authoritative: 0, credible: 0, speculative: 0, unverified: 0 };
      list.forEach(s => { tierCounts[s.credibility_tier || 'unverified']++; });
      // Evidence quality: weighted average of tier weight, 0-100
      const weightSum = list.reduce((sum, s) => sum + (TIER_WEIGHT[s.credibility_tier || 'unverified']), 0);
      const quality = list.length ? Math.round((weightSum / (list.length * 3)) * 100) : 0;
      rows.push({
        agentId,
        name: agent?.name || (agentId === '__facilitator__' ? 'Facilitator' : 'Unknown SME'),
        discipline: agent?.discipline || (agentId === '__facilitator__' ? 'Manual entry' : ''),
        isFacilitator: agentId === '__facilitator__',
        sources: [...list].sort((a, b) =>
          TIER_ORDER.indexOf(a.credibility_tier || 'unverified') - TIER_ORDER.indexOf(b.credibility_tier || 'unverified')
        ),
        tierCounts,
        quality,
      });
    }
    // Agents with the most, highest-quality evidence first; facilitator last
    return rows.sort((a, b) =>
      (a.isFacilitator ? 1 : 0) - (b.isFacilitator ? 1 : 0) ||
      b.quality - a.quality ||
      b.sources.length - a.sources.length
    );
  }, [sources, agents]);

  // Agents that participated but cited nothing — a gap worth surfacing
  const silentAgents = useMemo(() => {
    const cited = new Set(sources.map(s => s.agent_id));
    return agents.filter(a => !cited.has(a.id));
  }, [sources, agents]);

  const qualityColor = q => q >= 75 ? '#27AE60' : q >= 50 ? '#F0A500' : q >= 30 ? '#E67E22' : '#C0392B';

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
        Each SME's evidence ledger — the sources they referenced to support their assessments this session, ranked by evidence quality.
      </p>

      {ledger.map(row => {
        const isOpen = open[row.agentId] ?? true;
        const total = row.sources.length;
        return (
          <div data-ui="surface" key={row.agentId} className="rounded overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            {/* Header */}
            <button data-ui="card"
              onClick={() => setOpen(o => ({ ...o, [row.agentId]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
                      : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />}
              <Bot className="w-4 h-4 flex-shrink-0" style={{ color: row.isFacilitator ? 'var(--wr-text-muted)' : 'var(--wr-amber)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--wr-text-primary)' }}>{row.name}</p>
                {row.discipline && <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{row.discipline}</p>}
              </div>

              {/* Credibility mix bar */}
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <div className="flex rounded overflow-hidden" style={{ width: 90, height: 6, backgroundColor: 'var(--wr-bg-secondary)' }}>
                  {TIER_ORDER.map(t => row.tierCounts[t] > 0 && (
                    <div key={t} style={{ flex: row.tierCounts[t], backgroundColor: TIER_COLORS[t].text }} title={`${row.tierCounts[t]} ${TIER_LABELS[t]}`} />
                  ))}
                </div>
                <div className="text-right" style={{ width: 62 }}>
                  <span className="text-xs font-mono font-bold" style={{ color: qualityColor(row.quality) }}>{row.quality}</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}> quality</span>
                </div>
              </div>

              <span data-ui="badge" className="text-xs font-mono font-bold px-2 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-secondary)' }}>
                {total} ref{total !== 1 ? 's' : ''}
              </span>
            </button>

            {/* Sources */}
            {isOpen && (
              <div className="divide-y" style={{ borderColor: 'var(--wr-border)' }}>
                {row.sources.map(s => {
                  const c = TIER_COLORS[s.credibility_tier || 'unverified'];
                  const label = s.title || s.domain || s.url || 'Untitled source';
                  return (
                    <div key={s.id} className="px-4 py-3" style={{ borderTop: '1px solid var(--wr-border)' }}>
                      <div className="flex items-start gap-2 flex-wrap">
                        {s.url ? (
                          <a data-ui="reference" href={s.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-medium hover:underline inline-flex items-center gap-1" style={{ color: 'var(--wr-text-primary)' }}>
                            {label} <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ opacity: 0.6 }} />
                          </a>
                        ) : (
                          <span className="text-sm font-medium" style={{ color: 'var(--wr-text-primary)' }}>{label}</span>
                        )}
                        <span data-ui="badge" className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                          {TIER_LABELS[s.credibility_tier || 'unverified']}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                          {SOURCE_TYPE_LABELS[s.source_type] || s.source_type}
                        </span>
                      </div>
                      {s.cited_claim && (
                        <p className="text-xs mt-1.5 pl-2 italic" style={{ color: 'var(--wr-text-secondary)', borderLeft: '2px solid var(--wr-border)' }}>
                          "{s.cited_claim}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Unsupported SMEs */}
      {silentAgents.length > 0 && (
        <div data-ui="surface" className="rounded px-4 py-3" style={{ backgroundColor: 'rgba(230,126,34,0.08)', border: '1px solid rgba(230,126,34,0.3)' }}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#E67E22' }} />
            <span className="text-xs font-bold font-mono" style={{ color: '#E67E22' }}>UNSUPPORTED ASSESSMENTS</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>
            {silentAgents.map(a => a.name).join(', ')} cited no sources this session — their conclusions rest on persona reasoning alone. Consider prompting them to cite evidence, or weight their findings accordingly.
          </p>
        </div>
      )}
    </div>
  );
}
