import { useState, useEffect } from 'react';
import { Scissors, Loader2, Link2, CheckCircle2 } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import ProcessingBar from '@/components/ui/ProcessingBar';
import { useElapsed } from '@/hooks/useElapsed';
import ChainFlowGraph from '@/components/chainbreaker/ChainFlowGraph';
import { analyzeSessionChains, loadChainAnalyses, toChainMaps } from '@/lib/sessionAnalysis';

// In-session Kill Chains tab: the chains this session surfaced, each as an
// interactive rail, plus one-click Chain Breaker analysis that auto-creates
// session mitigations. Nothing leaves the session.
export default function SessionKillChains({ db, sessionId, chains = [], scenarioContext = '', existingMitigations = [], onAnalyzed }) {
  const [analyses, setAnalyses] = useState({});
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ i: 0, total: 0, name: '' });
  const [createdCount, setCreatedCount] = useState(null);
  const elapsed = useElapsed(analyzing);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadChainAnalyses({ db, chains }).then(map => { if (alive) { setAnalyses(map); setLoading(false); } });
    return () => { alive = false; };
  }, [db, chains]);

  const analyzedCount = Object.keys(analyses).length;

  const runAnalysis = async () => {
    setAnalyzing(true);
    setCreatedCount(null);
    try {
      const { analyses: newAnalyses, created } = await analyzeSessionChains({
        db, sessionId, chains, scenarioContext, existingMitigations,
        onProgress: (i, total, name) => setProgress({ i, total, name }),
      });
      setAnalyses(prev => ({ ...prev, ...newAnalyses }));
      setCreatedCount(created);
      onAnalyzed?.();
    } finally {
      setAnalyzing(false);
    }
  };

  if (!chains.length) {
    return (
      <div className="rounded-2xl py-14 text-center" style={{ border: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-card)' }}>
        <Link2 className="w-7 h-7 mx-auto mb-3" style={{ color: 'var(--wr-text-muted)', opacity: 0.4 }} />
        <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>No kill chains yet.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>Run the synthesis — it extracts the compound chains from the debate.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>
            {chains.length} kill chain{chains.length !== 1 ? 's' : ''} · {analyzedCount} analyzed
          </p>
          <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
            Dissects every chain — where to cut, chokepoints, and a prioritized mitigation roadmap — and files the mitigations to this session automatically.
          </p>
          {createdCount != null && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#27AE60' }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> {createdCount} mitigation{createdCount !== 1 ? 's' : ''} created — see the Mitigations tab.
            </p>
          )}
        </div>
        <WrButton onClick={runAnalysis} disabled={analyzing}>
          {analyzing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
            : <><Scissors className="w-4 h-4" /> {analyzedCount ? 'Re-analyze all chains' : 'Analyze all chains & generate mitigations'}</>}
        </WrButton>
      </div>

      {analyzing && (
        <ProcessingBar
          label={progress.name ? `Breaking chain: ${progress.name}` : 'Analyzing chains…'}
          elapsedMs={elapsed}
          sublabel={progress.total ? `Chain ${Math.min(progress.i + 1, progress.total)} of ${progress.total} · generating mitigation roadmaps` : 'Usually 15–40 seconds per chain.'}
        />
      )}

      {loading ? (
        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: 'var(--wr-text-muted)' }} /></div>
      ) : (
        chains.map((chain, i) => {
          const analysis = analyses[chain.id];
          const { analysisMap, rankMap } = toChainMaps(analysis);
          return (
            <div key={chain.id}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-secondary)' }}>{chain.name || `Chain ${i + 1}`}</p>
                {analysis?.chain_resilience && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }}>
                    RESILIENCE: {analysis.chain_resilience}
                  </span>
                )}
              </div>
              {analysis?.recommended_cut?.step_number != null && (
                <div className="rounded-lg px-3 py-2 mb-2 flex items-start gap-2" style={{ backgroundColor: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.25)' }}>
                  <Scissors className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#C0392B' }} />
                  <p className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>
                    <span className="font-mono font-bold" style={{ color: '#C0392B' }}>Cut here first — Step {analysis.recommended_cut.step_number}. </span>
                    {analysis.recommended_cut.rationale}
                  </p>
                </div>
              )}
              <ChainFlowGraph
                chain={chain}
                analysisMap={analysisMap}
                rankMap={rankMap}
                defaultLens={analysis ? 'leverage' : 'domain'}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
