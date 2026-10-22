// Floor control — decides WHO speaks next in a panel, the way a real meeting
// works: whoever the topic actually belongs to. Scoring is heuristic and local
// (no LLM call per turn); the room only calls the model for the SME that wins
// the floor.
//
// urge = relevance (their depth in this topic) + triggers (something provoked
// them) − suppression (it is outside their lane) − recency (they just spoke).

const STOP = new Set(['the','and','for','with','that','this','from','have','has','was','were','are','you','your','our','their','they','them','what','when','where','which','would','could','should','about','into','over','under','than','then','there','here','been','being','will','can','not','but','all','any','how','why','who','its','it\'s','a','an','of','to','in','on','is','as','at','by','or','if','we','i','be','do','go','he','me','my','no','so','up','us','am','it','did','had','her','him','his','let','may','see','too','use','via','yet','per','off','out','own','get','got','put']);

export function tokens(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    // Keep 2+ char tokens so short domain terms and acronyms (AI, RF, SQL, DNS,
    // war, law) survive; the STOP set carries the load of dropping short noise.
    .filter(w => w.length > 1 && !STOP.has(w));
}

function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string' && v.trim()) return v.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  return [];
}

// How strongly `phrases` show up in the topic's tokens (0..1-ish, uncapped small).
function overlap(topicTokens, phrases) {
  if (!topicTokens.length || !phrases.length) return 0;
  const set = new Set(topicTokens);
  let hits = 0;
  for (const phrase of phrases) {
    const words = tokens(phrase);
    if (!words.length) continue;
    // A phrase counts if any distinctive word appears.
    if (words.some(w => set.has(w))) hits++;
  }
  return hits / phrases.length;
}

/**
 * Score one SME's urge to speak about `topic`.
 * Returns { score, reason, defer } — `defer` set when the topic is outside
 * their competence and they should yield rather than answer.
 */
export function scoreUrge({ agent, topic, lastSpeakerIds = [], addressed = false, asked = false, panelSize = 3 }) {
  const t = tokens(topic);
  const eb = agent.expertise_boundaries || {};
  const fluency = agent.domain_expertise || {};
  const db_ = agent.debate_behavior || {};

  // Directly addressed always wins the floor.
  if (addressed) return { score: 100, reason: 'addressed directly', defer: false };

  let score = 0;
  const reasons = [];

  // Another expert put a question to them last turn. A strong pull — real
  // conversations route the floor back to whoever was asked — but softer than
  // a facilitator address, so defer/suppression logic still applies.
  if (asked) { score += 45; reasons.push('was asked directly'); }

  // Relevance — depth in this topic.
  const strong = overlap(t, asList(eb.strong));
  if (strong > 0) { score += strong * 40; reasons.push('core expertise'); }

  const fluencyHit = Object.entries(fluency).reduce((best, [label, val]) => {
    const hit = overlap(t, [label]);
    return hit > 0 && Number(val) > best ? Number(val) : best;
  }, 0);
  if (fluencyHit > 0) { score += fluencyHit * 3; reasons.push(`fluency ${fluencyHit}/10`); }

  // Discipline / focus / tags as a softer signal.
  score += overlap(t, [agent.discipline || '']) * 18;
  score += overlap(t, asList(agent.tags)) * 8;
  score += overlap(t, [agent.red_team_focus || '']) * 10;

  // Triggers — something in the topic provokes them.
  if (overlap(t, [agent.conflict_triggers || '']) > 0) { score += 22; reasons.push('conflict trigger'); }
  if (overlap(t, [db_.what_changes_mind || '']) > 0) { score += 10; reasons.push('evidence they weigh'); }
  const role = (db_.debate_role || agent.role_type || '').toLowerCase();
  if (role.includes('contrarian') || role.includes('devil')) { score += 12; reasons.push('contrarian role'); }
  if (role.includes('challenger')) score += 8;

  // Suppression — outside their lane.
  const weak = overlap(t, asList(eb.weak));
  const forbidden = overlap(t, [eb.forbidden_overreach || '']);
  const deferTo = asList(eb.defer_to);
  let defer = false;
  if (forbidden > 0) { score -= 45; defer = true; reasons.push('forbidden overreach'); }
  else if (weak > 0 && strong === 0) { score -= 25; defer = deferTo.length > 0; reasons.push('outside competence'); }

  // Recency — don't let one voice dominate. Softened on a small panel, where
  // there may be nobody else qualified to pick up the thread.
  const f = panelSize >= 3 ? 1 : 0.35;
  const idx = lastSpeakerIds.indexOf(agent.id);
  if (idx === 0) score -= 46 * f;
  else if (idx === 1) score -= 20 * f;
  else if (idx === 2) score -= 8 * f;

  // Small deterministic jitter by id so equal scores don't always tie-break the
  // same way (no Math.random — keeps behavior reproducible per agent).
  // Guard the empty-id case: ''.charCodeAt(0) is NaN, which would poison score.
  const idCode = (agent.id || '').charCodeAt(0) || 0;
  score += (idCode % 5) * 0.1;

  return {
    score: Math.round(score * 10) / 10,
    reason: reasons.slice(0, 2).join(' · ') || 'general interest',
    defer,
    deferTo,
  };
}

/**
 * Rank the panel for the current topic.
 * Returns [{ agent, score, reason, defer, deferTo }] sorted by urge, highest first.
 */
export function rankPanel({ agents = [], topic = '', lastSpeakerIds = [], addressedId = null, askedId = null }) {
  return agents
    .map(agent => ({
      agent,
      ...scoreUrge({
        agent, topic, lastSpeakerIds,
        addressed: addressedId === agent.id,
        asked: askedId === agent.id,
        panelSize: agents.length,
      }),
    }))
    .sort((a, b) => b.score - a.score);
}

// Urge above which an SME visibly "raises a hand" in the roster.
export const SPEAK_THRESHOLD = 12;

// In listen mode the panel stays quiet; only an urge this high is worth
// breaking silence for (a forbidden-overreach risk, a conflict trigger landing
// squarely in someone's lane). Deliberately far above SPEAK_THRESHOLD.
export const INTERJECT_THRESHOLD = 55;

/**
 * Choose the next speaker. Returns { agent, reason, defer, deferTo } or null when
 * nobody has enough to add (the panel falls silent and waits for the humans).
 *
 * `threshold` overrides the bar — pass INTERJECT_THRESHOLD for silent/listen mode.
 */
export function pickNextSpeaker({ agents, topic, lastSpeakerIds = [], addressedId = null, askedId = null, threshold = SPEAK_THRESHOLD }) {
  const ranked = rankPanel({ agents, topic, lastSpeakerIds, addressedId, askedId });
  const top = ranked[0];
  if (!top) return null;
  if (top.score < threshold && !addressedId) return null;
  return top;
}
