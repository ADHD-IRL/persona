// Attention-filtered memory — what each SME actually retains from the room.
//
// Every expert hears the last few exchanges verbatim, but beyond that, humans
// remember SELECTIVELY: the logistics person retains the resupply numbers, the
// cyber person the network detail. This module builds each SME's recall from
// the older transcript and the room's documents, weighted by their own
// expertise profile plus what the room is currently talking about (old points
// resurface when they become relevant).
//
// Heuristic and local, like floorControl — no LLM call. Two SMEs in the same
// session genuinely recall different things, which is both cheaper and more
// human than handing everyone the same window.

// Relative (not the '@' alias) so this stays loadable by plain node for tests;
// floorControl has no dependencies of its own. Vite resolves both forms.
import { tokens } from './floorControl.js';

function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string' && v.trim()) return v.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  return [];
}

// Weighted overlap between a text and the agent's expertise vocabulary.
// Uncapped small number — ~0.25 per soft hit, ~1.0 per core-expertise hit.
export function salienceTo(agent, text) {
  const t = tokens(text);
  if (!t.length) return 0;
  const set = new Set(t);
  let score = 0;
  const hit = (phrases, weight) => {
    for (const p of phrases) {
      const words = tokens(p);
      if (words.length && words.some(w => set.has(w))) score += weight;
    }
  };
  const eb = agent?.expertise_boundaries || {};
  hit(asList(eb.strong), 1.0);
  hit(Object.keys(agent?.domain_expertise || {}), 0.6);
  hit([agent?.discipline || ''], 0.5);
  hit([agent?.red_team_focus || ''], 0.4);
  hit([agent?.conflict_triggers || ''], 0.5);
  hit(asList(agent?.tags), 0.25);
  return score;
}

// How much a text overlaps what the room is talking about right now (0..1).
function topicPull(topicTokens, text) {
  if (!topicTokens.size) return 0;
  const t = tokens(text);
  if (!t.length) return 0;
  let shared = 0;
  for (const w of new Set(t)) if (topicTokens.has(w)) shared++;
  return Math.min(1, shared / 8);
}

const firstName = (name) => {
  const f = (name || '').split(/\s+/)[0];
  return f && f.length > 2 ? f : null;
};

// Older remarks this SME would have held onto. `messages` is the room's local
// message list (oldest first); the most recent `skipRecent` non-system messages
// are excluded — those are heard verbatim by everyone.
export function recallRemarks({ agent, messages = [], topic = '', skipRecent = 8, maxItems = 3, maxChars = 900, minScore = 0.6 }) {
  const spoken = messages.filter(m => (m.role === 'agent' || m.role === 'user') && m.content?.trim() && !m.isStreaming);
  const older = spoken.slice(0, Math.max(0, spoken.length - skipRecent));
  if (!older.length) return [];

  const topicTokens = new Set(tokens(topic));
  const myName = firstName(agent?.name);
  const nameRe = myName ? new RegExp(`\\b${myName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;

  const scored = older.map((m, i) => {
    let score = salienceTo(agent, m.content) + topicPull(topicTokens, m.content) * 1.2;
    if (m.agentId === agent?.id) score += 0.4;          // you remember what you said
    if (nameRe && nameRe.test(m.content)) score += 0.8; // and what was said to you
    return {
      speaker: m.role === 'agent' ? (m.agentName || 'SME') : (m.authorName || 'Team'),
      content: m.content.trim().slice(0, 240),
      score,
      order: i,
    };
  }).filter(r => r.score >= minScore);

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, maxItems).sort((a, b) => a.order - b.order);

  // Respect the character budget, keeping the strongest recalls.
  const out = [];
  let used = 0;
  for (const r of picked) {
    if (used + r.content.length > maxChars) break;
    used += r.content.length;
    out.push(r);
  }
  return out;
}

// Split a document into scoreable passages: paragraph-aware, with long
// paragraphs cut at a sentence boundary near `cap` characters.
function passagesOf(text, cap = 600) {
  const parts = [];
  for (const para of (text || '').split(/\n\s*\n/)) {
    const p = para.trim();
    if (p.length < 80) continue;
    if (p.length <= cap) { parts.push(p); continue; }
    let rest = p;
    while (rest.length > cap) {
      const window = rest.slice(0, cap);
      const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
      const at = cut > cap * 0.4 ? cut + 1 : cap;
      parts.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest.length >= 80) parts.push(rest);
  }
  return parts;
}

// The passages this SME would have flagged in the room's documents (uploaded
// docs + the read-ahead scenario), given who they are and what is being
// discussed. This is what lifts the panel past the flat context ceiling: each
// expert reaches the parts of the corpus that are THEIRS.
export function recallPassages({ agent, topic = '', documents = [], maxItems = 3, maxChars = 1100, minScore = 0.6 }) {
  const topicTokens = new Set(tokens(topic));
  const scored = [];
  for (const doc of documents) {
    if (!doc?.text) continue;
    for (const text of passagesOf(doc.text)) {
      const score = salienceTo(agent, text) + topicPull(topicTokens, text) * 1.2;
      if (score >= minScore) scored.push({ source: doc.name || 'document', text, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  let used = 0;
  for (const p of scored.slice(0, maxItems)) {
    const text = p.text.slice(0, 450);
    if (used + text.length > maxChars) break;
    used += text.length;
    out.push({ ...p, text });
  }
  return out;
}

// Render remarks + passages as the prompt block generatePanelTurn injects.
export function renderRecall({ remarks = [], passages = [] }) {
  const lines = [
    ...remarks.map(r => `- ${r.speaker} said earlier: “${r.content}”`),
    ...passages.map(p => `- From ${p.source}: “${p.text}”`),
  ];
  return lines.join('\n');
}

// One call that does the whole thing for a turn.
export function buildRecall({ agent, messages, topic, documents }) {
  return renderRecall({
    remarks: recallRemarks({ agent, messages, topic }),
    passages: recallPassages({ agent, topic, documents }),
  });
}
