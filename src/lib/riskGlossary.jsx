// Plain-language explanations for the risk numbers shown across the app.
// Centralised so a metric reads the same on the dashboard, in a session, and
// in the simulator. Each entry is { title, body } where body is JSX rendered
// inside a MetricHint popover.

const C = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
const strong = (t, color) => <strong style={{ color: color || 'var(--wr-text-primary)' }}>{t}</strong>;
const muted = (children) => <p style={{ color: 'var(--wr-text-muted)' }}>{children}</p>;

export const RISK_HINTS = {
  SCRS: {
    title: 'SCRS — Systemic Critical Risk Score',
    body: (
      <>
        <p>A single 0–100 headline for the whole picture — higher means more risk.</p>
        <p>It starts from the panel's severity-weighted findings, then comes {strong('down', C.LOW)} as brittle kill chains and applied countermeasures reduce exposure.</p>
        {muted(<>Bands: <span style={{ color: C.CRITICAL }}>Critical 80–100</span> · <span style={{ color: C.HIGH }}>High 60–79</span> · <span style={{ color: C.MEDIUM }}>Medium 40–59</span> · <span style={{ color: C.LOW }}>Low 0–39</span>.</>)}
      </>
    ),
  },

  PEAK: {
    title: 'Peak risk',
    body: (
      <>
        <p>The single riskiest call on the table — the highest score any one SME gave.</p>
        <p>Each SME rates {strong('likelihood')} and {strong('impact')} from 1 to 5; we multiply them, so scores run {strong('1–25')}.</p>
        {muted('It is the worst case, not an average — one alarmed SME is enough to raise it.')}
      </>
    ),
  },

  EXPOSURE: {
    title: 'Exposure',
    body: (
      <>
        <p>The panel's overall risk level, in one number.</p>
        <p>We average every SME's score, but first shrink each by how sure that SME was — a confident severe call pulls it up, a hedged one barely moves it.</p>
        {muted('It usually sits below Peak: it reflects the whole panel and its uncertainty, not just the loudest alarm.')}
      </>
    ),
  },

  LIKELIHOOD_IMPACT: {
    title: 'Likelihood × Impact',
    body: (
      <>
        <p>{strong('Likelihood')} (1 Rare → 5 Almost Certain) times {strong('Impact')} (1 Negligible → 5 Severe).</p>
        <p>The product runs 1–25 and sets the band: <span style={{ color: C.CRITICAL }}>Critical 15–25</span> · <span style={{ color: C.HIGH }}>High 9–14</span> · <span style={{ color: C.MEDIUM }}>Medium 4–8</span> · <span style={{ color: C.LOW }}>Low 1–3</span>.</p>
      </>
    ),
  },

  CONFIDENCE: {
    title: 'Confidence',
    body: (
      <>
        <p>How sure the SME is of their own rating, 0–100%.</p>
        {muted('Used to weight Exposure: low-confidence calls count for less than well-evidenced ones.')}
      </>
    ),
  },

  OPEN_CRITICALS: {
    title: 'Open criticals',
    body: (
      <>
        <p>How many findings are rated {strong('CRITICAL', C.CRITICAL)} and still unresolved.</p>
        {muted('The count you most want driven to zero — each is a top-severity threat with no mitigation closing it yet.')}
      </>
    ),
  },

  KILL_CHAINS: {
    title: 'Kill chains',
    body: (
      <>
        <p>Multi-step attack chains the panel identified, where each step depends on the one before.</p>
        {muted('Breaking any single step stops the chain — which is what the mitigation roadmap targets.')}
      </>
    ),
  },

  MITIGATIONS: {
    title: 'Mitigations',
    body: (
      <>
        <p>Countermeasures registered against this analysis, across every status.</p>
        {muted('Each carries an inherent risk and, once deployed, a residual risk — the gap is the reduction it buys.')}
      </>
    ),
  },

  NET_REDUCTION: {
    title: 'Net risk reduction',
    body: (
      <>
        <p>Total risk points removed by mitigations: {strong('inherent − residual')}, summed across scored mitigations.</p>
        {muted('Higher is better. It only counts mitigations that have both an inherent and a residual score.')}
      </>
    ),
  },

  COVERAGE_GAPS: {
    title: 'Coverage gaps',
    body: (
      <>
        <p>Threat areas in your landscape with no SME on the bench qualified to cover them.</p>
        {muted('Each gap is a blind spot — generate or assign an expert to close it.')}
      </>
    ),
  },

  BASE_SCORE: {
    title: 'Base score',
    body: (
      <>
        <p>The starting point for SCRS, before resilience and countermeasures.</p>
        <p>Every SME finding is weighted by its severity and by the SME's expertise level, then normalised to 0–100.</p>
        {muted('A World-Class expert’s Critical carries more weight than a Junior’s.')}
      </>
    ),
  },

  CHAIN_RESILIENCE: {
    title: 'Chain resilience modifier',
    body: (
      <>
        <p>How hard the kill chains are to break, applied as a {strong('reduction', C.LOW)} to SCRS.</p>
        {muted('Brittle chains are easy to disrupt, so they lower risk (down to −25). Robust chains hold, so they subtract nothing.')}
      </>
    ),
  },

  COUNTERMEASURE_COVERAGE: {
    title: 'Countermeasure coverage modifier',
    body: (
      <>
        <p>How much applied countermeasures {strong('reduce', C.LOW)} SCRS, based on coverage of the HIGH-leverage steps.</p>
        {muted('Full coverage of the highest-leverage steps is worth up to −20 points.')}
      </>
    ),
  },
};
