import { sectionedCompletion } from './sectionedCompletion.js';
// Runs a decision's panel end to end and writes the reasoned assessment.
//
// For every option of a decision this creates a Decision-Focus session, drives
// Round 1 → Round 2 → Synthesis with the same prompts and persistence the
// session workspace uses, then asks the model to compare the options and
// recommend one with evidence. The assessment is stored in the AppConfig KV
// store (key dec_assess_{decisionId}) alongside the panel setup
// (dec_setup_{decisionId}) so a re-run starts from the same scenario and bench.

import {
  generateRound1, generateRound2, generateSynthesis,
  callAnthropicStream, parseLooseJson,
} from './llm.js';
import { buildDecisionFraming } from './decisionContext.js';
import { retrieveKnowledge, formatKnowledgeContext } from './knowledge.js';
import { saveTurnSources } from './sources.js';
import { aggregateSessionRisk } from './risk.js';
import { sessionResumePlan } from './runState.js';
import { normalizeAssessment } from './decisionAssessment.js';
export { normalizeAssessment, resolveOptionId } from './decisionAssessment.js';

export const assessmentKey = (decisionId) => `dec_assess_${decisionId}`;
export const setupKey      = (decisionId) => `dec_setup_${decisionId}`;

// KV helpers live in lib/appConfigKV; re-exported so existing imports keep working.
export { readKV, writeKV, deleteKV } from './appConfigKV.js';

// ── One option = one full session ─────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function othersTextFor(sa, sessionAgents, agentById) {
  return sessionAgents
    .filter(o => o.agent_id !== sa.agent_id && o.round1_assessment)
    .map(o => {
      const a = agentById[o.agent_id];
      const conf = o.round1_confidence != null ? ` · confidence ${o.round1_confidence}%` : '';
      return `=== ${a?.name} (${a?.discipline}) [${o.round1_severity || '?'}${conf}] ===\n${o.round1_assessment}`;
    }).join('\n\n');
}

/**
 * Create (or resume) and fully run one Decision-Focus session for `option`.
 * onProgress({ stage, agentIndex, agentTotal }) fires as work advances;
 * shouldCancel() is polled between agents and throws 'Cancelled' when true.
 * `resume` = { session, sessionAgents } continues an interrupted session
 * (R-N10): stuck statuses are healed, finished agents and an existing
 * synthesis are skipped. Returns { session, sessionAgents, synthesis }.
 */
export async function runOptionSession({
  db, decision, option, assumptions = [], scenario, agents = [], threats = [], chains = [],
  onProgress = () => {}, shouldCancel = () => false, resume = null,
  onCheckpoint = null, knowledgeOverride, analysisName, phaseFocusOverride, analysisJobId,
}) {
  const framing = buildDecisionFraming(decision, option, assumptions);
  const scenarioContext = framing + (scenario?.context_document || '');
  const phaseFocus = phaseFocusOverride || 'Decision option evaluation';
  const agentById = Object.fromEntries(agents.map(a => [a.id, a]));

  let session;
  let sessionAgents = [];
  if (resume?.session) {
    session = resume.session;
    // Always resume from the database rows, not from whatever the page had
    // cached; a truncated or stale list would otherwise "complete" the session
    // with no agents in it.
    const fresh = await db.SessionAgent.filter({ session_id: session.id });
    sessionAgents = (fresh || []).map(({ agent: _a, ...sa }) => sa);
    if (onCheckpoint) {
      for (const agent of agents) if (!sessionAgents.some(sa => sa.agent_id === agent.id)) sessionAgents.push(await db.SessionAgent.create({ session_id: session.id, agent_id: agent.id, status: 'pending' }));
    }
    if (!sessionAgents.length) {
      throw new Error(`The unfinished session for "${option.name}" has no agents on record, so it cannot be resumed. Re-run everything to start it fresh.`);
    }
    const { resets } = sessionResumePlan('round1', sessionAgents);
    for (const r of resets) {
      await db.SessionAgent.update(r.id, { status: r.status });
      sessionAgents = sessionAgents.map(s => s.id === r.id ? { ...s, status: r.status } : s);
    }
    // The resumed session's bench is whatever it was created with.
    for (const sa of sessionAgents) if (!agentById[sa.agent_id]) {
      const a = (await db.Agent.filter({ id: sa.agent_id }))[0];
      if (a) agentById[sa.agent_id] = a;
    }
  } else {
    session = await db.Session.create({
      name: decision ? `${decision.title} — ${option.name}` : analysisName || scenario.name,
      scenario_id: scenario.id,
      domain_id: scenario.domain_id || null,
      phase_focus: phaseFocus,
      mode: 'classic',
      ...(analysisJobId ? { analysis_job_id: analysisJobId } : {}),
      status: 'pending',
      agent_ids: agents.map(a => a.id),
      decision_id: decision?.id || null,
      decision_option_id: decision ? option.id : null,
    });
    if (onCheckpoint) await onCheckpoint(session);
    for (const a of agents) {
      const sa = await db.SessionAgent.create({ session_id: session.id, agent_id: a.id, status: 'pending' });
      sessionAgents.push(sa);
    }
  }

  const kChunks = await retrieveKnowledge(db, `${scenario?.context_document || ''} ${phaseFocus}`, 5).catch(() => []);
  const knowledgeContext = knowledgeOverride ?? formatKnowledgeContext(kChunks);

  const checkCancel = () => { if (shouldCancel()) throw new Error('Cancelled'); };

  // Round 1 then Round 2, each agent in turn. Agents that already carry the
  // round's result (a resumed session) are skipped.
  for (const round of [1, 2]) {
    const doneField = round === 1 ? 'round1_assessment' : 'round2_rebuttal';
    for (let i = 0; i < sessionAgents.length; i++) {
      checkCancel();
      const sa = sessionAgents[i];
      const agent = agentById[sa.agent_id];
      if (!agent || sa[doneField]) continue;
      await onProgress({ stage: round === 1 ? 'round1' : 'round2', agentIndex: i + 1, agentTotal: sessionAgents.length, agentName: agent.name, agentId: agent.id, sessionId: session.id });

      const statusKey = round === 1 ? 'generating_r1' : 'generating_r2';
      await db.SessionAgent.update(sa.id, { status: statusKey });
      let res;
      try {
        res = await (round === 1 ? generateRound1 : generateRound2)({
          agent: { ...agent },
          scenarioContext,
          phaseFocus,
          ownAssessment: round === 2 ? sa.round1_assessment : '',
          othersAssessments: round === 2 ? othersTextFor(sa, sessionAgents, agentById) : '',
          threatCatalog: threats,
          chainContext: JSON.stringify(chains.map(c => ({ name: c.name, description: c.description, steps: c.steps, evidence: c.evidence, review_status: c.review_status }))),
          facilitator_note: '',
          knowledgeContext,
        });
      } catch (e) {
        await db.SessionAgent.update(sa.id, { status: round === 1 ? 'pending' : 'r1_done' }).catch(() => {});
        throw e;
      }

      const updates = round === 1 ? {
        round1_assessment: res.assessment,
        round1_severity: res.severity || agent.severity_default,
        round1_confidence: res.confidence,
        round1_likelihood: res.likelihood,
        round1_impact: res.impact,
        compound_chain_text: res.compound_chain_text || null,
        status: 'r1_done',
      } : {
        round2_rebuttal: res.assessment,
        round2_revised_severity: res.severity || sa.round1_severity,
        round2_confidence: res.confidence,
        round2_likelihood: res.likelihood,
        round2_impact: res.impact,
        compound_chain_text: res.compound_chain_text || sa.compound_chain_text || null,
        status: 'complete',
      };
      await db.SessionAgent.update(sa.id, updates);
      sessionAgents = sessionAgents.map(s => s.id === sa.id ? { ...s, ...updates } : s);
      await saveTurnSources(db, session.id, null, sa.agent_id, res.assessment).catch(() => {});
      if (i < sessionAgents.length - 1) await sleep(300);
    }
    await db.Session.update(session.id, { status: round === 1 ? 'round1' : 'round2' });
  }

  // Synthesis, persisted the same way the workspace does it. A resumed session
  // that already has one keeps it.
  checkCancel();
  const existingSynth = resume ? (await db.SessionSynthesis.filter({ session_id: session.id }))[0] : null;
  let synthesisText;
  if (existingSynth?.raw_text) {
    synthesisText = existingSynth.raw_text;
  } else {
    await onProgress({ stage: 'synthesis', sessionId: session.id, agentIndex: 0, agentTotal: sessionAgents.length });
    const synthAgents = sessionAgents.map(sa => ({
      ...sa,
      agentName: agentById[sa.agent_id]?.name,
      discipline: agentById[sa.agent_id]?.discipline,
    }));
    const synth = await generateSynthesis({
      session,
      sessionAgents: synthAgents,
      scenarioContext: scenario?.context_document || '',
      decisionContext: framing,
    });
    await db.SessionSynthesis.create({
      raw_text: synth.synthesis,
      session_id: session.id,
      compound_chains: synth.compound_chains || [],
    });
    await saveTurnSources(db, session.id, null, null, synth.synthesis).catch(() => {});
    synthesisText = synth.synthesis;
  }
  const savedSynthesis = (await db.SessionSynthesis.filter({ session_id: session.id }))[0];
  const existingChains = await db.Chain.filter({ session_id: session.id });
  for (const [index,c] of (savedSynthesis?.compound_chains || []).entries()) {
    const sourceKey = 'session:' + session.id + ':chain:' + index;
    if (existingChains.some(row => row.source_key === sourceKey || (!row.source_key && row.name === c.name))) continue;
    await db.Chain.create({ session_id: session.id, scenario_id: scenario.id, name: c.name,
      description: c.description || '', steps: c.steps || [], is_ai_generated: true, tags: [],
      ...(analysisJobId ? { analysis_job_id: analysisJobId, source_key: sourceKey, review_status: 'needs_review', evidence: [{ kind: 'model', text: synthesisText, session_id: session.id }] } : {}) });
  }
  await db.Session.update(session.id, { status: 'complete' });

  return { session: { ...session, status: 'complete' }, sessionAgents, synthesis: synthesisText };
}

// ── Cross-option reasoned assessment ─────────────────────────────────────────

/**
 * perOption: [{ option, sessionAgents (with .agent), synthesis }]
 * Returns the parsed assessment object (see prompt for shape).
 */
export async function generateDecisionAssessment({ decision, options, assumptions = [], perOption = [] }) {
  const live = assumptions.filter(a => a.status !== 'invalidated');

  const optionBlocks = perOption.map(({ option, sessionAgents, synthesis }) => {
    const agg = aggregateSessionRisk(sessionAgents);
    const letter = String.fromCharCode(65 + options.findIndex(o => o.id === option.id));
    const smeLines = sessionAgents.map(sa => {
      const a = sa.agent || {};
      const sev = sa.round2_revised_severity || sa.round1_severity || '?';
      const conf = sa.round2_confidence ?? sa.round1_confidence;
      const l = sa.round2_likelihood ?? sa.round1_likelihood;
      const i = sa.round2_impact ?? sa.round1_impact;
      const text = (sa.round2_rebuttal || sa.round1_assessment || '').replace(/\s+/g, ' ');
      return `- ${a.name || 'SME'} (${a.discipline || ''}) — ${sev}${conf != null ? `, confidence ${conf}%` : ''}${l && i ? `, L${l}×I${i}` : ''}: ${text}`;
    }).join('\n');
    const synthBits = synthesis;
    return [
      `### OPTION ${letter} — ${option.name} (id: ${option.id})`,
      option.description ? option.description : '',
      agg ? `Aggregate: peak risk ${agg.peak}/25, avg exposure ${agg.avgExposure}, ratings ${agg.count} (C${agg.severityCounts.CRITICAL} H${agg.severityCounts.HIGH} M${agg.severityCounts.MEDIUM} L${agg.severityCounts.LOW})` : 'Aggregate: no quantified ratings',
      'SME final positions:', smeLines,
      synthBits ? `Full synthesis:\n${synthBits}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const renderAssessment = records => `You are the decision-assessment engine for a multidisciplinary red-team platform. A panel of expert agents has just run a two-round analysis of EACH option of a design decision. Compare the options and determine whether any option can be recommended, with reasons that cite the evidence.

DECISION: ${decision.title}
${decision.description || ''}
${decision.acceptance_criteria ? `ACCEPTANCE CRITERIA: ${decision.acceptance_criteria}` : 'ACCEPTANCE CRITERIA: none stated'}
${live.length ? `KEY ASSUMPTIONS:\n${live.map(a => `- [${a.criticality || 'MEDIUM'}] ${a.text}`).join('\n')}` : ''}

PANEL EVIDENCE PER OPTION:
${records.map(r => r.text).join('\n\n')}

Rules:
- Set recommendation_status to RECOMMEND_OPTION only when the evidence supports choosing an option. Set REJECT_ALL when every option fails mandatory acceptance criteria or carries unacceptable risk. Set NEEDS_MORE_INFORMATION when missing or conflicting evidence prevents a defensible choice. Never choose an option merely because one must win.
- For RECOMMEND_OPTION, provide exactly one valid recommended_option_id. For REJECT_ALL or NEEDS_MORE_INFORMATION, recommended_option_id must be null and no option verdict may be RECOMMENDED. For REJECT_ALL, every option verdict must be NOT RECOMMENDED.
- State the evidence or redesign needed to move forward in conditions_to_revisit. Lower risk is not automatically better: weigh peak risk, how many SMEs rated CRITICAL/HIGH and how confident they were, whether the option meets the acceptance criteria, and which assumptions it puts at risk.
- Every reason must point at evidence: name SMEs, severities, confidences, or synthesis findings. No generic statements.
- Be candid about what the chosen option still costs (the risk knowingly accepted) and what would change your recommendation.
- Use the exact option ids shown in parentheses above for "recommended_option_id" and "option_id" — never the letter or the name.
- Keep lists short: at most 5 rationale items, 4 key_risks per option, 3 assumptions_at_risk per option, 4 tradeoffs, 4 conditions_to_revisit. Every list value is a plain string.

Return ONLY one JSON object, no markdown, in exactly this shape:
{
  "recommendation_status": "RECOMMEND_OPTION" | "REJECT_ALL" | "NEEDS_MORE_INFORMATION",
  "recommended_option_id": "<id>" | null,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "headline": "<one sentence: the recommended option or why no option can be recommended>",
  "rationale": ["<reason citing evidence>", "..."],
  "options": [
    {
      "option_id": "<id>",
      "verdict": "RECOMMENDED" | "VIABLE" | "NOT RECOMMENDED" | "NEEDS EVIDENCE",
      "risk_summary": "<2-3 sentences on this option's risk picture>",
      "key_risks": ["<specific risk, with the SME or finding that raised it>", "..."],
      "meets_acceptance_criteria": "YES" | "PARTIAL" | "NO" | "UNKNOWN",
      "acceptance_note": "<one sentence>",
      "assumptions_at_risk": ["<assumption text this option would strain or break>", "..."],
      "accepted_risk_if_chosen": "<one sentence: the residual risk a decision-maker knowingly accepts>"
    }
  ],
  "tradeoffs": ["<what you give up by choosing the recommended option over each alternative>", "..."],
  "conditions_to_revisit": ["<observable condition that should trigger re-assessment>", "..."]
}`;

  const raw = await sectionedCompletion({ records: [{ id: 'option-evidence', text: optionBlocks }], render: renderAssessment, complete: (prompt, maxTokens = 6144) => callAnthropicStream({ messages: [{ role: 'user', content: prompt }], maxTokens }) });
  let parsed;
  try { parsed = parseLooseJson(raw); }
  catch (e) { throw new Error(`The assessment did not come back as valid JSON (${e.message}). Try regenerating.`); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.options)) {
    throw new Error('The assessment came back in an unexpected shape. Try regenerating.');
  }
  return normalizeAssessment(parsed, options);
}

