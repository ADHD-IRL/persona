import {
  createStopTracker, noveltyOf, noveltyAgainst, engagementOf, substanceOf,
  movementOf, disagreementOf,
} from '../src/lib/panel/debateStop.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ── The regression this scoring exists to prevent ────────────────────────────
// Lifetime novelty decays monotonically: a panel of specialists exhausts its
// shared vocabulary, so by a handful of turns EVERY turn scores as repetition
// however good it is. That pinned the pulse to "wrapping up" and ended runs
// early. Windowed novelty must not have that property.
{
  const roster = ['Ada Ruiz', 'Ben Okafor', 'Cal Ito'];
  const engaged = [
    ['Ada Ruiz', 'The fuel position is the binding constraint. We hold 92,000 gallons against a burn of 31,000 a day, which is three days of cover before the force is dry, because the tempo holds.'],
    ['Ben Okafor', 'Ada, that three-day figure assumes the tempo holds and nobody has examined it. Per the register, cutting rotary-wing tasking changes the burn. Why are we treating 31,000 as fixed?'],
    ['Cal Ito', 'Both of those positions skip the pump question. If the repair runs a week then the connector does not help, because we cannot move fuel into the distribution system.'],
    ['Ada Ruiz', 'I disagree with Cal on sequencing. Pumps only matter once the connector arrives, so the 34-hour escort window decides this unless the repair slips past it.'],
    ['Ben Okafor', 'Cal is right that the pumps are a second constraint. What changes my mind is whether the surveillance is cueing fires, because that makes the transit a 60 percent loss proposition.'],
    ['Cal Ito', 'That number needs a source. According to the brief we have two vessels detected 60 miles west, which is observation, not cueing. Unless we have more, 60 percent is invented.'],
  ];
  const t = createStopTracker();
  let stopped = null;
  const gs = [];
  engaged.forEach(([speaker, text], i) => {
    const v = t.observeTurn({ text, speaker, roster });
    gs.push(t.history[i].g);
    if (v.stop && !stopped) stopped = v.kind;
  });
  ok(!stopped, `an engaged, concrete debate must not wind down, got ${stopped}`);
  const last = t.history[t.history.length - 1];
  ok(last.gbar >= 0.25, `momentum stays above the stop bar, got ${last.gbar}`);
  // The signal has to MOVE — a constant readout is useless as an indicator.
  ok(Math.max(...gs) - Math.min(...gs) > 0.1, `per-turn score varies, range ${Math.min(...gs)}..${Math.max(...gs)}`);
  ok(t.history.every(h => h.engagement != null && h.substance != null), 'every turn records all three components');
  ok(t.history.some(h => h.engagement >= 0.5), 'naming a colleague and rebutting scores as engagement');
}

// ── The new per-turn signals ─────────────────────────────────────────────────
{
  const recent = [new Set(['fuel', 'gallons', 'burn', 'tempo'])];
  ok(noveltyAgainst('fuel gallons burn tempo', recent) === 0, 'restating the recent window scores zero');
  ok(noveltyAgainst('electronic warfare geolocation emitters', recent) === 1, 'a new thread scores fully novel');
  // The property lifetime novelty lacks: falling out of the window restores it.
  const window = [new Set(['alpha']), new Set(['beta'])];
  ok(noveltyAgainst('alpha', window) === 0 && noveltyAgainst('alpha', [new Set(['beta'])]) === 1,
    'novelty recovers once a term leaves the window');
}
{
  const roster = ['Ada Ruiz', 'Ben Okafor'];
  ok(engagementOf('Ada, I disagree with that read.', { roster }) > 0.6, 'naming + rebutting is high engagement');
  ok(engagementOf('Both of those positions skip the pump question.', { roster }) > 0.3,
    'engaging without using a name still registers');
  ok(engagementOf('I agree.', { roster }) === 0, 'bare agreement is zero engagement');
  ok(engagementOf('What would have to be true for that to hold?', { roster }) > 0, 'a question counts as engagement');
}
{
  ok(substanceOf('Per the register, 92,000 gallons at 31,000 a day is three days because the burn holds.') > 0.6,
    'figures + a source + a reason is substantive');
  ok(substanceOf('This is a serious and important consideration.') < 0.1, 'adjectives are not substance');
}

// ── Signal-level checks ──────────────────────────────────────────────────────
{
  const seen = new Set();
  const n1 = noveltyOf('the supply chain has three single points of failure in logistics', seen);
  ok(n1 === 1, 'first turn is fully novel');
  const n2 = noveltyOf('the supply chain failure points in logistics', seen);
  ok(n2 === 0, 'pure restatement scores zero novelty');
  const n3 = noveltyOf('supply chain failure but consider adversary electronic warfare jamming', seen);
  ok(n3 > 0.3 && n3 < 0.9, `partial novelty in (0.3,0.9), got ${n3}`);
}
{
  const settled = {
    a: { shifted: false, confDelta: 0, stance: 'for', confidence: 80 },
    b: { shifted: false, confDelta: -2, stance: 'for', confidence: 75 },
  };
  ok(movementOf(settled) < 0.05, 'settled room has ~zero movement');
  ok(disagreementOf(settled) === 0, 'unanimous room has zero disagreement');

  const split = {
    a: { shifted: false, confDelta: 0, stance: 'for', confidence: 80 },
    b: { shifted: false, confDelta: 0, stance: 'against', confidence: 80 },
  };
  ok(disagreementOf(split) === 1, 'even split has disagreement 1');

  const moving = {
    a: { shifted: true, confDelta: 30, stance: 'for', confidence: 60 },
    b: { shifted: true, confDelta: -20, stance: 'mixed', confidence: 50 },
  };
  ok(movementOf(moving) > 0.5, 'shifting room has high movement');
  ok(disagreementOf({ a: { stance: null, confidence: 70 } }) === null, 'no usable stances -> null D');
}

// ── Scenario 1: exhaustion — experts start repeating themselves ─────────────
{
  const t = createStopTracker();
  const turns = [
    'The adversary can exploit the unencrypted telemetry link during the handoff windows between ground stations. That link carries command state, and interception there gives them everything they need to spoof the downstream relay without touching the perimeter at all.',
    'Physical access controls at the forward depot are the second problem. Overnight shifts are unstaffed, badge logs are not reconciled, and the camera coverage on the north loading dock has a blind corner big enough to move a vehicle through.',
    'I agree with both. The telemetry link is the technical entry point and the depot is the physical one, and the combination is what worries me — exploit the link to time the depot approach and the response window collapses.',
    'To restate where we are: the unencrypted telemetry link during handoff windows and the unstaffed overnight depot access are the two risks. The combination of the technical entry point and the physical entry point is the core exposure we have identified.',
    'Yes — as we have said, the telemetry link handoff window plus the depot overnight access blind corner. The combination exposure. I have nothing to add beyond what has been identified already about the link and the depot.',
    'Agreed, the telemetry link and the depot access remain the two risks we identified. The handoff window exposure and the overnight blind corner exposure together are the finding.',
  ];
  let stopped = null;
  for (const text of turns) {
    const v = t.observeTurn({ text });
    if (v.stop) { stopped = v; break; }
  }
  ok(stopped && stopped.kind === 'exhaustion', `repetition ends in exhaustion, got ${stopped?.kind}`);
}

// ── Scenario 2: consensus — fresh poll, settled and unanimous ────────────────
{
  const t = createStopTracker();
  const positions = {
    a: { shifted: false, confDelta: 3, stance: 'for', confidence: 85 },
    b: { shifted: false, confDelta: -4, stance: 'for', confidence: 80 },
    c: { shifted: false, confDelta: 0, stance: 'for', confidence: 90 },
  };
  const v = t.observeTurn({
    text: 'entirely new framing about maritime interdiction corridors and refueling tempo',
    positions, pollTurn: 5, currentTurn: 6,
  });
  ok(v.stop && v.kind === 'consensus', `settled+unanimous fresh poll -> consensus, got ${v.kind}`);
}

// ── Scenario 3: impasse — settled but split ──────────────────────────────────
{
  const t = createStopTracker();
  const positions = {
    a: { shifted: false, confDelta: 1, stance: 'for', confidence: 85 },
    b: { shifted: false, confDelta: -2, stance: 'against', confidence: 80 },
  };
  const v = t.observeTurn({
    text: 'fresh angle entirely different vocabulary spectrum allocation interference',
    positions, pollTurn: 3, currentTurn: 4,
  });
  ok(v.stop && v.kind === 'impasse', `settled+split fresh poll -> impasse, got ${v.kind}`);
}

// ── Scenario 4: still moving — must NOT stop even though split ───────────────
{
  const t = createStopTracker();
  const positions = {
    a: { shifted: true, confDelta: 25, stance: 'for', confidence: 60 },
    b: { shifted: true, confDelta: -15, stance: 'against', confidence: 55 },
  };
  const v = t.observeTurn({
    text: 'brand new argument about sanctions enforcement gaps in transshipment hubs',
    positions, pollTurn: 2, currentTurn: 3,
  });
  ok(!v.stop, 'split but still-moving room keeps debating');
}

// ── Scenario 5: stale poll is ignored ────────────────────────────────────────
{
  const t = createStopTracker();
  const positions = {
    a: { shifted: false, confDelta: 0, stance: 'for', confidence: 90 },
    b: { shifted: false, confDelta: 0, stance: 'for', confidence: 90 },
  };
  const v = t.observeTurn({
    text: 'totally novel discussion of cognitive warfare narratives and diaspora media',
    positions, pollTurn: 1, currentTurn: 9, // 8 turns old > pollWindow 4
  });
  ok(!v.stop, 'stale poll cannot trigger consensus');
}

// ── Scenario 6: same poll not re-judged; patience protects a lull ────────────
{
  const t = createStopTracker();
  const moving = {
    a: { shifted: true, confDelta: 20, stance: 'for', confidence: 60 },
    b: { shifted: true, confDelta: 10, stance: 'against', confidence: 50 },
  };
  const v1 = t.observeTurn({ text: 'new thread about rail gauge incompatibility at border crossings', positions: moving, pollTurn: 1, currentTurn: 2 });
  ok(!v1.stop, 'moving poll: continue');
  // One repetitive turn — a lull, not an ending
  const v2 = t.observeTurn({ text: 'rail gauge border crossings as mentioned', positions: moving, pollTurn: 1, currentTurn: 3 });
  ok(!v2.stop, 'single dry turn survives (patience)');
  // Recovery resets the streak
  const v3 = t.observeTurn({ text: 'different topic entirely satellite ground station redundancy in polar coverage', positions: moving, pollTurn: 1, currentTurn: 4 });
  ok(!v3.stop && v3.metrics.novelty > 0.5, 'novel turn resets the dry streak');
}

// ── Scenario 7: seeding — restating the pre-burst discussion is not novel ────
{
  const t = createStopTracker({ seedTexts: ['the port facility lacks perimeter sensors on the north approach'] });
  const v = t.observeTurn({ text: 'the port facility perimeter sensors north approach' });
  ok(v.metrics.novelty === 0, `seeded restatement scores zero, got ${v.metrics.novelty}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

