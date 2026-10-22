// Facilitation cue — turns the pulse's metrics into ADVICE. The chart answers
// "what happened"; this answers "what should the facilitator do next", as one
// plain sentence plus the single control it recommends. Pure function over
// the stop tracker's history/events (src/lib/debateStop.js): no LLM calls.
//
// Returns { phase, word, text, action } or null before the first turn.
//   phase:  'productive' | 'cooling' | 'wrapping' | 'closed'   (traffic-light chip)
//   word:   the chip's label
//   text:   the cue sentence
//   action: 'poll' | 'record' | 'dissent' | 'talk' | 'reports' | null — which control to
//           surface next to the cue (the caller supplies the handlers; a
//           missing handler simply renders no button).

import { STOP_DEFAULTS } from './debateStop.js';

export const PHASE_META = {
  productive: { word: 'Productive', color: '#27AE60' },
  cooling:    { word: 'Cooling',    color: '#D68910' },
  wrapping:   { word: 'Wrapping up', color: '#C0392B' },
  closed:     { word: 'Closed',      color: '#8A9BB5' },
};

export const ACTION_LABEL = {
  poll: 'Poll the room',
  record: 'Record decision',
  dissent: 'Surface dissent',
  talk: 'Invite a contribution',
  reports: 'Open reports',
};

export function facilitationCue({
  history = [], events = [],
  epsilon = STOP_DEFAULTS.epsilon,
  pollWindow = STOP_DEFAULTS.pollWindow,
  patience = STOP_DEFAULTS.patience,
  closed = false,        // the session is complete
  debateDone = false,    // the debate reached its end, session may still be open
} = {}) {
  const last = history[history.length - 1];
  if (!last) return null;
  const lastTurn = history.length;

  // The room's own state settles this before any scoring does. Inferring "it
  // is over" from a stop event only works when one was recorded at exactly the
  // final turn, which misses a debate that ended on its own and a session
  // closed by any route other than "End & summarize" — and the cue then went
  // on dispensing live advice about a debate nobody was having.
  if (closed || debateDone) {
    return {
      phase: 'closed', word: PHASE_META.closed.word,
      text: closed
        ? 'The session is closed. This pulse is the record of how the debate ran — there is nothing here to act on.'
        : 'The debate is finished and every question has its verdict in the debate record. The room stays open if you want to keep working.',
      action: 'reports',
    };
  }

  const boundary=events.at(-1);
  if(boundary?.type==='resume'&&boundary.turn===lastTurn)return {phase:'productive',word:'Ready',text:'The next turn will update the pulse. Earlier bars remain the record of the previous discussion.',action:null};

  // A run that ended right after the final observed turn is still "ended"
  // until a new turn arrives — the cue then names the ending's next move.
  const endedNow = [...events].reverse().find(e => e.type === 'stop' && e.turn === lastTurn);
  if (endedNow) {
    const byKind = {
      paused: { text: 'Paused by the analyst. Invite another contribution when ready, or advance the phase deliberately.', action: 'talk' },
      // The session or debate is over: the pulse is a record now, not advice.
      complete: { text: 'The session is closed — the transcript, the debate record, and every report are in the Reports center.', action: null },
      consensus: { text: 'The room reached agreement — capture it while it’s fresh.', action: 'record' },
      impasse:   { text: 'Deadlock — split but no longer moving. Record the disagreement as a finding.', action: 'record' },
      exhaustion:{ text: 'They ran dry — steer with a question, or resume and see if there’s more.', action: 'talk' },
      silence:   { text: 'Nobody owns the current topic — sharpen the question or call in a specialist.', action: null },
      budget:    { text: 'Turn limit reached — resume if the thread is live, or redirect.', action: 'talk' },
    };
    const k = byKind[endedNow.kind] || { text: 'The run ended — resume or steer.', action: 'talk' };
    // A finished session is not "wrapping up", it is done.
    if (endedNow.kind === 'complete') return { phase: 'closed', word: PHASE_META.closed.word, ...k };
    return { phase: 'wrapping', word: PHASE_META.wrapping.word, ...k };
  }

  // One quiet turn from the end — the most time-critical cue there is.
  if (last.dry >= patience - 1 && last.dry > 0) {
    return {
      phase: 'wrapping', word: PHASE_META.wrapping.word,
      text: 'Repeated low-value turns: add evidence or surface dissent. Cross-examination and live bursts may pause; you control phase changes.',
      action: 'dissent',
    };
  }

  // Read the room from the freshest poll, if one is still fresh.
  const polls = events.filter(e => e.type === 'poll' && e.disagreement != null);
  const latestPoll = polls[polls.length - 1];
  const freshPoll = latestPoll && lastTurn - latestPoll.turn <= pollWindow ? latestPoll : null;

  const falling = history.length >= 3 && last.gbar < history[history.length - 3].gbar - 0.05;
  const below = last.gbar != null && last.gbar < epsilon;
  const cooling = below || falling || (last.gbar != null && last.gbar < epsilon + 0.12);

  if (cooling && freshPoll) {
    if (freshPoll.disagreement < 0.25) {
      return {
        phase: below ? 'wrapping' : 'cooling', word: below ? PHASE_META.wrapping.word : PHASE_META.cooling.word,
        text: 'Polled model positions are aligned — review evidence and remaining disagreement before recording a conclusion.',
        action: 'record',
      };
    }
    if (freshPoll.disagreement >= 0.6) {
      return {
        phase: below ? 'wrapping' : 'cooling', word: below ? PHASE_META.wrapping.word : PHASE_META.cooling.word,
        text: 'Deadlock forming — split but slowing. Record the disagreement, or aim at the crux expert.',
        action: 'record',
      };
    }
  }

  if (cooling) {
    // Name the component that is dragging, so the cue is diagnostic rather
    // than just a verdict. Each weakness has a different remedy.
    const byWeakness = {
      novelty: {
        text: below
          ? 'They are circling the same ground — put a new question or a new fact in front of them.'
          : 'Coverage is thinning; the last turns revisited familiar ground. A sharper question would open new ground.',
        action: 'dissent',
      },
      engagement: {
        // Both wordings have to name a person-directed remedy: the fix for weak
        // engagement is always to make one expert answer another, never just
        // "add more pressure".
        text: below
          ? 'They are talking past each other rather than to each other — aim a question at one expert by name.'
          : 'Nobody is engaging anyone directly — put a question to one expert by name, or surface dissent so they argue with each other rather than take turns.',
        action: 'dissent',
      },
      substance: {
        text: below
          ? 'Lots of talk, little that is concrete — ask for figures, sources, or what would have to be true.'
          : 'The turns are getting vaguer. Ask someone to put a number or a source behind their position.',
        action: 'poll',
      },
    };
    const w = byWeakness[last.weakest];
    if (w) {
      return { phase: below ? 'wrapping' : 'cooling', word: below ? PHASE_META.wrapping.word : PHASE_META.cooling.word, ...w };
    }
    return {
      phase: below ? 'wrapping' : 'cooling', word: below ? PHASE_META.wrapping.word : PHASE_META.cooling.word,
      text: below
        ? 'Momentum is under the wind-down line — poll the room, or steer before it ends on its own.'
        : 'Losing steam with no fresh read on the room — take a straw poll to see where they stand.',
      action: 'poll',
    };
  }

  // Healthy, but the room has never been polled: establish the baseline.
  if (polls.length === 0 && lastTurn >= 4) {
    return {
      phase: 'productive', word: PHASE_META.productive.word,
      text: 'Going strong — take a baseline straw poll so later shifts are visible.',
      action: 'poll',
    };
  }

  return {
    phase: 'productive', word: PHASE_META.productive.word,
    text: 'The debate is earning its keep — let them run.',
    action: 'talk',
  };
}
