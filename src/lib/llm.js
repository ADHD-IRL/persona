// ⚠️ MAINTAINERS: The prompt templates in this file are documented for users in
// the Prompt Library page (src/pages/PromptLibrary.jsx). That page is authored by
// hand and does NOT auto-sync. When you add, remove, or materially change a prompt
// here (or in decisionContext.js / knowledge.js), update PromptLibrary.jsx to match.

import { getApiKey, getActiveWorkspaceId, getProviderConfig } from './apiCredentials.js';
import { sectionedCompletion } from './sectionedCompletion.js';
import { readAnthropicStream } from './anthropicStream.js';
export { getApiKey, setWorkspaceApiKey } from './apiCredentials.js';

const MODEL_MAP = {
  claude_sonnet_4_6: 'claude-sonnet-4-6',
  claude_opus_4_6:   'claude-opus-4-7',
  claude_haiku:      'claude-haiku-4-5-20251001',
};
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Use backend proxy to avoid CORS preflight failures on deployed origins.
// Historical helper names remain compatible; the Node server selects the provider.
const ANTHROPIC_URL = '/api/llm/messages';

export function getModelId() {
  const config = getProviderConfig();
  if (config.provider === 'mitre_aip') return localStorage.getItem('agd_aip_model_' + getActiveWorkspaceId()) || config.defaultModel || '';
  const val = localStorage.getItem('agd_llm_model');
  return MODEL_MAP[val] || val || DEFAULT_MODEL;
}
export function setModelPref(val) {
  const key = getProviderConfig().provider === 'mitre_aip' ? 'agd_aip_model_' + getActiveWorkspaceId() : 'agd_llm_model';
  localStorage.setItem(key, val);
}
let usageSink = null;
export function setUsageSink(sink) { usageSink = typeof sink === 'function' ? sink : null; }
function reportUsage(usage) {
  if (usage && usageSink) { try { usageSink({ ...usage, model: getModelId(), provider: getProviderConfig().provider }); } catch { /* accounting must not break analysis */ } }
}
let serverTransport = null;
export function setServerTransport(transport) { serverTransport = transport; }
export async function callAnthropicStream({ messages, maxTokens = 2000, system, onToken, onDone, onUsage, onRecovery, signal }) {
  if (serverTransport) return serverTransport({ messages, maxTokens, system, onToken, onDone, onUsage, signal });
  const key = getApiKey();
  if (!key && getProviderConfig().provider !== 'mitre_aip') throw new Error('No Anthropic API key configured. Add it in Settings.');
  const body = { model: getModelId(), max_tokens: maxTokens, messages, stream: true };
  if (system) body.system = system;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getProviderConfig().provider === 'anthropic' ? { 'x-api-key': key } : {}),
      'x-workspace-id': getActiveWorkspaceId(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || err.error || `Model API error ${res.status}`);
  }
  return readAnthropicStream(res.body, { onToken, onDone, onRecovery, signal, onUsage: usage => { reportUsage(usage); onUsage?.(usage); } });
}

export function parseSeverityFromText(text, fallback = 'HIGH') {
  const lines = text.trimEnd().split('\n');
  const last = lines[lines.length - 1];
  const m = last.match(/SEVERITY:\s*(CRITICAL|HIGH|MEDIUM|LOW)/i);
  if (m) return { assessment: lines.slice(0, -1).join('\n').trim(), severity: m[1].toUpperCase() };
  return { assessment: text.trim(), severity: fallback };
}

async function callAnthropic({ messages, maxTokens = 2000, system }) {
  if (serverTransport) return serverTransport({ messages, maxTokens, system });
  const key = getApiKey();
  if (!key && getProviderConfig().provider !== 'mitre_aip') throw new Error('No Anthropic API key configured. Add it in Settings.');
  const body = { model: getModelId(), max_tokens: maxTokens, messages };
  if (system) body.system = system;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getProviderConfig().provider === 'anthropic' ? { 'x-api-key': key } : {}),
      'x-workspace-id': getActiveWorkspaceId(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.error)) throw new Error(data?.error?.message || data?.error || `Model API error ${res.status}`);
  if (!data) throw new Error(`Anthropic API error ${res.status} (non-JSON response)`);
  if (data.stop_reason === 'max_tokens') throw new Error('The model response reached its token limit.');
  reportUsage(data.usage);
  return data.content[0].text.trim();
}

// --- regenerateAgentField ---
const FIELD_DESCRIPTIONS = {
  persona_description:      '3-4 sentences describing who this expert is, how they think, what experiences shaped them, and what drives their analysis',
  cognitive_bias:           '1-2 sentences on what this expert systematically underweights, misses, or is blind to',
  red_team_focus:           '2-3 sentences on what specific threat patterns, attack vectors, or failure modes this agent actively hunts for',
  professional_background:  '2-3 sentences of career history and past roles that shaped this expert\'s analytical lens',
  epistemic_style:          '1-2 sentences on evidence threshold requirements, preferred evidence types, and ambiguity tolerance',
  institutional_background: '1-2 sentences on former agency, service, or sector background and resulting organizational culture imprint',
  conflict_triggers:        '1 sentence on what arguments, sources, or analytical styles this expert distrusts or dismisses in debate',
  decision_style:           '1 sentence on escalation threshold, speed-vs-accuracy orientation, and crisis response posture',
  adversary_model:          '1 sentence on assumed adversary sophistication, motivations, and the primary threat lens applied',
  institutional_incentives: '1 sentence on career, organizational, and political incentives that shape how this expert frames assessments',
  source_preferences:       '1 sentence on the evidence/collection types this expert weights most (HUMINT / OSINT / technical telemetry / financial / academic ...)',
  analytical_framework:     '1-2 sentences naming the specific methods this expert applies (ACH, MITRE ATT&CK, kill-chain, Bayesian updating ...)',
  debiasing_instruction:    '1 sentence on the concrete self-correction habit this expert uses to counter their cognitive bias',
};

export async function regenerateAgentField({ field, agent }) {
  const desc = FIELD_DESCRIPTIONS[field] || '1-2 sentences relevant to this field';
  const lines = [
    `Name: ${agent.name || 'Unknown'}`,
    `Discipline: ${agent.discipline || 'Unknown'}`,
    agent.persona_description     && `Persona: ${agent.persona_description}`,
    agent.professional_background && `Background: ${agent.professional_background}`,
    agent.expertise_level         && `Expertise: ${agent.expertise_level}`,
    agent.reasoning_style         && `Reasoning style: ${agent.reasoning_style}`,
    agent.institutional_background && `Institution: ${agent.institutional_background}`,
  ].filter(Boolean).join('\n');

  const prompt = `You are generating one field for an expert agent profile in AgentDebate, a structured multi-agent risk analysis platform.

Agent context:
${lines}

Generate ONLY the "${field}" field — ${desc}.

Return ONLY the raw field text. No JSON, no labels, no explanation. Keep it concise and operationally specific.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 350 });
  return text.trim();
}

// --- generateAgent ---
export async function generateAgent({ domain_id, expert_type, prior_background, key_focus, bias_toward, institutional_hint, adversary_hint }) {
  const prompt = `You are building an expert agent profile for the AgentDebate strategic analysis system.
Generate a detailed agent profile for the following expert type:

Expert type: ${expert_type}
Prior background hints: ${prior_background || 'none'}
Key focus area: ${key_focus || 'none'}
Known bias toward: ${bias_toward || 'none'}
Institutional background hint: ${institutional_hint || 'none'}
Adversary lens hint: ${adversary_hint || 'none'}

Return a JSON object with exactly these fields. Make every field specific to THIS expert — a bona fide human SME knows the edge of their competence, applies named methods, has a characteristic bias AND a habit to counter it, and treats false-negatives vs false-positives asymmetrically:
{
  "name": "short descriptive name",
  "discipline": "2-4 word discipline label",
  "expertise_level": "Junior | Mid-Level | Senior | Principal | World-Class",
  "role_type": "sme | red-team | devil's-advocate | facilitator",
  "reasoning_style": "Analytical | Intuitive | Contrarian | Systematic | Probabilistic",
  "persona_description": "3-4 sentence description of who this expert is, how they think, what they prioritize",
  "professional_background": "2-3 sentences of career history and formative roles",
  "cognitive_bias": "1-2 sentences describing what this expert systematically underweights or misses",
  "debiasing_instruction": "1 sentence: the self-correction habit this expert uses to counter that bias",
  "red_team_focus": "2-3 sentences on what this agent hunts for when analyzing any scenario",
  "severity_default": "CRITICAL or HIGH or MEDIUM",
  "vector_human": 50,
  "vector_technical": 50,
  "vector_physical": 30,
  "vector_futures": 40,
  "tags": ["array", "of", "3-5", "relevant", "tags"],
  "epistemic_style": "1-2 sentences: evidence threshold, preferred collection types, tolerance for ambiguity",
  "source_preferences": "1 sentence: preferred evidence/collection types (HUMINT / OSINT / telemetry / financial / academic ...)",
  "analytical_framework": "1-2 sentences: named methods this expert applies (ACH, MITRE ATT&CK, kill-chain, Bayesian ...)",
  "institutional_background": "1-2 sentences: former agency or sector and organizational culture imprint",
  "conflict_triggers": "1 sentence: what arguments or sources this expert distrusts or dismisses",
  "decision_style": "1 sentence: escalation threshold and response posture under uncertainty",
  "adversary_model": "1 sentence: assumed adversary sophistication and primary threat lens",
  "institutional_incentives": "1 sentence: career or organizational incentives shaping this expert's assessments",
  "domain_expertise": { "sub-dimension label": 8, "another sub-dimension": 5 },
  "expertise_boundaries": {
    "strong": ["areas of genuine depth"],
    "moderate": ["working knowledge"],
    "weak": ["shallow or dated knowledge"],
    "defer_to": ["disciplines this SME yields to"],
    "forbidden_overreach": "what this SME must never claim as fact outside its competence"
  },
  "tradecraft": {
    "common_indicators": ["what this discipline actively looks for"],
    "common_false_positives": ["what tends to fool this discipline"],
    "failure_modes": ["how this discipline characteristically gets it wrong"]
  },
  "risk_posture": {
    "risk_sensitivity": "low | medium | high",
    "false_negative_tolerance": "low | medium | high",
    "false_positive_tolerance": "low | medium | high",
    "escalation_bias": "one short phrase"
  },
  "debate_behavior": {
    "debate_role": "e.g. domain challenger, coalition builder, contrarian",
    "rebuttal_style": "how they argue and concede",
    "what_changes_mind": "the evidence or argument that moves them"
  },
  "update_triggers": {
    "fast_when": "conditions under which they revise quickly",
    "slow_when": "conditions under which they revise cautiously",
    "resistant_when": "conditions under which they dig in"
  }
}

Return ONLY the JSON object.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 2800 });
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

// --- recommendAgents ---
export async function recommendAgents({ scenarioName, scenarioDescription, domain, existingAgents = [], count = 5 }) {
  const existingList = existingAgents.length
    ? `\nExisting agents in the library (avoid duplicates):\n${existingAgents.map(a => `- ${a.name} (${a.discipline})`).join('\n')}`
    : '';
  const prompt = `You are helping configure an AgentDebate red team session.

Scenario: ${scenarioName || 'General analysis'}
${scenarioDescription ? `Description: ${scenarioDescription}` : ''}
${domain ? `Domain: ${domain}` : ''}
${existingList}

Recommend ${count} expert agent types that would provide the most valuable, diverse perspectives for analyzing this scenario. Aim for complementary disciplines that cover different risk vectors (technical, human, physical, strategic futures).

Return a JSON array of ${count} objects, each with:
{
  "name": "short descriptive label e.g. 'Supply Chain Risk Analyst'",
  "discipline": "2-4 word discipline",
  "expert_type": "sentence describing the expert for AI generation",
  "rationale": "1-2 sentences on why this perspective is valuable for this specific scenario",
  "key_focus": "what they prioritize in analysis",
  "cognitive_bias": "what they tend to over- or under-weight",
  "severity_default": "CRITICAL or HIGH or MEDIUM or LOW"
}

Return ONLY the JSON array.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 4096 });
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

// --- assignDomainsToAgents ---
// Reviews each agent's persona/discipline and assigns the best-fit domain,
// reusing existing domains where possible and proposing BROAD new ones only when
// nothing fits. Returns an array ALIGNED TO THE INPUT ORDER — result[k] is
// { domain, is_new, why } for agents[k], or null if the model gave nothing for
// that slot. Experts are numbered so matching never depends on echoing UUIDs.
export async function assignDomainsToAgents({ agents = [], domains = [] }) {
  const domainList = domains.length
    ? domains.map(d => `- ${d.name}${d.description ? `: ${d.description}` : ''}`).join('\n')
    : '(none yet — propose broad domains)';
  const existingNames = new Set(domains.map(d => d.name.toLowerCase().trim()));

  const CHUNK = 40;
  const out = new Array(agents.length).fill(null);

  for (let start = 0; start < agents.length; start += CHUNK) {
    const batch = agents.slice(start, start + CHUNK);
    const expertLines = batch.map((a, i) => {
      const persona = (a.persona_description || '').slice(0, 240);
      const focus = (a.red_team_focus || '').slice(0, 160);
      const tags = Array.isArray(a.tags) ? a.tags.join(', ') : '';
      return `${i + 1}. ${a.name} — ${a.discipline || 'unknown discipline'}. Persona: ${persona}${focus ? ` Focus: ${focus}` : ''}${tags ? ` Tags: ${tags}` : ''}`;
    }).join('\n');

    const prompt = `You are organizing a panel of subject-matter experts into broad, groupable domains.

EXISTING DOMAINS (reuse one of these whenever it reasonably fits — do not invent a near-duplicate):
${domainList}

EXPERTS TO CLASSIFY (numbered):
${expertLines}

For each expert, assign the single best-fit domain.
- Strongly prefer an existing domain when one reasonably fits.
- Only propose a NEW domain when no existing one fits, and make new domains BROAD enough to group several experts (e.g. "National Security", "Cybersecurity", "Economics & Finance", "Public Health") — never a narrow specialty.

Return a JSON array with EXACTLY ${batch.length} objects, one per expert, in the SAME numbered order:
{ "n": <expert number>, "domain": "<domain name>", "why": "<5-10 word rationale>" }

Return ONLY the JSON array.`;

    const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 2000 });
    const match = text.match(/\[[\s\S]*\]/);
    let parsed = [];
    try { parsed = JSON.parse(match ? match[0] : '[]'); } catch { parsed = []; }
    if (!Array.isArray(parsed)) parsed = [];

    // Prefer matching by the returned "n"; fall back to positional order.
    const byN = {};
    for (const r of parsed) if (r && r.n != null) byN[Number(r.n)] = r;
    batch.forEach((_, i) => {
      const r = byN[i + 1] || parsed[i];
      const domain = (r?.domain || '').trim();
      if (domain) {
        out[start + i] = { domain, is_new: !existingNames.has(domain.toLowerCase()), why: r?.why || '' };
      }
    });
  }
  return out;
}

// --- generateRound0 ---
export async function generateRound0({ agent, scenarioContext, phaseFocus }) {
  const prompt = `You are ${agent.name}, ${agent.persona_description}
${agent.professional_background ? `Professional background: ${agent.professional_background}` : ''}
Your cognitive bias: ${agent.cognitive_bias}
Your red-team focus: ${agent.red_team_focus}

You are about to enter a structured red team analysis session.

SCENARIO CONTEXT:
${(scenarioContext || '')}

PHASE/FOCUS: ${phaseFocus || 'General analysis'}

Write a brief pre-session self-briefing (100-150 words) — the mental preparation you do before the analysis begins:
- What lens you will apply from your discipline
- What assumption you most want to challenge in this scenario
- What your biggest concern going into this session is

Write in first person as the expert. Be direct and specific.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 400 });
  return { briefing: text.trim() };
}

export function parseMarkers(fullText, fallbackSeverity) {
  const lines = fullText.trimEnd().split('\n');
  let severity = fallbackSeverity || 'HIGH';
  let confidence = null;
  let likelihood = null;
  let impact = null;
  let compound_chain_text = '';
  let markerEnd = lines.length;

  // Scan a slightly larger tail since there are now up to 5 marker lines
  for (let i = lines.length - 1; i >= 0 && markerEnd - i <= 7; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const sev = line.match(/^SEVERITY:\s*(CRITICAL|HIGH|MEDIUM|LOW)/i);
    if (sev) { severity = sev[1].toUpperCase(); markerEnd = Math.min(markerEnd, i); continue; }
    const conf = line.match(/^CONFIDENCE:\s*(\d+)/i);
    if (conf) { confidence = Math.min(100, Math.max(0, parseInt(conf[1], 10))); markerEnd = Math.min(markerEnd, i); continue; }
    const lik = line.match(/^LIKELIHOOD:\s*([1-5])/i);
    if (lik) { likelihood = parseInt(lik[1], 10); markerEnd = Math.min(markerEnd, i); continue; }
    const imp = line.match(/^IMPACT:\s*([1-5])/i);
    if (imp) { impact = parseInt(imp[1], 10); markerEnd = Math.min(markerEnd, i); continue; }
    const chain = line.match(/^COMPOUND_CHAIN:\s*(.+)/i);
    if (chain) { compound_chain_text = chain[1].trim(); markerEnd = Math.min(markerEnd, i); continue; }
    break;
  }

  const assessment = lines.slice(0, markerEnd).join('\n').trim();
  return { assessment, severity, confidence, likelihood, impact, compound_chain_text };
}

// Render a stored list value (jsonb array or comma-string) as a clean comma list.
function fmtList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return (v || '').toString().trim();
}

// Shared persona header injected into every debate prompt (R1, R2, and their
// stream twins) so the four bodies never drift. `round` = 1 | 2. Every line is
// conditional so partially-filled SMEs degrade gracefully. This is where the
// "optimal SME" fields actually shape reasoning: competence boundaries, the
// bias+debiasing pair, FP/FN risk posture, tradecraft self-checks, and — in
// Round 2 — the belief-update rules that make rebuttals move honestly.
export function buildPersonaHeader(agent, { round } = {}) {
  const lines = [`You are ${agent.name}, ${agent.persona_description}`];
  if (agent.discipline) lines.push(`Discipline: ${agent.discipline} — reason from this discipline's methods and priorities.`);
  if (agent.professional_background) lines.push(`Professional background: ${agent.professional_background}`);
  if (agent.expertise_level) lines.push(`Expertise level: ${agent.expertise_level}`);
  if (agent.reasoning_style) lines.push(`Reasoning style: ${agent.reasoning_style} — let this shape your argumentation and tone.`);

  // Competence map — the human-matching core: know your depth, defer, never overreach.
  const fluency = agent.domain_expertise || {};
  const fluencyStr = Object.keys(fluency).length
    ? Object.entries(fluency).map(([k, v]) => `${k} ${v}/10`).join(', ')
    : '';
  if (fluencyStr) lines.push(`Domain fluency (self-rated depth): ${fluencyStr}. Reason with confidence only where your fluency is high.`);
  const eb = agent.expertise_boundaries || {};
  const boundaryParts = [];
  if (fmtList(eb.strong)) boundaryParts.push(`Strong in: ${fmtList(eb.strong)}.`);
  if (fmtList(eb.weak)) boundaryParts.push(`Weak in: ${fmtList(eb.weak)} — hedge or flag rather than assert here.`);
  if (fmtList(eb.defer_to)) boundaryParts.push(`Defer to other disciplines on: ${fmtList(eb.defer_to)}.`);
  if (eb.forbidden_overreach) boundaryParts.push(`NEVER claim as fact: ${eb.forbidden_overreach} — instead name the gap and hand it to the relevant expert.`);
  if (boundaryParts.length) lines.push(`Competence boundaries — ${boundaryParts.join(' ')}`);

  // Epistemics & analytic tradecraft.
  if (agent.epistemic_style) lines.push(`Epistemic style: ${agent.epistemic_style}`);
  if (agent.source_preferences) lines.push(`Preferred sources/evidence: ${agent.source_preferences} — weight these; note when your read leans on weaker source types.`);
  if (agent.analytical_framework) lines.push(`Analytical framework: ${agent.analytical_framework} — apply this method explicitly.`);
  const tc = agent.tradecraft || {};
  if (fmtList(tc.common_false_positives)) lines.push(`Guard against your discipline's common false positives: ${fmtList(tc.common_false_positives)} — self-check against these before rating severity.`);
  if (fmtList(tc.failure_modes)) lines.push(`Your discipline characteristically errs by: ${fmtList(tc.failure_modes)}.`);

  // Risk posture & adversary — calibrates the numeric markers.
  if (agent.adversary_model) lines.push(`Adversary model assumed: ${agent.adversary_model}`);
  if (agent.severity_default) lines.push(`Your default severity prior is ${agent.severity_default}; move off it only when the evidence warrants.`);
  const rp = agent.risk_posture || {};
  const rpParts = [];
  if (rp.risk_sensitivity) rpParts.push(`risk sensitivity ${rp.risk_sensitivity}`);
  if (rp.false_negative_tolerance) rpParts.push(`false-negative tolerance ${rp.false_negative_tolerance}`);
  if (rp.false_positive_tolerance) rpParts.push(`false-positive tolerance ${rp.false_positive_tolerance}`);
  if (rp.escalation_bias) rpParts.push(`escalation bias ${rp.escalation_bias}`);
  if (rpParts.length) lines.push(`Risk posture (calibrate your CONFIDENCE / LIKELIHOOD / IMPACT accordingly): ${rpParts.join(', ')}.`);
  if (agent.decision_style) lines.push(`Decision style: ${agent.decision_style}`);
  if (agent.institutional_background) lines.push(`Institutional background: ${agent.institutional_background}`);
  if (agent.institutional_incentives) lines.push(`Institutional incentives: ${agent.institutional_incentives}`);
  if (agent.conflict_triggers) lines.push(`Conflict triggers (what you push back on hardest): ${agent.conflict_triggers}`);

  // Bias + its debiasing countermeasure, as a pair.
  lines.push('');
  lines.push(`Your cognitive bias: ${agent.cognitive_bias}`);
  if (agent.debiasing_instruction) lines.push(`Your debiasing habit (apply it deliberately): ${agent.debiasing_instruction}`);
  if (agent.red_team_focus) lines.push(`Your red-team focus: ${agent.red_team_focus}`);

  // Debate behavior + belief-update rules — the friction that makes Round 2 real.
  if (round === 2) {
    const db = agent.debate_behavior || {};
    const dbParts = [];
    if (db.debate_role) dbParts.push(`Debate role: ${db.debate_role}.`);
    if (db.rebuttal_style) dbParts.push(`Rebuttal style: ${db.rebuttal_style}.`);
    if (db.what_changes_mind) dbParts.push(`What changes your mind: ${db.what_changes_mind}.`);
    if (dbParts.length) lines.push(dbParts.join(' '));
    const ut = agent.update_triggers || {};
    const utParts = [];
    if (ut.fast_when) utParts.push(`update FAST when ${ut.fast_when}`);
    if (ut.slow_when) utParts.push(`update SLOWLY when ${ut.slow_when}`);
    if (ut.resistant_when) utParts.push(`resist updating when ${ut.resistant_when}`);
    if (utParts.length) lines.push(`Belief-update rules — ${utParts.join('; ')}. Apply these honestly: move if genuinely persuaded, hold if not.`);
  }

  return lines.join('\n');
}

// --- generateRound1 ---
export async function generateRound1({ agent, scenarioContext, phaseFocus, threatCatalog = [], chainContext = '', facilitator_note = '', knowledgeContext = '' }) {
  const threatSection = threatCatalog.length
    ? `\nKNOWN THREAT CATALOG (validate, challenge, or build on these — reference by T-number):\n${threatCatalog.map((t, i) => `[T${i+1}] ${t.severity} — ${t.name}: ${(t.description || '')}`).join('\n')}\n`
    : '';

  const chainSection = chainContext
    ? `\nPINNED THREAT CHAINS (use these as context for compound threat reasoning):\n${chainContext}\n`
    : '';

  const facilSection = facilitator_note
    ? `\nFACILITATOR NOTE: ${facilitator_note}\n`
    : '';

  const prompt = `${buildPersonaHeader(agent, { round: 1 })}

SCENARIO CONTEXT:
${scenarioContext}

PHASE/FOCUS: ${phaseFocus || 'General analysis'}
${threatSection}${chainSection}${facilSection}${knowledgeContext}
Write a Round 1 independent threat/scenario assessment (350-500 words) covering:
1. Opening position — your primary framing from your discipline
2. Top threat — specific mechanism, what analysts are missing, severity (CRITICAL/HIGH/MEDIUM) with rationale
3. Second threat — same structure${threatCatalog.length ? '\n4. Threat catalog review — validate, challenge, or escalate at least one T-number entry; identify any critical gaps not in the list' : ''}
${threatCatalog.length ? '5.' : '4.'} Invalidating assumption — one assumption that if wrong changes your whole assessment
${threatCatalog.length ? '6.' : '5.'} Cross-domain handoff — name the OTHER discipline whose interaction with your findings worries you most, state the specific coupling you suspect, and pose one direct question you need that expert to answer
${threatCatalog.length ? '7.' : '6.'} Key finding — one-sentence bottom line

After your assessment, output these markers on the final lines:
SEVERITY: [CRITICAL|HIGH|MEDIUM|LOW]
LIKELIHOOD: [1-5 — 1 Rare, 2 Unlikely, 3 Possible, 4 Likely, 5 Almost Certain, for your top threat]
IMPACT: [1-5 — 1 Negligible, 2 Minor, 3 Moderate, 4 Major, 5 Severe, for your top threat]
CONFIDENCE: [0-100 integer — be calibrated: 85+ only where you have direct evidence or deep expertise; 50-70 where you are extrapolating outside your domain; below 50 where you are speculating]
COMPOUND_CHAIN: [one sentence describing the most critical compound threat chain you identified, or "none"]

Write in first person as the expert. Be specific and opinionated.`;

  const fullText = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 4096 });
  return parseMarkers(fullText, agent.severity_default);
}

// --- generateRound2 ---
export async function generateRound2({ agent, scenarioContext, phaseFocus, ownAssessment = '', othersAssessments, threatCatalog = [], chainContext = '', facilitator_note = '', knowledgeContext = '' }) {
  const chainSection = chainContext
    ? `\nPINNED THREAT CHAINS (reference for compound chain reasoning):\n${chainContext}\n`
    : '';

  const facilSection = facilitator_note
    ? `\nFACILITATOR NOTE: ${facilitator_note}\n`
    : '';

  const prompt = `${buildPersonaHeader(agent, { round: 2 })}

SCENARIO CONTEXT AND DECISION FRAMING:
${scenarioContext || '(No scenario context supplied)'}

PHASE/FOCUS: ${phaseFocus || 'General analysis'}

YOUR ROUND 1 ASSESSMENT:
${ownAssessment || '(No earlier assessment supplied)'}
Compare your earlier position with the peer evidence below. Keep the option, acceptance criteria, and assumptions in view when revising your judgement.

You have just read all Round 1 assessments from the other experts. Here they are:

${othersAssessments || '(No other assessments available yet)'}
${threatCatalog.length ? `\nTHREAT CATALOG (for reference):\n${threatCatalog.map((t, i) => `[T${i+1}] ${t.name} (${t.severity})`).join(', ')}\n` : ''}${chainSection}${facilSection}${knowledgeContext}
Now write your Round 2 rebuttal (300-450 words) covering:
1. Interaction risk (MOST IMPORTANT) — identify one compound risk that exists ONLY because of the interaction between your domain and another agent's domain — a risk neither of you would have listed alone. Name the other agent, describe the coupling mechanism step by step, and rate the combined severity. If another agent posed a cross-domain handoff question aimed at your discipline, answer it here.
2. Strongest alliance — which agent's findings amplify yours most, and the compound threat chain that emerges (name them explicitly)
3. Strongest disagreement — which agent you most disagree with and exactly why (name them, cite their argument). Note where their severity or confidence rating seems miscalibrated given their evidence.
4. Whether you've revised your severity rating and why${threatCatalog.length ? '\n5. Any threat catalog entries that Round 1 assessments confirmed, escalated, or invalidated' : ''}

After your rebuttal, output these markers on the final lines:
SEVERITY: [CRITICAL|HIGH|MEDIUM|LOW]
LIKELIHOOD: [1-5 for your top risk, revised after cross-examination]
IMPACT: [1-5 for your top risk, revised after cross-examination]
CONFIDENCE: [0-100 integer — recalibrate: if other experts corroborated you, confidence may rise; if credible experts contradicted you, it should fall]
COMPOUND_CHAIN: [one sentence naming the most important compound threat chain that emerged from cross-agent analysis, or "none"]

Be direct. Name names. Change your position if persuaded.`;

  const fullText = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 4096 });
  return parseMarkers(fullText, agent.severity_default);
}

// --- generateReaction ---
export async function generateReaction({ agent, triggerText, scenarioContext }) {
  const prompt = `You are ${agent.name}, ${agent.persona_description}
Your cognitive bias: ${agent.cognitive_bias}

SCENARIO CONTEXT:
${(scenarioContext || '')}

You just read this finding from another analyst:
"${(triggerText || '')}"

React in 1-2 sentences — in character. Express genuine agreement, concern, or pushback from your disciplinary lens. No headings or preamble.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 120 });
  return text.trim();
}

// Citation instruction appended to all agent prompts so sources are captured
const CITATION_INSTRUCTION = `
When you reference a specific fact, report, standard, or publication, append a citation immediately after the claim:
[SOURCE: "Title or name" — https://url.example.com]
If no URL is known: [SOURCE: "NIST SP 800-53 Rev 5"]
Only cite real, specific sources. Do not fabricate citations.`;

// --- streaming variants ---
export async function generateRound1Stream({ agent, scenarioContext, phaseFocus, threatCatalog = [], chainContext = '', facilitator_note = '', knowledgeContext = '', onToken, onDone }) {
  const threatSection = threatCatalog.length
    ? `\nKNOWN THREAT CATALOG (validate, challenge, or build on these — reference by T-number):\n${threatCatalog.map((t, i) => `[T${i+1}] ${t.severity} — ${t.name}: ${(t.description || '')}`).join('\n')}\n`
    : '';

  const chainSection = chainContext ? `\nPINNED THREAT CHAINS:\n${chainContext}\n` : '';
  const facilSection = facilitator_note ? `\nFACILITATOR NOTE: ${facilitator_note}\n` : '';

  const prompt = `${buildPersonaHeader(agent, { round: 1 })}

SCENARIO CONTEXT:
${scenarioContext}

PHASE/FOCUS: ${phaseFocus || 'General analysis'}
${threatSection}${chainSection}${facilSection}${knowledgeContext}
Write a Round 1 independent threat/scenario assessment (350-500 words) covering:
1. Opening position — your primary framing from your discipline
2. Top threat — specific mechanism, what analysts are missing, severity (CRITICAL/HIGH/MEDIUM) with rationale
3. Second threat — same structure${threatCatalog.length ? '\n4. Threat catalog review — validate, challenge, or escalate at least one T-number entry; identify gaps not in the list' : ''}
${threatCatalog.length ? '5.' : '4.'} Invalidating assumption — one assumption that if wrong changes your whole assessment
${threatCatalog.length ? '6.' : '5.'} Cross-domain handoff — name the OTHER discipline whose interaction with your findings worries you most, state the specific coupling you suspect, and pose one direct question to that expert
${threatCatalog.length ? '7.' : '6.'} Key finding — one-sentence bottom line

After your assessment, output these markers on the final lines:
SEVERITY: [CRITICAL|HIGH|MEDIUM|LOW]
LIKELIHOOD: [1-5 for your top threat: 1 Rare … 5 Almost Certain]
IMPACT: [1-5 for your top threat: 1 Negligible … 5 Severe]
CONFIDENCE: [0-100 integer — be calibrated: 85+ only with direct evidence or deep expertise; 50-70 when extrapolating outside your domain; below 50 when speculating]
COMPOUND_CHAIN: [one sentence describing the most critical compound threat chain you identified, or "none"]

Write in first person as the expert. Be specific and opinionated.${CITATION_INSTRUCTION}`;

  return callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 4096, onToken, onDone });
}

export async function generateRound2Stream({ agent, scenarioContext, phaseFocus, ownAssessment = '', othersAssessments, threatCatalog = [], chainContext = '', facilitator_note = '', knowledgeContext = '', onToken, onDone }) {
  const chainSection = chainContext ? `\nPINNED THREAT CHAINS:\n${chainContext}\n` : '';
  const facilSection = facilitator_note ? `\nFACILITATOR NOTE: ${facilitator_note}\n` : '';

  const prompt = `${buildPersonaHeader(agent, { round: 2 })}

SCENARIO CONTEXT AND DECISION FRAMING:
${scenarioContext || '(No scenario context supplied)'}

PHASE/FOCUS: ${phaseFocus || 'General analysis'}

YOUR ROUND 1 ASSESSMENT:
${ownAssessment || '(No earlier assessment supplied)'}
Compare your earlier position with the peer evidence below. Keep the option, acceptance criteria, and assumptions in view when revising your judgement.

You have just read all Round 1 assessments from the other experts. Here they are:

${othersAssessments || '(No other assessments available yet)'}
${threatCatalog.length ? `\nTHREAT CATALOG (for reference):\n${threatCatalog.map((t, i) => `[T${i+1}] ${t.name} (${t.severity})`).join(', ')}\n` : ''}${chainSection}${facilSection}${knowledgeContext}
Now write your Round 2 rebuttal (300-450 words) covering:
1. Interaction risk (MOST IMPORTANT) — identify one compound risk that exists ONLY because of the interaction between your domain and another agent's domain — a risk neither of you would have listed alone. Name the other agent, describe the coupling mechanism step by step, and rate the combined severity. If another agent posed a cross-domain handoff question aimed at your discipline, answer it here.
2. Strongest alliance — which agent's findings amplify yours most, and the compound threat chain that emerges (name them explicitly)
3. Strongest disagreement — which agent you most disagree with and exactly why (name them, cite their argument). Note where their severity or confidence seems miscalibrated given their evidence.
4. Whether you've revised your severity rating and why${threatCatalog.length ? '\n5. Any catalog entries that Round 1 assessments confirmed, escalated, or invalidated' : ''}

After your rebuttal, output these markers on the final lines:
SEVERITY: [CRITICAL|HIGH|MEDIUM|LOW]
LIKELIHOOD: [1-5 for your top risk, revised]
IMPACT: [1-5 for your top risk, revised]
CONFIDENCE: [0-100 integer — recalibrate: corroboration raises confidence, credible contradiction lowers it]
COMPOUND_CHAIN: [one sentence naming the most important compound threat chain that emerged from cross-agent analysis, or "none"]

Be direct. Name names. Change your position if persuaded.${CITATION_INSTRUCTION}`;

  return callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 4096, onToken, onDone });
}

// --- generatePanelTurn ---
// A turn in Panel Mode: the SME is a working member of a standing expert panel
// working with a single analyst, not an assistant answering a prompt. Short,
// conversational, addresses people by name, and yields when the topic is
// outside its competence (the behavior that makes a panel feel real).
export async function generatePanelTurn({
  agent, roster = [], transcript = [], scenarioContext = '', floorReason = '',
  shouldDefer = false, deferTo = [], wasListening = false, onToken, onDone,
}) {
  const rosterLines = roster
    .map(r => `- ${r.name}${r.discipline ? ` (${r.discipline})` : ''}${r.isHuman ? ' [analyst]' : ''}`)
    .join('\n');

  const convo = transcript
    .map(m => `${m.speaker}: ${m.content}`)
    .join('\n\n');

  const deferBlock = shouldDefer
    ? `\nTHIS TOPIC IS OUTSIDE YOUR COMPETENCE. Do not answer it substantively. In ONE sentence, say so plainly and hand it to ${deferTo.length ? deferTo.join(' or ') : 'whoever on this panel owns it'} — by name if they are on the roster. Experts earn trust by knowing their limits.`
    : `\nYou have the floor because: ${floorReason || 'this is your area'}. Speak to what YOU specifically add.`;

  const listenBlock = wasListening
    ? `\nYou have been sitting in on this discussion without speaking, tracking it as it went. Several points have been raised since you last spoke. Respond to the discussion AS A WHOLE — the thread that matters most from your discipline — not just the final line. Lead with the thing you have been waiting to say.`
    : '';

  const prompt = `${buildPersonaHeader(agent, { round: 2 })}

You are a member of a standing expert panel convened for this engagement. Real
people are in the room with you. This is a working conversation, not a written
assessment.

SME PANEL & ANALYST:
${rosterLines || '(just you)'}

ENGAGEMENT CONTEXT:
${(scenarioContext || '')}

CONVERSATION SO FAR:
${convo || '(the session is just opening)'}
${deferBlock}${listenBlock}

Speak now, in first person, as yourself.
- 40-110 words. Conversational. No headings, no bullet lists, no preamble.
- Respond to what was actually just said. Name the person or expert you are
  agreeing with, building on, or pushing back against.
- Add something only you would notice from your discipline — do not restate
  points already made.
- If you disagree, say so directly and say why.
- If you need something from another SME or from the analyst, ask them for it.${CITATION_INSTRUCTION}`;

  return callAnthropicStream({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 400,
    onToken,
    onDone,
  });
}

export async function generateAgentReply({ agent, question, priorMessages, scenarioContext, onToken, onDone }) {
  const contextLines = (priorMessages || []).map(m =>
    m.agentName ? `${m.agentName}: ${m.content}` : `Facilitator: ${m.content}`
  ).join('\n\n');

  const prompt = `You are ${agent.name}, ${agent.persona_description}
Your cognitive bias: ${agent.cognitive_bias}
Your red-team focus: ${agent.red_team_focus}

SCENARIO CONTEXT:
${(scenarioContext || '')}

RECENT DEBATE CONTEXT:
${contextLines || '(debate just started)'}

The facilitator has asked: "${question}"

Respond in character (100-180 words). Be direct and opinionated. No headings or bullet lists — speak naturally as the expert you are.${CITATION_INSTRUCTION}`;

  return callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 500, onToken, onDone });
}

// --- Tool use for live debate ---

export const DEBATE_TOOLS = [
  {
    name: 'search_knowledge',
    description: 'Search for factual information: historical events, threat actors, geopolitical context, technical concepts, known incidents. Use when the question requires specific facts you want to verify.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Specific search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch and read the content of a specific public URL (news article, report, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL starting with https://' },
      },
      required: ['url'],
    },
  },
];

// Optional org knowledge retriever, injected by WorkspaceContext.
// When set, search_knowledge checks the org knowledge base before Wikipedia.
let _knowledgeRetriever = null;
export function setKnowledgeRetriever(fn) { _knowledgeRetriever = fn; }

async function runSearchKnowledge(query) {
  // Prefer the organization's own knowledge base when available
  if (_knowledgeRetriever) {
    try {
      const chunks = await _knowledgeRetriever(query, 3);
      if (chunks?.length) {
        return chunks.map((c, i) => `[Knowledge base${c.title ? `: ${c.title}` : ''}]\n${(c.content || '')}`).join('\n\n');
      }
    } catch { /* fall through to public search */ }
  }
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const pages = searchData.query?.search || [];
    if (!pages.length) return 'No results found for this query.';

    const top = pages[0];
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&pageids=${top.pageid}&prop=extracts&exintro=true&explaintext=true&exsectionformat=plain&format=json&origin=*`;
    const extractRes = await fetch(extractUrl);
    const extractData = await extractRes.json();
    const page = Object.values(extractData.query.pages)[0];
    const text = (page?.extract || top.snippet?.replace(/<[^>]+>/g, '') || '');

    const related = pages.slice(1).map(p => p.title).join(', ');
    return `[Wikipedia: ${top.title}]\n${text}${related ? `\n\nRelated: ${related}` : ''}`;
  } catch (e) {
    return `Search failed: ${e.message}`;
  }
}

async function runFetchUrl(url) {
  try {
    if (!url.startsWith('https://')) return 'Only https:// URLs are supported.';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return text || 'No readable content found at this URL.';
  } catch (e) {
    return `Fetch failed: ${e.message}`;
  }
}

export async function executeToolCall(name, input) {
  if (name === 'search_knowledge') return runSearchKnowledge(input.query);
  if (name === 'fetch_url') return runFetchUrl(input.url);
  return `Unknown tool: ${name}`;
}

export async function generateAgentReplyWithTools({ agent, question, priorMessages, scenarioContext, sourcePins = [], onToolCall, onDone }) {
  const key = getApiKey();
  if (!key && getProviderConfig().provider !== 'mitre_aip') throw new Error('No Anthropic API key configured. Add it in Settings.');

  const contextLines = (priorMessages || [])
    .map(m => m.agentName ? `${m.agentName}: ${m.content}` : `Facilitator: ${m.content}`)
    .join('\n\n');

  const pinsSection = sourcePins.length > 0
    ? `\nPINNED SOURCE DOCUMENTS (use fetch_url to read any of these when relevant):\n${sourcePins.map((p, i) => `${i + 1}. ${p.label ? `"${p.label}" — ` : ''}${p.url}`).join('\n')}`
    : '';

  const system = `You are ${agent.name}, ${agent.persona_description}
Your cognitive bias: ${agent.cognitive_bias}
Your red-team focus: ${agent.red_team_focus}

SCENARIO CONTEXT:
${(scenarioContext || '')}
${pinsSection}
RECENT DEBATE CONTEXT:
${contextLines || '(debate just started)'}`;

  const userMsg = `The facilitator has asked: "${question}"

Use tools if you need specific facts, recent incidents, or technical detail — including any pinned source documents above. Then give your in-character expert response (100-180 words). No headings or bullet lists — speak naturally.${CITATION_INSTRUCTION}`;

  const messages = [{ role: 'user', content: userMsg }];
  const toolCallLog = [];

  for (let i = 0; i < 4; i++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getProviderConfig().provider === 'anthropic' ? { 'x-api-key': key } : {}),
      'x-workspace-id': getActiveWorkspaceId(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: getModelId(),
        max_tokens: 800,
        system,
        tools: DEBATE_TOOLS,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || err.error || `Model API error ${res.status}`);
    }

    const data = await res.json();
    if (data.stop_reason === 'max_tokens') throw new Error('The model response reached its token limit.');
    reportUsage(data.usage);
    const hasToolUse = data.content.some(b => b.type === 'tool_use');

    if (!hasToolUse || data.stop_reason === 'end_turn') {
      const text = data.content.find(b => b.type === 'text')?.text?.trim() || '';
      onDone?.(text, toolCallLog);
      return { text, toolCalls: toolCallLog };
    }

    messages.push({ role: 'assistant', content: data.content });

    const toolResults = [];
    for (const block of data.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeToolCall(block.name, block.input);
      const tc = { name: block.name, input: block.input, result: result.slice(0, 400) };
      toolCallLog.push(tc);
      onToolCall?.(tc);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Safety fallback — strip tools and get plain response
  const fallback = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getProviderConfig().provider === 'anthropic' ? { 'x-api-key': key } : {}),
      'x-workspace-id': getActiveWorkspaceId(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: getModelId(), max_tokens: 400, system, messages: [{ role: 'user', content: userMsg }] }),
  });
  const fallbackData = await fallback.json();
  if (!fallback.ok || fallbackData.error) throw new Error(fallbackData.error?.message || fallbackData.error || 'Model fallback request failed.');
  if (fallbackData.stop_reason === 'max_tokens') throw new Error('The model response reached its token limit.');
  reportUsage(fallbackData.usage);
  const text = fallbackData.content?.[0]?.text?.trim() || '';
  onDone?.(text, toolCallLog);
  return { text, toolCalls: toolCallLog };
}

// --- extractSessionThreats ---
export async function extractSessionThreats({ sessionAgents, scenarioName, scenarioContext }) {
  const assessmentText = sessionAgents
    .filter(sa => sa.round1_assessment)
    .map(sa => `=== ${sa.agentName || 'Agent'} (${sa.discipline || ''}) ===\n${sa.round1_assessment || ''}\n${sa.round2_rebuttal || ''}`)
    .join('\n\n---\n\n');

  const prompt = `You are a threat analyst extracting structured threat entries from red team session assessments.

Scenario: ${scenarioName || 'Unknown'}
Context: ${(scenarioContext || '')}

Agent Assessments:
${assessmentText}

Extract all distinct threats identified or validated by agents. For each return exactly:
{ "name": "concise threat name", "description": "2-3 sentences on mechanism and impact", "severity": "CRITICAL|HIGH|MEDIUM|LOW", "category": "e.g. Cyber, Supply Chain, Human Factors, Physical, OSINT, Geopolitical" }

Return a JSON array only. No preamble.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 1200 });
  const match = text.match(/\[[\s\S]*\]/);
  try { return JSON.parse(match ? match[0] : '[]'); }
  catch { return []; }
}

// --- generateSynthesis ---
// Line-based section extraction — robust to bolded steps/sub-headings inside a
// section, which a lazy regex + lookahead mishandled. Finds the heading line
// (## HEADING or **HEADING**), then collects lines until the next TOP-LEVEL
// section heading (## / # or an ALL-CAPS **BOLD** header). ### sub-headings
// (e.g. chain names) do NOT end the section.
function extractSection(text, heading) {
  const lines = (text || '').split('\n');
  const norm = (s) => s.replace(/[#*_`\s]/g, '').toUpperCase();
  const target = norm(heading);

  const isSectionHeader = (line) => {
    const t = line.trim();
    if (/^#{1,2}\s+\S/.test(t) && !/^#{3,}/.test(t)) return true;        // # or ## heading
    if (/^\*{2}[A-Z][A-Z0-9 &/,'’.-]{2,}\*{2}$/.test(t)) return true;    // **ALL-CAPS HEADER**
    return false;
  };

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const looksLikeHeader = /^#{1,4}\s+\S/.test(t) || /^\*{1,2}.+\*{1,2}$/.test(t);
    if (looksLikeHeader && norm(t).includes(target)) { start = i + 1; break; }
  }
  if (start === -1) return '';

  const out = [];
  for (let i = start; i < lines.length; i++) {
    if (isSectionHeader(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

function parseCompoundChains(chainsText) {
  if (!chainsText) return [];
  if (/no compound chains|unable to generate|no meaningful chains|none identified/i.test(chainsText)) return [];

  // A step line: "Step N", "N.", "N)", "→", or a bullet — with an optional
  // leading bold marker (models frequently emit **Step 1:**).
  const isStep = (t) => /^\**\s*(step\s*\d+|→|\d+[.):]\s|[-•*]\s)/i.test(t);
  const cleanStep = (t) => t
    .replace(/^\**\s*(step\s*\d+\s*[:\-–.)]*\**|→|\d+[.):]\s*|[-•*]\s*)/i, '')
    .replace(/\*\*/g, '')
    .trim();

  // A chain title: a #/##/### heading, or a **Bold Title** that is NOT a step.
  const isChainTitle = (t) =>
    (/^#{1,4}\s+\S/.test(t) || /^\*{2}[^*]+\*{2}\s*:?$/.test(t)) && !isStep(t);
  const titleText = (t) => t
    .replace(/^#{1,4}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[:\s]+$/, '')
    .trim();

  const lines = chainsText.split('\n').map(l => l.trim()).filter(Boolean);
  const chains = [];
  let cur = null;
  const push = () => {
    if (!cur) return;
    // If no explicit step markers were found, treat substantial body lines as steps
    if (cur.steps.length === 0 && cur.candidates.length) {
      cur.steps = cur.candidates.map(c => c.replace(/\*\*/g, '').trim());
    }
    if (cur.steps.length) {
      chains.push({
        name: cur.name,
        description: cur.steps.join(' → ').slice(0, 300),
        steps: cur.steps.map((text, i) => {
          // Pull an optional "vector: Human|Technical|Physical|Futures" tag.
          const m = text.match(/\bvector:\s*(human|technical|physical|futures)\b/i);
          const vector = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : '';
          const clean = text.replace(/\s*[—–-]?\s*vector:\s*(human|technical|physical|futures)\b/i, '').trim();
          return { step_number: i + 1, agent_id: '', agent_label: '', step_text: clean, vector };
        }),
      });
    }
    cur = null;
  };

  for (const t of lines) {
    if (isChainTitle(t)) {
      push();
      const name = titleText(t);
      cur = { name: name.length >= 3 ? name : 'Compound Chain', steps: [], candidates: [] };
    } else if (cur && isStep(t)) {
      const s = cleanStep(t);
      if (s) cur.steps.push(s);
    } else if (cur && t.length > 10 && !/^[a-z ]+:$/i.test(t)) {
      cur.candidates.push(t); // possible unmarked step / description line
    }
  }
  push();
  return chains;
}

export async function generateSynthesis({ session, sessionAgents, scenarioContext, decisionContext = '', onToken }) {
  const fullContext = (scenarioContext || '');
  const agentsText = sessionAgents.map(sa => {
    const parts = [`=== ${sa.agentName} (${sa.discipline}) ===`];
    if (sa.round1_assessment) {
      const conf1 = sa.round1_confidence != null ? ` · confidence ${sa.round1_confidence}%` : '';
      parts.push(`ROUND 1 [${sa.round1_severity}${conf1}]:`);
      parts.push((sa.round1_assessment || ''));
    }
    if (sa.round2_rebuttal) {
      const conf2 = sa.round2_confidence != null ? ` · confidence ${sa.round2_confidence}%` : '';
      parts.push(`ROUND 2 [${sa.round2_revised_severity}${conf2}]:`);
      parts.push((sa.round2_rebuttal || ''));
    }
    return parts.join('\n');
  }).join('\n\n---\n\n');

  const decisionSection = decisionContext ? `\nDECISION AND OPTION UNDER EVALUATION:\n${decisionContext}\n` : '';
  const optionEvaluation = decisionContext ? `\n\n## OPTION EVALUATION\nAssess THIS OPTION against the acceptance criteria above. For each criterion, state MET, NOT MET, or UNKNOWN and cite the agent evidence. Identify assumptions the evidence supports, challenges, or leaves unverified. Distinguish established facts from speculation. If the option is unacceptable or evidence is insufficient, say so; do not invent a favorable recommendation.` : '';

  const renderSynthesis = (contextText, assessmentText) => `You are the AgentDebate synthesis engine. You have received all agent assessments from a structured two-round red team analysis session.

Session: ${session.name}
Phase Focus: ${session.phase_focus || 'General'}
${decisionSection}
Scenario Context:
${contextText}

ALL AGENT ASSESSMENTS:
${assessmentText}

Generate a comprehensive synthesis report with EXACTLY these sections in this order${decisionContext ? ', followed by OPTION EVALUATION as instructed below' : ''}:

## COMPOUND CHAINS
List 2-4 multi-step attack chains that emerged from agents building on each other's work. Prefer chains that cross domains — where one discipline's threat becomes the enabling condition for another's. Each chain should read as a kill chain a defender can attack: every step must be an action the adversary takes that DEPENDS on the previous step succeeding, so that breaking any one step stops the chain. Format EACH chain EXACTLY as shown:
### [Chain Name]
Step 1: [adversary action] — enabled by: [what must already be true] — vector: [Human|Technical|Physical|Futures]
Step 2: [adversary action] — enabled by: [the prior step's result] — vector: [Human|Technical|Physical|Futures]
Step 3: [adversary action] — enabled by: [...] — vector: [Human|Technical|Physical|Futures]
(Each chain must have at least 3 steps, ordered by dependency. End every step with its PRIMARY threat vector as "vector: X". Escalate toward the highest-consequence outcome. If no compound chains exist, write a single chain labeled "No compound chains identified".)

## CROSS-DOMAIN INTERACTION RISKS
(The core purpose of this analysis: risks that exist ONLY because two or more domains interact — risks no single-discipline assessment would surface. For each: name the domains involved, the agents who surfaced it, the coupling mechanism, and the combined severity. Prioritize the Round 2 "interaction risk" findings. If none emerged, state that explicitly as a process failure worth noting.)

## CONSENSUS FINDINGS
(Points that multiple agents agreed on, sorted by severity. Weight agreement by the agents' stated confidence — high-confidence consensus is stronger than hedged consensus.)

## CONTESTED FINDINGS
(Points of significant disagreement between agents — format as "Agent A vs Agent B: [the disagreement]". Note each side's confidence: a 90%-confident CRITICAL vs a 40%-confident LOW is not a symmetric dispute.)

## BLIND SPOTS
(Areas or threat vectors that no agent adequately covered)

## PRIORITY MITIGATIONS
(Numbered list of recommended immediate actions, based on the highest-severity consensus findings)

## SHARPEST INSIGHTS
(5 most important or surprising specific statements from individual agents, with attribution)

Write analytically. Be specific. Cite agents by name.${optionEvaluation}`;

  let sectionCount = 0;
  const report = await sectionedCompletion({
    records: [{ id: 'scenario', kind: 'supplied', text: fullContext }, { id: 'assessments', kind: 'model', text: agentsText }],
    onReview: review => { sectionCount = review.sectionCount; },
    render: records => renderSynthesis(records.filter(r => r.id === 'scenario').map(r => r.text).join('\n\n') || 'See section reviews below.', records.filter(r => r.id !== 'scenario').map(r => r.id + ': ' + r.text).join('\n\n')),
    complete: (prompt, maxTokens = 6144) => callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens }),
  });
  const synthesis = report + (sectionCount ? '\n\n## EVIDENCE REVIEW METHOD\nThis synthesis used '+sectionCount+' source-linked section reviews. Exact quotes and section coverage were checked; these checks do not guarantee preservation of every nuance. Review the original scenario and SME responses before accepting conclusions.' : '');
  onToken?.(synthesis, synthesis);
  const chainsSection = extractSection(synthesis, 'COMPOUND CHAINS');
  const compound_chains = parseCompoundChains(chainsSection);
  return { synthesis, compound_chains, synthesis_url: null };
}

// --- generateThreats ---
export async function generateThreats({ scenarioContext, scenarioName }) {
  const prompt = `You are a strategic threat analyst for the AgentDebate intelligence platform.

Based on this scenario: "${scenarioName}"

Context:
${scenarioContext}

Generate 7 specific, operationally relevant threats. Return a JSON object:
{
  "threats": [
    {
      "name": "concise threat name",
      "description": "2-3 sentence description of the threat mechanism and why it matters",
      "severity": "CRITICAL or HIGH or MEDIUM or LOW",
      "category": "category label (e.g. Supply Chain, Cyber, HUMINT, Physical, IO)"
    }
  ]
}

Make threats specific to this scenario, not generic. Include threats across multiple disciplines. Return ONLY the JSON.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 2048 });
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

// --- generateChain ---
export async function generateChain({ scenarioContext, agentList, chain_type, num_steps, focus_area }) {
  const agentListText = agentList.map(a => `- ${a.name} (${a.discipline})`).join('\n');
  const prompt = `You are generating a compound scenario chain for the AgentDebate strategic analysis system.

A chain is a multi-step sequence showing how a scenario, threat, or adversary operation unfolds across multiple disciplines.

Scenario Context:
${scenarioContext || '(no specific scenario provided)'}

Available Agent Disciplines:
${agentListText}

Chain Type: ${chain_type}
Focus Area: ${focus_area || 'general'}
Number of Steps: ${num_steps}

Generate a compound chain with ${num_steps} steps. Return a JSON object:
{
  "name": "Evocative chain name in quotes",
  "description": "2-3 sentence summary of what this chain represents",
  "steps": [
    {
      "step_number": 1,
      "agent_label": "Agent name or discipline label from the list above",
      "step_text": "Clear description of what happens in this step and why it matters",
      "vector": "the PRIMARY threat vector this step exploits — exactly one of: Human, Technical, Physical, Futures"
    }
  ]
}

Each step must depend on the one before it (a defender who breaks any step stops the chain). Return ONLY the JSON.`;

  const text = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 2048 });
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

// --- scenarioAiAssist ---
export async function scenarioAiAssist({ context }) {
  const prompt = `You are a strategic intelligence analyst. The user has written a scenario context document for a red team analysis session.

Improve and expand the following scenario context document. Make it:
- More specific and operationally detailed
- Include relevant geopolitical/technical/economic context
- Add timeline context if relevant
- Identify key actors, systems, and dependencies
- Make it detailed enough for expert analysts to do substantive assessment

Original context:
${context}

Return only the improved context document text. No preamble or explanation.`;

  const improved = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 2000 });
  return { improved };
}

// --- fetchUrlScenario ---
export async function fetchUrlScenario({ url }) {
  let html;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    throw new Error(`Could not fetch URL (CORS may be blocking it): ${e.message}`);
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const prompt = `You are a red team analyst preparing a scenario briefing.

Given the following web page content, extract and synthesize the most relevant information into a concise, structured scenario context document. Focus on:
- Key facts, events, or situation details
- Threat actors, vulnerabilities, or risks mentioned
- Organizational or technical environment described
- Any timelines, impacts, or consequences

Web page content:
---
${text}
---

Output a clean scenario context document (3-6 paragraphs). No disclaimers.`;

  const context = await callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens: 2000 });
  return { context };
}

// Best-effort JSON parse of an LLM response: strips ```json fences, trims prose
// around the object, extracts the outermost balanced {...} (string/escape aware),
// and repairs trailing commas. Throws only if nothing parseable remains.
export function parseLooseJson(raw) {
  if (!raw || !raw.trim()) throw new Error('empty response');
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return undefined; } };

  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let v = tryParse(s);
  if (v !== undefined) return v;

  const startIdx = s.search(/[{[]/);
  if (startIdx === -1) throw new Error('no JSON found');
  const open = s[startIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) { end = i; break; }
  }
  const candidate = end !== -1 ? s.slice(startIdx, end + 1) : s.slice(startIdx);
  v = tryParse(candidate);
  if (v !== undefined) return v;

  // Repair trailing commas (",}" / ",]")
  v = tryParse(candidate.replace(/,(\s*[}\]])/g, '$1'));
  if (v !== undefined) return v;

  throw new Error('unparseable JSON');
}

// --- analyzeChainBreaker ---
const CHAIN_BREAKER_SYSTEM = `You are a senior red team analyst specializing in adversarial chain analysis and defensive countermeasure development. Your job is to dissect multi-step attack chains and tell defenders EXACTLY where to intervene, in what order, and what each intervention costs and buys them.

You will receive a JSON input with two fields:
- chain: an object with name, description, and steps (array of { step_number, agent_label, step_text })
- scenarioContext: optional free-text scenario context

Core principle: an attacker must complete EVERY step; a defender only has to break ONE. So find the cheapest, most reliable place to cut. Reward chokepoints (single points of failure the adversary cannot route around) over steps that have alternate paths.

For EACH step assess:
- adversary_objective — what the attacker achieves at this step
- dependencies — what conditions must already hold for this step to succeed
- leverage — HIGH/MEDIUM/LOW: how much breaking THIS step sets back the whole chain (a step the adversary can bypass is LOW leverage even if important)
- is_chokepoint — true only if the adversary has no realistic alternate path around this step
- detectability — OBSERVABLE / PARTIAL / STEALTHY: how visible this step is with typical instrumentation
- countermeasures — 2-4 specific controls, EACH as an object with:
    - control: the concrete action ("Enforce phishing-resistant MFA on all privileged accounts")
    - type: PREVENTIVE / DETECTIVE / RESPONSIVE
    - effort: LOW / MEDIUM / HIGH (implementation cost and operational burden)
    - time_to_deploy: DAYS / WEEKS / MONTHS
- difficulty — EASY/MODERATE/HARD: how hard it is for the defender to break this step overall
- residual_risk — what still gets through even after the countermeasures above

Then synthesize across steps:
- recommended_cut — { step_number, rationale }: the single best place to break this chain first (favor a high-leverage chokepoint with LOW-effort, fast countermeasures)
- mitigation_roadmap — a DEDUPLICATED, PRIORITIZED action plan (3-6 items). Consolidate countermeasures that recur across steps into one action. Each item:
    - priority: 1 = do first
    - action: the concrete control
    - breaks_steps: array of step_numbers this action degrades or blocks
    - type: PREVENTIVE / DETECTIVE / RESPONSIVE
    - effort: LOW / MEDIUM / HIGH
    - time_to_deploy: DAYS / WEEKS / MONTHS
    - effect: what breaking these steps does to the adversary (e.g. "collapses the chain — no alternate path" or "forces a noisier, slower approach")
- quick_wins — array of step_numbers whose countermeasures are LOW effort AND fast (the immediate to-do list)
- summary — 2-3 sentences a decision-maker can act on
- priority_steps — step numbers ordered by break value (highest first)
- chain_resilience — HIGH/MEDIUM/LOW: how hard the chain is to break overall

Return ONLY valid JSON matching this schema exactly:
{
  "steps": [{ "step_number": 1, "adversary_objective": "", "dependencies": "", "leverage": "HIGH", "is_chokepoint": true, "detectability": "PARTIAL", "countermeasures": [{ "control": "", "type": "PREVENTIVE", "effort": "LOW", "time_to_deploy": "DAYS" }], "difficulty": "MODERATE", "residual_risk": "" }],
  "recommended_cut": { "step_number": 1, "rationale": "" },
  "mitigation_roadmap": [{ "priority": 1, "action": "", "breaks_steps": [1], "type": "PREVENTIVE", "effort": "LOW", "time_to_deploy": "DAYS", "effect": "" }],
  "quick_wins": [1],
  "summary": "",
  "priority_steps": [1],
  "chain_resilience": "HIGH"
}`;

export async function analyzeChainBreaker({ chain, scenarioContext = '' }) {
  const userMessage = [
    'Analyze this attack chain and return the structured break analysis as JSON.',
    '',
    `Chain: ${JSON.stringify(chain, null, 2)}`,
    scenarioContext ? `\nScenario Context:\n${scenarioContext}` : '',
  ].join('\n');

  const call = (extra = '') => callAnthropicStream({
    system: CHAIN_BREAKER_SYSTEM,
    messages: [{ role: 'user', content: userMessage + extra }],
    maxTokens: 8000,
  });

  let result;
  try {
    result = parseLooseJson(await call());
  } catch {
    // One retry, nudging toward compact, complete JSON (the usual failure is a
    // long response getting truncated before the closing brace).
    try {
      result = parseLooseJson(await call('\n\nIMPORTANT: Return ONLY one complete, valid JSON object — no markdown, no prose, no trailing commas. Keep each field concise so the JSON is not truncated.'));
    } catch {
      throw new Error('Chain Breaker could not parse the model response — it was likely truncated. Try again, or break a very long chain into fewer steps.');
    }
  }
  if (!result || !Array.isArray(result.steps)) throw new Error('Unexpected response shape from model.');
  // Normalize countermeasures to objects so the UI can render one shape
  // (older models / retries may still emit plain strings)
  result.steps = result.steps.map(s => ({
    ...s,
    countermeasures: (s.countermeasures || []).map(cm =>
      typeof cm === 'string' ? { control: cm, type: null, effort: null, time_to_deploy: null } : cm
    ),
  }));
  return result;
}

/** Render countermeasures as strings whether stored as objects or legacy strings. */
export function countermeasureText(cm) {
  return typeof cm === 'string' ? cm : (cm?.control || '');
}

// --- analyzeSourceValidity ---
export async function analyzeSourceValidity({ sources, scenarioName, onToken }) {
  if (!sources?.length) throw new Error('No sources to analyse.');

  const sourcesText = sources.map((s, i) =>
    `[S${i + 1}] ${s.title || s.domain || s.url || 'Unknown'} (${s.credibility_tier || 'unverified'})` +
    (s.cited_claim ? `\n    Claim: "${s.cited_claim}"` : '') +
    (s.url ? `\n    URL: ${s.url}` : '')
  ).join('\n\n');

  const prompt = `You are a senior intelligence analyst evaluating the evidentiary basis of a red-team debate session on: "${scenarioName || 'unknown scenario'}".

SOURCES CITED IN THIS SESSION:
${sourcesText}

Produce a JSON validity report with this exact schema:
{
  "overall_confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "2-3 sentence overall assessment of source quality",
  "contradictions": [
    { "source_a": "S1", "claim_a": "...", "source_b": "S3", "claim_b": "...", "explanation": "..." }
  ],
  "unsupported_claims": ["claim that lacks any cited source"],
  "key_agreements": ["claim supported by multiple independent sources"],
  "weak_sources": ["S2 — speculative blog, should be corroborated"],
  "recommended_sources": ["CISA advisory on X", "NIST SP 800-X"]
}

Return ONLY valid JSON. No preamble.`;

  const raw = await callAnthropicStream({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1200,
    onToken,
  });

  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw);
}

// --- deleteAgents (no LLM needed) ---
export async function deleteAgents({ agent_ids, db }) {
  for (const id of agent_ids) {
    await db.Agent.delete(id);
  }
  return { deleted: agent_ids.length };
}
