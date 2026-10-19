import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import PageHeader from '@/components/ui/PageHeader';
import { Map, AlertTriangle, Merge } from 'lucide-react';
import ThreatHeatmap from '@/components/threatmap/ThreatHeatmap';
import DisciplineRadar from '@/components/threatmap/DisciplineRadar';
import SeverityByDiscipline from '@/components/threatmap/SeverityByDiscipline';
import CoverageGapPanel from '@/components/threatmap/CoverageGapPanel';
import DrillDownPanel from '@/components/threatmap/DrillDownPanel';
import { SEV_ORDER, SEV_COLORS, buildGroups, findCategoryDuplicates } from '@/components/threatmap/mapUtils';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function ThreatMap() {
  const { db } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [threats, setThreats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [domains, setDomains] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionAgents, setSessionAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState(null); // { group, category }
  const [merging, setMerging] = useState(false);

  // View state lives in the URL so a specific map view is shareable
  const activeView    = searchParams.get('view') || 'heatmap';
  const axis          = searchParams.get('axis') || 'domain';
  const filterSev     = searchParams.get('sev') || '';
  const filterSession = searchParams.get('session') || '';

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const load = () => {
    if (!db) return;
    Promise.all([
      db.Threat.list(),
      db.Agent.list(),
      db.Domain.list(),
      db.Session.list(),
      db.SessionAgent.list(),
    ]).then(([t, a, d, s, sa]) => {
      setThreats(t);
      setAgents(a);
      setDomains(d);
      setSessions(s);
      setSessionAgents(sa);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [db]);

  const views = [
    { id: 'heatmap', label: 'HEATMAP' },
    { id: 'radar', label: 'EXPOSURE RADAR' },
    { id: 'severity', label: 'SEVERITY BREAKDOWN' },
  ];

  // Filter threats by selected session + severity
  const filteredThreats = useMemo(() => {
    let list = threats;
    if (filterSession) {
      list = list.filter(t => t.scenario_id &&
        sessions.find(s => s.id === filterSession && s.scenario_id === t.scenario_id));
    }
    if (filterSev) list = list.filter(t => (t.severity || 'MEDIUM') === filterSev);
    return list;
  }, [threats, filterSession, filterSev, sessions]);

  // Filter agents by selected session
  const filteredAgents = useMemo(() => {
    if (!filterSession) return agents;
    const sessionAgentIds = new Set(
      sessionAgents.filter(sa => sa.session_id === filterSession).map(sa => sa.agent_id)
    );
    return agents.filter(a => sessionAgentIds.has(a.id));
  }, [agents, sessionAgents, filterSession]);

  // The shared grouping model: honest threat↔agent join, Unassigned bucket
  const { groups, unassignedThreats } = useMemo(
    () => buildGroups({ axis, agents: filteredAgents, domains, threats: filteredThreats }),
    [axis, filteredAgents, domains, filteredThreats]
  );

  const axisLabel = axis === 'domain' ? 'domain' : 'discipline';

  // Near-duplicate threat categories (e.g. "Cyber" vs "Cybers")
  const categoryDups = useMemo(() => findCategoryDuplicates(threats), [threats]);

  const mergeCategories = async (dup) => {
    if (!confirm(`Merge ${dup.merge.map(m => `"${m.name}"`).join(', ')} into "${dup.keep}"? This updates the category on the affected threats.`)) return;
    setMerging(true);
    try {
      const names = new Set(dup.merge.map(m => m.name));
      const affected = threats.filter(t => names.has(t.category));
      for (const t of affected) {
        await db.Threat.update(t.id, { category: dup.keep });
      }
      load();
    } finally {
      setMerging(false);
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    filteredThreats.forEach(t => {
      const sev = t.severity || 'MEDIUM';
      counts[sev] = (counts[sev] || 0) + 1;
    });
    return { total: filteredThreats.length, groupCount: groups.filter(g => !g.isUnassigned).length, ...counts };
  }, [filteredThreats, groups]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <PageHeader
        icon={Map}
        title="THREAT MAP"
        subtitle="Coverage gaps · Threat concentration · Panel alignment"
      />

      {filterSession && (
        <div className="px-6 pt-4">
          <button data-ui="action" onClick={() => navigate(`/sessions/${filterSession}`)} className="text-xs font-mono inline-flex items-center gap-1 px-2 py-1 rounded"
            style={{ color: 'var(--wr-amber)', backgroundColor: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', cursor: 'pointer' }}>
            ← Back to session · filtered to this session
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div
        className="flex items-center gap-4 px-6 py-2 border-b flex-wrap"
        style={{ backgroundColor: 'var(--wr-bg-secondary)', borderColor: 'var(--wr-border)' }}
      >
        {/* View tabs */}
        <div data-ui="surface" className="flex rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
          {views.map(v => (
            <button data-ui="action"
              key={v.id}
              onClick={() => setParam('view', v.id === 'heatmap' ? '' : v.id)}
              className="px-4 py-1.5 text-xs font-mono font-bold tracking-wider transition-colors"
              style={{
                backgroundColor: activeView === v.id ? 'var(--wr-amber)' : 'transparent',
                color: activeView === v.id ? '#0D1B2A' : 'var(--wr-text-secondary)',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Axis toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>GROUP BY</span>
          <div data-ui="surface" className="flex rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
            {[{ id: 'domain', label: 'DOMAIN' }, { id: 'discipline', label: 'DISCIPLINE' }].map(a => (
              <button data-ui="action"
                key={a.id}
                onClick={() => setParam('axis', a.id === 'domain' ? '' : a.id)}
                className="px-3 py-1.5 text-xs font-mono font-bold tracking-wider transition-colors"
                style={{
                  backgroundColor: axis === a.id ? 'rgba(240,165,0,0.15)' : 'transparent',
                  color: axis === a.id ? 'var(--wr-amber)' : 'var(--wr-text-secondary)',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Severity filter pills */}
        <div className="flex items-center gap-1.5">
          {SEV_ORDER.map(s => {
            const active = filterSev === s;
            return (
              <button data-ui="action"
                key={s}
                onClick={() => setParam('sev', active ? '' : s)}
                className="text-xs px-2 py-1 rounded font-mono font-bold transition-colors"
                style={{
                  backgroundColor: active ? hexToRgba(SEV_COLORS[s], 0.25) : 'transparent',
                  color: active ? SEV_COLORS[s] : 'var(--wr-text-muted)',
                  border: `1px solid ${active ? SEV_COLORS[s] : 'var(--wr-border)'}`,
                }}
              >
                {s.slice(0, 4)}
              </button>
            );
          })}
        </div>

        {/* Session filter */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs font-mono font-bold" style={{ color: 'var(--wr-text-muted)' }}>SESSION</span>
          <select
            value={filterSession}
            onChange={e => setParam('session', e.target.value)}
            className="px-3 py-1.5 text-xs rounded outline-none"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
          >
            <option value="">All Threats</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.status?.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--wr-text-muted)' }}>LOADING DATA...</p>
          </div>
        </div>
      ) : filteredThreats.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <AlertTriangle className="w-12 h-12" style={{ color: 'var(--wr-text-muted)' }} />
          <p className="text-sm font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            {filterSession || filterSev
              ? 'No threats match the current filters.'
              : 'No threats identified yet. Add threats via the Threats page.'}
          </p>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Unassigned threats banner */}
          {unassignedThreats.length > 0 && (
            <div data-ui="surface" className="px-4 py-3 rounded text-xs flex items-center justify-between"
              style={{ backgroundColor: 'rgba(214,137,16,0.08)', border: '1px solid rgba(214,137,16,0.3)' }}>
              <span style={{ color: '#D68910' }}>
                <strong>{unassignedThreats.length} threat{unassignedThreats.length !== 1 ? 's' : ''}</strong> have no domain assignment —
                they appear in the <em>Unassigned</em> row instead of being spread across every {axisLabel}. Assign domains for accurate mapping.
              </span>
              <button data-ui="action"
                onClick={() => navigate('/threats')}
                className="ml-4 flex-shrink-0 px-2 py-1 rounded font-mono font-bold"
                style={{ backgroundColor: 'rgba(214,137,16,0.15)', color: '#D68910', border: '1px solid rgba(214,137,16,0.3)' }}
              >
                Open Threats
              </button>
            </div>
          )}

          {/* Category near-duplicate nudge */}
          {categoryDups.length > 0 && (
            <div data-ui="surface" className="px-4 py-3 rounded text-xs space-y-2"
              style={{ backgroundColor: 'rgba(46,134,171,0.08)', border: '1px solid rgba(46,134,171,0.3)' }}>
              <div className="flex items-center gap-2" style={{ color: '#2E86AB' }}>
                <Merge className="w-3.5 h-3.5 flex-shrink-0" />
                <strong>Similar threat categories detected</strong> — merging them declutters the map columns.
              </div>
              {categoryDups.map((dup, i) => (
                <div key={i} className="flex items-center justify-between gap-2 pl-5">
                  <span style={{ color: 'var(--wr-text-secondary)' }}>
                    {dup.merge.map(m => `"${m.name}" (${m.count})`).join(', ')} → <strong>"{dup.keep}"</strong>
                  </span>
                  <button data-ui="action"
                    onClick={() => mergeCategories(dup)}
                    disabled={merging}
                    className="flex-shrink-0 px-2 py-1 rounded font-mono font-bold"
                    style={{ backgroundColor: 'rgba(46,134,171,0.15)', color: '#2E86AB', border: '1px solid rgba(46,134,171,0.3)' }}
                  >
                    {merging ? 'Merging…' : 'Merge'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Summary stats bar */}
          <div data-ui="surface"
            className="rounded px-5 py-3 flex items-center gap-6 flex-wrap"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}
          >
            <div className="flex-shrink-0">
              <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>TOTAL THREATS</p>
              <p className="text-2xl font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{stats.total}</p>
            </div>
            <div className="w-px h-10 flex-shrink-0" style={{ backgroundColor: 'var(--wr-border)' }} />
            {SEV_ORDER.map(s => (
              <div key={s} className="flex-shrink-0 text-center">
                <p className="text-xs font-mono" style={{ color: SEV_COLORS[s] }}>{s}</p>
                <p className="text-xl font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{stats[s]}</p>
              </div>
            ))}
            <div className="w-px h-10 flex-shrink-0" style={{ backgroundColor: 'var(--wr-border)' }} />
            <div className="flex-shrink-0 text-center">
              <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{axisLabel.toUpperCase()}S</p>
              <p className="text-xl font-bold font-mono" style={{ color: 'var(--wr-text-primary)' }}>{stats.groupCount}</p>
            </div>
            {(filterSession || filterSev) && (
              <>
                <div className="w-px h-10 flex-shrink-0" style={{ backgroundColor: 'var(--wr-border)' }} />
                <div data-ui="surface"
                  className="text-xs font-mono px-2.5 py-1 rounded"
                  style={{ backgroundColor: hexToRgba('#F0A500', 0.12), color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)' }}
                >
                  FILTERED{filterSession ? `: ${sessions.find(s => s.id === filterSession)?.name}` : ''}{filterSev ? ` · ${filterSev}` : ''}
                </div>
              </>
            )}
          </div>

          {/* Active view */}
          {activeView === 'heatmap' && (
            <ThreatHeatmap groups={groups} axisLabel={axisLabel} onSelect={sel => setSelection({ ...sel, axis })} />
          )}
          {activeView === 'radar' && (
            <DisciplineRadar groups={groups} axisLabel={axisLabel} />
          )}
          {activeView === 'severity' && (
            <SeverityByDiscipline groups={groups} axisLabel={axisLabel} onSelect={sel => setSelection({ ...sel, axis })} />
          )}

          {/* Coverage always visible */}
          <CoverageGapPanel groups={groups} axisLabel={axisLabel} onSelect={sel => setSelection({ ...sel, axis })} />
        </div>
      )}

      {selection && (
        <DrillDownPanel selection={selection} onClose={() => setSelection(null)} />
      )}
    </div>
  );
}
