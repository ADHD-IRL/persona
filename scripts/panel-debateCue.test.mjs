import { facilitationCue } from '../src/lib/panel/debateCue.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL:', name); } };
const H = (over) => ({ gbar: 0.6, dry: 0, ...over });

// No history → no cue
ok(facilitationCue({ history: [], events: [] }) === null, 'empty history -> null');

// Healthy default → let them run
{
  const c = facilitationCue({ history: [H(), H(), H()], events: [] });
  ok(c.phase === 'productive' && c.action === 'talk', `healthy -> talk, got ${c.phase}/${c.action}`);
}

// Healthy, 4+ turns, never polled → baseline poll
{
  const c = facilitationCue({ history: [H(), H(), H(), H()], events: [] });
  ok(c.action === 'poll' && c.phase === 'productive', `unpolled healthy -> poll, got ${c.action}`);
}

// Cooling with no fresh poll → poll
{
  const c = facilitationCue({ history: [H({ gbar: 0.8 }), H({ gbar: 0.5 }), H({ gbar: 0.3 })], events: [] });
  ok(c.phase === 'cooling' && c.action === 'poll', `cooling no-poll -> poll, got ${c.phase}/${c.action}`);
}

// Cooling over a green band → record decision (converging)
{
  const c = facilitationCue({
    history: [H({ gbar: 0.8 }), H({ gbar: 0.5 }), H({ gbar: 0.3 })],
    events: [{ turn: 2, type: 'poll', disagreement: 0.1, movement: 0.1 }],
  });
  ok(c.action === 'record' && c.text.includes('positions are aligned'), `cooling+green -> record/converging, got ${c.action}: ${c.text}`);
}

// Cooling over a red band → record disagreement (deadlock)
{
  const c = facilitationCue({
    history: [H({ gbar: 0.8 }), H({ gbar: 0.5 }), H({ gbar: 0.3 })],
    events: [{ turn: 2, type: 'poll', disagreement: 0.8, movement: 0.1 }],
  });
  ok(c.action === 'record' && c.text.toLowerCase().includes('deadlock'), `cooling+red -> deadlock, got: ${c.text}`);
}

// Stale poll is ignored → falls back to the poll cue
{
  const c = facilitationCue({
    history: Array.from({ length: 8 }, () => H({ gbar: 0.3 })),
    events: [{ turn: 1, type: 'poll', disagreement: 0.1, movement: 0.1 }],
  });
  ok(c.action === 'poll', `stale poll ignored -> poll, got ${c.action}`);
}

// One turn from the end (dry === patience - 1) → urgent steer cue
{
  const c = facilitationCue({ history: [H(), H({ gbar: 0.4, dry: 2 })], events: [] });
  ok(c.phase === 'wrapping' && c.text.includes('Repeated low-value turns'), `dry=patience-1 -> urgent, got: ${c.text}`);
}

// A single quiet turn is no longer urgent — patience is 3, so one lull is fine
{
  const c = facilitationCue({ history: [H(), H({ gbar: 0.6, dry: 1 })], events: [] });
  ok(!c.text.includes('Repeated low-value turns'), `dry=1 is not urgent, got: ${c.text}`);
}

// Cooling cues name the weakest component, because each has a different remedy
{
  const c = facilitationCue({ history: [H({ gbar: 0.5 }), H({ gbar: 0.4 }), H({ gbar: 0.3, weakest: 'novelty' })], events: [] });
  ok(c.text.includes('circling') || c.text.includes('familiar ground'), `novelty-weak cue names repetition, got: ${c.text}`);
}
{
  const c = facilitationCue({ history: [H({ gbar: 0.5 }), H({ gbar: 0.4 }), H({ gbar: 0.3, weakest: 'engagement' })], events: [] });
  ok(c.action === 'dissent' && /each other|by name/.test(c.text), `engagement-weak cue aims at a person, got: ${c.action}/${c.text}`);
}
{
  const c = facilitationCue({ history: [H({ gbar: 0.5 }), H({ gbar: 0.4 }), H({ gbar: 0.3, weakest: 'substance' })], events: [] });
  ok(/figures|number|source/.test(c.text), `substance-weak cue asks for specifics, got: ${c.text}`);
}

// A fresh poll still wins over the component diagnosis (it is stronger evidence)
{
  const c = facilitationCue({
    history: [H({ gbar: 0.8 }), H({ gbar: 0.5 }), H({ gbar: 0.3, weakest: 'engagement' })],
    events: [{ turn: 2, type: 'poll', disagreement: 0.1, movement: 0.1 }],
  });
  ok(c.action === 'record', `fresh poll outranks the weakest-component cue, got ${c.action}`);
}

// Ended runs name the ending's next move
{
  const mk = (kind) => facilitationCue({ history: [H(), H()], events: [{ turn: 2, type: 'stop', kind }] });
  ok(mk('consensus').action === 'record', 'consensus end -> record');
  ok(mk('impasse').action === 'record', 'impasse end -> record');
  ok(mk('exhaustion').action === 'talk', 'exhaustion end -> talk');
  ok(mk('silence').action === null, 'silence end -> no button');
  ok(mk('budget').action === 'talk', 'budget end -> talk');
}

// A stop earlier in the run (resumed since) does not pin the cue to "ended"
{
  const c = facilitationCue({ history: [H(), H(), H()], events: [{ turn: 1, type: 'stop', kind: 'exhaustion' }] });
  ok(c.phase === 'productive', `old stop ignored after resume, got ${c.phase}`);
}

// A finished session reads as closed, not as a live debate still earning its keep
{
  const c = facilitationCue({ history: [H(), H({ gbar: 0.7 })], events: [{ turn: 2, type: 'stop', kind: 'complete' }] });
  ok(c.phase === 'closed' && c.action === null, `complete -> closed/no action, got ${c.phase}/${c.action}`);
  ok(/Reports center/.test(c.text), `complete cue points at the reports, got: ${c.text}`);
}
// A high-momentum final turn must not override the ending
{
  const c = facilitationCue({ history: [H({ gbar: 0.9 }), H({ gbar: 0.95 })], events: [{ turn: 2, type: 'stop', kind: 'complete' }] });
  ok(c.word === 'Closed', `a strong last turn still reads Closed, got ${c.word}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);


