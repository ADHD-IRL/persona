import { useState, useEffect, useRef, useCallback, Component } from 'react';
import ReactMarkdown from 'react-markdown';
import { scoreSourceCredibility, parseCitations, saveTurnSources, TIER_COLORS, TIER_LABELS, SOURCE_TYPE_LABELS } from '@/lib/sources';
import { analyzeSourceValidity } from '@/lib/llm';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { generateRound1, generateRound2, generateRound0, generateReaction, generateSynthesis as generateSynthesisLLM, extractSessionThreats } from '@/lib/llm';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, ChevronDown, ChevronUp, Sparkles, AlertCircle, Save, BarChart2, ShieldAlert, Check, X, BookOpen, MessageSquare, BellRing, StopCircle, Trash2 } from 'lucide-react';
import SeverityBadge from '@/components/ui/SeverityBadge';
import EvidenceLedger from '@/components/session/EvidenceLedger';
import { riskScore, riskBandFromScore, likelihoodLabel, impactLabel } from '@/lib/risk';
import RiskMatrix from '@/components/session/RiskMatrix';
import { retrieveKnowledge, formatKnowledgeContext } from '@/lib/knowledge';
import { buildDecisionFraming } from '@/lib/decisionContext';
import { useElapsed, fmtDuration } from '@/hooks/useElapsed';
import ProcessingBar from '@/components/ui/ProcessingBar';
import NextSteps from '@/components/session/NextSteps';
import SessionKillChains from '@/components/session/SessionKillChains';
import SessionMitigations from '@/components/session/SessionMitigations';
import AnalysisStages from '@/components/session/AnalysisStages';
import { buildGroups } from '@/components/threatmap/mapUtils';
import WrButton from '@/components/ui/WrButton';
import { WrInput } from '@/components/ui/WrInput';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import DebateTranscript from '@/components/session/DebateTranscript';
import RiskRegistry from '@/components/session/RiskRegistry';
import SessionProgressBar from '@/components/session/SessionProgressBar';
import SynthesisSummary from '@/components/session/SynthesisSummary';

const TABS = ['ROUND 1','ROUND 2','SYNTHESIS','KILL CHAINS','THREATS','MITIGATIONS','SOURCES','SETTINGS'];

class SynthesisErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[SynthesisTab]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl p-5 mt-4" style={{ backgroundColor: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)' }}>
          <p className="text-xs font-bold font-mono mb-2" style={{ color: '#C0392B' }}>SYNTHESIS RENDER ERROR</p>
          <p className="text-xs font-mono" style={{ color: '#C0392B', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            className="mt-3 text-xs underline"
            style={{ color: '#C0392B' }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AgentAssessmentCard({ sa, agent, round, onGenerate, onUpdate, onReset }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [briefExpanded, setBriefExpanded] = useState(false);
  const isGenerating = sa.status === (round === 1 ? 'generating_r1' : 'generating_r2');
  const cardElapsed = useElapsed(isGenerating);
  const text = round === 1 ? sa.round1_assessment : sa.round2_rebuttal;
  const severity = round === 1 ? sa.round1_severity : sa.round2_revised_severity;
  const confidence = round === 1 ? sa.round1_confidence : sa.round2_confidence;
  const likelihood = round === 1 ? sa.round1_likelihood : sa.round2_likelihood;
  const impact = round === 1 ? sa.round1_impact : sa.round2_impact;
  const rScore = riskScore(likelihood, impact);
  const rBand = riskBandFromScore(rScore);
  const color = agent?.domain_color || '#F0A500';

  const SEV_COLORS = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
  const sevColor = SEV_COLORS[severity] || 'var(--wr-text-muted)';

  return (
    <div
      className="rounded-2xl overflow-hidden flex"
      style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}
    >
      {/* Left colour bar */}
      <div className="w-1.5 flex-shrink-0 rounded-l-2xl" style={{ backgroundColor: color }} />

      <div className="flex-1 p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{agent?.name}</p>
            <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{agent?.discipline}</p>
          </div>
          <div className="flex items-center gap-2">
            {rScore != null && (
              <span
                className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-full"
                title={`Likelihood ${likelihood}/5 (${likelihoodLabel(likelihood)}) × Impact ${impact}/5 (${impactLabel(impact)}) = risk ${rScore}/25`}
                style={{ backgroundColor: `${rBand.color}18`, color: rBand.color, border: `1px solid ${rBand.color}40` }}
              >
                L{likelihood}×I{impact}={rScore}
              </span>
            )}
            {confidence != null && (
              <span
                className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.2)' }}
              >
                {confidence}%
              </span>
            )}
            {severity && (
              <span
                className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${sevColor}18`, color: sevColor, border: `1px solid ${sevColor}40` }}
              >
                {severity}
              </span>
            )}
          </div>
        </div>

        {/* Round 0 pre-brief collapsible */}
        {sa.round0_briefing && (
          <div className="mb-3 rounded-xl" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
            <button
              onClick={() => setBriefExpanded(!briefExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs"
              style={{ color: 'var(--wr-text-muted)' }}
            >
              <span className="flex items-center gap-1.5 font-mono tracking-wider">
                <BookOpen className="w-3 h-3" /> PRE-SESSION BRIEF
              </span>
              {briefExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {briefExpanded && (
              <div className="px-3 pb-3">
                <p className="text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--wr-text-secondary)' }}>
                  {sa.round0_briefing}
                </p>
              </div>
            )}
          </div>
        )}

        {isGenerating ? (
          <div className="py-3">
            <ProcessingBar
              label="Generating assessment…"
              elapsedMs={cardElapsed}
              sublabel="The agent is thinking through the scenario. Usually 15–40 seconds."
            />
          </div>
        ) : text ? (
          <div>
            {editing ? (
              <div>
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={8}
                  className="w-full text-xs px-2 py-2 rounded-xl outline-none resize-none"
                  style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
                <div className="flex gap-2 mt-2">
                  <WrButton size="xs" onClick={() => { onUpdate(editText); setEditing(false); }}>Save</WrButton>
                  <WrButton variant="secondary" size="xs" onClick={() => setEditing(false)}>Cancel</WrButton>
                </div>
              </div>
            ) : (
              <div>
                <div className={expanded ? '' : 'line-clamp-4'}>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--wr-text-secondary)' }}>{text}</p>
                </div>
                <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs mt-2 transition-colors hover:opacity-80" style={{ color: 'var(--wr-amber)' }}>
                  {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show more</>}
                </button>
              </div>
            )}
            <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--wr-border)' }}>
              <WrButton variant="secondary" size="xs" onClick={() => { setEditText(text); setEditing(true); }}>Edit</WrButton>
              <WrButton variant="secondary" size="xs" onClick={onGenerate}><RefreshCw className="w-3 h-3" /> Regen</WrButton>
{onReset && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <WrButton variant="secondary" size="xs" onClick={onReset}>
                      <Trash2 className="w-3 h-3" />
                    </WrButton>
                  </TooltipTrigger>
                  <TooltipContent side="top">Clear this agent's assessment</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        ) : (
          <div className="py-3">
            <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>No assessment yet</p>
            <WrButton size="xs" onClick={onGenerate}>Generate</WrButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Synthesis helper components (must be module-level for React reconciliation) ─

const SYNTHESIS_SECTION_ICONS = {
  'Consensus Findings':    { color: '#27AE60', icon: '✓' },
  'Contested Findings':    { color: '#D68910', icon: '⚡' },
  'Compound Threat Chains':{ color: '#C0392B', icon: '⛓' },
  'Blind Spots':           { color: 'hsl(215 10% 48%)', icon: '◎' },
  'Priority Mitigations':  { color: '#2E86AB', icon: '🛡' },
  'Sharpest Insights':     { color: '#F0A500', icon: '▲' },
};

function SynthSectionCard({ title, children }) {
  const meta = SYNTHESIS_SECTION_ICONS[title] || { color: 'hsl(215 10% 48%)', icon: '•' };
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
      <div
        className="flex items-center gap-2.5 px-5 py-3"
        style={{ borderBottom: '1px solid var(--wr-border)', backgroundColor: 'rgba(138,155,181,0.04)' }}
      >
        <span style={{ color: meta.color, fontSize: 13 }}>{meta.icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>{title}</h3>
      </div>
      <div className="p-5" style={{ backgroundColor: 'var(--wr-bg-card)' }}>
        {children}
      </div>
    </div>
  );
}

function SynthMarkdown({ text }) {
  if (!text) return <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>Not available</p>;
  return (
    <ReactMarkdown
      components={{
        h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--wr-text-primary)', marginBottom: 4, marginTop: 12 }}>{children}</h3>,
        p: ({ children }) => <p style={{ fontSize: 13.5, color: 'var(--wr-text-secondary)', lineHeight: 1.75, marginBottom: 10 }}>{children}</p>,
        ul: ({ children }) => <ul style={{ paddingLeft: 18, marginBottom: 10 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: 18, marginBottom: 10 }}>{children}</ol>,
        li: ({ children }) => <li style={{ fontSize: 13.5, color: 'var(--wr-text-secondary)', lineHeight: 1.7, marginBottom: 3 }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--wr-text-primary)' }}>{children}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function SynthChains({ chains: rawChains = [] }) {
  const chains = Array.isArray(rawChains) ? rawChains
    : typeof rawChains === 'string' ? (() => { try { return JSON.parse(rawChains); } catch { return []; } })()
    : [];
  if (!chains.length) return <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>No compound chains identified</p>;
  return (
    <div className="space-y-6">
      {chains.map((chain, ci) => (
        <div key={ci}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--wr-text-primary)' }}>{chain.name}</h4>
          <div className="space-y-2">
            {(chain.steps || []).map((step, si) => {
              const isLast = si === chain.steps.length - 1;
              return (
                <div key={si} className="flex items-start gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)', color: 'var(--wr-amber)' }}
                    >
                      {step.step_number || si + 1}
                    </div>
                    {!isLast && <div className="w-px h-4 mt-1" style={{ backgroundColor: 'var(--wr-border)' }} />}
                  </div>
                  <div className="flex-1 pb-2" style={{ borderBottom: !isLast ? '1px solid rgba(138,155,181,0.1)' : 'none' }}>
                    <p className="text-sm leading-relaxed pt-1" style={{ color: 'var(--wr-text-secondary)' }}>{step.step_text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function extractSynthSection(text, heading) {
  const pattern = new RegExp(`(?:^|\\n)#{1,3}\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i');
  const m = text.match(pattern);
  return m ? m[1].trim() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
function SynthesisPanel({ synthesis, sessionId, onGenerate, generating, synthStatus, r2Done, synthError, streamText, sessionAgents, agents, session, scenario }) {
  const synthElapsed = useElapsed(generating);
  const [resolvedText, setResolvedText] = useState('');

  useEffect(() => {
    if (!synthesis?.raw_text) return;
    const raw = synthesis.raw_text;
    if (raw.startsWith('http')) {
      fetch(raw).then(r => r.text()).then(setResolvedText);
    } else {
      setResolvedText(raw);
    }
  }, [synthesis?.raw_text]);

  // Synthesis exists but resolvedText not yet hydrated (useEffect pending after state update)
  if (synthesis?.raw_text && !resolvedText && !generating) {
    return (
      <div className="flex items-center gap-2 py-10">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--wr-amber)' }} />
        <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>Loading synthesis...</span>
      </div>
    );
  }

  if (!synthesis && !generating) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Sparkles className="w-10 h-10 mb-4" style={{ color: 'var(--wr-amber)' }} />
        <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--wr-text-primary)' }}>Generate Synthesis</h3>
        {synthError ? (
          <div className="mb-6 rounded p-3 max-w-md w-full flex items-start gap-2" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C0392B' }} />
            <p className="text-xs" style={{ color: '#C0392B' }}>{synthError}</p>
          </div>
        ) : !r2Done ? (
          <p className="text-sm mb-6 text-center max-w-md" style={{ color: 'var(--wr-text-secondary)' }}>
            Complete Round 2 first, then generate the synthesis report.
          </p>
        ) : (
          <p className="text-sm mb-6 text-center max-w-md" style={{ color: 'var(--wr-text-secondary)' }}>
            All agents have completed Round 2. Ready to generate the synthesis report.
          </p>
        )}
        <WrButton size="lg" onClick={onGenerate} disabled={!r2Done}>
          <Sparkles className="w-4 h-4" /> Generate Synthesis
        </WrButton>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="py-6">
        <div className="mb-4">
          <ProcessingBar
            label={synthStatus || 'Synthesizing all assessments…'}
            elapsedMs={synthElapsed}
            sublabel={streamText ? 'Streaming the report — findings appear below as they generate.' : 'Reading every agent assessment. This usually takes 30–90 seconds.'}
          />
        </div>
        {streamText ? (
          <div className="rounded p-4 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono overflow-y-auto max-h-[60vh]"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-secondary)' }}>
            {streamText}
            <span className="inline-block w-1.5 h-3 ml-0.5 animate-pulse" style={{ backgroundColor: 'var(--wr-amber)' }} />
          </div>
        ) : (
          <div className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <div className="h-2 rounded w-3/4 mb-2 animate-pulse" style={{ backgroundColor: 'var(--wr-border)' }} />
            <div className="h-2 rounded w-1/2 mb-2 animate-pulse" style={{ backgroundColor: 'var(--wr-border)' }} />
            <div className="h-2 rounded w-2/3 animate-pulse" style={{ backgroundColor: 'var(--wr-border)' }} />
          </div>
        )}
      </div>
    );
  }

  const markdownToHtml = (md) => {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="section-title">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^\d+\.\s+(.+)$/gm, '<li class="ol-item">$1</li>')
      .replace(/^[-*•]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/(<li class="ol-item">.*<\/li>\n?)+/g, m => `<ol>${m.replace(/ class="ol-item"/g, '')}</ol>`)
      .replace(/^(?!<[houli]|<hr|<strong|<em)(.+)$/gm, '<p>$1</p>')
      .replace(/\n{2,}/g, '\n');
  };

  const printReport = () => {
    const win = window.open('', '_blank');

    // ── severity palette ──────────────────────────────────────────────────────
    const SEV_COLOR  = { CRITICAL:'#C0392B', HIGH:'#E67E22', MEDIUM:'#D4AC0D', LOW:'#27AE60', INFORMATIONAL:'#2980B9' };
    const SEV_BG     = { CRITICAL:'#FDECEA', HIGH:'#FEF0E6', MEDIUM:'#FEFBE6', LOW:'#E9F7EF', INFORMATIONAL:'#EAF4FB' };

    // ── build per-agent rows ──────────────────────────────────────────────────
    const agentMap = Object.fromEntries((agents || []).map(a => [a.id, a]));
    const rows = (sessionAgents || []).map(sa => {
      const ag = agentMap[sa.agent_id] || {};
      return {
        name:     ag.name || 'Unknown',
        disc:     ag.discipline || '',
        color:    ag.domain_color || '#888',
        r1sev:    (sa.round1_severity || '—').toUpperCase(),
        r2sev:    (sa.round2_revised_severity || '—').toUpperCase(),
        r1conf:   sa.round1_confidence ?? null,
        r2conf:   sa.round2_confidence ?? null,
      };
    });

    // ── severity distribution ─────────────────────────────────────────────────
    const SEV_ORDER = ['CRITICAL','HIGH','MEDIUM','LOW','INFORMATIONAL'];
    const sevCounts = Object.fromEntries(SEV_ORDER.map(s => [s, 0]));
    rows.forEach(r => { const s = r.r2sev !== '—' ? r.r2sev : r.r1sev; if (sevCounts[s] !== undefined) sevCounts[s]++; });
    const overallRisk = SEV_ORDER.find(s => sevCounts[s] > 0) || 'LOW';
    const totalAgents = rows.length || 1;

    // ── SVG: severity horizontal stacked bar ──────────────────────────────────
    const BAR_W = 480;
    let stackX = 0;
    const stackedSegments = SEV_ORDER.filter(s => sevCounts[s] > 0).map(s => {
      const w = Math.round((sevCounts[s] / totalAgents) * BAR_W);
      const seg = `<rect x="${stackX}" y="0" width="${w}" height="28" fill="${SEV_COLOR[s]}" />
        <text x="${stackX + w / 2}" y="18" text-anchor="middle" font-size="11" fill="white" font-weight="bold" font-family="Arial">${sevCounts[s] > 0 ? s[0] : ''}</text>`;
      stackX += w;
      return seg;
    }).join('');

    // ── SVG: per-agent severity + confidence chart ────────────────────────────
    const CHART_W = 340;
    const agentChartRows = rows.map((r, i) => {
      const conf = r.r2conf ?? r.r1conf ?? 0;
      const confW = Math.round((conf / 100) * CHART_W);
      const confColor = conf >= 75 ? '#27AE60' : conf >= 50 ? '#D4AC0D' : '#E67E22';
      const sev = r.r2sev !== '—' ? r.r2sev : r.r1sev;
      const y = i * 44;
      return `<g transform="translate(0,${y})">
        <circle cx="7" cy="10" r="6" fill="${r.color}" />
        <text x="18" y="14" font-size="11" font-family="Arial" fill="#222" font-weight="600">${r.name.substring(0,22)}</text>
        <text x="18" y="26" font-size="9" font-family="Arial" fill="#888">${r.disc.substring(0,28)}</text>
        <rect x="200" y="3" width="${CHART_W}" height="16" fill="#eee" rx="3"/>
        <rect x="200" y="3" width="${confW || 2}" height="16" fill="${confColor}" rx="3"/>
        <text x="${200 + CHART_W + 8}" y="14" font-size="10" font-family="Arial" fill="#555">${conf}%</text>
        <rect x="560" y="2" width="70" height="18" rx="3" fill="${SEV_BG[sev] || '#f5f5f5'}"/>
        <text x="595" y="14" text-anchor="middle" font-size="10" font-family="Arial" fill="${SEV_COLOR[sev] || '#555'}" font-weight="bold">${sev}</text>
      </g>`;
    }).join('');
    const agentChartH = Math.max(rows.length * 44, 20);

    // ── SVG: donut chart for severity distribution ────────────────────────────
    const DONUT_R = 70; const DONUT_CX = 90; const DONUT_CY = 90;
    let donutAngle = -Math.PI / 2;
    const donutSlices = SEV_ORDER.filter(s => sevCounts[s] > 0).map(s => {
      const frac = sevCounts[s] / totalAgents;
      const sweep = frac * 2 * Math.PI;
      const x1 = DONUT_CX + DONUT_R * Math.cos(donutAngle);
      const y1 = DONUT_CY + DONUT_R * Math.sin(donutAngle);
      donutAngle += sweep;
      const x2 = DONUT_CX + DONUT_R * Math.cos(donutAngle);
      const y2 = DONUT_CY + DONUT_R * Math.sin(donutAngle);
      const large = sweep > Math.PI ? 1 : 0;
      return `<path d="M${DONUT_CX},${DONUT_CY} L${x1.toFixed(1)},${y1.toFixed(1)} A${DONUT_R},${DONUT_R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${SEV_COLOR[s]}" stroke="white" stroke-width="2"/>`;
    }).join('');
    const donutLegend = SEV_ORDER.filter(s => sevCounts[s] > 0).map((s, i) =>
      `<g transform="translate(185,${20 + i * 22})">
        <rect width="12" height="12" rx="2" fill="${SEV_COLOR[s]}"/>
        <text x="18" y="10" font-size="11" font-family="Arial" fill="#333">${s} — ${sevCounts[s]} agent${sevCounts[s] !== 1 ? 's' : ''}</text>
      </g>`
    ).join('');

    // ── compound chains ───────────────────────────────────────────────────────
    const chains = synthesis?.compound_chains || [];
    const chainsHtml = chains.length === 0
      ? '<p style="color:#888;font-style:italic;font-size:13px">No compound attack chains identified in this session.</p>'
      : chains.map(c => `
        <div class="chain-card">
          <div class="chain-name">${c.name}</div>
          ${c.description ? `<p class="chain-desc">${c.description.substring(0,280)}${c.description.length > 280 ? '…' : ''}</p>` : ''}
          <div class="chain-flow">
            ${(c.steps || []).map((s, i) => `
              <div class="flow-step">
                <div class="flow-num">${i + 1}</div>
                <div class="flow-text">${s.step_text}</div>
              </div>
              ${i < (c.steps || []).length - 1 ? '<div class="flow-arrow">▼</div>' : ''}
            `).join('')}
          </div>
        </div>`).join('');

    // ── agent assessment table ────────────────────────────────────────────────
    const tableRows = rows.map(r => {
      const conf = r.r2conf ?? r.r1conf;
      const confBar = conf !== null
        ? `<div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:8px;background:#eee;border-radius:4px"><div style="width:${conf}%;height:8px;background:${conf>=75?'#27AE60':conf>=50?'#D4AC0D':'#E67E22'};border-radius:4px"></div></div><span style="font-size:11px;color:#555;min-width:32px">${conf}%</span></div>`
        : '<span style="color:#bbb">—</span>';
      return `<tr>
        <td><span class="agent-dot" style="background:${r.color}"></span>${r.name}</td>
        <td style="color:#666;font-size:12px">${r.disc}</td>
        <td class="sev-cell" style="background:${SEV_BG[r.r1sev]||'#f5f5f5'};color:${SEV_COLOR[r.r1sev]||'#333'}">${r.r1sev}</td>
        <td class="sev-cell" style="background:${SEV_BG[r.r2sev]||'#f5f5f5'};color:${SEV_COLOR[r.r2sev]||'#333'}">${r.r2sev}</td>
        <td style="min-width:160px">${confBar}</td>
      </tr>`;
    }).join('');

    const htmlBody = markdownToHtml(resolvedText);
    const dateStr = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Executive Risk Report — ${session?.name || 'Session'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', serif; color: #1a1a1a; font-size: 14px; line-height: 1.7; background: #fff; }
  .page { max-width: 900px; margin: 0 auto; padding: 60px 60px; }
  @media print {
    .page { padding: 30px 40px; }
    .page-break { page-break-before: always; }
    .no-break { page-break-inside: avoid; }
  }

  /* Cover */
  .cover { display:flex; flex-direction:column; justify-content:space-between; min-height:96vh; border-left:6px solid #F0A500; padding-left:32px; }
  .cover-label { font-family:Arial,sans-serif; font-size:11px; letter-spacing:0.15em; color:#999; text-transform:uppercase; margin-bottom:48px; }
  .cover-title { font-size:36px; font-weight:700; color:#111; line-height:1.2; margin-bottom:16px; }
  .cover-subtitle { font-size:18px; color:#555; margin-bottom:40px; }
  .cover-meta { font-size:13px; color:#777; line-height:2; }
  .cover-risk { display:inline-block; padding:8px 20px; border-radius:4px; font-family:Arial,sans-serif; font-size:13px; font-weight:700; letter-spacing:0.1em; margin-top:32px; }
  .cover-footer { font-size:11px; color:#aaa; border-top:1px solid #eee; padding-top:16px; }

  /* Section headers */
  .section-header { font-family:Arial,sans-serif; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:#F0A500; font-weight:700; margin-bottom:16px; margin-top:36px; padding-bottom:6px; border-bottom:2px solid #F0A500; }
  .section-title { font-size:20px; color:#111; margin:28px 0 8px; border-bottom:2px solid #F0A500; padding-bottom:6px; font-weight:700; }

  /* Risk badge */
  .risk-badge { display:inline-flex; align-items:center; gap:8px; padding:10px 20px; border-radius:6px; font-family:Arial,sans-serif; font-weight:700; font-size:14px; letter-spacing:0.05em; }

  /* Charts */
  .chart-row { display:flex; gap:32px; align-items:flex-start; margin:20px 0; flex-wrap:wrap; }
  .chart-box { flex:1; min-width:220px; }
  .chart-label { font-family:Arial,sans-serif; font-size:10px; color:#999; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:8px; }

  /* Agent table */
  table { width:100%; border-collapse:collapse; font-size:13px; margin:16px 0; }
  th { background:#F8F8F8; text-align:left; padding:9px 12px; font-family:Arial,sans-serif; font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:#888; border-bottom:2px solid #eee; font-weight:600; }
  td { padding:10px 12px; border-bottom:1px solid #f0f0f0; vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:#FAFAFA; }
  .sev-cell { font-family:Arial,sans-serif; font-size:10px; font-weight:700; letter-spacing:0.08em; text-align:center; border-radius:3px; padding:5px 8px; }
  .agent-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:middle; }

  /* Synthesis body */
  h1.section-title { font-size:20px; }
  h2 { font-family:Arial,sans-serif; font-size:11px; letter-spacing:0.15em; text-transform:uppercase; color:#F0A500; font-weight:700; margin:28px 0 8px; padding-bottom:4px; border-bottom:1px solid #F0A50040; }
  h3 { font-size:15px; color:#333; margin:20px 0 6px; font-weight:600; }
  h4 { font-size:13px; color:#555; margin:14px 0 4px; font-style:italic; }
  p { margin:8px 0; color:#333; line-height:1.8; }
  ul, ol { margin:8px 0 12px; padding-left:24px; }
  li { margin:5px 0; color:#333; line-height:1.7; }
  strong { font-weight:700; color:#111; }
  em { font-style:italic; color:#555; }
  hr { border:none; border-top:1px solid #eee; margin:24px 0; }
  blockquote { border-left:3px solid #F0A500; padding-left:16px; color:#555; margin:16px 0; font-style:italic; }

  /* Chain cards */
  .chain-card { border:1px solid #e8e8e8; border-left:4px solid #F0A500; border-radius:6px; padding:20px 24px; margin:16px 0; background:#FAFAFA; page-break-inside:avoid; }
  .chain-name { font-size:15px; font-weight:700; color:#111; margin-bottom:8px; }
  .chain-desc { font-size:12px; color:#666; margin-bottom:14px; font-style:italic; }
  .chain-flow { display:flex; flex-direction:column; align-items:flex-start; gap:0; }
  .flow-step { display:flex; align-items:flex-start; gap:12px; }
  .flow-num { width:24px; height:24px; background:#F0A500; color:white; border-radius:50%; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; font-family:Arial,sans-serif; flex-shrink:0; margin-top:2px; }
  .flow-text { font-size:13px; color:#333; line-height:1.6; padding:2px 0; }
  .flow-arrow { color:#F0A500; font-size:14px; margin:4px 0 4px 6px; }

  /* Footer */
  .report-footer { margin-top:60px; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#aaa; display:flex; justify-content:space-between; font-family:Arial,sans-serif; }
</style>
</head><body>

<!-- ═══════════════════════ COVER PAGE ═══════════════════════ -->
<div class="page">
  <div class="cover">
    <div>
      <div class="cover-label">Confidential — Executive Risk Report</div>
      <div class="cover-title">${session?.name || 'Risk Assessment'}</div>
      <div class="cover-subtitle">${scenario?.name || ''}</div>
      <div class="cover-meta">
        ${session?.phase_focus ? `<div><strong>Phase Focus:</strong> ${session.phase_focus}</div>` : ''}
        <div><strong>Assessment Date:</strong> ${dateStr}</div>
        <div><strong>Participating Agents:</strong> ${rows.length}</div>
        <div><strong>Assessment Rounds:</strong> 2</div>
      </div>
      <div>
        <div class="risk-badge" style="background:${SEV_BG[overallRisk]};color:${SEV_COLOR[overallRisk]};margin-top:28px">
          ⚑ Overall Risk Level: ${overallRisk}
        </div>
      </div>
    </div>
    <div class="cover-footer">
      Generated by AgentDebate &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; Confidential
    </div>
  </div>
</div>

<!-- ═══════════════════════ EXECUTIVE DASHBOARD ═══════════════════════ -->
<div class="page page-break">
  <div class="section-header">Executive Dashboard</div>

  <!-- Risk distribution donut + legend -->
  <div class="chart-row no-break">
    <div class="chart-box">
      <div class="chart-label">Severity Distribution</div>
      <svg width="380" height="180" xmlns="http://www.w3.org/2000/svg">
        ${donutSlices}
        <circle cx="${DONUT_CX}" cy="${DONUT_CY}" r="38" fill="white"/>
        <text x="${DONUT_CX}" y="${DONUT_CY - 7}" text-anchor="middle" font-size="18" font-weight="bold" fill="${SEV_COLOR[overallRisk]}" font-family="Arial">${overallRisk[0]}</text>
        <text x="${DONUT_CX}" y="${DONUT_CY + 11}" text-anchor="middle" font-size="9" fill="#888" font-family="Arial">OVERALL</text>
        ${donutLegend}
      </svg>
    </div>
    <div class="chart-box">
      <div class="chart-label">Risk Level Breakdown</div>
      <svg width="500" height="${Math.max(SEV_ORDER.filter(s=>sevCounts[s]>0).length * 36 + 10, 40)}" xmlns="http://www.w3.org/2000/svg">
        ${SEV_ORDER.filter(s => sevCounts[s] > 0).map((s, i) => {
          const w = Math.round((sevCounts[s] / totalAgents) * 300);
          return `<g transform="translate(0,${i * 36})">
            <text x="0" y="18" font-size="11" fill="#555" font-family="Arial" font-weight="600">${s}</text>
            <rect x="115" y="4" width="300" height="22" fill="#f0f0f0" rx="3"/>
            <rect x="115" y="4" width="${w}" height="22" fill="${SEV_COLOR[s]}" rx="3"/>
            <text x="${115 + w + 8}" y="19" font-size="12" fill="#333" font-weight="bold" font-family="Arial">${sevCounts[s]}</text>
          </g>`;
        }).join('')}
      </svg>
    </div>
  </div>

  <!-- Agent risk matrix -->
  <div class="section-header" style="margin-top:32px">Agent Risk Matrix</div>
  <div class="no-break">
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Discipline</th>
          <th>Round 1 Severity</th>
          <th>Round 2 Severity</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <!-- Agent confidence chart -->
  <div class="section-header" style="margin-top:32px">Agent Confidence Scores</div>
  <svg width="700" height="${agentChartH}" xmlns="http://www.w3.org/2000/svg">
    <text x="200" y="-8" font-size="9" fill="#bbb" font-family="Arial">CONFIDENCE</text>
    <text x="560" y="-8" font-size="9" fill="#bbb" font-family="Arial">R2 SEVERITY</text>
    ${agentChartRows}
  </svg>
</div>

<!-- ═══════════════════════ COMPOUND ATTACK CHAINS ═══════════════════════ -->
<div class="page page-break">
  <div class="section-header">Compound Attack Chains</div>
  <p style="color:#666;font-size:13px;margin-bottom:20px">Multi-step attack sequences identified across agent assessments where individual vulnerabilities compound into higher-severity scenarios.</p>
  ${chainsHtml}
</div>

<!-- ═══════════════════════ FULL SYNTHESIS NARRATIVE ═══════════════════════ -->
<div class="page page-break">
  <div class="section-header">Synthesis Narrative</div>
  ${htmlBody}
</div>

<!-- Footer on every page via fixed positioning is not reliable in print; inline footer instead -->
<div class="page">
  <div class="report-footer">
    <span>AgentDebate — Executive Risk Report</span>
    <span>${session?.name || ''}</span>
    <span>${dateStr}</span>
  </div>
</div>

<script>
  function doClose() {
    try { if (window.opener) window.opener.focus(); } catch(e) {}
    window.close();
  }
  window.onafterprint = doClose;
  var mq = window.matchMedia && window.matchMedia('print');
  if (mq) {
    var handler = function(e) { if (!e.matches) doClose(); };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }
  window.onload = function() { setTimeout(window.print.bind(window), 300); };
<\/script>
</body></html>`);
    win.document.close();
  };

  const synth = synthesis;
  const rawCompoundChains = synth?.compound_chains;
  const compoundChains = Array.isArray(rawCompoundChains) ? rawCompoundChains
    : typeof rawCompoundChains === 'string' ? (() => { try { return JSON.parse(rawCompoundChains); } catch { return []; } })()
    : [];

  // These JSONB fields default to [] in the DB (truthy!) so we can't use || directly.
  // The save code only populates raw_text; always extract sections from resolvedText.
  const asStr = (v) => (v && typeof v === 'string') ? v : null;
  const consensusText   = asStr(synth?.consensus_findings)  || (resolvedText ? extractSynthSection(resolvedText, 'Consensus') : null);
  const contestedText   = asStr(synth?.contested_findings)  || (resolvedText ? extractSynthSection(resolvedText, 'Contest') : null);
  const blindText       = asStr(synth?.blind_spots)         || (resolvedText ? extractSynthSection(resolvedText, 'Blind') : null);
  const mitigationText  = asStr(synth?.priority_mitigations)|| (resolvedText ? extractSynthSection(resolvedText, 'Mitig') : null);
  const insightsText    = asStr(synth?.sharpest_insights)   || (resolvedText ? extractSynthSection(resolvedText, 'Insight') : null);

  return (
    <div className="space-y-4">
      {resolvedText && (
        <div className="flex items-center gap-3">
          <WrButton variant="outline" size="sm" onClick={printReport}>
            🖨 Print Report
          </WrButton>
        </div>
      )}

      {resolvedText && (
        <>
          {consensusText && (
            <SynthSectionCard title="Consensus Findings">
              <SynthMarkdown text={consensusText} />
            </SynthSectionCard>
          )}
          {contestedText && (
            <SynthSectionCard title="Contested Findings">
              <SynthMarkdown text={contestedText} />
            </SynthSectionCard>
          )}
          {compoundChains.length > 0 && (
            <SynthSectionCard title="Compound Threat Chains">
              <SynthChains chains={compoundChains} />
            </SynthSectionCard>
          )}
          {blindText && (
            <SynthSectionCard title="Blind Spots">
              <div style={{ borderLeft: '3px solid rgba(240,165,0,0.3)', paddingLeft: 14 }}>
                <SynthMarkdown text={blindText} />
              </div>
            </SynthSectionCard>
          )}
          {mitigationText && (
            <SynthSectionCard title="Priority Mitigations">
              <SynthMarkdown text={mitigationText} />
            </SynthSectionCard>
          )}
          {insightsText && (
            <SynthSectionCard title="Sharpest Insights">
              <SynthMarkdown text={insightsText} />
            </SynthSectionCard>
          )}
          {!consensusText && !contestedText && !blindText && !mitigationText && !insightsText && (
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
              <ReactMarkdown
                components={{
                  h2: ({ children }) => <h2 style={{ fontWeight: 700, color: 'var(--wr-amber)', marginBottom: 8, marginTop: 24, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--wr-text-primary)', marginBottom: 6, marginTop: 16 }}>{children}</h3>,
                  p: ({ children }) => <p style={{ fontSize: 13.5, color: 'var(--wr-text-secondary)', lineHeight: 1.75, marginBottom: 12 }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ul>,
                  li: ({ children }) => <li style={{ fontSize: 13.5, color: 'var(--wr-text-secondary)', lineHeight: 1.7, marginBottom: 4 }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--wr-text-primary)' }}>{children}</strong>,
                }}
              >
                {resolvedText}
              </ReactMarkdown>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sources Panel ─────────────────────────────────────────────────────────────
function SourcesPanel({ sources, agents, session, db, sessionId, onSourceAdded }) {
  const [addUrl, setAddUrl] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validityReport, setValidityReport] = useState(null);
  const [validityError, setValidityError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [view, setView] = useState('sme'); // 'sme' = evidence ledger, 'tier' = by credibility

  const agentMap = Object.fromEntries((agents || []).map(a => [a.id, a]));

  const TIERS = ['authoritative', 'credible', 'speculative', 'unverified'];
  const grouped = TIERS.reduce((acc, t) => {
    acc[t] = sources.filter(s => (s.credibility_tier || 'unverified') === t);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!addUrl.trim()) return;
    setAdding(true);
    try {
      const { tier, score } = scoreSourceCredibility(addUrl.trim());
      let domain = addUrl;
      try { domain = new URL(addUrl.trim()).hostname; } catch { /* keep */ }
      await db.SessionSource.create({
        session_id: sessionId, source_type: 'facilitator',
        url: addUrl.trim(), title: addTitle.trim() || null,
        domain, credibility_tier: tier, credibility_score: score,
      });
      setAddUrl(''); setAddTitle(''); setShowAddForm(false);
      onSourceAdded?.();
    } catch { /* ignore */ }
    setAdding(false);
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidityReport(null);
    setValidityError(null);
    try {
      const report = await analyzeSourceValidity({ sources, scenarioName: session?.name });
      setValidityReport(report);
    } catch (e) {
      setValidityError(e.message);
    }
    setValidating(false);
  };

  if (sources.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <div className="rounded p-8 text-center" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <p className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>NO SOURCES CAPTURED YET</p>
          <p className="text-xs mt-2" style={{ color: 'var(--wr-text-muted)' }}>Sources appear automatically when agents use tools or cite publications. You can also add sources manually below.</p>
          <button onClick={() => setShowAddForm(v => !v)} className="mt-4 text-xs font-mono font-bold px-3 py-1.5 rounded" style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)' }}>
            + Add Source
          </button>
        </div>
        {showAddForm && <AddSourceForm url={addUrl} title={addTitle} setUrl={setAddUrl} setTitle={setAddTitle} onAdd={handleAdd} adding={adding} />}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            {view === 'sme' ? 'SME EVIDENCE LEDGER' : 'SESSION SOURCES'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>{sources.length} source{sources.length !== 1 ? 's' : ''} captured</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* View toggle */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
            {[{ id: 'sme', label: 'By SME' }, { id: 'tier', label: 'By Tier' }].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className="text-xs font-mono font-bold px-3 py-1.5 transition-colors"
                style={{
                  backgroundColor: view === v.id ? 'var(--wr-amber)' : 'transparent',
                  color: view === v.id ? '#0D1B2A' : 'var(--wr-text-muted)',
                }}>
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAddForm(v => !v)} className="text-xs font-mono font-bold px-3 py-1.5 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }}>
            + Add
          </button>
          <button onClick={handleValidate} disabled={validating} className="text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1.5" style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)', opacity: validating ? 0.6 : 1 }}>
            {validating ? '…' : '⚡'} {validating ? 'Analysing…' : 'Run Validity Analysis'}
          </button>
        </div>
      </div>

      {showAddForm && <AddSourceForm url={addUrl} title={addTitle} setUrl={setAddUrl} setTitle={setAddTitle} onAdd={handleAdd} adding={adding} />}

      {/* Validity report */}
      {validityError && <p className="text-xs p-3 rounded" style={{ backgroundColor: 'rgba(192,57,43,0.1)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.2)' }}>{validityError}</p>}
      {validityReport && <ValidityReport report={validityReport} />}

      {/* By SME — evidence ledger */}
      {view === 'sme' && <EvidenceLedger sources={sources} agents={agents || []} />}

      {/* By tier — credibility grouping */}
      {view === 'tier' && TIERS.map(tier => {
        const list = grouped[tier];
        if (!list.length) return null;
        const c = TIER_COLORS[tier];
        return (
          <div key={tier} className="rounded overflow-hidden" style={{ border: `1px solid ${c.border}` }}>
            <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: c.bg }}>
              <span className="text-xs font-bold font-mono tracking-widest" style={{ color: c.text }}>{TIER_LABELS[tier].toUpperCase()}</span>
              <span className="text-xs font-mono" style={{ color: c.text }}>{list.length}</span>
            </div>
            <div className="divide-y" style={{ backgroundColor: 'var(--wr-bg-card)', borderColor: 'var(--wr-border)' }}>
              {list.map(s => <SourceRow key={s.id} source={s} agent={agentMap[s.agent_id]} tierColor={c} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddSourceForm({ url, title, setUrl, setTitle, onAdd, adding }) {
  return (
    <div className="rounded p-4 space-y-3" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <p className="text-xs font-bold font-mono tracking-widest" style={{ color: 'var(--wr-text-muted)' }}>ADD FACILITATOR SOURCE</p>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded text-sm font-mono" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)', outline: 'none' }} />
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title or description (optional)" className="w-full px-3 py-2 rounded text-sm" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)', outline: 'none' }} />
      <button onClick={onAdd} disabled={adding || !url.trim()} className="px-4 py-1.5 rounded text-xs font-bold font-mono" style={{ backgroundColor: 'rgba(240,165,0,0.15)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)', opacity: adding || !url.trim() ? 0.5 : 1 }}>
        {adding ? 'Adding…' : 'Add Source'}
      </button>
    </div>
  );
}

function SourceRow({ source, agent, tierColor }) {
  const [expanded, setExpanded] = useState(false);
  const label = source.title || source.domain || source.url || 'Unknown source';
  const typeLabel = SOURCE_TYPE_LABELS[source.source_type] || source.source_type;
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate hover:underline" style={{ color: 'var(--wr-text-primary)', maxWidth: 380 }}>
                {label}
              </a>
            ) : (
              <span className="text-sm font-medium" style={{ color: 'var(--wr-text-primary)' }}>{label}</span>
            )}
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: tierColor.bg, color: tierColor.text, border: `1px solid ${tierColor.border}` }}>{TIER_LABELS[source.credibility_tier || 'unverified']}</span>
            <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{typeLabel}</span>
            {agent && <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>via {agent.name}</span>}
          </div>
          {source.cited_claim && (
            <p className="text-xs mt-1 italic" style={{ color: 'var(--wr-text-muted)' }}>
              "{source.cited_claim.slice(0, 120)}{source.cited_claim.length > 120 ? '…' : ''}"
            </p>
          )}
          {source.content_snippet && (
            <button onClick={() => setExpanded(v => !v)} className="text-xs mt-1" style={{ color: 'var(--wr-amber)' }}>
              {expanded ? 'Hide snippet ▲' : 'Show snippet ▼'}
            </button>
          )}
          {expanded && source.content_snippet && (
            <pre className="text-xs mt-1 p-2 rounded whitespace-pre-wrap" style={{ backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-secondary)', fontFamily: 'inherit' }}>
              {source.content_snippet}
            </pre>
          )}
        </div>
        {source.credibility_score != null && (
          <span className="text-xs font-mono font-bold flex-shrink-0 mt-0.5" style={{ color: tierColor.text }}>{source.credibility_score}</span>
        )}
      </div>
    </div>
  );
}

function ValidityReport({ report }) {
  const confColors = { HIGH: '#27AE60', MEDIUM: '#F0A500', LOW: '#C0392B' };
  const c = confColors[report.overall_confidence] || 'var(--wr-text-muted)';
  return (
    <div className="rounded p-4 space-y-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>VALIDITY ANALYSIS</h3>
        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: `${c}22`, color: c, border: `1px solid ${c}44` }}>
          {report.overall_confidence} CONFIDENCE
        </span>
      </div>
      {report.summary && <p className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>{report.summary}</p>}
      {report.contradictions?.length > 0 && (
        <div>
          <p className="text-xs font-bold font-mono mb-2" style={{ color: '#C0392B' }}>CONTRADICTIONS ({report.contradictions.length})</p>
          {report.contradictions.map((c, i) => (
            <div key={i} className="rounded p-3 mb-2" style={{ backgroundColor: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)' }}>
              <p className="text-xs font-medium" style={{ color: '#C0392B' }}>{c.source_a} vs {c.source_b}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--wr-text-secondary)' }}>{c.explanation}</p>
            </div>
          ))}
        </div>
      )}
      {report.unsupported_claims?.length > 0 && (
        <div>
          <p className="text-xs font-bold font-mono mb-2" style={{ color: '#E67E22' }}>UNSUPPORTED CLAIMS</p>
          <ul className="space-y-1">
            {report.unsupported_claims.map((claim, i) => <li key={i} className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>• {claim}</li>)}
          </ul>
        </div>
      )}
      {report.key_agreements?.length > 0 && (
        <div>
          <p className="text-xs font-bold font-mono mb-2" style={{ color: '#27AE60' }}>CROSS-SOURCE AGREEMENTS</p>
          <ul className="space-y-1">
            {report.key_agreements.map((a, i) => <li key={i} className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>✓ {a}</li>)}
          </ul>
        </div>
      )}
      {report.recommended_sources?.length > 0 && (
        <div>
          <p className="text-xs font-bold font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>RECOMMENDED ADDITIONAL SOURCES</p>
          <ul className="space-y-1">
            {report.recommended_sources.map((s, i) => <li key={i} className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>→ {s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SessionSettingsPanel({ session, sessionAgents, getAgent, onSaved }) {
  const { db } = useWorkspace();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: session.name || '', phase_focus: session.phase_focus || '', context_override: session.context_override || '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [saved, setSaved] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    await db.Session.update(session.id, form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved(); // reloads session data; stays on the settings tab
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <h3 className="text-xs font-bold tracking-widest mb-4 font-mono" style={{ color: 'var(--wr-text-muted)' }}>SESSION DETAILS</h3>
        <div className="space-y-4">
          <WrInput label="NAME" value={form.name} onChange={v => set('name', v)} placeholder="Session name" />
          <WrInput label="PHASE FOCUS" value={form.phase_focus} onChange={v => set('phase_focus', v)} placeholder="e.g. Pre-launch risk assessment" />
          <WrInput label="CONTEXT OVERRIDE" value={form.context_override} onChange={v => set('context_override', v)} placeholder="Optional extra context appended to agent prompts..." rows={4} />
        </div>
        <div className="mt-4">
          <WrButton onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
          </WrButton>
        </div>
      </div>

      <div className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <h3 className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>AGENTS ({sessionAgents.length})</h3>
        <div className="space-y-1">
          {sessionAgents.map(sa => {
            const agent = getAgent(sa.agent_id);
            return (
              <div key={sa.id} className="flex items-center gap-2 text-xs py-1" style={{ color: 'var(--wr-text-secondary)' }}>
                <span className="font-medium">{agent?.name}</span>
                <span style={{ color: 'var(--wr-text-muted)' }}>— {agent?.discipline}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SessionWorkspace() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { db, workspace } = useWorkspace();
  const [session, setSession] = useState(null);
  const [sessionAgents, setSessionAgents] = useState([]);
  const [agents, setAgents] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [synthStreamText, setSynthStreamText] = useState('');
  const [tab, setTab] = useState('ROUND 1');
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingSynthesis, setGeneratingSynthesis] = useState(false);
  const [synthStatus, setSynthStatus] = useState('');
  const [scenarios, setScenarios] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [genStartedAt, setGenStartedAt] = useState(null);
  const genElapsed = useElapsed(generatingAll);
  const [genError, setGenError] = useState(null);
  const [synthError, setSynthError] = useState(null);
  const [threats, setThreats] = useState([]);
  const [extractedThreats, setExtractedThreats] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [savingThreats, setSavingThreats] = useState(false);
  const [selectedThreats, setSelectedThreats] = useState(new Set());
  const [pinnedChains, setPinnedChains] = useState([]);
  const [sessionSources, setSessionSources] = useState([]);
  const [decisionFraming, setDecisionFraming] = useState(''); // Decision-Focus prompt block
  const [decisionMeta, setDecisionMeta] = useState(null);      // { decision, option } for the banner
  const [sessionChains, setSessionChains] = useState([]);      // chains extracted from this session
  const [sessionMitigations, setSessionMitigations] = useState([]);
  const [allDomains, setAllDomains] = useState([]);            // for coverage-gap count
  const [facilitatorNote, setFacilitatorNote] = useState('');
  const [briefingAll, setBriefingAll] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [showReactions, setShowReactions] = useState(false);
  const [loadingReactions, setLoadingReactions] = useState(false);
  const [criticalToast, setCriticalToast] = useState(null);
  const toastTimer = useRef(null);
  const cancelRef = useRef(false);

  const load = async () => {
    if (!db) return;
    try {
    const [sess, sa, ag, sc, synth, srcs] = await Promise.all([
      db.Session.filter({ id }),
      db.SessionAgent.filter({ session_id: id }),
      db.Agent.list(),
      db.Scenario.list(),
      db.SessionSynthesis.filter({ session_id: id }),
      db.SessionSource.filter({ session_id: id }).catch(() => []),
    ]);
    setSession(sess[0] || null);
    setSessionAgents(sa);
    setAgents(ag);
    setScenarios(sc);
    setSynthesis(synth[0] || null);
    setSessionSources(srcs || []);

    const sessionData = sess[0];
    if (sessionData?.facilitator_note) setFacilitatorNote(sessionData.facilitator_note);

    const scenarioId = sessionData?.scenario_id;
    if (scenarioId) {
      const t = await db.Threat.filter({ scenario_id: scenarioId });
      setThreats(t);
    }

    // Load pinned chains + this session's extracted chains/mitigations + domains
    const pinnedIds = sessionData?.pinned_chain_ids || [];
    const [allChains, sessMits, doms] = await Promise.all([
      db.Chain.list(),
      db.Mitigation ? db.Mitigation.filter({ session_id: id }).catch(() => []) : [],
      db.Domain.list().catch(() => []),
    ]);
    setPinnedChains(pinnedIds.length ? allChains.filter(c => pinnedIds.includes(c.id)) : []);
    setSessionChains(allChains.filter(c => c.session_id === id));
    setSessionMitigations(sessMits || []);
    setAllDomains(doms || []);

    // Decision-Focus session: build the framing block injected into every prompt
    if (sessionData?.decision_id && sessionData?.decision_option_id && db.Decision) {
      try {
        const [decision, option, assumptions] = await Promise.all([
          db.Decision.get(sessionData.decision_id),
          db.DecisionOption.get(sessionData.decision_option_id),
          db.DecisionAssumption.filter({ decision_id: sessionData.decision_id }).catch(() => []),
        ]);
        setDecisionFraming(buildDecisionFraming(decision, option, assumptions));
        setDecisionMeta(decision && option ? { decision, option } : null);
      } catch { setDecisionFraming(''); setDecisionMeta(null); }
    } else {
      setDecisionFraming('');
      setDecisionMeta(null);
    }
    } catch (err) {
      console.error('SessionWorkspace load failed:', err);
    }
  };

  useEffect(() => { load(); }, [id, db]);

  // Open a completed session on the SYNTHESIS tab (where results + Next Steps live)
  const initialTabRef = useRef(false);
  useEffect(() => {
    if (initialTabRef.current || !session) return;
    initialTabRef.current = true;
    if (session.status === 'complete' && !searchParams.get('autoSynth')) setTab('SYNTHESIS');
  }, [session, searchParams]);

  // Auto-trigger synthesis when navigated from LiveDebateRoom with ?autoSynth=1
  const autoSynthFiredRef = useRef(false);
  useEffect(() => {
    if (!searchParams.get('autoSynth') || autoSynthFiredRef.current) return;
    if (!session || generatingSynthesis) return;
    if (synthesis) return; // already done
    const allR2Done = sessionAgents.length > 0 && sessionAgents.every(sa => sa.round2_rebuttal);
    if (!allR2Done) return;
    autoSynthFiredRef.current = true;
    setTab('SYNTHESIS');
    generateSynthesis();
  }, [session, sessionAgents, synthesis, generatingSynthesis, searchParams]);

  const getAgent = (agentId) => agents.find(a => a.id === agentId);
  const scenario = scenarios.find(s => s.id === session?.scenario_id);

  const buildChainContext = () => {
    if (!pinnedChains.length) return '';
    return pinnedChains.map(c => {
      const steps = (c.steps || []).map(s => `  Step ${s.step_number}: ${s.step_text}`).join('\n');
      return `[${c.name}]\n${c.description || ''}\n${steps}`;
    }).join('\n\n');
  };

  const showCriticalToast = (agentName, severity) => {
    if (severity !== 'CRITICAL') return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setCriticalToast(agentName);
    toastTimer.current = setTimeout(() => setCriticalToast(null), 7000);
  };

const briefAllAgents = async () => {
    setBriefingAll(true);
    const scenarioCtx = decisionFraming + (scenario?.context_document || '');
    for (const sa of sessionAgents) {
      const agent = getAgent(sa.agent_id);
      if (!agent) continue;
      try {
        const { briefing } = await generateRound0({
          agent: { ...agent },
          scenarioContext: scenarioCtx,
          phaseFocus: session?.phase_focus || '',
        });
        await db.SessionAgent.update(sa.id, { round0_briefing: briefing });
      } catch { /* skip failures silently */ }
    }
    setBriefingAll(false);
    load();
  };

  const resetAgent = async (sa, round) => {
    const updates = round === 1
      ? { round1_assessment: null, round1_severity: null, round1_confidence: null, compound_chain_text: null, status: 'pending' }
      : { round2_rebuttal: null, round2_revised_severity: null, round2_confidence: null, status: 'r1_done' };
    await db.SessionAgent.update(sa.id, updates);
    setSessionAgents(prev => prev.map(s => s.id === sa.id ? { ...s, ...updates } : s));
  };

  const resetAllAgents = async (round) => {
    for (const sa of sessionAgents) {
      await resetAgent(sa, round);
    }
  };

  const generateRound = async (round) => {
    cancelRef.current = false;
    setGeneratingAll(true);
    setGenStartedAt(Date.now());
    setGenError(null);
    const doneField = round === 1 ? 'round1_assessment' : 'round2_rebuttal';
    const agentsToRun = sessionAgents.filter(sa => !sa[doneField]);
    setProgress({ current: 0, total: agentsToRun.length });
    const others = round === 2 ? sessionAgents.filter(sa => sa.round1_assessment) : [];
    const chainContext = buildChainContext();
    // Retrieve org knowledge for the scenario once per round run
    const kChunks = await retrieveKnowledge(db, `${scenario?.context_document || ''} ${session?.phase_focus || ''}`, 5);
    const knowledgeContext = formatKnowledgeContext(kChunks);

    // Save facilitator note to session if changed
    if (facilitatorNote !== (session?.facilitator_note || '')) {
      await db.Session.update(id, { facilitator_note: facilitatorNote });
    }

    let completedCount = 0;
    let stuckSaId = null;

    try {
      for (let i = 0; i < agentsToRun.length; i++) {
        if (cancelRef.current) {
          cancelRef.current = false;
          break;
        }
        const sa = agentsToRun[i];
        const agent = getAgent(sa.agent_id);
        if (!agent) continue;

        setProgress({ current: i + 1, total: agentsToRun.length });

        const statusKey = round === 1 ? 'generating_r1' : 'generating_r2';
        stuckSaId = sa.id;
        await db.SessionAgent.update(sa.id, { status: statusKey });
        setSessionAgents(prev => prev.map(s => s.id === sa.id ? { ...s, status: statusKey } : s));

        const othersText = others
          .filter(o => o.agent_id !== sa.agent_id)
          .map(o => {
            const oAgent = getAgent(o.agent_id);
            const conf = o.round1_confidence != null ? ` · confidence ${o.round1_confidence}%` : '';
            return `=== ${oAgent?.name} (${oAgent?.discipline}) [${o.round1_severity || '?'}${conf}] ===\n${o.round1_assessment}`;
          }).join('\n\n');

        const fn = round === 1 ? generateRound1 : generateRound2;
        const res = await fn({
          agent: { ...agent },
          scenarioContext: decisionFraming + (scenario?.context_document || ''),
          phaseFocus: session?.phase_focus || '',
          othersAssessments: othersText,
          threatCatalog: threats,
          chainContext,
          facilitator_note: facilitatorNote,
          knowledgeContext,
        });

        const updates = round === 1 ? {
          round1_assessment: res.assessment,
          round1_severity: res.severity || agent.severity_default,
          round1_confidence: res.confidence,
          round1_likelihood: res.likelihood,
          round1_impact: res.impact,
          compound_chain_text: res.compound_chain_text || null,
          status: 'r1_done',
        } : {
          round2_rebuttal: res.assessment,
          round2_revised_severity: res.severity || sa.round1_severity,
          round2_confidence: res.confidence,
          round2_likelihood: res.likelihood,
          round2_impact: res.impact,
          compound_chain_text: res.compound_chain_text || sa.compound_chain_text || null,
          status: 'complete',
        };

        await db.SessionAgent.update(sa.id, updates);
        setSessionAgents(prev => prev.map(s => s.id === sa.id ? { ...s, ...updates } : s));
        showCriticalToast(agent.name, updates.round1_severity || updates.round2_revised_severity);
        await saveTurnSources(db, id, null, sa.agent_id, res.assessment);
        completedCount++;
        stuckSaId = null;

        if (i < agentsToRun.length - 1) await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      if (stuckSaId) {
        const resetStatus = round === 1 ? 'pending' : 'r1_done';
        await db.SessionAgent.update(stuckSaId, { status: resetStatus }).catch(() => {});
        setSessionAgents(prev => prev.map(s => s.id === stuckSaId ? { ...s, status: resetStatus } : s));
      }
      setGenError(e.message || 'Generation failed');
      setGeneratingAll(false);
      setProgress({ current: 0, total: 0 });
      return;
    }

    const allDone = completedCount === agentsToRun.length;
    const newStatus = round === 1 ? 'round1' : 'round2';
    await db.Session.update(id, { status: newStatus });
    setGeneratingAll(false);
    setProgress({ current: 0, total: 0 });

    // After round 2 fully completes, switch to synthesis and auto-generate
    if (round === 2 && allDone) {
      setTab('SYNTHESIS');
      setTimeout(() => generateSynthesis(), 500);
    } else {
      load();
    }
  };

  const generateSingleAgent = async (sa, round) => {
    const agent = getAgent(sa.agent_id);
    if (!agent) return;
    setGenError(null);
    const statusKey = round === 1 ? 'generating_r1' : 'generating_r2';
    await db.SessionAgent.update(sa.id, { status: statusKey });
    setSessionAgents(prev => prev.map(s => s.id === sa.id ? { ...s, status: statusKey } : s));

    const others = round === 2 ? sessionAgents.filter(o => o.agent_id !== sa.agent_id && o.round1_assessment) : [];
    const othersText = others.map(o => {
      const oAgent = getAgent(o.agent_id);
      const conf = o.round1_confidence != null ? ` · confidence ${o.round1_confidence}%` : '';
      return `=== ${oAgent?.name} (${oAgent?.discipline}) [${o.round1_severity || '?'}${conf}] ===\n${o.round1_assessment}`;
    }).join('\n\n');

    const chainContext = buildChainContext();
    const kChunks = await retrieveKnowledge(db, `${scenario?.context_document || ''} ${session?.phase_focus || ''}`, 5);
    const knowledgeContext = formatKnowledgeContext(kChunks);

    try {
      const fn2 = round === 1 ? generateRound1 : generateRound2;
      const res = await fn2({
        agent: { ...agent },
        scenarioContext: decisionFraming + (scenario?.context_document || ''),
        phaseFocus: session?.phase_focus || '',
        othersAssessments: othersText,
        threatCatalog: threats,
        chainContext,
        facilitator_note: facilitatorNote,
        knowledgeContext,
      });

      const updates = round === 1 ? {
        round1_assessment: res.assessment,
        round1_severity: res.severity || agent.severity_default,
        round1_confidence: res.confidence,
        round1_likelihood: res.likelihood,
        round1_impact: res.impact,
        compound_chain_text: res.compound_chain_text || null,
        status: 'r1_done',
      } : {
        round2_rebuttal: res.assessment,
        round2_revised_severity: res.severity || sa.round1_severity,
        round2_confidence: res.confidence,
        round2_likelihood: res.likelihood,
        round2_impact: res.impact,
        compound_chain_text: res.compound_chain_text || sa.compound_chain_text || null,
        status: 'complete',
      };

      await db.SessionAgent.update(sa.id, updates);
      showCriticalToast(agent.name, updates.round1_severity || updates.round2_revised_severity);
      // Check if all agents are now done for this round; if so, advance session status
      const doneField = round === 1 ? 'round1_assessment' : 'round2_rebuttal';
      const updatedAgents = sessionAgents.map(s => s.id === sa.id ? { ...s, ...updates } : s);
      const allRoundDone = updatedAgents.every(s => s[doneField]);
      if (allRoundDone) {
        const newStatus = round === 1 ? 'round1' : 'round2';
        await db.Session.update(id, { status: newStatus });
        if (round === 2) {
          setTab('SYNTHESIS');
          setTimeout(() => generateSynthesis(), 500);
        }
      }
    } catch (e) {
      await db.SessionAgent.update(sa.id, { status: 'pending' });
      setGenError(e.message || 'Generation failed');
    }
    load();
  };

  const updateAgentText = async (sa, round, text) => {
    const field = round === 1 ? 'round1_assessment' : 'round2_rebuttal';
    await db.SessionAgent.update(sa.id, { [field]: text });
    load();
  };

  const generateReactions = async () => {
    const r1Done = sessionAgents.filter(sa => sa.round1_assessment);
    if (r1Done.length < 2) return;
    setLoadingReactions(true);
    setReactions([]);
    const scenarioCtx = decisionFraming + (scenario?.context_document || '');
    const newReactions = [];

    for (const sa of r1Done) {
      const agent = getAgent(sa.agent_id);
      if (!agent) continue;
      // React to another agent's assessment (next in list)
      const others = r1Done.filter(o => o.agent_id !== sa.agent_id);
      if (!others.length) continue;
      const target = others[Math.floor(Math.random() * others.length)];
      const targetAgent = getAgent(target.agent_id);
      try {
        const text = await generateReaction({
          agent: { ...agent },
          triggerText: target.round1_assessment,
          scenarioContext: scenarioCtx,
        });
        newReactions.push({ agentName: agent.name, targetName: targetAgent?.name, text, color: agent.domain_color || '#F0A500' });
        setReactions([...newReactions]);
      } catch { /* skip */ }
    }
    setLoadingReactions(false);
  };

  const generateSynthesis = async () => {
    setGeneratingSynthesis(true);
    setSynthError(null);
    setSynthStreamText('');
    setSynthStatus('Collecting agent assessments...');

    try {
      // Fetch fresh data from DB — state may be stale if called right after round generation
      const [freshSess, freshAgents, freshAgentDefs, freshScenarios, freshSynth] = await Promise.all([
        db.Session.filter({ id }),
        db.SessionAgent.filter({ session_id: id }),
        db.Agent.list(),
        db.Scenario.list(),
        db.SessionSynthesis.filter({ session_id: id }),
      ]);
      const sess = freshSess[0] || session;
      const agentMap = Object.fromEntries(freshAgentDefs.map(a => [a.id, a]));
      const scenarioDef = freshScenarios.find(s => s.id === sess?.scenario_id);

      setSynthStatus('Streaming synthesis...');
      const res = await generateSynthesisLLM({
        session: sess,
        sessionAgents: freshAgents.map(sa => ({
          ...sa,
          agentName: agentMap[sa.agent_id]?.name,
          discipline: agentMap[sa.agent_id]?.discipline,
        })),
        scenarioContext: scenarioDef?.context_document || '',
        onToken: (_tok, full) => setSynthStreamText(full),
      });

      const existing = freshSynth[0] || null;
      const synthData = {
        raw_text: res.synthesis,
        session_id: id,
        compound_chains: res.compound_chains || [],
      };
      if (existing?.id) {
        await db.SessionSynthesis.update(existing.id, synthData);
      } else {
        await db.SessionSynthesis.create(synthData);
      }

      await saveTurnSources(db, id, null, null, res.synthesis);

      // Persist parsed compound chains to the chains table
      const newChains = res.compound_chains || [];
      if (newChains.length > 0) {
        // Remove any chains previously generated for this session so re-runs don't duplicate
        const existingChains = await db.Chain.filter({ session_id: id }).catch(() => []);
        for (const c of existingChains.filter(c => c.is_ai_generated)) {
          await db.Chain.delete(c.id).catch(() => {});
        }
        for (const c of newChains) {
          await db.Chain.create({
            session_id: id,
            scenario_id: session?.scenario_id || null,
            name: c.name,
            description: c.description || '',
            steps: c.steps || [],
            is_ai_generated: true,
            tags: [],
          });
        }
      }

      await db.Session.update(id, { status: 'complete' });
      // Update synthesis state immediately so the UI doesn't flash the empty state
      // while load() is still in-flight (finally fires before load completes).
      setSynthesis(prev => prev ? { ...prev, ...synthData } : synthData);
      setSynthStreamText('');
      load();
    } catch (e) {
      setSynthError(e.message || 'Synthesis failed — check your Anthropic API key and try again.');
      setSynthStreamText('');
      load();
    } finally {
      setGeneratingSynthesis(false);
      setSynthStatus('');
    }
  };

  const handleExtractThreats = async () => {
    setExtracting(true);
    setExtractedThreats(null);
    try {
      const results = await extractSessionThreats({
        sessionAgents: sessionAgents.map(sa => ({
          ...sa,
          agentName: getAgent(sa.agent_id)?.name,
          discipline: getAgent(sa.agent_id)?.discipline,
        })),
        scenarioName: scenario?.name || '',
        scenarioContext: decisionFraming + (scenario?.context_document || ''),
      });
      setExtractedThreats(results);
      setSelectedThreats(new Set(results.map((_, i) => i)));
    } catch {
      setExtractedThreats([]);
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveThreats = async () => {
    if (!extractedThreats || selectedThreats.size === 0) return;
    setSavingThreats(true);
    try {
      const toSave = extractedThreats.filter((_, i) => selectedThreats.has(i));
      for (const t of toSave) {
        await db.Threat.create({
          scenario_id: session.scenario_id,
          name: t.name,
          description: t.description,
          severity: t.severity,
          category: t.category,
          tags: [],
        });
      }
      setExtractedThreats(null);
      setSelectedThreats(new Set());
      load();
    } finally {
      setSavingThreats(false);
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--wr-amber)' }} />
      </div>
    );
  }

  const statusConfig = { pending:'#546E7A', round1:'#2E86AB', round2:'#D68910', complete:'#27AE60' };
  const statusColor = statusConfig[session.status] || '#546E7A';
  const round = tab === 'ROUND 1' ? 1 : 2;

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      {/* CRITICAL escalation toast */}
      {criticalToast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg"
          style={{ backgroundColor: '#C0392B', color: '#fff', maxWidth: 340 }}
        >
          <BellRing className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest font-mono">CRITICAL ESCALATION</p>
            <p className="text-xs mt-0.5">{criticalToast} has assessed CRITICAL severity</p>
          </div>
          <button onClick={() => setCriticalToast(null)} className="opacity-70 hover:opacity-100 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Bar */}
      <div className="border-b px-6 py-4 flex items-center gap-4" style={{ borderColor: 'var(--wr-border)', backgroundColor: 'var(--wr-bg-secondary)' }}>
        <Link to="/sessions" className="text-xs flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Sessions
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-bold" style={{ color: 'var(--wr-text-primary)' }}>{session.name}</h1>
            <span className="text-xs px-2 py-0.5 rounded font-bold font-mono" style={{ backgroundColor: `${statusColor}22`, color: statusColor }}>
              {session.status?.toUpperCase()}
            </span>
            {pinnedChains.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: 'rgba(46,134,171,0.15)', color: '#2E86AB' }}>
                {pinnedChains.length} chain{pinnedChains.length !== 1 ? 's' : ''} pinned
              </span>
            )}
            {decisionMeta && (
              <Link to={`/decisions/${decisionMeta.decision.id}`} className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: 'rgba(39,174,96,0.15)', color: '#27AE60', textDecoration: 'none' }}>
                Decision Focus · {decisionMeta.option.name}
              </Link>
            )}
          </div>
          {session.phase_focus && <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>{session.phase_focus}</p>}
          {(() => {
            const done = new Set(['setup']);
            const sas = sessionAgents;
            if (sas.length && sas.every(sa => sa.round1_assessment)) done.add('round1');
            if (sas.length && sas.every(sa => sa.round2_rebuttal)) done.add('round2');
            if (synthesis?.raw_text) done.add('synthesis');
            if (sessionChains.length || threats.length) done.add('findings');
            if (sessionMitigations.length) done.add('act');
            if (decisionMeta?.decision?.status === 'decided') done.add('decide');
            const current = tab === 'ROUND 1' ? 'round1' : tab === 'ROUND 2' ? 'round2'
              : tab === 'SYNTHESIS' ? 'synthesis'
              : (tab === 'KILL CHAINS' || tab === 'THREATS') ? 'findings'
              : tab === 'MITIGATIONS' ? 'act' : 'setup';
            const go = (stage) => {
              if (stage === 'round1') setTab('ROUND 1');
              else if (stage === 'round2') setTab('ROUND 2');
              else if (stage === 'synthesis') setTab('SYNTHESIS');
              else if (stage === 'findings') setTab('KILL CHAINS');
              else if (stage === 'act') setTab('MITIGATIONS');
              else if (stage === 'decide' && session?.decision_id) navigate(`/decisions/${session.decision_id}`);
            };
            return <div className="mt-2"><AnalysisStages current={current} done={done} onNavigate={go} /></div>;
          })()}
        </div>
        <div className="flex items-center gap-2">
          {session.mode === 'live' && (
            <Link to={`/sessions/${id}/live`}>
              <WrButton size="sm" style={{ backgroundColor: 'rgba(46,134,171,0.15)', borderColor: 'rgba(46,134,171,0.4)', color: '#2E86AB' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#2E86AB', display: 'inline-block', marginRight: 4 }} />
                Enter Debate Room
              </WrButton>
            </Link>
          )}
          <Link to={`/sessions/${id}/results`}>
            <WrButton variant="outline" size="sm"><BarChart2 className="w-3.5 h-3.5" /> Results</WrButton>
          </Link>
          {(tab === 'ROUND 1' || tab === 'ROUND 2') && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <WrButton
                    variant="secondary"
                    size="sm"
                    onClick={briefAllAgents}
                    disabled={briefingAll}
                  >
                    {briefingAll
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Briefing...</>
                      : <><BookOpen className="w-3.5 h-3.5" /> Brief Agents</>}
                  </WrButton>
                </TooltipTrigger>
                <TooltipContent side="bottom">Each agent writes a 100-word pre-session reflection before Round 1</TooltipContent>
              </Tooltip>
              {generatingAll ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <WrButton size="sm" variant="secondary" onClick={() => { cancelRef.current = true; }} style={{ borderColor: '#C0392B', color: '#C0392B' }}>
                      <StopCircle className="w-3.5 h-3.5" /> Stop
                    </WrButton>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Stop generation after the current agent finishes</TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <WrButton
                        size="sm"
                        onClick={() => generateRound(round)}
                        disabled={generatingAll || sessionAgents.every(sa => round === 1 ? sa.round1_assessment : sa.round2_rebuttal)}
                      >
                        <><Sparkles className="w-3.5 h-3.5" /> Generate All {tab === 'ROUND 1' ? 'Round 1' : 'Round 2'}</>
                      </WrButton>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Run {tab === 'ROUND 1' ? 'Round 1' : 'Round 2'} assessments for all agents</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <WrButton
                        size="sm"
                        variant="secondary"
                        onClick={() => resetAllAgents(round)}
                        style={{ color: 'var(--wr-text-muted)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Reset All
                      </WrButton>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Clear all {tab} assessments and return agents to pending</TooltipContent>
                  </Tooltip>
                </>
              )}
            </>
          )}
          {tab === 'SYNTHESIS' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <WrButton size="sm" onClick={generateSynthesis} disabled={generatingSynthesis}>
                  <Sparkles className="w-3.5 h-3.5" /> {generatingSynthesis ? 'Generating...' : 'Generate Synthesis'}
                </WrButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">Synthesize all Round 2 assessments into a consensus threat picture</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--wr-border)' }}>
        {TABS.map(t => {
          let badge = null;
          if (t === 'ROUND 1') {
            const done = sessionAgents.filter(sa => sa.round1_assessment).length;
            const total = sessionAgents.length;
            if (total > 0) badge = done === total ? '✓' : `${done}/${total}`;
          } else if (t === 'ROUND 2') {
            const done = sessionAgents.filter(sa => sa.round2_rebuttal).length;
            const total = sessionAgents.length;
            if (total > 0) badge = done === total ? '✓' : `${done}/${total}`;
          } else if (t === 'SYNTHESIS') {
            badge = synthesis?.raw_text ? '✓' : null;
          } else if (t === 'THREATS') {
            badge = threats.length > 0 ? String(threats.length) : null;
          } else if (t === 'SOURCES') {
            badge = sessionSources.length > 0 ? String(sessionSources.length) : null;
          }
          return (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-3 text-xs font-bold tracking-widest font-mono transition-colors flex items-center gap-1.5"
              style={{
                color: tab === t ? 'var(--wr-amber)' : 'var(--wr-text-muted)',
                borderBottom: tab === t ? '2px solid var(--wr-amber)' : '2px solid transparent',
              }}>
              {t}
              {badge && (
                <span
                  className="text-xs font-mono font-bold px-1 py-0 rounded-sm"
                  style={{
                    backgroundColor: badge === '✓' ? 'rgba(39,174,96,0.15)' : 'rgba(240,165,0,0.12)',
                    color: badge === '✓' ? '#27AE60' : 'var(--wr-amber)',
                    fontSize: '9px',
                    lineHeight: 1.6,
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Session progress strip */}
      <SessionProgressBar
        sessionAgents={sessionAgents}
        agents={agents}
        synthesis={synthesis}
        threats={threats}
        sessionSources={sessionSources}
        generatingAll={generatingAll}
        generatingSynthesis={generatingSynthesis}
        onTabChange={setTab}
      />

      {/* Content */}
      <div className="p-6">
        {/* Unrun banner */}
        {session.status === 'pending' && (
          <div className="mb-5 rounded p-4 flex items-center gap-4"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px dashed var(--wr-border)' }}>
            <div className="flex-1">
              <p className="text-xs font-bold tracking-widest font-mono mb-1" style={{ color: 'var(--wr-text-muted)' }}>
                SESSION NOT STARTED
              </p>
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                {session.mode === 'live'
                  ? 'This session is ready. Enter the debate room to begin live AI moderation.'
                  : 'This session is ready. Generate Round 1 assessments from the tabs below to begin.'}
              </p>
            </div>
            {session.mode === 'live' ? (
              <Link to={`/sessions/${id}/live`}>
                <WrButton>Enter Debate Room</WrButton>
              </Link>
            ) : (
              <WrButton onClick={() => { setTab('ROUND 1'); }}>
                Start Round 1
              </WrButton>
            )}
          </div>
        )}

        {(tab === 'ROUND 1' || tab === 'ROUND 2') && (
          <>
            {/* Facilitator note — shown in Round 2 tab */}
            {tab === 'ROUND 2' && (
              <div className="mb-4 rounded p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold tracking-widest font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>FACILITATOR NOTE</p>
                <textarea
                  value={facilitatorNote}
                  onChange={e => setFacilitatorNote(e.target.value)}
                  placeholder="Add a note to guide agents in Round 2 — e.g. focus on supply chain dependencies..."
                  rows={2}
                  className="w-full text-xs px-3 py-2 rounded outline-none resize-none"
                  style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
                />
              </div>
            )}

            {genError && (
              <div className="mb-4 rounded p-3 flex items-start gap-2" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: '#C0392B' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold mb-0.5">Generation Failed</p>
                  <p className="text-xs">{genError}</p>
                </div>
                <button onClick={() => setGenError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
              </div>
            )}

            {/* Per-agent progress panel */}
            {generatingAll && progress.total > 0 && (() => {
              const completed = Math.max(0, progress.current - 1); // agents fully finished
              const avgMs = completed > 0 ? genElapsed / completed : null;
              const remaining = progress.total - completed;
              const etaMs = avgMs != null ? avgMs * remaining : null;
              const activeAgent = getAgent(sessionAgents[progress.current - 1]?.agent_id);
              return (
              <div className="mb-4 rounded p-3.5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                <ProcessingBar
                  label={`Generating ${tab} — agent ${progress.current} of ${progress.total}${activeAgent ? `: ${activeAgent.name}` : ''}`}
                  value={completed / progress.total}
                  elapsedMs={genElapsed}
                  etaMs={etaMs}
                  sublabel={avgMs != null ? `~${fmtDuration(avgMs)} per agent` : 'Estimating time…'}
                />
                <div className="flex gap-2 mt-3">
                  {sessionAgents.map((sa, i) => {
                    const agent = getAgent(sa.agent_id);
                    const isDone = i < progress.current;
                    const isActive = i === progress.current - 1 && !isDone;
                    return (
                      <div key={sa.id} className="flex flex-col items-center gap-1" title={agent?.name}>
                        <span className="text-xs font-mono" style={{
                          color: isDone ? '#27AE60' : isActive ? 'var(--wr-amber)' : 'var(--wr-text-muted)',
                        }}>
                          {isDone ? '✓' : isActive ? '●' : '○'}
                        </span>
                        <span className="text-xs truncate max-w-[60px]" style={{ color: 'var(--wr-text-muted)', fontSize: '9px' }}>
                          {agent?.name?.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })()}

            {/* Quantified risk matrix — shown once any assessment carries L×I */}
            {sessionAgents.some(sa => (round === 1 ? sa.round1_likelihood : sa.round2_likelihood)) && (
              <div className="mb-4">
                <RiskMatrix sessionAgents={sessionAgents} agents={agents} round={round} />
              </div>
            )}

            {/* Batch action bar — generate every pending assessment at once */}
            {(() => {
              const pending = sessionAgents.filter(sa => round === 1 ? !sa.round1_assessment : !sa.round2_rebuttal);
              if (generatingAll || pending.length === 0) return null;
              const done = sessionAgents.length - pending.length;
              return (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-3"
                  style={{ backgroundColor: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.3)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--wr-amber)' }} />
                    <span className="text-sm" style={{ color: 'var(--wr-text-secondary)' }}>
                      <strong style={{ color: 'var(--wr-text-primary)' }}>{pending.length}</strong> agent{pending.length !== 1 ? 's' : ''} awaiting {tab === 'ROUND 1' ? 'Round 1' : 'Round 2'}
                      {done > 0 && <span style={{ color: 'var(--wr-text-muted)' }}> · {done} done</span>}
                    </span>
                  </div>
                  <WrButton size="sm" onClick={() => generateRound(round)}>
                    <Sparkles className="w-3.5 h-3.5" /> Generate all {pending.length}
                  </WrButton>
                </div>
              );
            })()}

            <DebateTranscript
              sessionAgents={sessionAgents}
              agents={agents}
              round={round}
              onGenerate={generateSingleAgent}
              onUpdate={updateAgentText}
              onReset={!generatingAll ? resetAgent : null}
            />

            {/* Live reactions feed */}
            {tab === 'ROUND 1' && sessionAgents.some(sa => sa.round1_assessment) && (
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { setShowReactions(!showReactions); if (!showReactions && reactions.length === 0) generateReactions(); }}
                        className="flex items-center gap-2 text-xs font-mono tracking-wider"
                        style={{ color: showReactions ? 'var(--wr-amber)' : 'var(--wr-text-muted)' }}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {showReactions ? 'HIDE REACTIONS' : 'SHOW LIVE REACTIONS'}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Simulated cross-agent reactions to each other's Round 1 assessments</TooltipContent>
                  </Tooltip>
                  {showReactions && reactions.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={generateReactions} className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                          <RefreshCw className="w-3 h-3 inline mr-1" />refresh
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Regenerate all agent reactions</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {showReactions && (
                  <div className="rounded p-4 space-y-3" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                    {loadingReactions ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--wr-amber)' }} />
                        <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Generating reactions...</span>
                      </div>
                    ) : reactions.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No reactions yet.</p>
                    ) : (
                      reactions.map((r, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color, minHeight: 20 }} />
                          <div>
                            <p className="text-xs font-semibold" style={{ color: 'var(--wr-text-primary)' }}>
                              {r.agentName} <span style={{ color: 'var(--wr-text-muted)', fontWeight: 400 }}>re: {r.targetName}</span>
                            </p>
                            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{r.text}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'SYNTHESIS' && (
          <SynthesisErrorBoundary key={synthesis?.id || 'synth'}>
            <SynthesisSummary
              synthesis={synthesis}
              sessionAgents={sessionAgents}
              agents={agents}
              threats={threats}
              sessionSources={sessionSources}
              onGoToThreats={() => setTab('THREATS')}
            />
            <SynthesisPanel
              synthesis={synthesis}
              sessionId={id}
              onGenerate={generateSynthesis}
              generating={generatingSynthesis}
              synthStatus={synthStatus}
              r2Done={sessionAgents.length > 0 && sessionAgents.every(sa => sa.round2_rebuttal)}
              synthError={synthError}
              streamText={synthStreamText}
              sessionAgents={sessionAgents}
              agents={agents}
              session={session}
              scenario={scenarios.find(s => s.id === session?.scenario_id) || null}
            />
            {synthesis?.raw_text && (() => {
              // Coverage gaps for the participating panel against this scenario's threats
              let gaps = null;
              try {
                const participants = agents.filter(a => sessionAgents.some(sa => sa.agent_id === a.id));
                const { groups } = buildGroups({ axis: 'domain', agents: participants, domains: allDomains, threats });
                gaps = groups.filter(g => !g.isUnassigned && g.score > 0 && g.agents.length <= 1).length;
              } catch { gaps = null; }
              return (
                <div className="mt-6">
                  <NextSteps
                    sessionId={id}
                    decisionId={session?.decision_id || null}
                    threatsCount={threats.length}
                    chainsCount={sessionChains.length}
                    mitigationsCount={sessionMitigations.length}
                    coverageGaps={gaps}
                    onCatalogThreats={() => setTab('THREATS')}
                    onBreakChains={() => setTab('KILL CHAINS')}
                    onTrackMitigations={() => setTab('MITIGATIONS')}
                  />
                </div>
              );
            })()}
          </SynthesisErrorBoundary>
        )}

        {tab === 'KILL CHAINS' && (
          <div className="max-w-4xl">
            <SessionKillChains
              db={db}
              sessionId={id}
              chains={sessionChains}
              scenarioContext={(session?.context_override ? session.context_override + '\n\n' : '') + (scenario?.context_document || '')}
              existingMitigations={sessionMitigations}
              onAnalyzed={load}
            />
          </div>
        )}

        {tab === 'MITIGATIONS' && (
          <div className="max-w-4xl">
            <SessionMitigations db={db} mitigations={sessionMitigations} onChange={load} />
          </div>
        )}

        {tab === 'THREATS' && (
          <div className="space-y-6 max-w-4xl">
            <div>
              {threats.length === 0 ? (
                <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                  <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                    No threats assigned to this scenario. Extract threats from session assessments below.
                  </p>
                </div>
              ) : (
                <RiskRegistry threats={threats} />
              )}
            </div>

            <div className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                    EXTRACT FROM SESSION
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>
                    Analyze agent assessments to surface new threats and save them to this scenario.
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <WrButton size="sm" onClick={handleExtractThreats}
                      disabled={extracting || !sessionAgents.some(sa => sa.round1_assessment)}>
                      {extracting
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...</>
                        : <><ShieldAlert className="w-3.5 h-3.5" /> Extract Threats</>}
                    </WrButton>
                  </TooltipTrigger>
                  <TooltipContent side="left">Analyze agent assessments and save new threat vectors to this scenario's catalog</TooltipContent>
                </Tooltip>
              </div>

              {!sessionAgents.some(sa => sa.round1_assessment) && (
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                  Complete at least Round 1 before extracting threats.
                </p>
              )}

              {extractedThreats !== null && (
                <div>
                  {extractedThreats.length === 0 ? (
                    <p className="text-xs py-2" style={{ color: 'var(--wr-text-muted)' }}>
                      No distinct threats could be extracted from the current assessments.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs mb-3" style={{ color: 'var(--wr-text-secondary)' }}>
                        {extractedThreats.length} threat{extractedThreats.length !== 1 ? 's' : ''} found — click to select/deselect
                      </p>
                      <div className="space-y-2 mb-4">
                        {extractedThreats.map((t, i) => (
                          <div key={i}
                            className="flex items-start gap-3 rounded p-3 cursor-pointer transition-all"
                            style={{
                              backgroundColor: selectedThreats.has(i) ? 'rgba(240,165,0,0.08)' : 'var(--wr-bg-secondary)',
                              border: `1px solid ${selectedThreats.has(i) ? 'rgba(240,165,0,0.3)' : 'var(--wr-border)'}`,
                            }}
                            onClick={() => setSelectedThreats(prev => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i); else next.add(i);
                              return next;
                            })}>
                            <div className="flex-shrink-0 w-4 h-4 mt-0.5 rounded flex items-center justify-center"
                              style={{
                                backgroundColor: selectedThreats.has(i) ? 'var(--wr-amber)' : 'transparent',
                                border: `1.5px solid ${selectedThreats.has(i) ? 'var(--wr-amber)' : 'var(--wr-border)'}`,
                              }}>
                              {selectedThreats.has(i) && <Check className="w-2.5 h-2.5" style={{ color: '#0D1B2A' }} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <p className="text-xs font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{t.name}</p>
                                <SeverityBadge severity={t.severity} />
                                {t.category && (
                                  <span className="text-xs font-mono" style={{ color: 'var(--wr-amber)' }}>{t.category}</span>
                                )}
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{t.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <WrButton size="sm" onClick={handleSaveThreats}
                          disabled={savingThreats || selectedThreats.size === 0}>
                          {savingThreats
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                            : <><Check className="w-3.5 h-3.5" /> Save {selectedThreats.size} Selected</>}
                        </WrButton>
                        <WrButton variant="secondary" size="sm" onClick={() => setExtractedThreats(null)}>
                          <X className="w-3.5 h-3.5" /> Discard
                        </WrButton>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'SOURCES' && (
          <SourcesPanel sources={sessionSources} agents={agents} session={session} db={db} sessionId={id} onSourceAdded={load} />
        )}

        {tab === 'SETTINGS' && (
          <SessionSettingsPanel session={session} sessionAgents={sessionAgents} getAgent={getAgent} onSaved={load} />
        )}
      </div>
    </div>
  );
}
