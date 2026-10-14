import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Swords, ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import WrButton from '@/components/ui/WrButton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const SEV_CLASS = {
  CRITICAL: 'border-red-700/40 text-red-600 bg-red-700/5',
  HIGH:     'border-orange-500/40 text-orange-500 bg-orange-500/5',
  MEDIUM:   'border-amber-500/40 text-amber-500 bg-amber-500/5',
  LOW:      'border-green-600/40 text-green-500 bg-green-600/5',
};

function SeverityPill({ severity }) {
  if (!severity) return null;
  return (
    <span className={cn(
      'text-[10px] px-1.5 py-0.5 rounded-full border font-bold tracking-wider font-mono whitespace-nowrap',
      SEV_CLASS[severity] || SEV_CLASS.HIGH
    )}>
      {severity}
    </span>
  );
}

function ThinkingDots({ color = 'bg-amber-500' }) {
  return (
    <div className="flex items-center gap-2 py-3">
      <div className="flex gap-1">
        {[0, 300, 600].map(delay => (
          <div key={delay} className={cn('w-1.5 h-1.5 rounded-full animate-pulse', color)} style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
      <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Analyzing…</span>
    </div>
  );
}

function AgentRow({ sa, agent, round, onGenerate, onUpdate, onReset }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const isGenerating = sa.status === (round === 1 ? 'generating_r1' : 'generating_r2');
  const text = round === 1 ? sa.round1_assessment : sa.round2_rebuttal;
  const severity = round === 1 ? sa.round1_severity : sa.round2_revised_severity;
  const prevSev = round === 2 ? sa.round1_severity : null;
  const sevShifted = severity && prevSev && severity !== prevSev;
  const confidence = round === 1 ? sa.round1_confidence : sa.round2_confidence;
  const color = agent?.domain_color || '#F0A500';

  return (
    <tr className="border-b last:border-b-0" style={{ borderColor: 'var(--wr-border)' }}>
      {/* Left: agent info column */}
      <td
        className="align-top px-4 py-4 border-r w-40 overflow-hidden"
        style={{ borderColor: `${color}30`, backgroundColor: `${color}06` }}
      >
        <div className="flex flex-col gap-1.5 sticky top-4 min-w-0">
          <div
            className="text-xs font-bold tracking-wider font-mono px-1.5 py-0.5 rounded-full max-w-full break-words border"
            style={{ color, borderColor: `${color}40`, backgroundColor: `${color}12` }}
          >
            {agent?.name || '—'}
          </div>
          {agent?.discipline && (
            <span className="text-[11px] break-words" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</span>
          )}
          <div className="flex flex-col gap-1 mt-0.5">
            <SeverityPill severity={severity} />
            {sevShifted && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                was {prevSev}
              </span>
            )}
            {confidence != null && (
              <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--wr-amber)' }}>
                {confidence}%
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Right: assessment content */}
      <td className="align-top px-5 py-4">
        {isGenerating ? (
          <ThinkingDots color="bg-amber-500" />
        ) : text ? (
          <div>
            {editing ? (
              <div>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={8}
                  className="w-full text-xs px-3 py-2 rounded-xl outline-none resize-none"
                  style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
                />
                <div className="flex gap-2 mt-2">
                  <WrButton size="xs" onClick={() => { onUpdate(editText); setEditing(false); }}>Save</WrButton>
                  <WrButton variant="secondary" size="xs" onClick={() => setEditing(false)}>Cancel</WrButton>
                </div>
              </div>
            ) : (
              <>
                <div className={cn('prose prose-sm max-w-none break-words', !expanded && 'line-clamp-4')}
                  style={{ '--tw-prose-body': 'var(--wr-text-secondary)', '--tw-prose-bold': 'var(--wr-text-primary)' }}>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p style={{ fontSize: 13.5, color: 'var(--wr-text-secondary)', lineHeight: 1.75, marginBottom: 8 }}>{children}</p>,
                      ul: ({ children }) => <ul style={{ paddingLeft: 18, marginBottom: 8 }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ paddingLeft: 18, marginBottom: 8 }}>{children}</ol>,
                      li: ({ children }) => <li style={{ fontSize: 13.5, color: 'var(--wr-text-secondary)', lineHeight: 1.7, marginBottom: 3 }}>{children}</li>,
                      strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--wr-text-primary)' }}>{children}</strong>,
                    }}
                  >
                    {text}
                  </ReactMarkdown>
                </div>
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="flex items-center gap-1 text-xs mt-2 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--wr-amber)' }}
                >
                  {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show more</>}
                </button>
              </>
            )}
            {!editing && (
              <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--wr-border)' }}>
                <WrButton variant="secondary" size="xs" onClick={() => { setEditText(text); setEditing(true); }}>Edit</WrButton>
                <WrButton variant="secondary" size="xs" onClick={onGenerate}>
                  <RefreshCw className="w-3 h-3" /> Regen
                </WrButton>
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
            )}
          </div>
        ) : (
          <div className="py-2">
            <p className="text-sm italic mb-3" style={{ color: 'var(--wr-text-muted)' }}>No assessment yet</p>
            <WrButton size="xs" onClick={onGenerate}>Generate</WrButton>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function DebateTranscript({
  sessionAgents = [],
  agents = [],
  round,
  onGenerate,
  onUpdate,
  onReset,
}) {
  const roundLabel = round === 1 ? 'Round 1 — Independent Assessments' : 'Round 2 — Rebuttals';

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b"
        style={{ borderColor: 'var(--wr-border)', backgroundColor: 'rgba(138,155,181,0.04)' }}
      >
        <Swords className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
        <span className="text-xs font-bold tracking-wider uppercase font-mono" style={{ color: 'var(--wr-text-muted)' }}>
          {roundLabel}
        </span>
        <span className="ml-auto text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
          {sessionAgents.length} agents
        </span>
      </div>

      {/* Transcript table */}
      <table className="w-full table-fixed border-collapse" style={{ backgroundColor: 'var(--wr-bg-card)' }}>
        <colgroup>
          <col style={{ width: '160px' }} />
          <col />
        </colgroup>
        <tbody>
          {sessionAgents.map(sa => {
            const agent = agents.find(a => a.id === sa.agent_id);
            return (
              <AgentRow
                key={sa.id}
                sa={sa}
                agent={agent}
                round={round}
                onGenerate={() => onGenerate(sa, round)}
                onUpdate={(text) => onUpdate(sa, round, text)}
                onReset={onReset ? () => onReset(sa, round) : null}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
