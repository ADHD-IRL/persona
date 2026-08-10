// Persona export — portable JSON for the agent bench.
//
// Exports the persona definition only: no ids, workspace, or timestamps, so a
// file can be moved between workspaces or environments. The domain is exported
// by NAME rather than id for the same reason.

// Every persona-bearing column on `agents`, in a sensible reading order.
// Infra columns (id, workspace_id, created_by, created_at, updated_at,
// domain_id) are deliberately excluded.
const PERSONA_FIELDS = [
  // Identity
  'name', 'discipline', 'role_type', 'expertise_level', 'reasoning_style',
  // Core persona
  'persona_description', 'professional_background', 'institutional_background',
  'institutional_incentives', 'cognitive_bias', 'debiasing_instruction',
  'epistemic_style', 'decision_style', 'conflict_triggers',
  // Red team
  'red_team_focus', 'adversary_model', 'severity_default',
  // Method
  'analytical_framework', 'source_preferences',
  // Structured expertise (jsonb)
  'domain_expertise', 'expertise_boundaries', 'tradecraft', 'risk_posture',
  'debate_behavior', 'update_triggers',
  // Calibration
  'historical_strengths', 'historical_weaknesses', 'weighting_adjustment',
  // Coverage vectors
  'vector_human', 'vector_technical', 'vector_physical', 'vector_futures',
  // Classification
  'tags', 'scenario_tags', 'is_ai_generated',
];

export const EXPORT_FORMAT = 'agentdebate.personas';
export const EXPORT_VERSION = 1;

// Drop empty values so the file stays readable — an unset field is noise, and
// its absence on import means "use the default" just as reliably.
function isEmpty(v) {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

/** One agent row → a portable persona object. */
export function toPersona(agent, domainNameById = {}) {
  const persona = {};
  for (const field of PERSONA_FIELDS) {
    const value = agent[field];
    if (!isEmpty(value)) persona[field] = value;
  }
  const domain = domainNameById[agent.domain_id];
  if (domain) persona.domain = domain;
  return persona;
}

/** Build the full export payload for a set of agents. */
export function buildPersonaExport(agents = [], domains = []) {
  const domainNameById = Object.fromEntries(domains.map(d => [d.id, d.name]));
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    count: agents.length,
    personas: agents.map(a => toPersona(a, domainNameById)),
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

export function exportFilename(prefix = 'agentdebate-personas') {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${prefix}-${stamp}.json`;
}

/** Trigger a browser download of the payload as a .json file. */
export function downloadPersonaExport(agents, domains, filename = exportFilename()) {
  const payload = buildPersonaExport(agents, domains);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return payload;
}
