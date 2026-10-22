import MarkdownContent from '@/components/ui/MarkdownContent';
import { Hand } from 'lucide-react';
import AgentAvatar from './AgentAvatar';
import Waveform from './Waveform';

// The stage — a glanceable band above the transcript that keeps the whole panel
// on screen and puts the spotlight on whoever currently has the floor. The
// speaker is enlarged with active rings; everyone else dims. A live caption
// mirrors what the speaker is saying, and a raised hand marks who is ready to
// jump in. Click any expert to address them directly.
export default function PanelStage({
  agents = [],
  colors = {},
  agentStatus = {},
  currentSpeakerId = null,
  speakerText = '',
  urges = {},
  addressedId = null,
  speakThreshold = 12,
  onAddress,
  closed = false,      // session complete — the stage is a record
  debateDone = false,  // the debate reached its end
}) {
  const color = id => colors[id] || '#F0A500';
  const speaker = agents.find(a => a.id === currentSpeakerId) || null;
  const someoneSpeaking = Boolean(speaker);

  // 'deliberating' (System 2 private reasoning) reads as 'thinking' on the stage.
  const isThinking = id => agentStatus[id] === 'thinking' || agentStatus[id] === 'deliberating';
  function avatarStatus(id) {
    if (id === currentSpeakerId) return isThinking(id) ? 'thinking' : 'speaking';
    if (isThinking(id)) return 'thinking';
    if (agentStatus[id] === 'speaking') return 'speaking';
    return 'idle';
  }

  // Nobody waits for a floor that is not being handed out.
  const over = closed || debateDone;

  // Who's ready to jump in when the floor is open (highest urge over the bar).
  const waiting = (someoneSpeaking || over) ? [] :
    agents.filter(a => (urges[a.id] ?? 0) >= speakThreshold)
      .sort((a, b) => (urges[b.id] ?? 0) - (urges[a.id] ?? 0));
  const topWaiting = waiting[0];

  const speakerColor = someoneSpeaking ? color(currentSpeakerId) : over ? '#8A9BB5' : '#27AE60';

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-card)', borderBottom: '1px solid var(--wr-border)', flexShrink: 0 }}>
      {/* Status strip */}
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--wr-border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: speakerColor, display: 'inline-block', flexShrink: 0 }} />
          <span className="text-[10.5px] font-mono font-bold tracking-widest truncate" style={{ color: speakerColor }}>
            {speaker
              ? `${speaker.name.toUpperCase()} ${agentStatus[currentSpeakerId] === 'deliberating' ? 'IS DELIBERATING' : agentStatus[currentSpeakerId] === 'thinking' ? 'IS THINKING' : 'HAS THE FLOOR'}`
              : closed ? 'THE SESSION IS CLOSED'
              : debateDone ? 'THE DEBATE IS FINISHED'
              : 'THE ROOM IS OPEN'}
          </span>
        </div>
        <span className="text-[10.5px] font-mono flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }}>
          {agents.length} in the room
        </span>
      </div>

      {/* Avatar row */}
      <div className="flex items-end justify-center gap-4 px-4 pt-4 pb-2 flex-wrap">
        {agents.map(a => {
          const st = avatarStatus(a.id);
          const isSpeaker = a.id === currentSpeakerId;
          const wantsFloor = !someoneSpeaking && !over && (urges[a.id] ?? 0) >= speakThreshold;
          const dim = someoneSpeaking && !isSpeaker;
          return (
            <div key={a.id} style={{
              position: 'relative',
              opacity: dim ? 0.4 : 1,
              transform: isSpeaker ? 'scale(1.08)' : 'scale(1)',
              transition: 'opacity 0.25s, transform 0.25s',
            }}>
              {wantsFloor && (
                <div title="Ready to jump in" style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', zIndex: 3 }}>
                  <Hand className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} />
                </div>
              )}
              <AgentAvatar
                agent={a}
                color={color(a.id)}
                size={isSpeaker ? 60 : 48}
                status={st}
                active={addressedId === a.id}
                showLabel
                onClick={!over && onAddress ? () => onAddress(a.id) : undefined}
              />
            </div>
          );
        })}
        {agents.length === 0 && (
          <p className="text-xs py-4" style={{ color: 'var(--wr-text-muted)' }}>No experts on this session.</p>
        )}
      </div>

      {/* Live caption / open-room hint */}
      {speaker ? (
        <div className="flex items-center gap-2.5 mx-4 mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: `1px solid ${speakerColor}55` }}>
          <Waveform color={speakerColor} barCount={22} height={16} isActive />
          <div className="flex-1 min-w-0" aria-label="Live SME response">
            <p className="text-xs font-semibold mb-1" style={{color:speakerColor}}>{speaker.name} · live response</p>
            {speakerText ? <div className="max-h-64 overflow-y-auto"><MarkdownContent>{speakerText}</MarkdownContent></div> : <span className="text-xs italic" style={{color:'var(--wr-text-muted)'}}>Waiting for the first response words…</span>}
          </div>
        </div>
      ) : (
        agents.length > 0 && (
          <p className="text-center text-[11px] pb-3 px-4" style={{ color: 'var(--wr-text-muted)' }}>
            {closed
              ? <>This session is closed. Nobody is waiting for the floor — the transcript and the reports are the record.</>
              : debateDone
                ? <>The debate is finished, so no hands are up. Review the analyst resolution and the saved debate record.</>
                : topWaiting
                  ? <>{topWaiting.name.split(' ')[0]} looks ready to jump in — select them (or another SME), then invite a contribution.</>
                  : <>Select an SME to address next, or run the remaining phase.</>}
          </p>
        )
      )}
    </div>
  );
}
