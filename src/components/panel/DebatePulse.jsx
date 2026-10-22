import WrButton from '@/components/ui/WrButton';
import { useRef, useState, useEffect } from 'react';
import { Activity, Table2, BarChart3, HelpCircle } from 'lucide-react';
import { facilitationCue, PHASE_META, ACTION_LABEL } from '@/lib/panel/debateCue';

// DebatePulse — the live "is this debate still earning its keep?" strip.
// Bars are each turn's raw value g, painted in the SPEAKER's roster color so
// attribution is visible at a glance (who is driving vs. recycling); the line
// is the smoothed ḡ (the hero); the dashed rule is the stop bar ε. Diamonds
// mark straw polls, flags mark run endings, top ticks mark stance switches,
// baseline ticks mark facilitator messages, and red pips mark quiet turns
// that counted toward the dry streak. A faint background band between a poll
// and its staleness shows the room's split (green = near agreement, red =
// deeply split) — so falling momentum reads as converging vs. deadlocking.
// Renders from the stop tracker's history (src/lib/debateStop.js).
//
// Color duties: bar hues are the app's entity colors (roster/stage use the
// same ones — color follows the expert, checked with the dataviz validator:
// CVD + normal-vision separation pass; the tooltip's speaker name and the
// table view are the relief for the dim/contrast caveats). Line #BD8609 and
// poll diamonds #1E8FC4 are the strip's own validated pair. Band colors are
// status (agreement state), never reused as identity, and carry a text
// legend in the caption plus the tooltip's split wording.
const LINE = '#BD8609';
const POLL = '#1E8FC4';
const QUIET = '#C0392B';
const BAND = { agree: '#27AE60', split: '#D68910', deep: '#C0392B' };
const bandColor = (d) => d < 0.25 ? BAND.agree : d < 0.6 ? BAND.split : BAND.deep;

// Endings in two lengths: a short flag that fits inside the strip, and the
// full phrase for the tooltip.
const STOP_FLAG = { consensus: 'agreement', impasse: 'deadlock', exhaustion: 'ran dry', silence: 'silence', budget: 'turn limit' };
const STOP_LABEL = {
  consensus: 'agreement reached',
  impasse: 'deadlock — split but settled',
  exhaustion: 'ran dry (repeating themselves)',
  silence: 'nobody had more to add',
  budget: 'turn limit reached',
};

// Plain-language bands: the word carries the meaning, the number is backup.
const noveltyWord = (n) => n >= 0.6 ? 'breaking new ground' : n >= 0.35 ? 'building on the thread' : 'mostly restating';
const engagementWord = (e) => e >= 0.6 ? 'arguing with the room' : e >= 0.3 ? 'acknowledging others' : 'talking past everyone';
const substanceWord = (s) => s >= 0.6 ? 'concrete — figures or sources' : s >= 0.3 ? 'some specifics' : 'vague, nothing to hold';
// The three always-available components, so a falling line can be diagnosed.
const WEAKEST_LABEL = { novelty: 'covering old ground', engagement: 'not engaging each other', substance: 'short on specifics' };
const mindsWord = (m) => m >= 0.3 ? 'minds moving' : m >= 0.15 ? 'some shifting' : 'positions settled';
const splitWord = (d) => d < 0.25 ? 'near agreement' : d < 0.6 ? 'split' : 'deeply split';

// One legend row: a real glyph (a miniature of the mark itself) + its meaning.
function LegendRow({ glyph, title, text }) {
  return (
    <div className="flex items-start gap-2">
      <svg width="20" height="14" style={{ flexShrink: 0, marginTop: 1 }}>{glyph}</svg>
      <p className="text-[11px] leading-snug" style={{ color: 'var(--wr-text-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{title}</span> — {text}
      </p>
    </div>
  );
}

// "How to read this" — the organized legend. Three groups: the picture (line,
// bars, wind-down rule — including what the trend line MEANS), the markers,
// and the speakers. Collapsible so the strip stays lean once learned; the
// open/closed choice is remembered per browser.
function PulseLegend({ speakers }) {
  return (
    <div className="rounded-lg px-3 py-2.5 mt-1.5 space-y-2"
      style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>

      <p className="text-[9px] font-mono font-bold tracking-widest" style={{ color: 'var(--wr-text-muted)' }}>THE PICTURE</p>
      <LegendRow title="The line is momentum — the debate’s energy"
        text="a running average of how much each turn adds. Rising = the discussion is building; falling = it is running out of new things to say."
        glyph={<path d="M1,11 L6,5 L11,8 L19,3" fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />} />
      <LegendRow title="Bars are single turns"
        text="height = how much that one turn added; color = who spoke."
        glyph={<>
          <rect x="1" y="5" width="4.5" height="9" rx="1" fill="#F0A500" opacity="0.7" />
          <rect x="7.5" y="1" width="4.5" height="13" rx="1" fill="#2E86AB" opacity="0.7" />
          <rect x="14" y="7" width="4.5" height="7" rx="1" fill="#27AE60" opacity="0.7" />
        </>} />
      <LegendRow title="The dashed line is the wind-down point"
        text="low scores across three consecutive turns can pause an automated cross-examination or live burst. Opening, evidence and closing phases still hear the panel. You decide when to advance."
        glyph={<line x1="1" x2="19" y1="7" y2="7" stroke="var(--wr-border-strong)" strokeWidth="1.5" strokeDasharray="3 3" />} />

      <p className="text-[9px] font-mono font-bold tracking-widest pt-1" style={{ color: 'var(--wr-text-muted)' }}>MARKERS</p>
      <LegendRow title="Straw poll"
        text="a snapshot of where every expert stands was taken here."
        glyph={<path transform="translate(10,7)" d="M0,-4.5 L4.5,0 L0,4.5 L-4.5,0 Z" fill={POLL} />} />
      <LegendRow title="Room’s split (background shading)"
        text="after a poll: green = the experts agree, amber = divided, red = deeply split. These are model poll positions, not verified agreement or evidence quality."
        glyph={<>
          <rect x="1" y="1" width="6" height="13" fill={BAND.agree} opacity="0.4" />
          <rect x="7" y="1" width="6" height="13" fill={BAND.split} opacity="0.4" />
          <rect x="13" y="1" width="6" height="13" fill={BAND.deep} opacity="0.4" />
        </>} />
      <LegendRow title="Quiet turn"
        text="a turn with low heuristic momentum. Three consecutive low turns can pause a cross-examination or live burst."
        glyph={<circle cx="10" cy="7" r="2.5" fill={QUIET} />} />
      <LegendRow title="Steering"
        text="a stance switch (labeled, top) or a facilitator message (bottom) happened here."
        glyph={<>
          <line x1="6" x2="6" y1="1" y2="7" stroke="var(--wr-amber)" strokeWidth="2" />
          <line x1="14" x2="14" y1="8" y2="14" stroke="var(--wr-amber)" strokeWidth="2" />
        </>} />

      {speakers.length > 0 && (
        <>
          <p className="text-[9px] font-mono font-bold tracking-widest pt-1" style={{ color: 'var(--wr-text-muted)' }}>SPEAKERS</p>
          <div className="flex items-center gap-3 flex-wrap">
            {speakers.map(s => (
              <span key={s.id} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--wr-text-secondary)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: s.color, opacity: 0.85, display: 'inline-block' }} />
                {s.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// The facilitation cue bar — the pulse's headline is ADVICE, not a readout:
// a traffic-light phase chip, one plain sentence, and the single control the
// situation calls for (rendered only when the caller supplied its handler).
function CueBar({ cue, actions = {} }) {
  if (!cue) return null;
  const meta = PHASE_META[cue.phase];
  const handler = cue.action ? actions[cue.action] : null;
  return (
    <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ color: meta.color, backgroundColor: `${meta.color}20`, border: `1px solid ${meta.color}55` }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: meta.color, display: 'inline-block' }} />
        {cue.word}
      </span>
      <span className="text-[12px] min-w-0" style={{ color: 'var(--wr-text-primary)' }}>{cue.text}</span>
      {handler && (
        <WrButton variant="secondary" size="sm" onClick={handler}>{ACTION_LABEL[cue.action]}</WrButton>
      )}
    </div>
  );
}

export default function DebatePulse({ history = [], events = [], colors = {}, epsilon = 0.25, pollWindow = 4, height = 56, showHeader = true, tableToggle = false, showCue = false, cueActions = {}, closed = false, debateDone = false }) {
  const scrollRef = useRef(null);
  const [hover, setHover] = useState(null); // index into history
  const [asTable, setAsTable] = useState(false);

  // "How to read this" panel — open by default for first-time users; the
  // choice is remembered per browser so the strip stays lean once learned.
  const [showLegend, setShowLegend] = useState(() => {
    try { return localStorage.getItem('agd_pulse_legend') === 'open'; } catch { return true; }
  });
  const toggleLegend = () => setShowLegend(v => {
    const next = !v;
    try { localStorage.setItem('agd_pulse_legend', next ? 'open' : 'closed'); } catch { /* ignore */ }
    return next;
  });

  // Keep the newest turns in view as the strip grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [history.length]);

  const last = history[history.length - 1];
  const cue = showCue ? facilitationCue({ history, events, epsilon, pollWindow, closed, debateDone }) : null;
  const over = closed || debateDone;

  // Geometry. Fixed step per turn; the container scrolls horizontally.
  const STEP = 16, BAR_W = 7, PAD_L = 6, PAD_R = 30, PAD_T = 8, PAD_B = 4;
  const plotH = height - PAD_T - PAD_B;
  const width = PAD_L + Math.max(history.length, 1) * STEP + PAD_R;
  const x = (i) => PAD_L + i * STEP + STEP / 2;
  const y = (v) => PAD_T + (1 - Math.max(0, Math.min(1, v))) * plotH;

  const linePath = history.map((h, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(h.gbar)}`).join(' ');
  const eventsAt = (turnIdx) => events.filter(e => e.turn === turnIdx + 1);
  const stops = events.filter(e => e.type === 'stop');
  const polls = events.filter(e => e.type === 'poll');
  const stances = events.filter(e => e.type === 'stance');
  const humans = events.filter(e => e.type === 'human');
  // Numbers face the user as percentages ("42% momentum"), never raw decimals.
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const barFill = (h) => (h.speakerId && colors[h.speakerId]) || LINE;
  // A turn's gap boundary (markers for events that happened AFTER turn e.turn).
  const gapX = (turn) => PAD_L + turn * STEP;

  // Split bands: each poll shades the strip until it goes stale or the next
  // poll lands — the context that says whether falling momentum is the room
  // converging (green) or deadlocking (red).
  const bands = polls
    .filter(e => e.disagreement != null)
    .map((e, k, arr) => {
      const from = e.turn;                                    // fresh starting with turn e.turn+1
      const nextPoll = arr[k + 1]?.turn ?? Infinity;
      const to = Math.min(from + pollWindow, nextPoll, history.length);
      return to > from ? { x1: gapX(from), x2: gapX(to), color: bandColor(e.disagreement) } : null;
    })
    .filter(Boolean);

  // Legend for the report-drawer variant (the live strip sits beside the
  // roster, which already shows these colors + names).
  const speakers = [];
  if (tableToggle) {
    const seen = new Set();
    for (const h of history) {
      if (!h.speakerId || seen.has(h.speakerId)) continue;
      seen.add(h.speakerId);
      speakers.push({ id: h.speakerId, name: (h.speaker || '?').split(' ')[0], color: barFill(h) });
    }
  }

  return (
    <div>
      {showHeader && (
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[10px] font-mono font-bold tracking-widest inline-flex items-center gap-1.5" style={{ color: 'var(--wr-text-muted)' }}>
            <Activity className="w-3 h-3" style={{ color: 'var(--wr-amber)' }} /> DEBATE PULSE
          </span>
          {last && (
            <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              {over
                ? `finished at ${pct(last.gbar)} heuristic momentum · wind-down line was ${pct(epsilon)}`
                : `heuristic momentum ${pct(last.gbar)} · review threshold ${pct(epsilon)}`}
              {!over && last.gbar != null && last.gbar < epsilon + 0.12 && last.weakest
                ? ` · weakest: ${WEAKEST_LABEL[last.weakest] || last.weakest}`
                : ''}
            </span>
          )}
          {history.length > 0 && (
            <WrButton variant="secondary" size="sm" onClick={toggleLegend} aria-pressed={showLegend} title="Explain the line, bars, and markers"><HelpCircle className="w-3 h-3" /> How to read
            </WrButton>
          )}
          {tableToggle && history.length > 0 && (
            <WrButton variant="secondary" size="sm" onClick={() => setAsTable(t => !t)} title={asTable ? 'Show the chart' : 'Show the numbers as a table'}>{asTable ? <BarChart3 className="w-3 h-3" /> : <Table2 className="w-3 h-3" />} {asTable ? 'Chart' : 'Table'}
            </WrButton>
          )}
        </div>
      )}

      {/* The facilitation cue — the pulse's headline is advice, with the
          recommended control one click away. */}
      {cue && <CueBar cue={cue} actions={cueActions} />}

      {history.length === 0 ? (
        <p className="text-[11px] py-2" style={{ color: 'var(--wr-text-muted)' }}>
          The pulse appears once the experts start speaking — each turn is scored for what it adds.
        </p>
      ) : asTable ? (
        <div className="overflow-x-auto">
          <table className="text-[11px] font-mono w-full" style={{ color: 'var(--wr-text-secondary)' }}>
            <thead>
              <tr style={{ color: 'var(--wr-text-muted)' }}>
                {['turn', 'speaker', 'turn added', 'momentum', 'new ground', 'engagement', 'substance', 'minds', 'room'].map(h => (
                  <th key={h} className="text-left pr-4 pb-1 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.turn} style={{ borderTop: '1px solid var(--wr-border)' }}>
                  <td className="pr-4 py-0.5">{h.turn}</td>
                  <td className="pr-4 truncate" style={{ maxWidth: 110 }}>{h.speaker ? h.speaker.split(' ')[0] : '—'}</td>
                  <td className="pr-4">{pct(h.g)}</td>
                  <td className="pr-4" style={{ color: 'var(--wr-text-primary)' }}>{pct(h.gbar)}</td>
                  <td className="pr-4">{h.novelty != null ? `${noveltyWord(h.novelty)} (${pct(h.novelty)})` : '—'}</td>
                  <td className="pr-4">{h.engagement != null ? pct(h.engagement) : '—'}</td>
                  <td className="pr-4">{h.substance != null ? pct(h.substance) : '—'}</td>
                  <td className="pr-4">{h.movement != null ? mindsWord(h.movement) : '—'}</td>
                  <td className="pr-4">{h.disagreement != null ? splitWord(h.disagreement) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={scrollRef} className="overflow-x-auto relative" style={{ scrollbarWidth: 'thin', paddingBottom: 10 }}>
          <svg width={width} height={height} style={{ display: 'block' }} role="img"
            aria-label={over
              ? `Debate pulse, finished: momentum ended at ${pct(last?.gbar)}; the wind-down line was ${pct(epsilon)}`
              : `Debate pulse: momentum at ${pct(last?.gbar)}; review threshold ${pct(epsilon)}`}>
            {/* Split bands — the room's poll-to-poll agreement state, faint, behind everything */}
            {bands.map((b, k) => (
              <rect key={`b${k}`} x={b.x1} y={PAD_T} width={b.x2 - b.x1} height={plotH}
                fill={b.color} opacity="0.10" />
            ))}

            {/* The wind-down line ε — the only gridline that matters */}
            <line x1={PAD_L} x2={width - 4} y1={y(epsilon)} y2={y(epsilon)}
              stroke="var(--wr-border-strong)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={width - 4} y={y(epsilon) - 3} textAnchor="end" fontSize="8" fontFamily="monospace" fill="var(--wr-text-muted)">
              winds down below this line
            </text>

            {/* Raw g per turn — bars in the SPEAKER's color (dimmed; the line stays hero) */}
            {history.map((h, i) => (
              <rect key={h.turn} x={x(i) - BAR_W / 2} y={y(h.g)} width={BAR_W} height={Math.max(1.5, y(0) - y(h.g))}
                rx="1.5" fill={barFill(h)} opacity={hover === i ? 0.85 : 0.45} />
            ))}

            {/* Quiet-turn pips — this turn counted toward the dry streak */}
            {history.map((h, i) => h.dry > 0 && (
              <circle key={`q${h.turn}`} cx={x(i)} cy={Math.max(PAD_T + 3, y(h.g) - 5)} r="2" fill={QUIET} />
            ))}

            {/* Stance switches — a top tick + label at the gap where the switch happened */}
            {stances.map((e, k) => (
              <g key={`st${k}`}>
                <line x1={gapX(e.turn)} x2={gapX(e.turn)} y1={PAD_T} y2={PAD_T + 7}
                  stroke="var(--wr-amber)" strokeWidth="1.5" />
                <text x={gapX(e.turn) + 3} y={PAD_T + 7} fontSize="7.5" fontFamily="monospace" fill="var(--wr-text-muted)">
                  → {e.stance}
                </text>
              </g>
            ))}

            {/* Facilitator messages — a small baseline tick where a human steered */}
            {humans.map((e, k) => (
              <line key={`hu${k}`} x1={gapX(e.turn)} x2={gapX(e.turn)} y1={height - PAD_B - 5} y2={height - PAD_B}
                stroke="var(--wr-amber)" strokeWidth="1.5" opacity="0.85" />
            ))}

            {/* Smoothed ḡ — the hero line */}
            {history.length > 1 && <path d={linePath} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />}
            {history.length === 1 && <circle cx={x(0)} cy={y(history[0].gbar)} r="2.5" fill={LINE} />}

            {/* Straw polls — diamonds pinned near the top of their column */}
            {polls.map((e, k) => (
              <path key={`p${k}`} transform={`translate(${gapX(e.turn)}, ${PAD_T + 2})`}
                d="M0,-4 L4,0 L0,4 L-4,0 Z" fill={POLL} />
            ))}

            {/* Run endings — a flag line with the reason */}
            {stops.map((e, k) => (
              <g key={`s${k}`}>
                <line x1={x(e.turn - 1) + STEP / 2} x2={x(e.turn - 1) + STEP / 2} y1={PAD_T} y2={height - PAD_B}
                  stroke="var(--wr-text-muted)" strokeWidth="1" strokeDasharray="2 2" />
                <text x={x(e.turn - 1) + STEP / 2 + 3} y={PAD_T + 7} fontSize="8" fontFamily="monospace" fill="var(--wr-text-muted)">
                  {STOP_FLAG[e.kind] || e.kind}
                </text>
              </g>
            ))}

            {/* Hover hit targets — one full-height column per turn */}
            {history.map((_, i) => (
              <rect key={`h${i}`} x={PAD_L + i * STEP} y={0} width={STEP} height={height} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            ))}
            {hover != null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={height - PAD_B} stroke="var(--wr-text-muted)" strokeWidth="1" opacity="0.5" />
            )}
          </svg>

          {/* Tooltip — the turn in plain language; numbers stay as backup */}
          {hover != null && history[hover] && (() => {
            const h = history[hover];
            const winding = h.gbar != null && h.gbar < epsilon;
            const pollLine = h.movement != null
              ? `${mindsWord(h.movement)} · ${h.disagreement != null ? splitWord(h.disagreement) : 'stance unclear'}`
              : 'no recent poll — take one to read the room';
            return (
              <div className="absolute z-10 px-2.5 py-2 rounded text-[10px] pointer-events-none leading-relaxed"
                style={{
                  left: Math.max(0, Math.min(x(hover) + 8, width - 230)), top: 0,
                  backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border-strong)',
                  color: 'var(--wr-text-secondary)', whiteSpace: 'nowrap',
                }}>
                <span className="font-mono font-bold" style={{ color: 'var(--wr-text-primary)' }}>
                  Turn {h.turn}{h.speaker ? ` · ${h.speaker}` : ''}
                </span>
                <br />{noveltyWord(h.novelty)} ({Math.round(h.novelty * 100)}% new)
                {h.engagement != null && <><br />{engagementWord(h.engagement)} ({pct(h.engagement)})</>}
                {h.substance != null && <><br />{substanceWord(h.substance)} ({pct(h.substance)})</>}
                <br />{pollLine}
                <br />
                <span style={{ color: winding || h.dry >= 2 ? '#C0392B' : 'var(--wr-text-secondary)' }}>
                  momentum {pct(h.gbar)} — {winding ? 'below the wind-down line' : 'above the wind-down line'}
                  {h.dry ? ` · ${h.dry} quiet turn${h.dry > 1 ? 's' : ''} (pause threshold: 3 consecutive low turns)` : ''}
                </span>
                {eventsAt(hover).map((e, k) => (
                  <span key={k} style={{ color: 'var(--wr-text-primary)' }}>
                    <br />
                    {e.type === 'poll' ? '◆ straw poll taken here'
                      : e.type === 'stop' ? `⚑ run ended here: ${STOP_LABEL[e.kind] || e.kind}`
                      : e.type === 'stance' ? `→ stance switched to ${e.stance} after this turn`
                      : e.type === 'human' ? '│ facilitator steered after this turn'
                      : null}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Glyph legend under the chart — miniatures of the real marks, plus
          speaker chips in the report variant (the live strip sits beside the
          roster, which already carries those colors and names). */}
      {!asTable && history.length > 0 && showLegend && <PulseLegend speakers={speakers} />}
    </div>
  );
}
