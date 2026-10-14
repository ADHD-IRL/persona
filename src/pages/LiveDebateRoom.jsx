import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { ArrowLeft, Zap, Play, Send, Loader2, Search, Globe, FlaskConical, ShieldAlert, ArrowRight, StopCircle, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  generateRound1Stream, generateRound2Stream,
  generateAgentReply, generateAgentReplyWithTools,
  parseMarkers,
} from '@/lib/llm';
import { saveTurnSources } from '@/lib/sources';
import { buildDecisionFraming } from '@/lib/decisionContext';
import SpeakerStage      from '@/components/debate/SpeakerStage';
import AddressChips      from '@/components/debate/AddressChips';
import AgentAvatar       from '@/components/debate/AgentAvatar';

// ─────────────────────────────────────────────────────────────────────────────

const AGENT_COLORS = [
  '#2E86AB', '#7B2D8B', '#27AE60', '#D68910', '#C0392B',
  '#1ABC9C', '#8E44AD', '#E67E22', '#16A085', '#2980B9',
];
const SEV_COLOR = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const TOOL_ICONS = { search_knowledge: Search, fetch_url: Globe };

// ── Sub-components ────────────────────────────────────────────────────────────

function Divider({ text }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--wr-border)' }} />
      <span className="text-xs font-bold font-mono tracking-widest px-3 py-1 rounded"
        style={{ color: 'var(--wr-text-muted)', backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
        {text}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--wr-border)' }} />
    </div>
  );
}

function ToolChip({ tc }) {
  const Icon = TOOL_ICONS[tc.name] || Search;
  const label = tc.name === 'search_knowledge'
    ? tc.input.query
    : (tc.input.url || '').replace(/^https?:\/\//, '').slice(0, 50);
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mr-1 mb-1"
      style={{ backgroundColor: 'rgba(26,188,156,0.12)', color: '#1ABC9C', border: '1px solid rgba(26,188,156,0.25)' }}>
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      {label}
    </span>
  );
}

function AgentBubble({ msg, agent, color, isStreaming }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <AgentAvatar agent={agent} color={color} size={28} status={isStreaming ? 'thinking' : 'idle'} />
        <span className="text-xs font-bold" style={{ color }}>{msg.agentName}</span>
        {msg.discipline && <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>· {msg.discipline}</span>}
        {msg.severity && (
          <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded ml-auto"
            style={{ backgroundColor: `${SEV_COLOR[msg.severity]}15`, color: SEV_COLOR[msg.severity] }}>
            {msg.severity}
          </span>
        )}
        {msg.confidence != null && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
            title="Agent's self-assessed confidence in this assessment"
            style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)' }}>
            {msg.confidence}%
          </span>
        )}
      </div>
      {msg.toolCalls?.length > 0 && (
        <div className="flex flex-wrap mb-1.5">
          {msg.toolCalls.map((tc, i) => <ToolChip key={i} tc={tc} />)}
        </div>
      )}
      <div className="rounded p-3 text-sm leading-relaxed whitespace-pre-wrap"
        style={{
          backgroundColor: `${color}08`,
          borderLeft: `3px solid ${color}`,
          border: `1px solid ${color}20`,
          color: 'var(--wr-text-secondary)',
        }}>
        {msg.content || (isStreaming ? '' : '—')}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 align-middle animate-pulse rounded-sm"
            style={{ backgroundColor: color }} />
        )}
      </div>
    </div>
  );
}

function UserBubble({ msg }) {
  return (
    <div className="mb-5 flex justify-end">
      <div style={{ maxWidth: '60%' }}>
        <div className="flex items-center justify-end gap-2 mb-1.5 flex-wrap">
{msg.targetAgentName && (
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.2)' }}>
              → {msg.targetAgentName}
            </span>
          )}
          <span className="text-xs font-bold font-mono" style={{ color: 'var(--wr-amber)' }}>FACILITATOR</span>
        </div>
        <div className="rounded p-3 text-sm leading-relaxed"
          style={{
            backgroundColor: 'rgba(240,165,0,0.07)',
            borderRight: '3px solid var(--wr-amber)',
            border: '1px solid rgba(240,165,0,0.2)',
            color: 'var(--wr-text-primary)',
          }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ── Roster row ────────────────────────────────────────────────────────────────

function RosterRow({ agent, color, status, onAddress }) {
  const sev = agent.severity_default;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--wr-border)' }}>
      <AgentAvatar agent={agent} color={color} size={28} status={status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--wr-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</p>
        <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--wr-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.discipline}</p>
      </div>
      {sev && (
        <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, padding: '1px 5px', borderRadius: 3, backgroundColor: `${SEV_COLOR[sev]}15`, color: SEV_COLOR[sev], flexShrink: 0 }}>
          {sev.slice(0, 4)}
        </span>
      )}
<Tooltip>
        <TooltipTrigger asChild>
          <button onClick={onAddress} style={{ width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--wr-text-muted)' }}>
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Direct your next message to this agent only</TooltipContent>
      </Tooltip>
    </div>
  );
}

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div>
        <p style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--wr-text-primary)' }}>{label}</p>
        {desc && <p style={{ fontSize: 10, color: 'var(--wr-text-muted)' }}>{desc}</p>}
      </div>
      <button
        role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        style={{
          width: 34, height: 18, borderRadius: 9, flexShrink: 0, border: 'none', cursor: 'pointer', position: 'relative',
          backgroundColor: checked ? 'var(--wr-amber)' : 'var(--wr-bg-hover)',
          transition: 'background-color 0.2s',
        }}
      >
        <div style={{
          width: 14, height: 14, borderRadius: '50%', position: 'absolute', top: 2,
          left: checked ? 18 : 2, backgroundColor: '#fff', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveDebateRoom() {
  const { id } = useParams();
  const { db } = useWorkspace();
  const navigate = useNavigate();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [session, setSession]             = useState(null);
  const [scenario, setScenario]           = useState(null);
  const [decisionFraming, setDecisionFraming] = useState('');
  const [sourcePins, setSourcePins]       = useState([]);
  const [sessionAgents, setSessionAgents] = useState([]);
  const [profiles, setProfiles]           = useState({});  // agent_id → agent row
  const [colors, setColors]               = useState({});  // agent_id → hex color
const [messages, setMessages]           = useState([]);
  const [agentStatus, setAgentStatus]     = useState({});
  const [agentSeverity, setAgentSeverity] = useState({});

  const [phase, setPhase]     = useState('idle');
  const [running, setRunning] = useState(false);

  const [question, setQuestion]         = useState('');
  const [targetAgentId, setTargetAgentId] = useState(null); // null = all
  const [asking, setAsking]             = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [threats, setThreats]           = useState([]);

const transcriptRef       = useRef(null);
  const streamBuf           = useRef({});
const streamControllerRef = useRef(null);
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
      setSourcePins(sess?.source_pins || []);
      setSessionAgents(saList);

      const p = {}, c = {}, statuses = {}, severities = {};
      for (let i = 0; i < saList.length; i++) {
        const sa    = saList[i];
        const agent = await db.Agent.get(sa.agent_id);
        if (agent) {
          p[sa.agent_id] = agent;
          c[sa.agent_id] = agent.color || AGENT_COLORS[i % AGENT_COLORS.length];
        }
        statuses[sa.agent_id]  = sa.round1_assessment ? 'done' : 'idle';
        if (sa.round2_revised_severity || sa.round1_severity)
          severities[sa.agent_id] = sa.round2_revised_severity || sa.round1_severity;
      }
      setProfiles(p);
      setColors(c);
      setAgentStatus(statuses);
      setAgentSeverity(severities);

      const hasR1 = saList.some(sa => sa.round1_assessment);
      const hasR2 = saList.some(sa => sa.round2_rebuttal);
      setPhase(hasR2 ? 'r2done' : hasR1 ? 'r1done' : 'idle');

      if (sess?.scenario_id) {
        setScenario(await db.Scenario.get(sess.scenario_id));
        const t = await db.Threat.filter({ scenario_id: sess.scenario_id });
        setThreats(t);
      }

      // Decision-Focus session: build the framing block injected into prompts
      if (sess?.decision_id && sess?.decision_option_id && db.Decision) {
        try {
          const [decision, option, assumptions] = await Promise.all([
            db.Decision.get(sess.decision_id),
            db.DecisionOption.get(sess.decision_option_id),
            db.DecisionAssumption.filter({ decision_id: sess.decision_id }).catch(() => []),
          ]);
          setDecisionFraming(buildDecisionFraming(decision, option, assumptions));
        } catch { setDecisionFraming(''); }
      }

      setMessages(msgs.map(m => ({
        id: m.id, role: m.role, content: m.content,
        agentId: m.agent_id, agentName: m.metadata?.agentName,
        discipline: m.metadata?.discipline, severity: m.metadata?.severity,
        confidence: m.metadata?.confidence, targetAgentName: m.metadata?.targetAgentName,
      })));
    })();
  }, [db, id]);

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const push = useCallback(msg =>
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }]), []);

  const appendToken = useCallback((tempId, token) => {
    streamBuf.current[tempId] = (streamBuf.current[tempId] || '') + token;
    const text = streamBuf.current[tempId];
    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: text } : m));
  }, []);

  const finishStream = useCallback((tempId, finalText, extra = {}) => {
    setMessages(prev => prev.map(m =>
      m.id === tempId ? { ...m, content: finalText, isStreaming: false, ...extra } : m
    ));
    delete streamBuf.current[tempId];
  }, []);

  // Interrupt: abort stream
  const cancelRef = useRef(false);

  const interrupt = useCallback(() => {
    streamControllerRef.current?.abort();
  }, []);

  const stopRound = useCallback(() => {
    cancelRef.current = true;
    interrupt();
  }, [interrupt]);


  const resetAgent = useCallback(async (sa, round) => {
    const updates = round === 1
      ? { round1_assessment: null, round1_severity: null, status: 'pending' }
      : { round2_rebuttal: null, round2_revised_severity: null, status: 'r1_done' };
    await db.SessionAgent.update(sa.id, updates);
    setSessionAgents(prev => prev.map(s => s.id === sa.id ? { ...s, ...updates } : s));
    setMessages(prev => prev.filter(m => !(m.agentId === sa.agent_id && m.round === round)));
    setAgentStatus(s => ({ ...s, [sa.agent_id]: round === 1 ? 'idle' : 'done' }));
  }, [db, id]);

  const resetAllAgents = useCallback(async (round) => {
    for (const sa of sessionAgents) {
      await resetAgent(sa, round);
    }
    setPhase(round === 1 ? 'idle' : 'r1done');
  }, [sessionAgents, resetAgent]);

const scenarioCtx = decisionFraming + (scenario?.context_document || session?.context_override || '');

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((e.key === 'h' || e.key === 'H') && !inInput) { e.preventDefault(); interrupt(); return; }
      if (e.key === 'Escape') { setTargetAgentId(null); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAsk(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); setTargetAgentId(null); return; }
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const sa = sessionAgents[parseInt(e.key) - 1];
        if (sa) { e.preventDefault(); setTargetAgentId(sa.agent_id); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [interrupt, sessionAgents, question, asking]);

  // ── Round 1 ─────────────────────────────────────────────────────────────────

  const startRound1 = async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true); setPhase('r1');
    const sysMsg = { role: 'system', content: 'ROUND 1 — INDEPENDENT ASSESSMENTS' };
    push(sysMsg);
    await db.SessionMessage.create({ session_id: id, ...sysMsg, round: 1, metadata: {} });

    for (const sa of sessionAgents) {
      if (cancelRef.current) { cancelRef.current = false; break; }
      const agent = profiles[sa.agent_id];
      if (!agent || sa.round1_assessment) continue;
      setAgentStatus(s => ({ ...s, [sa.agent_id]: 'thinking' }));
      const tempId = `r1_${sa.agent_id}`;
      streamBuf.current[tempId] = '';
      push({ id: tempId, role: 'agent', agentId: sa.agent_id, agentName: agent.name, discipline: agent.discipline, content: '', round: 1, isStreaming: true });
      try {
        await generateRound1Stream({
          agent, scenarioContext: scenarioCtx, phaseFocus: session?.phase_focus,
          threatCatalog: threats,
          onToken: token => { setAgentStatus(s => ({ ...s, [sa.agent_id]: 'streaming' })); appendToken(tempId, token); },
          onDone: async text => {
            const { assessment, severity, confidence, likelihood, impact, compound_chain_text } = parseMarkers(text, agent.severity_default || 'HIGH');
            finishStream(tempId, assessment, { severity, confidence });
            setAgentStatus(s => ({ ...s, [sa.agent_id]: 'done' }));
            setAgentSeverity(s => ({ ...s, [sa.agent_id]: severity }));
            // Update local state so Round 2 othersCtx sees the fresh assessment
            setSessionAgents(prev => prev.map(s => s.id === sa.id ? { ...s, round1_assessment: assessment, round1_severity: severity, round1_confidence: confidence, status: 'r1_done' } : s));
            await db.SessionAgent.update(sa.id, { round1_assessment: assessment, round1_severity: severity, round1_confidence: confidence, round1_likelihood: likelihood, round1_impact: impact, compound_chain_text: compound_chain_text || null, status: 'r1_done' });
            const savedMsg = await db.SessionMessage.create({ session_id: id, agent_id: sa.agent_id, role: 'agent', content: assessment, round: 1, metadata: { agentName: agent.name, discipline: agent.discipline, severity, confidence } });
            await saveTurnSources(db, id, savedMsg?.id || tempId, sa.agent_id, assessment);
          },
        });
      } catch (err) {
        setAgentStatus(s => ({ ...s, [sa.agent_id]: 'idle' }));
        setMessages(prev => prev.filter(m => m.id !== tempId));
        push({ role: 'system', content: `Error (${agent.name}): ${err.message}` });
      }
    }
    await db.Session.update(id, { status: 'round1' });
    setPhase('r1done'); setRunning(false);
    const done = { role: 'system', content: 'ROUND 1 COMPLETE — you can now ask questions or start Round 2' };
    push(done);
    await db.SessionMessage.create({ session_id: id, ...done, round: 1, metadata: {} });
  };

  // ── Round 2 ─────────────────────────────────────────────────────────────────

  const startRound2 = async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true); setPhase('r2');
    setAgentStatus(s => Object.fromEntries(Object.keys(s).map(k => [k, 'idle'])));
    const sysMsg = { role: 'system', content: 'ROUND 2 — CROSS-AGENT REBUTTALS' };
    push(sysMsg);
    await db.SessionMessage.create({ session_id: id, ...sysMsg, round: 2, metadata: {} });

    // Fetch fresh agents from DB — local sessionAgents state may be stale
    const freshAgents = await db.SessionAgent.filter({ session_id: id });
    setSessionAgents(freshAgents);
    const othersCtx = (currentId) => freshAgents
      .filter(sa => sa.agent_id !== currentId && sa.round1_assessment)
      .map(sa => {
        const p = profiles[sa.agent_id];
        const conf = sa.round1_confidence != null ? ` · confidence ${sa.round1_confidence}%` : '';
        return `=== ${p?.name} (${p?.discipline}) [${sa.round1_severity || '?'}${conf}] ===\n${sa.round1_assessment}`;
      })
      .join('\n\n---\n\n');

    for (const sa of freshAgents) {
      if (cancelRef.current) { cancelRef.current = false; break; }
      const agent = profiles[sa.agent_id];
      if (!agent || sa.round2_rebuttal) continue;
      setAgentStatus(s => ({ ...s, [sa.agent_id]: 'thinking' }));
      const tempId = `r2_${sa.agent_id}`;
      streamBuf.current[tempId] = '';
      push({ id: tempId, role: 'agent', agentId: sa.agent_id, agentName: agent.name, discipline: agent.discipline, content: '', round: 2, isStreaming: true });
      try {
        await generateRound2Stream({
          agent, scenarioContext: scenarioCtx, phaseFocus: session?.phase_focus,
          othersAssessments: othersCtx(sa.agent_id), threatCatalog: threats,
          onToken: token => { setAgentStatus(s => ({ ...s, [sa.agent_id]: 'streaming' })); appendToken(tempId, token); },
          onDone: async text => {
            const { assessment, severity, confidence, likelihood, impact, compound_chain_text } = parseMarkers(text, sa.round1_severity || 'HIGH');
            finishStream(tempId, assessment, { severity, confidence });
            setAgentStatus(s => ({ ...s, [sa.agent_id]: 'done' }));
            setAgentSeverity(s => ({ ...s, [sa.agent_id]: severity }));
            setSessionAgents(prev => prev.map(s => s.id === sa.id ? { ...s, round2_rebuttal: assessment, round2_revised_severity: severity, round2_confidence: confidence, status: 'complete' } : s));
            await db.SessionAgent.update(sa.id, { round2_rebuttal: assessment, round2_revised_severity: severity, round2_confidence: confidence, round2_likelihood: likelihood, round2_impact: impact, compound_chain_text: compound_chain_text || null, status: 'complete' });
            const savedMsg = await db.SessionMessage.create({ session_id: id, agent_id: sa.agent_id, role: 'agent', content: assessment, round: 2, metadata: { agentName: agent.name, discipline: agent.discipline, severity, confidence } });
            await saveTurnSources(db, id, savedMsg?.id || tempId, sa.agent_id, assessment);
          },
        });
      } catch (err) {
        setAgentStatus(s => ({ ...s, [sa.agent_id]: 'idle' }));
        setMessages(prev => prev.filter(m => m.id !== tempId));
        push({ role: 'system', content: `Error (${agent.name}): ${err.message}` });
      }
    }
    await db.Session.update(id, { status: 'round2' });
    setPhase('r2done'); setRunning(false);
    const done = { role: 'system', content: 'ROUND 2 COMPLETE — ready to synthesize' };
    push(done);
    await db.SessionMessage.create({ session_id: id, ...done, round: 2, metadata: {} });
  };

  // ── Facilitator question ─────────────────────────────────────────────────────

  const handleAsk = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    const q = question.trim();
    setQuestion('');

    const targetAgent = targetAgentId ? profiles[targetAgentId] : null;
    push({ role: 'user', content: q, targetAgentName: targetAgent?.name || null });
    await db.SessionMessage.create({ session_id: id, role: 'user', content: q, metadata: { targetAgentName: targetAgent?.name || null } });

    const targets    = targetAgentId ? sessionAgents.filter(sa => sa.agent_id === targetAgentId) : sessionAgents;
    const priorCtx   = messages.filter(m => m.role !== 'system').slice(-8)
      .map(m => ({ agentName: m.agentName || null, content: m.content }));

    for (const sa of targets) {
      const agent = profiles[sa.agent_id];
      if (!agent) continue;
      setAgentStatus(s => ({ ...s, [sa.agent_id]: 'thinking' }));
      const tempId = `q_${sa.agent_id}_${Date.now()}`;
      streamBuf.current[tempId] = '';
      push({ id: tempId, role: 'agent', agentId: sa.agent_id, agentName: agent.name, discipline: agent.discipline, content: '', isStreaming: true });
      try {
        if (toolsEnabled) {
          await generateAgentReplyWithTools({
            agent, question: q, priorMessages: priorCtx, scenarioContext: scenarioCtx, sourcePins,
            onToolCall: tc => {
              setAgentStatus(s => ({ ...s, [sa.agent_id]: 'researching' }));
              setMessages(prev => prev.map(m => m.id === tempId ? { ...m, toolCalls: [...(m.toolCalls || []), tc] } : m));
            },
            onDone: async (text, toolCalls) => {
              setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: text, isStreaming: false, toolCalls } : m));
              setAgentStatus(s => ({ ...s, [sa.agent_id]: phase.endsWith('done') ? 'done' : 'idle' }));
              const savedMsg = await db.SessionMessage.create({ session_id: id, agent_id: sa.agent_id, role: 'agent', content: text, metadata: { agentName: agent.name, discipline: agent.discipline, toolCalls } });
              await saveTurnSources(db, id, savedMsg?.id || tempId, sa.agent_id, text, toolCalls);
            },
          });
        } else {
          await generateAgentReply({
            agent, question: q, priorMessages: priorCtx, scenarioContext: scenarioCtx,
            onToken: token => { setAgentStatus(s => ({ ...s, [sa.agent_id]: 'streaming' })); appendToken(tempId, token); },
            onDone: async text => {
              finishStream(tempId, text);
              setAgentStatus(s => ({ ...s, [sa.agent_id]: phase.endsWith('done') ? 'done' : 'idle' }));
              const savedMsg = await db.SessionMessage.create({ session_id: id, agent_id: sa.agent_id, role: 'agent', content: text, metadata: { agentName: agent.name, discipline: agent.discipline } });
              await saveTurnSources(db, id, savedMsg?.id || tempId, sa.agent_id, text);
            },
          });
        }
      } catch {
        setAgentStatus(s => ({ ...s, [sa.agent_id]: 'idle' }));
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    }
    setAsking(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!session) return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  const canR1    = phase === 'idle'   && !running;
  const canR2    = phase === 'r1done' && !running;
  const canSynth = phase === 'r2done' && !running;

  const agentList = sessionAgents.map(sa => profiles[sa.agent_id]).filter(Boolean);
return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 flex-shrink-0"
        style={{ backgroundColor: 'var(--wr-bg-card)', borderBottom: '1px solid var(--wr-border)' }}>
        <button onClick={() => navigate(`/sessions/${id}`)}
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 flex-shrink-0"
          style={{ color: 'var(--wr-text-muted)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--wr-amber)' }} />
          <p className="text-sm font-bold font-mono truncate" style={{ color: 'var(--wr-text-primary)' }}>{session.name}</p>
          {scenario && <span className="text-xs truncate hidden sm:block" style={{ color: 'var(--wr-text-muted)' }}>· {scenario.name}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => setToolsEnabled(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-all"
                style={{ backgroundColor: toolsEnabled ? 'rgba(26,188,156,0.12)' : 'transparent', border: `1px solid ${toolsEnabled ? '#1ABC9C' : 'var(--wr-border)'}`, color: toolsEnabled ? '#1ABC9C' : 'var(--wr-text-muted)' }}>
                <FlaskConical className="w-3 h-3" /> TOOLS {toolsEnabled ? 'ON' : 'OFF'}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Allow agents to use web search and document fetch during the debate</TooltipContent>
          </Tooltip>
          {running ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={stopRound}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-all"
                  style={{ backgroundColor: 'rgba(192,57,43,0.12)', border: '1px solid #C0392B', color: '#C0392B' }}>
                  <StopCircle className="w-3 h-3" /> STOP
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Stop generation after the current agent finishes</TooltipContent>
            </Tooltip>
          ) : (
            <>
              {[
                { label: 'ROUND 1', can: canR1, action: startRound1, color: '#2E86AB', tip: 'Run independent Round 1 assessments for all agents' },
                { label: 'ROUND 2', can: canR2, action: startRound2, color: '#D68910', tip: 'Run Round 2 rebuttals — agents read each other\'s Round 1 first' },
              ].map(({ label, can, action, color, tip }) => (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <button onClick={action} disabled={!can}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ backgroundColor: can ? `${color}18` : 'transparent', border: `1px solid ${can ? color : 'var(--wr-border)'}`, color: can ? color : 'var(--wr-text-muted)' }}>
                      <Play className="w-3 h-3" /> {label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{tip}</TooltipContent>
                </Tooltip>
              ))}
              {phase === 'r1done' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => resetAllAgents(1)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-all"
                      style={{ backgroundColor: 'transparent', border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)' }}>
                      <RotateCcw className="w-3 h-3" /> RESET R1
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Clear all Round 1 assessments and return to pending</TooltipContent>
                </Tooltip>
              )}
              {phase === 'r2done' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => resetAllAgents(2)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-all"
                      style={{ backgroundColor: 'transparent', border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)' }}>
                      <RotateCcw className="w-3 h-3" /> RESET R2
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Clear all Round 2 rebuttals and return to r1done</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button disabled={!canSynth} onClick={() => navigate(`/sessions/${id}?autoSynth=1`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ backgroundColor: canSynth ? 'rgba(240,165,0,0.15)' : 'transparent', border: `1px solid ${canSynth ? 'var(--wr-amber)' : 'var(--wr-border)'}`, color: canSynth ? 'var(--wr-amber)' : 'var(--wr-text-muted)' }}>
                <Zap className="w-3 h-3" /> SYNTHESIZE
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Generate synthesis from Round 2 assessments in the session workspace</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Main column */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Speaker Stage */}
          {agentList.length > 0 && (
            <SpeakerStage
              agents={agentList}
              colors={colors}
              agentStatus={agentStatus}
targetAgentId={targetAgentId}
              phase={phase}
              running={running}
              onAgentClick={agentId => setTargetAgentId(prev => prev === agentId ? null : agentId)}
            />
          )}

          {/* Transcript */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-5"
            aria-live="polite" aria-label="Debate transcript">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Zap className="w-10 h-10 mb-4 opacity-20" style={{ color: 'var(--wr-amber)' }} />
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--wr-text-secondary)' }}>Debate room ready</p>
                <p className="text-xs max-w-xs" style={{ color: 'var(--wr-text-muted)' }}>
                  Click <strong>ROUND 1</strong> to begin. Agents will stream their assessments live.
                </p>
              </div>
            )}
            {messages.map(msg => {
              if (msg.role === 'system') return <Divider key={msg.id} text={msg.content} />;
              if (msg.role === 'user')   return <UserBubble key={msg.id} msg={msg} />;
              return (
                <AgentBubble key={msg.id} msg={msg}
                  agent={profiles[msg.agentId] || { name: msg.agentName || '?', discipline: msg.discipline }}
                  color={colors[msg.agentId] || '#546E7A'}
                  isStreaming={msg.isStreaming}
                />
              );
            })}
          </div>

          {/* Composer */}
          <div className="flex-shrink-0" style={{ backgroundColor: 'var(--wr-bg-card)', borderTop: '1px solid var(--wr-border)' }}>
            {/* Address chips */}
            <AddressChips
              agents={agentList}
              colors={colors}
              targetAgentId={targetAgentId}
              onSelect={setTargetAgentId}
            />

            {/* Input row */}
            <div className="flex items-end gap-3 px-4 py-3">
<textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAsk(); } }}
                placeholder={targetAgentId && profiles[targetAgentId]
                  ? `Ask ${profiles[targetAgentId].name.split(' ')[0]}…  (⌘↵ to send)`
                  : 'Chat to the room…  (⌘↵ to send · hold SPACE to speak)'}
                rows={1}
                className="flex-1 px-3 py-2 text-sm rounded outline-none resize-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)', minHeight: 36 }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => interrupt()}
                    className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
                    style={{ width: 34, height: 34, border: '1px solid var(--wr-border)', backgroundColor: 'transparent', color: 'var(--wr-text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                    ✋
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Interrupt current speaker and take the floor (H)</TooltipContent>
              </Tooltip>
              <button onClick={handleAsk} disabled={asking || !question.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                style={{ backgroundColor: 'var(--wr-amber)', color: '#0D1B2A' }}>
                {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Ask
              </button>
            </div>

            {/* Hint strip */}
            <div className="px-4 py-1.5 border-t flex items-center justify-between text-xs font-mono"
              style={{ borderColor: 'var(--wr-border)', color: 'var(--wr-text-muted)' }}>
              <div className="flex items-center gap-3">
                <span><kbd style={{ padding: '1px 4px', borderRadius: 3, backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>⌘1–6</kbd> address agent</span>
                <span><kbd style={{ padding: '1px 4px', borderRadius: 3, backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>H</kbd> interrupt</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right rail ───────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 overflow-y-auto"
          style={{ width: 260, backgroundColor: 'var(--wr-bg-secondary)', borderLeft: '1px solid var(--wr-border)' }}>

          {/* Roster */}
          <div style={{ borderBottom: '1px solid var(--wr-border)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--wr-border)' }}>
              <p className="text-xs font-bold font-mono tracking-widest" style={{ color: 'var(--wr-text-muted)' }}>
                ROSTER · {agentList.length}
              </p>
              <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                {running ? (phase === 'r1' ? 'R1 running' : 'R2 running') : phase.replace('done', ' done').replace('idle', 'idle')}
              </span>
            </div>
            {sessionAgents.map(sa => {
              const agent = profiles[sa.agent_id];
              if (!agent) return null;
              const s = agentStatus[sa.agent_id] || 'idle';
              const status = s === 'streaming' ? 'speaking' : (s === 'thinking' || s === 'researching') ? 'thinking' : 'idle';
              const hasR1 = !!sa.round1_assessment;
              const hasR2 = !!sa.round2_rebuttal;
              return (
                <div key={sa.agent_id}>
                  <RosterRow
                    agent={agent}
                    color={colors[sa.agent_id]}
                    status={status}
                    onAddress={() => setTargetAgentId(prev => prev === sa.agent_id ? null : sa.agent_id)}
                  />
                  {!running && (hasR1 || hasR2) && (
                    <div className="flex gap-1 px-3 pb-2">
                      {hasR1 && (
                        <button onClick={() => resetAgent(sa, 1)}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-mono"
                          style={{ backgroundColor: 'transparent', border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)' }}
                          title="Clear Round 1 assessment">
                          <RotateCcw className="w-2.5 h-2.5" /> R1
                        </button>
                      )}
                      {hasR2 && (
                        <button onClick={() => resetAgent(sa, 2)}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-mono"
                          style={{ backgroundColor: 'transparent', border: '1px solid var(--wr-border)', color: 'var(--wr-text-muted)' }}
                          title="Clear Round 2 assessment">
                          <RotateCcw className="w-2.5 h-2.5" /> R2
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sources */}
          {sourcePins.length > 0 && (
            <div className="p-4" style={{ borderBottom: '1px solid var(--wr-border)' }}>
              <p className="text-xs font-bold font-mono tracking-widest mb-2" style={{ color: 'var(--wr-text-muted)' }}>SOURCES ({sourcePins.length})</p>
              {sourcePins.map((pin, i) => (
                <div key={i} className="flex items-start gap-1.5 mb-1.5">
                  <Globe className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#1ABC9C' }} />
                  <div className="min-w-0">
                    {pin.label && <p className="text-xs font-medium truncate" style={{ color: 'var(--wr-text-secondary)' }}>{pin.label}</p>}
                    <a href={pin.url} target="_blank" rel="noreferrer" className="text-xs truncate block hover:underline" style={{ color: 'var(--wr-text-muted)' }}>
                      {pin.url.replace(/^https?:\/\//, '').slice(0, 28)}…
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Threats */}
          {threats.length > 0 && (
            <div className="p-4">
              <p className="text-xs font-bold font-mono tracking-widest mb-2" style={{ color: 'var(--wr-text-muted)' }}>THREATS ({threats.length})</p>
              {threats.map(t => (
                <div key={t.id} className="mb-2 rounded p-2" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--wr-text-primary)' }}>{t.name}</p>
                    <span className="text-xs font-bold font-mono flex-shrink-0" style={{ color: SEV_COLOR[t.severity] || 'var(--wr-text-muted)' }}>{t.severity?.[0]}</span>
                  </div>
                  <button
                    onClick={() => setQuestion(`Regarding the threat "${t.name}": ${t.description || ''} What are the implications for this scenario?`)}
                    className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80 mt-1"
                    style={{ color: 'var(--wr-amber)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <ShieldAlert className="w-2.5 h-2.5" /> Surface
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
