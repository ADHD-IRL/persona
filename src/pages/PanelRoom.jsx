import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import {
  ArrowLeft, Send, Loader2, Play, Pause, StepForward, Users, Hand, Bot, X, Cpu,
  Ear, MessageSquare, ClipboardPaste, FileText,
} from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import { generatePanelTurn } from '@/lib/llm';
import { buildDecisionFraming } from '@/lib/decisionContext';
import { rankPanel, pickNextSpeaker, SPEAK_THRESHOLD, INTERJECT_THRESHOLD } from '@/lib/floorControl';
import { saveTurnSources } from '@/lib/sources';

const AGENT_COLORS = ['#F0A500', '#2E86AB', '#27AE60', '#C0392B', '#9B59B6', '#16A085', '#E67E22', '#8E44AD'];
const AUTO_TURNS = 6; // turns per auto-run burst

// ── Message bubbles ───────────────────────────────────────────────────────────

function SmeBubble({ msg, color }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
        style={{ backgroundColor: `${color}22`, color, border: `1.5px solid ${color}66` }}>
        {(msg.agentName || '?').slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-xs font-bold" style={{ color }}>{msg.agentName}</span>
          {msg.discipline && <span className="text-[11px]" style={{ color: 'var(--wr-text-muted)' }}>{msg.discipline}</span>}
          <span data-ui="badge" className="text-[9px] font-mono px-1 py-0.5 rounded inline-flex items-center gap-0.5"
            style={{ backgroundColor: 'rgba(155,89,182,0.14)', color: '#9B59B6', border: '1px solid rgba(155,89,182,0.3)' }}
            title="Simulated subject-matter expert — AI generated, not a real person">
            <Cpu className="w-2 h-2" /> AI SME
          </span>
          {msg.floorReason && (
            <span className="text-[10px] italic" style={{ color: 'var(--wr-text-muted)' }}>spoke up: {msg.floorReason}</span>
          )}
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--wr-text-secondary)' }}>
          {msg.content}{msg.isStreaming && <span className="opacity-50">▌</span>}
        </p>
      </div>
    </div>
  );
}

function HumanBubble({ msg }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(240,165,0,0.15)', border: '1.5px solid rgba(240,165,0,0.5)' }}>
        <Users className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-bold" style={{ color: 'var(--wr-amber)' }}>
          {msg.authorName || 'You'}
          {msg.authorRole && <span className="ml-1.5 font-normal" style={{ color: 'var(--wr-text-muted)' }}>{msg.authorRole}</span>}
        </span>
        <p className="text-sm leading-relaxed mt-0.5 whitespace-pre-wrap break-words" style={{ color: 'var(--wr-text-primary)' }}>{msg.content}</p>
      </div>
    </div>
  );
}

function SystemLine({ text }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--wr-border)' }} />
      <span className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--wr-text-muted)' }}>{text}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--wr-border)' }} />
    </div>
  );
}

// ── Roster ────────────────────────────────────────────────────────────────────

function RosterRow({ agent, color, status, urge, onAddress }) {
  const wantsFloor = urge != null && urge >= SPEAK_THRESHOLD && status === 'idle';
  return (
    <button data-ui="card" onClick={onAddress}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5">
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
        style={{ backgroundColor: `${color}22`, color, border: `1.5px solid ${color}66` }}>
        {(agent.name || '?').slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</p>
        <p className="text-[10px] truncate" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline || '—'}</p>
      </div>
      {status === 'thinking' && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" style={{ color }} />}
      {status === 'speaking' && <span className="text-[9px] font-mono flex-shrink-0" style={{ color }}>SPEAKING</span>}
      {wantsFloor && <Hand className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--wr-amber)' }} title="Has something to add" />}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PanelRoom() {
  const { id } = useParams();
  const { db } = useWorkspace();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [decisionFraming, setDecisionFraming] = useState('');
  const [sessionAgents, setSessionAgents] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [colors, setColors] = useState({});
  const [messages, setMessages] = useState([]);
  const [agentStatus, setAgentStatus] = useState({});

  const [input, setInput] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [turnsLeft, setTurnsLeft] = useState(0);
  const [addressedId, setAddressedId] = useState(null);
  const [me, setMe] = useState({ name: 'Analyst', role: '' });

  // Ambient event controls
  const [listenMode, setListenMode] = useState(false);   // panel tracks silently
  const [allowInterject, setAllowInterject] = useState(false);
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [catchUpText, setCatchUpText] = useState('');
  const [ending, setEnding] = useState(false);
  const silentSince = useRef(false); // panel has been listening without speaking

  const transcriptRef = useRef(null);
  const streamBuf = useRef({});
  const stopRef = useRef(false);
  const lastSpeakers = useRef([]);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!db || !id) return;
    (async () => {
      const [sess, saList, msgs] = await Promise.all([
        db.Session.get(id),
        db.SessionAgent.filter({ session_id: id }),
        db.SessionMessage.filter({ session_id: id }),
      ]);
      setSession(sess);
      setSessionAgents(saList);

      const p = {}, c = {}, st = {};
      for (let i = 0; i < saList.length; i++) {
        const agent = await db.Agent.get(saList[i].agent_id);
        if (agent) {
          p[agent.id] = agent;
          c[agent.id] = agent.color || AGENT_COLORS[i % AGENT_COLORS.length];
          st[agent.id] = 'idle';
        }
      }
      setProfiles(p); setColors(c); setAgentStatus(st);

      if (sess?.scenario_id) setScenario(await db.Scenario.get(sess.scenario_id));

      if (sess?.decision_id && sess?.decision_option_id && db.Decision) {
        try {
          const [d, o, a] = await Promise.all([
            db.Decision.get(sess.decision_id),
            db.DecisionOption.get(sess.decision_option_id),
            db.DecisionAssumption.filter({ decision_id: sess.decision_id }).catch(() => []),
          ]);
          setDecisionFraming(buildDecisionFraming(d, o, a));
        } catch { /* optional */ }
      }

      setMessages((msgs || []).map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        agentId: m.agent_id,
        agentName: m.metadata?.agentName,
        discipline: m.metadata?.discipline,
        authorName: m.author_name || m.metadata?.authorName,
        authorRole: m.metadata?.authorRole,
        floorReason: m.metadata?.floorReason,
      })));
    })();
  }, [db, id]);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages]);

  const push = useCallback(msg => {
    setMessages(prev => [...prev, { id: `${Date.now()}_${Math.random()}`, ...msg }]);
  }, []);

  const scenarioCtx = decisionFraming + (session?.context_override ? `${session.context_override}\n\n` : '') + (scenario?.context_document || '');

  // The live topic = what was said most recently (that's what the panel reacts to).
  const currentTopic = (() => {
    const recent = messages.filter(m => m.role !== 'system').slice(-3);
    return recent.map(m => m.content).join(' ').slice(-1200) || scenario?.name || session?.name || '';
  })();

  const agentList = sessionAgents.map(sa => profiles[sa.agent_id]).filter(Boolean);

  // Live urge ranking → drives the "hand raised" indicator in the roster.
  const urges = (() => {
    if (!agentList.length) return {};
    const ranked = rankPanel({ agents: agentList, topic: currentTopic, lastSpeakerIds: lastSpeakers.current });
    return Object.fromEntries(ranked.map(r => [r.agent.id, r.score]));
  })();

  // ── One panel turn ──────────────────────────────────────────────────────────
  const runTurn = useCallback(async (opts = {}) => {
    const { forcedAgentId = null, topicOverride = null, threshold = SPEAK_THRESHOLD, quiet = false } = opts;
    if (speaking) return false;

    const list = sessionAgents.map(sa => profiles[sa.agent_id]).filter(Boolean);
    if (!list.length) return false;

    const topic = topicOverride ?? currentTopic;
    const pick = pickNextSpeaker({
      agents: list,
      topic,
      lastSpeakerIds: lastSpeakers.current,
      addressedId: forcedAgentId,
      threshold,
    });

    if (!pick) {
      // `quiet` = a background check during listen mode; silence is the expected
      // outcome there, so don't clutter the transcript with a notice.
      if (!quiet) push({ role: 'system', content: 'The panel has nothing further to add — put a question to them.' });
      return false;
    }

    const agent = pick.agent;
    setSpeaking(true);
    setAgentStatus(s => ({ ...s, [agent.id]: 'thinking' }));

    const roster = [
      ...list.filter(a => a.id !== agent.id).map(a => ({ name: a.name, discipline: a.discipline })),
      ...(me.name ? [{ name: me.name, discipline: me.role, isHuman: true }] : []),
    ];

    const transcript = messages.filter(m => m.role !== 'system').slice(-10).map(m => ({
      speaker: m.role === 'agent' ? `${m.agentName} (${m.discipline || 'SME'})` : (m.authorName || 'Analyst'),
      content: m.content,
    }));

    const tempId = `t_${agent.id}_${Date.now()}`;
    streamBuf.current[tempId] = '';
    push({
      id: tempId, role: 'agent', agentId: agent.id, agentName: agent.name,
      discipline: agent.discipline, content: '', isStreaming: true,
      floorReason: forcedAgentId ? null : pick.reason,
    });

    try {
      await generatePanelTurn({
        agent,
        roster,
        transcript,
        scenarioContext: scenarioCtx,
        floorReason: pick.reason,
        shouldDefer: pick.defer,
        deferTo: pick.deferTo || [],
        wasListening: silentSince.current,
        onToken: (_token, full) => {
          setAgentStatus(s => ({ ...s, [agent.id]: 'speaking' }));
          streamBuf.current[tempId] = full;
          const text = streamBuf.current[tempId];
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: text } : m));
        },
        onDone: async text => {
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: text, isStreaming: false } : m));
          setAgentStatus(s => ({ ...s, [agent.id]: 'idle' }));
          delete streamBuf.current[tempId];
          try {
            const saved = await db.SessionMessage.create({
              session_id: id, agent_id: agent.id, role: 'agent', content: text,
              author_type: 'sme', author_name: agent.name,
              metadata: { agentName: agent.name, discipline: agent.discipline, floorReason: pick.reason },
            });
            await saveTurnSources(db, id, saved?.id || tempId, agent.id, text);
          } catch { /* transcript still shown */ }
        },
      });
      lastSpeakers.current = [agent.id, ...lastSpeakers.current].slice(0, 4);
      silentSince.current = false;
      return true;
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setAgentStatus(s => ({ ...s, [agent.id]: 'idle' }));
      push({ role: 'system', content: `${agent.name} could not respond: ${e.message}` });
      return false;
    } finally {
      setSpeaking(false);
    }
  }, [speaking, sessionAgents, profiles, currentTopic, messages, me, scenarioCtx, db, id, push]);

  // ── Auto-run loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoRunning || speaking || turnsLeft <= 0) return;
    let cancelled = false;
    (async () => {
      if (stopRef.current || cancelled) return;
      const ok = await runTurn();
      if (cancelled) return;
      setTurnsLeft(n => {
        const next = ok ? n - 1 : 0;
        if (next <= 0) setAutoRunning(false);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [autoRunning, speaking, turnsLeft, runTurn]);

  const startAuto = () => { stopRef.current = false; setTurnsLeft(AUTO_TURNS); setAutoRunning(true); };
  const pauseAuto = () => { stopRef.current = true; setAutoRunning(false); setTurnsLeft(0); };

  // ── Capture what the room says ──────────────────────────────────────────────
  // In listen mode this is note-taking: the panel absorbs it and stays quiet.
  // Otherwise it's a turn in the conversation and the panel responds.
  const capture = async (text, { forceReply = false } = {}) => {
    const body = (text || '').trim();
    if (!body) return;
    const authorName = me.name || 'You';
    push({ role: 'user', content: body, authorName, authorRole: me.role });
    try {
      await db.SessionMessage.create({
        session_id: id, role: 'user', content: body,
        author_type: 'human', author_name: authorName,
        metadata: { authorName, authorRole: me.role || null },
      });
    } catch { /* transcript still shown */ }

    const target = addressedId;
    setAddressedId(null);

    if (listenMode && !forceReply && !target) {
      silentSince.current = true;
      // Only a very high urge is worth breaking silence for, and only if enabled.
      if (allowInterject) {
        setTimeout(() => runTurn({ topicOverride: body, threshold: INTERJECT_THRESHOLD, quiet: true }), 60);
      }
      return;
    }
    setTimeout(() => runTurn({ forcedAgentId: target, topicOverride: body }), 60);
  };

  const send = async () => {
    if (!input.trim() || speaking) return;
    const text = input;
    setInput('');
    await capture(text);
  };

  // "Thoughts?" — break the silence deliberately and let the most relevant
  // expert speak to everything they have been tracking.
  const askForThoughts = () => {
    if (speaking) return;
    silentSince.current = true;
    runTurn();
  };

  const submitCatchUp = async () => {
    const block = catchUpText.trim();
    if (!block) return;
    setCatchUpText('');
    setShowCatchUp(false);
    await capture(block, { forceReply: !listenMode });
  };

  // End the event and turn the transcript into the usual artifacts.
  const endAndAnalyze = async () => {
    setEnding(true);
    try { await db.Session.update(id, { status: 'complete' }); } catch { /* non-fatal */ }
    navigate(`/sessions/${id}?autoSynth=1`);
  };

  if (!session) return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 flex-shrink-0" style={{ backgroundColor: 'var(--wr-bg-card)', borderBottom: '1px solid var(--wr-border)' }}>
        <button data-ui="action" onClick={() => navigate(`/session-tracker?session=${id}`)} className="flex items-center gap-1.5 text-xs hover:opacity-70" style={{ color: 'var(--wr-text-muted)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Session Tracker
        </button>
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate" style={{ color: 'var(--wr-text-primary)' }}>{session.name}</h1>
          <p className="text-[11px]" style={{ color: 'var(--wr-text-muted)' }}>
            Expert panel · {agentList.length} SME{agentList.length !== 1 ? 's' : ''} convened
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Listen mode — the panel sits in and tracks without speaking */}
          <button data-ui="action"
            onClick={() => { setListenMode(v => !v); if (!listenMode) { pauseAuto(); silentSince.current = true; } }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: listenMode ? 'rgba(155,89,182,0.15)' : 'transparent',
              color: listenMode ? '#9B59B6' : 'var(--wr-text-secondary)',
              border: `1px solid ${listenMode ? 'rgba(155,89,182,0.45)' : 'var(--wr-border)'}`,
            }}
            title="Panel listens and tracks the discussion without speaking until you ask"
          >
            <Ear className="w-3.5 h-3.5" /> {listenMode ? 'Listening' : 'Listen mode'}
          </button>

          {listenMode ? (
            <WrButton size="sm" onClick={askForThoughts} disabled={speaking || !agentList.length}>
              <MessageSquare className="w-3.5 h-3.5" /> Thoughts?
            </WrButton>
          ) : autoRunning ? (
            <WrButton size="sm" variant="secondary" onClick={pauseAuto} style={{ borderColor: '#C0392B', color: '#C0392B' }}>
              <Pause className="w-3.5 h-3.5" /> Pause ({turnsLeft})
            </WrButton>
          ) : (
            <WrButton size="sm" onClick={startAuto} disabled={speaking || !agentList.length}>
              <Play className="w-3.5 h-3.5" /> Let them talk
            </WrButton>
          )}

          <WrButton size="sm" variant="secondary" onClick={() => runTurn()} disabled={speaking || autoRunning || !agentList.length}>
            <StepForward className="w-3.5 h-3.5" /> Next speaker
          </WrButton>

          <WrButton size="sm" variant="outline" onClick={endAndAnalyze} disabled={ending || !messages.length}>
            {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} End &amp; Analyze
          </WrButton>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Transcript */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={transcriptRef} className="flex-1 overflow-y-auto px-6 py-5">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <Users className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--wr-text-muted)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--wr-text-muted)' }}>The panel is convened and listening.</p>
                <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>
                  Open with a question or brief them — or hit “Let them talk” and they’ll start working the problem.
                </p>
              </div>
            )}
            {messages.map(m =>
              m.role === 'system' ? <SystemLine key={m.id} text={m.content} />
              : m.role === 'agent' ? <SmeBubble key={m.id} msg={m} color={colors[m.agentId] || '#F0A500'} />
              : <HumanBubble key={m.id} msg={m} />
            )}
          </div>

          {/* Composer */}
          <div className="px-6 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-card)' }}>
            {addressedId && profiles[addressedId] && (
              <div className="flex items-center gap-1.5 mb-2">
                <span data-ui="badge" className="text-[10px] font-mono px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ backgroundColor: 'rgba(240,165,0,0.12)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.3)' }}>
                  to {profiles[addressedId].name}
                  <button aria-label="Close" data-ui="icon" onClick={() => setAddressedId(null)}><X className="w-2.5 h-2.5" /></button>
                </span>
              </div>
            )}
            {showCatchUp ? (
              <div className="space-y-2">
                <textarea
                  value={catchUpText}
                  onChange={e => setCatchUpText(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder="Paste what's been discussed — meeting transcript, whiteboard notes, chat log. The panel reads the whole block and reacts to the thread that matters."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
                />
                <div className="flex gap-2">
                  <WrButton size="sm" onClick={submitCatchUp} disabled={!catchUpText.trim()}>
                    <ClipboardPaste className="w-3.5 h-3.5" /> Bring the panel up to speed
                  </WrButton>
                  <WrButton size="sm" variant="secondary" onClick={() => { setShowCatchUp(false); setCatchUpText(''); }}>Cancel</WrButton>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                  placeholder={
                    addressedId ? `Ask ${profiles[addressedId]?.name}…`
                    : listenMode ? 'Capture what the room is saying…'
                    : 'Speak to the panel…'
                  }
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
                />
                <WrButton variant="secondary" onClick={() => setShowCatchUp(true)} title="Paste a block of discussion">
                  <ClipboardPaste className="w-4 h-4" />
                </WrButton>
                <WrButton onClick={send} disabled={!input.trim() || speaking}>
                  {speaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </WrButton>
              </div>
            )}

            {listenMode && (
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-[10px] font-mono flex items-center gap-1" style={{ color: '#9B59B6' }}>
                  <Ear className="w-2.5 h-2.5" /> PANEL IS LISTENING — notes are captured, nobody speaks until you ask
                </span>
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: 'var(--wr-text-muted)' }}>
                  <input type="checkbox" checked={allowInterject} onChange={e => setAllowInterject(e.target.checked)} className="accent-purple-500" />
                  let an expert break in if it's urgent
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Roster */}
        <div className="w-64 flex-shrink-0 overflow-y-auto" style={{ borderLeft: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-card)' }}>
          <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--wr-border)' }}>
            <p className="text-[10px] font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>IN THE ROOM</p>
          </div>

          <div className="py-1">
            <p className="px-3 py-1 text-[9px] font-mono tracking-wider flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}>
              <Bot className="w-2.5 h-2.5" /> AI EXPERT PANEL
            </p>
            {agentList.map(a => (
              <RosterRow key={a.id} agent={a} color={colors[a.id] || '#F0A500'}
                status={agentStatus[a.id] || 'idle'} urge={urges[a.id]}
                onAddress={() => setAddressedId(prev => prev === a.id ? null : a.id)} />
            ))}
            {!agentList.length && (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--wr-text-muted)' }}>No SMEs on this session.</p>
            )}
          </div>

          <div className="py-1" style={{ borderTop: '1px solid var(--wr-border)' }}>
            <p className="px-3 py-1 text-[9px] font-mono tracking-wider flex items-center gap-1" style={{ color: 'var(--wr-text-muted)' }}>
              <Users className="w-2.5 h-2.5" /> YOUR ANALYST CONTEXT
            </p>
            <div className="px-3 py-1.5 space-y-1.5">
              <input value={me.name} onChange={e => setMe(v => ({ ...v, name: e.target.value }))} aria-label="Transcript name" placeholder="Transcript name"
                className="w-full px-2 py-1 rounded text-xs outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
              <input value={me.role} onChange={e => setMe(v => ({ ...v, role: e.target.value }))} aria-label="Analytical focus" placeholder="Analytical focus (optional)"
                className="w-full px-2 py-1 rounded text-xs outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
            </div>
          </div>

          <div className="px-3 py-3 mt-1" style={{ borderTop: '1px solid var(--wr-border)' }}>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--wr-text-muted)' }}>
              <Cpu className="w-2.5 h-2.5 inline mr-1" style={{ color: '#9B59B6' }} />
              Panel SMEs are <strong style={{ color: 'var(--wr-text-secondary)' }}>AI-simulated experts</strong>, not real
              people. They speak when a topic is in their lane and defer when it isn’t. Treat their output as analysis to
              test, not as a credentialed professional opinion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

