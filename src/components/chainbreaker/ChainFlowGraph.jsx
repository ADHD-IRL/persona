import { useState, Fragment } from 'react';
import { Scissors, AlertTriangle, X, Target, Eye } from 'lucide-react';
import { countermeasureText } from '@/lib/llm';

// ── Palettes ──────────────────────────────────────────────────────────────────
// Two lenses share one rail: LEVERAGE answers "where do I cut?"; VECTOR answers
// "which discipline drives this step?" (the cross-domain story).

const LEVERAGE = {
  HIGH:   { color: '#C0392B', bg: 'rgba(192,57,43,0.12)',  border: 'rgba(192,57,43,0.5)',  glow: 'rgba(192,57,43,0.28)' },
  MEDIUM: { color: '#D68910', bg: 'rgba(214,137,16,0.12)', border: 'rgba(214,137,16,0.5)', glow: 'rgba(214,137,16,0.28)' },
  LOW:    { color: '#2E86AB', bg: 'rgba(46,134,171,0.12)', border: 'rgba(46,134,171,0.5)', glow: 'rgba(46,134,171,0.28)' },
};

const VECTOR = {
  Human:     { color: '#9B59B6', bg: 'rgba(155,89,182,0.12)', border: 'rgba(155,89,182,0.5)', glow: 'rgba(155,89,182,0.28)', label: 'HUMAN' },
  Technical: { color: '#2E86AB', bg: 'rgba(46,134,171,0.12)', border: 'rgba(46,134,171,0.5)', glow: 'rgba(46,134,171,0.28)', label: 'TECHNICAL' },
  Physical:  { color: '#C0392B', bg: 'rgba(192,57,43,0.12)',  border: 'rgba(192,57,43,0.5)',  glow: 'rgba(192,57,43,0.28)',  label: 'PHYSICAL' },
  Futures:   { color: '#16A085', bg: 'rgba(22,160,133,0.12)', border: 'rgba(22,160,133,0.5)', glow: 'rgba(22,160,133,0.28)', label: 'FUTURES' },
};

const DIFFICULTY_COLOR = { EASY: '#27AE60', MODERATE: '#D68910', HARD: '#C0392B' };
const EFFORT_COLOR = { LOW: '#27AE60', MEDIUM: '#D68910', HIGH: '#C0392B' };
const TYPE_COLOR = { PREVENTIVE: '#2E86AB', DETECTIVE: '#9B59B6', RESPONSIVE: '#D68910' };

// Normalize a free-text step.vector into one of the four canonical vectors.
function vectorKey(step) {
  const v = (step?.vector || '').toString().trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith('hum')) return 'Human';
  if (v.startsWith('tech') || v.startsWith('cyber') || v.startsWith('soft')) return 'Technical';
  if (v.startsWith('phys') || v.startsWith('hard')) return 'Physical';
  if (v.startsWith('fut') || v.startsWith('strat')) return 'Futures';
  return null;
}

// Palette for a node under the active lens, or null → neutral styling.
function accentFor(lens, step, analysis) {
  if (lens === 'domain') {
    const vk = vectorKey(step);
    return vk ? VECTOR[vk] : null;
  }
  return LEVERAGE[analysis?.leverage] || null;
}

function CMBadge({ label, color }) {
  if (!label) return null;
  return (
    <span style={{
      fontSize: 8.5, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
      padding: '0px 4px', borderRadius: 2, whiteSpace: 'nowrap',
      backgroundColor: `${color}1f`, color, border: `1px solid ${color}55`,
    }}>
      {label}
    </span>
  );
}

// ── Arrow between nodes ───────────────────────────────────────────────────────

function FlowArrow({ accentOfNext, isCut }) {
  const color = isCut ? '#C0392B' : (accentOfNext ? accentOfNext.color + '66' : 'rgba(240,165,0,0.25)');
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44 }}
      title={isCut ? 'Chain broken here — downstream steps cannot proceed' : undefined}>
      {isCut ? (
        <Scissors style={{ width: 16, height: 16, color: '#C0392B' }} />
      ) : (
        <svg width="44" height="20" viewBox="0 0 44 20" fill="none">
          <line x1="0" y1="10" x2="34" y2="10" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
          <polygon points="34,5 44,10 34,15" fill={color} />
        </svg>
      )}
    </div>
  );
}

// ── Individual flow node ──────────────────────────────────────────────────────

const NODE_W = 166;

function FlowNode({ step, lens, accent, analysis, priorityRank, isSelected, isDownstreamOfCut, onClick }) {
  const isPri  = lens === 'leverage' && priorityRank !== null && priorityRank !== undefined;
  const isTop2 = isPri && priorityRank <= 2;
  const vk     = lens === 'domain' ? vectorKey(step) : null;

  const borderColor = isSelected
    ? (accent?.color || 'var(--wr-amber)')
    : (accent?.border || 'var(--wr-border)');

  const boxShadow = isSelected
    ? `0 0 0 2px ${accent?.color || 'var(--wr-amber)'}, 0 0 18px ${accent?.glow || 'rgba(240,165,0,0.2)'}`
    : isTop2 && accent
    ? `0 0 14px ${accent.glow}`
    : 'none';

  return (
    <div style={{ position: 'relative', flexShrink: 0, opacity: isDownstreamOfCut ? 0.3 : 1, transition: 'opacity 0.15s ease' }}>
      {/* Priority rank badge (leverage lens) */}
      {isPri && (
        <div style={{
          position: 'absolute', top: -11, right: -11,
          width: 22, height: 22, borderRadius: '50%',
          backgroundColor: accent?.color || '#F0A500',
          color: '#fff', fontSize: 10, fontWeight: 700,
          fontFamily: 'JetBrains Mono, monospace',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, boxShadow: `0 2px 8px ${accent?.glow || 'rgba(240,165,0,0.35)'}`,
        }}>
          {priorityRank}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={e => e.key === 'Enter' && onClick()}
        style={{
          width: NODE_W, minHeight: 96, borderRadius: 8,
          border: `${isSelected ? 2 : 1.5}px solid ${borderColor}`,
          backgroundColor: accent ? accent.bg : 'rgba(255,255,255,0.02)',
          cursor: 'pointer', padding: '10px 12px',
          transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
          boxShadow, userSelect: 'none',
        }}
      >
        {/* Step number + lens tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              backgroundColor: accent?.color || 'rgba(240,165,0,0.15)',
              border: `1.5px solid ${accent?.color || 'var(--wr-amber)'}`,
              color: '#fff', fontSize: 10, fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {step.step_number}
            </div>
            {lens === 'leverage' && analysis?.leverage && (
              <span style={{ fontSize: 9, fontWeight: 700, color: accent?.color, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em' }}>
                {analysis.leverage}
              </span>
            )}
            {lens === 'domain' && vk && (
              <span style={{ fontSize: 9, fontWeight: 700, color: accent?.color, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em' }}>
                {VECTOR[vk].label}
              </span>
            )}
          </div>
          {lens === 'leverage' && analysis?.is_chokepoint && (
            <Target style={{ width: 11, height: 11, color: '#C0392B', flexShrink: 0 }} />
          )}
        </div>

        {step.agent_label && (
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--wr-amber)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {step.agent_label}
          </p>
        )}

        <p style={{
          fontSize: 10, color: 'var(--wr-text-muted)', lineHeight: 1.45,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {step.step_text}
        </p>

        {lens === 'leverage' && isPri && analysis?.leverage === 'HIGH' && (
          <div style={{
            marginTop: 7, paddingTop: 6, borderTop: `1px solid ${accent?.border}`,
            fontSize: 9, fontWeight: 700, color: accent?.color,
            fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.07em',
          }}>
            ✂ BREAK POINT
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function StepDetailPanel({ step, lens, accent, analysis, priorityRank, cascade, onClose }) {
  const vk = lens === 'domain' ? vectorKey(step) : null;

  return (
    <div style={{ borderTop: `2px solid ${accent?.color || 'var(--wr-border)'}`, padding: '16px 20px 18px', backgroundColor: accent ? accent.bg : 'transparent' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: accent?.color || 'var(--wr-amber)' }}>
              STEP {step.step_number}
            </span>
            {vk && (
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, padding: '1px 7px', borderRadius: 3, backgroundColor: accent?.bg, color: accent?.color, border: `1px solid ${accent?.border}` }}>
                {VECTOR[vk].label}
              </span>
            )}
            {lens === 'leverage' && priorityRank != null && (
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: accent?.color }}>· PRIORITY #{priorityRank}</span>
            )}
            {lens === 'leverage' && analysis?.leverage && (
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, padding: '1px 7px', borderRadius: 3, backgroundColor: accent?.bg, color: accent?.color, border: `1px solid ${accent?.border}` }}>
                {analysis.leverage} LEVERAGE
              </span>
            )}
            {analysis?.difficulty && (
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', padding: '1px 7px', borderRadius: 3, backgroundColor: 'var(--wr-bg-secondary)', color: DIFFICULTY_COLOR[analysis.difficulty] || 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }}>
                {analysis.difficulty}
              </span>
            )}
            {analysis?.is_chokepoint && (
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 3, backgroundColor: 'rgba(192,57,43,0.15)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.4)' }} title="No realistic adversary path around this step — cutting it collapses the chain">
                <Target style={{ width: 10, height: 10 }} /> CHOKEPOINT
              </span>
            )}
            {analysis?.detectability && (
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 3, backgroundColor: 'var(--wr-bg-secondary)', color: 'var(--wr-text-muted)', border: '1px solid var(--wr-border)' }} title="How visible this step is with typical instrumentation">
                <Eye style={{ width: 10, height: 10 }} /> {analysis.detectability}
              </span>
            )}
          </div>
          {step.agent_label && (
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--wr-amber)', lineHeight: 1.3 }}>{step.agent_label}</p>
          )}
        </div>
        <button data-ui="icon" onClick={onClose} style={{ color: 'var(--wr-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }} aria-label="Close detail">
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Adversary action — always shown */}
      {step.step_text && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--wr-text-muted)', marginBottom: 5, letterSpacing: '0.06em' }}>
            ADVERSARY ACTION
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--wr-text-secondary)' }}>{step.step_text}</p>
        </div>
      )}

      {/* Break-here cascade — the "prevents downstream" story */}
      <div style={{
        borderRadius: 6, padding: '10px 12px', marginBottom: analysis ? 12 : 0,
        backgroundColor: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.25)',
      }}>
        <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#C0392B', marginBottom: 5, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Scissors style={{ width: 11, height: 11 }} /> BREAK CHAIN HERE
        </p>
        <p style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--wr-text-secondary)' }}>{cascade}</p>
      </div>

      {/* Chain Breaker enrichment */}
      {analysis && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0 10px' }}>
            <div style={{ borderRadius: 6, padding: '10px 12px', backgroundColor: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.2)' }}>
              <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#C0392B', marginBottom: 6, letterSpacing: '0.06em' }}>ADVERSARY OBJECTIVE</p>
              <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--wr-text-secondary)' }}>{analysis.adversary_objective}</p>
            </div>
            <div style={{ borderRadius: 6, padding: '10px 12px', backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
              <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--wr-text-muted)', marginBottom: 6, letterSpacing: '0.06em' }}>STEP DEPENDENCIES</p>
              <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--wr-text-secondary)' }}>{analysis.dependencies}</p>
            </div>
          </div>

          {analysis.countermeasures?.length > 0 && (
            <div style={{ borderRadius: 6, padding: '10px 12px', marginBottom: 10, backgroundColor: accent?.bg || 'var(--wr-bg-secondary)', border: `1px solid ${accent?.border || 'var(--wr-border)'}` }}>
              <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: accent?.color || 'var(--wr-text-secondary)', marginBottom: 8, letterSpacing: '0.06em' }}>DEFENSIVE COUNTERMEASURES</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {analysis.countermeasures.map((cm, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: accent?.color || 'var(--wr-text-muted)', flexShrink: 0, marginTop: 2, width: 14 }}>{i + 1}.</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--wr-text-secondary)' }}>{countermeasureText(cm)}</p>
                      {(cm.type || cm.effort || cm.time_to_deploy) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                          <CMBadge label={cm.type} color={TYPE_COLOR[cm.type] || 'var(--wr-text-muted)'} />
                          {cm.effort && <CMBadge label={`${cm.effort} EFFORT`} color={EFFORT_COLOR[cm.effort] || 'var(--wr-text-muted)'} />}
                          {cm.time_to_deploy && <CMBadge label={cm.time_to_deploy} color="#546E7A" />}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.residual_risk && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <AlertTriangle style={{ width: 12, height: 12, color: '#D68910', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 11, color: 'var(--wr-text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: '#D68910' }}>Residual risk: </strong>{analysis.residual_risk}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ChainFlowGraph({ chain, analysisMap = {}, rankMap = {}, defaultLens = 'leverage', showLensToggle = true }) {
  const [selectedStep, setSelectedStep] = useState(null);
  const [lens, setLens] = useState(defaultLens);
  const steps = chain?.steps || [];

  if (steps.length === 0) return null;

  const hasAnalysis = Object.keys(analysisMap).length > 0;
  const toggleStep = (num) => setSelectedStep(prev => prev === num ? null : num);

  const selIdx = selectedStep != null ? steps.findIndex(s => s.step_number === selectedStep) : -1;
  const selectedStepData = selIdx >= 0 ? steps[selIdx] : null;
  const selectedAnalysis = selectedStep != null ? (analysisMap[selectedStep] || null) : null;
  const selectedRank     = selectedStep != null ? (rankMap[selectedStep] ?? null) : null;

  // "Break here" cascade — an attacker must complete every step, so cutting
  // step i prevents every later step.
  const cascadeText = (() => {
    if (selIdx < 0) return '';
    const downstream = steps.slice(selIdx + 1);
    if (!downstream.length) return 'Terminal step — if the adversary reaches here the objective is achieved. Break an earlier step.';
    const list = downstream.map(s => `Step ${s.step_number}`).join(', ');
    const choke = selectedAnalysis?.is_chokepoint ? 'This is a chokepoint — the adversary has no alternate path, so cutting it collapses the whole chain. ' : '';
    return `${choke}Because every step depends on the one before it, breaking Step ${selectedStepData.step_number} stops the adversary from reaching ${list}.`;
  })();

  // Which lenses are usable: domain lens only makes sense if any step has a vector.
  const anyVector = steps.some(s => vectorKey(s));
  const showToggle = showLensToggle && (hasAnalysis || anyVector);
  const activeLens = lens === 'domain' && !anyVector ? 'leverage' : lens;

  // Legend entries for the active lens.
  const legend = activeLens === 'domain'
    ? [...new Set(steps.map(vectorKey).filter(Boolean))].map(k => [VECTOR[k].label, VECTOR[k].color])
    : [['HIGH', '#C0392B'], ['MEDIUM', '#D68910'], ['LOW', '#2E86AB']];

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-card)' }}>
      {/* Legend + lens toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '9px 16px', borderBottom: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--wr-text-muted)', letterSpacing: '0.08em' }}>
            ATTACK CHAIN
          </span>
          {showToggle && (
            <div style={{ display: 'flex', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--wr-border)' }}>
              {[['leverage', 'Leverage'], ['domain', 'Vector']].map(([val, label]) => {
                const on = activeLens === val;
                const disabled = val === 'domain' && !anyVector;
                return (
                  <button data-ui="action" key={val} onClick={() => !disabled && setLens(val)} disabled={disabled}
                    style={{
                      fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.04em',
                      padding: '3px 8px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                      backgroundColor: on ? 'var(--wr-amber)' : 'transparent',
                      color: on ? '#0D1B2A' : (disabled ? 'var(--wr-border-strong)' : 'var(--wr-text-secondary)'),
                    }}
                    title={disabled ? 'No vector data on these steps' : `Color nodes by ${label.toLowerCase()}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          {legend.map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--wr-text-muted)' }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 10, color: 'var(--wr-text-muted)', fontStyle: 'italic' }}>click node → break analysis</span>
        </div>
      </div>

      {/* Rail */}
      <div style={{ overflowX: 'auto', padding: '24px 24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: steps.length * NODE_W + (steps.length - 1) * 44 + 2 }}>
          {steps.map((step, i) => (
            <Fragment key={step.step_number}>
              <FlowNode
                step={step}
                lens={activeLens}
                accent={accentFor(activeLens, step, analysisMap[step.step_number])}
                analysis={analysisMap[step.step_number] || null}
                priorityRank={rankMap[step.step_number] ?? null}
                isSelected={selectedStep === step.step_number}
                isDownstreamOfCut={selIdx >= 0 && i > selIdx}
                onClick={() => toggleStep(step.step_number)}
              />
              {i < steps.length - 1 && (
                <FlowArrow
                  accentOfNext={accentFor(activeLens, steps[i + 1], analysisMap[steps[i + 1].step_number])}
                  isCut={selIdx >= 0 && i === selIdx}
                />
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedStepData && (
        <StepDetailPanel
          step={selectedStepData}
          lens={activeLens}
          accent={accentFor(activeLens, selectedStepData, selectedAnalysis)}
          analysis={selectedAnalysis}
          priorityRank={selectedRank}
          cascade={cascadeText}
          onClose={() => setSelectedStep(null)}
        />
      )}
    </div>
  );
}
