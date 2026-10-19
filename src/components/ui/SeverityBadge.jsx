const POSTURES = {
  CRITICAL: 'treats most scenarios as high-consequence',
  HIGH:     'leans toward elevated risk assessments',
  MEDIUM:   'a tempered, balanced risk voice',
  LOW:      'skeptical of alarmism, requires strong evidence',
};

// Tooltip for agent cards, where the badge shows the agent's severity_default
// rather than an assessed threat severity.
export function agentDefaultSeverityTitle(severity) {
  const s = POSTURES[severity] ? severity : 'MEDIUM';
  return `Default severity: ${s} — this agent's baseline risk posture (${POSTURES[s]}). `
    + `Used as their rating in debate rounds when a response doesn't declare one. `
    + `Not a rating of the agent itself.`;
}

export default function SeverityBadge({ severity, size = 'sm', title }) {
  const config = {
    CRITICAL: { bg: '#C0392B', text: '#fff', label: 'CRITICAL' },
    HIGH:     { bg: '#D68910', text: '#0D1B2A', label: 'HIGH' },
    MEDIUM:   { bg: '#2E86AB', text: '#fff', label: 'MEDIUM' },
    LOW:      { bg: '#27AE60', text: '#fff', label: 'LOW' },
  };
  const c = config[severity] || config.MEDIUM;
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';
  return (
    <span data-ui="badge"
      className={`${padding} rounded font-bold tracking-wider font-mono inline-block ${title ? 'cursor-help' : ''}`}
      style={{ backgroundColor: c.bg, color: c.text }}
      title={title}
    >
      {c.label}
    </span>
  );
}
