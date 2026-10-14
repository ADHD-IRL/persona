
const SEV_COLOR = {
  CRITICAL: { text: '#C0392B', bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.25)' },
  HIGH:     { text: '#D68910', bg: 'rgba(214,137,16,0.08)', border: 'rgba(214,137,16,0.25)' },
  MEDIUM:   { text: '#2E86AB', bg: 'rgba(46,134,171,0.08)', border: 'rgba(46,134,171,0.25)' },
  LOW:      { text: '#27AE60', bg: 'rgba(39,174,96,0.08)',  border: 'rgba(39,174,96,0.25)'  },
};

function SevPill({ severity }) {
  if (!severity) return null;
  const c = SEV_COLOR[severity] || SEV_COLOR.HIGH;
  return (
    <span
      className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: c.text, backgroundColor: c.bg, border: `1px solid ${c.border}` }}
    >
      {severity}
    </span>
  );
}

function ThreatRow({ threat, index }) {
  const c = SEV_COLOR[threat.severity] || SEV_COLOR.HIGH;
  return (
    <tr className="border-b last:border-b-0 group" style={{ borderColor: 'var(--wr-border)' }}>
      <td className="pl-4 pr-2 py-3.5 w-8 text-right">
        <div
          className="w-1 h-full min-h-[2.5rem] rounded-full mx-auto"
          style={{ backgroundColor: c.text, opacity: 0.7 }}
        />
      </td>
      <td className="px-4 py-3.5 w-14 text-xs font-mono text-center tabular-nums" style={{ color: 'var(--wr-text-muted)' }}>
        T-{String(index + 1).padStart(2, '0')}
      </td>
      <td className="px-2 py-3.5">
        <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--wr-text-primary)' }}>
          {threat.name}
        </p>
        {threat.description && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>
            {threat.description}
          </p>
        )}
      </td>
      <td className="px-4 py-3.5 w-28">
        {threat.category && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--wr-amber)', backgroundColor: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.18)' }}>
            {threat.category}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 w-28">
        <SevPill severity={threat.severity} />
      </td>
    </tr>
  );
}

export default function RiskRegistry({ threats = [] }) {
  if (!threats.length) return null;

  const bySev = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const sorted = [...threats].sort((a, b) => {
    const ai = bySev.indexOf(a.severity);
    const bi = bySev.indexOf(b.severity);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: 'var(--wr-border)', backgroundColor: 'rgba(138,155,181,0.04)' }}
      >
        <span className="text-xs font-bold tracking-widest font-mono uppercase" style={{ color: 'var(--wr-text-muted)' }}>
          Risk Registry
        </span>
        <div className="flex items-center gap-3">
          {bySev.map(sev => {
            const count = threats.filter(t => t.severity === sev).length;
            if (!count) return null;
            const c = SEV_COLOR[sev];
            return (
              <span key={sev} className="text-[10px] font-mono font-bold" style={{ color: c.text }}>
                {count}{sev[0]}
              </span>
            );
          })}
          <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>{threats.length} total</span>
        </div>
      </div>

      {/* Table */}
      <table className="w-full border-collapse" style={{ backgroundColor: 'var(--wr-bg-card)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--wr-border)', backgroundColor: 'rgba(138,155,181,0.02)' }}>
            <th className="w-8" />
            <th className="px-4 py-2.5 text-left w-14">
              <span className="text-[9px] font-bold font-mono tracking-widest uppercase" style={{ color: 'var(--wr-text-muted)' }}>#</span>
            </th>
            <th className="px-2 py-2.5 text-left">
              <span className="text-[9px] font-bold font-mono tracking-widest uppercase" style={{ color: 'var(--wr-text-muted)' }}>Threat / Description</span>
            </th>
            <th className="px-4 py-2.5 text-left w-28">
              <span className="text-[9px] font-bold font-mono tracking-widest uppercase" style={{ color: 'var(--wr-text-muted)' }}>Category</span>
            </th>
            <th className="px-4 py-2.5 text-left w-28">
              <span className="text-[9px] font-bold font-mono tracking-widest uppercase" style={{ color: 'var(--wr-text-muted)' }}>Severity</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => (
            <ThreatRow key={t.id || i} threat={t} index={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
