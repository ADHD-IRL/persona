import { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import { useWorkspace } from '@/lib/WorkspaceContext';

// ─── Format Guide ────────────────────────────────────────────────────────────

const FORMAT_EXAMPLE = `## Counterintelligence / HUMINT Officer

**Persona:** Former DIA counterintelligence officer with 22 years...

**Cognitive Bias:** Overweights human collection vectors...

**Primary Focus:** Foreign adversary elicitation of key personnel...

**Severity:** HIGH

**Vectors:**
- Human: 85
- Technical: 40
- Physical: 50
- Futures: 30

**Tags:** HUMINT, counterintelligence, insider-threat

**Domain Tags:** DoD, National Security

**Epistemic Style:** Requires corroboration across two collection domains before high-confidence attribution.

**Institutional Background:** Former DIA officer; shaped by interagency rivalry and classification barriers.

**Conflict Triggers:** Distrusts private-sector cyber analysts who lack HUMINT exposure.

**Decision Style:** Delays attribution until evidentiary chain is operationally defensible.

**Adversary Model:** Assumes state-actor primacy for any persistent intrusion campaign.

**Incentives:** Career shaped by avoiding false positives; institutional reputation depends on accuracy over speed.

**Professional Background:** 22 years in DIA counterintelligence, including field elicitation and insider-threat investigations.
**Expertise Level:** Principal
**Reasoning Style:** Analytical

### Domain Fluency
* **intelligence tradecraft:** 9/10
* **cyber technical:** 5/10
* **insider threat:** 8/10

### Expertise Boundaries
**Strong:** foreign elicitation, insider-threat indicators, source validation
**Weak:** ICS/OT internals, cryptographic implementation
**Defer To:** Cyber on intrusion attribution; OT Engineer on control-system pathways
**Forbidden Overreach:** never assert a specific malware family or exploit chain as fact

### Analytic Tradecraft
**Analytical Framework:** ACH; structured source validation
**Common False Positives:** benign anomalous behavior read as hostile elicitation
**Failure Modes:** overweighting human vectors when the pathway is technical

### Bias Model
**Debiasing Instruction:** before finalizing, ask what non-human explanation fits the same evidence.

### Risk Posture
**Risk Sensitivity:** high
**False Negative Tolerance:** low
**False Positive Tolerance:** medium

### Debate Behavior
**Debate Role:** domain challenger
**What Changes Mind:** corroborating technical telemetry from a second collection domain
**Updates Slow When:** the only evidence is single-source HUMINT

---

## All-Source Intelligence Analyst

**Persona:** Career CIA all-source analyst...

**Cognitive Bias:** Confirmation bias in evaluation...

**Primary Focus:** Geopolitical intelligence gaps...

**Severity:** HIGH

**Vectors:**
- Human: 70
- Technical: 60
- Physical: 40
- Futures: 50

**Tags:** OSINT, analysis, geopolitical

**Domain Tags:** DoD, National Security`;

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseCategoryHeader(lines) {
  // Category line: "# Category XY — Some Name" or "# XY — Some Name"
  for (const line of lines) {
    const m = line.match(/^#\s+(?:Category\s+\w+\s+[—–-]+\s+)?(.+)/i);
    if (m && !line.startsWith('## ')) {
      // Pull just a clean category name
      const raw = m[1].trim();
      // Strip leading "Category XX —" patterns
      const cleaned = raw.replace(/^Category\s+\w+\s*[—–-]+\s*/i, '').trim();
      if (cleaned && !cleaned.match(/^\d+ Agents/i) && !cleaned.match(/^These agents/i)) {
        return cleaned;
      }
    }
  }
  return null;
}

function getSection(lines, startIdx, label) {
  // Check for inline value on the same line
  const sameLine = lines[startIdx].replace(new RegExp(`.*\\*\\*${label}:\\*\\*\\s*`, 'i'), '').trim();
  if (sameLine) return sameLine;
  // Gather continuation lines
  const result = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\*\*\w/.test(lines[i]) || /^#{1,3}\s/.test(lines[i]) || /^---/.test(lines[i])) break;
    if (lines[i].trim()) result.push(lines[i].replace(/^-\s*/, '').trim());
  }
  return result.join(' ') || null;
}

const splitList = (s) => (s || '').split(/[,;]/).map(t => t.trim()).filter(Boolean);

// Collect the lines under a `### Heading` sub-block, up to the next heading or ---.
function getSubBlockLines(lines, heading) {
  const norm = (s) => s.replace(/[#*\s]/g, '').toLowerCase();
  const target = norm(heading);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,4}\s/.test(lines[i].trim()) && norm(lines[i]).includes(target)) { start = i + 1; break; }
  }
  if (start === -1) return [];
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#{1,4}\s/.test(t) || /^---/.test(t)) break;
    out.push(lines[i]);
  }
  return out;
}

function parseAgentBlock(blockLines) {
  const agent = {
    name: '', discipline: '', persona_description: '', cognitive_bias: '',
    red_team_focus: '', severity_default: 'HIGH',
    vector_human: 50, vector_technical: 50, vector_physical: 30, vector_futures: 40,
    tags: [], is_ai_generated: false, domain_tags: [],
    epistemic_style: '', institutional_background: '', conflict_triggers: '',
    decision_style: '', adversary_model: '', institutional_incentives: '',
    // Optimal-SME extended fields (all optional, backwards compatible)
    professional_background: '', expertise_level: '', role_type: 'sme',
    reasoning_style: '', source_preferences: '', analytical_framework: '',
    debiasing_instruction: '',
    domain_expertise: {}, expertise_boundaries: {}, tradecraft: {},
    risk_posture: {}, debate_behavior: {}, update_triggers: {},
  };

  // Name from ## heading: "## LIB-IC01 — Some Name" → "Some Name"
  const h2 = blockLines.find(l => l.startsWith('## '));
  if (h2) {
    const nameMatch = h2.match(/^##\s+(?:[\w-]+\s+[—–-]+\s+)?(.+)/);
    if (nameMatch) {
      agent.name = nameMatch[1].trim();
      // Use the ID portion as a prefix tag
      const idMatch = h2.match(/^##\s+([\w-]+)\s+[—–-]/);
      if (idMatch) agent._id_prefix = idMatch[1];
    }
    // Discipline = last part of name (after the slash or comma if present)
    const discMatch = agent.name.match(/[\/,]\s*(.+)$/);
    agent.discipline = discMatch ? discMatch[1].trim() : agent.name;
  }

  const lines = blockLines;

  const findAndGet = (label) => {
    const idx = lines.findIndex(l => new RegExp(`\\*\\*${label}:\\*\\*`, 'i').test(l));
    if (idx === -1) return null;
    return getSection(lines, idx, label);
  };

  const persona = findAndGet('Persona');
  if (persona) agent.persona_description = persona;

  const bias = findAndGet('Cognitive Bias');
  if (bias) agent.cognitive_bias = bias;

  // Primary Focus → red_team_focus
  const focus = findAndGet('Primary Focus') || findAndGet('Red Team Focus') || findAndGet('Red-Team Focus');
  if (focus) agent.red_team_focus = focus;

  // Severity
  const sev = findAndGet('Severity');
  if (sev) {
    const s = sev.toUpperCase();
    if (['CRITICAL','HIGH','MEDIUM','LOW'].includes(s)) agent.severity_default = s;
  }

  // Vectors section
  const vecIdx = lines.findIndex(l => /\*\*Vectors:\*\*/i.test(l));
  if (vecIdx !== -1) {
    for (let i = vecIdx; i < Math.min(vecIdx + 8, lines.length); i++) {
      const l = lines[i];
      const h = l.match(/human:\s*(\d+)/i); if (h) agent.vector_human = parseInt(h[1]);
      const t = l.match(/technical:\s*(\d+)/i); if (t) agent.vector_technical = parseInt(t[1]);
      const p = l.match(/physical:\s*(\d+)/i); if (p) agent.vector_physical = parseInt(p[1]);
      const f = l.match(/futures:\s*(\d+)/i); if (f) agent.vector_futures = parseInt(f[1]);
    }
  }

  // Tags
  const tagsLine = findAndGet('Tags');
  if (tagsLine) {
    agent.tags = tagsLine.split(',').map(t => t.trim()).filter(Boolean);
  }

  // Domain Tags — used to match/create domains
  const domainTagsLine = findAndGet('Domain Tags');
  if (domainTagsLine) {
    // "All domains" → special marker
    if (/all domains/i.test(domainTagsLine)) {
      agent.domain_tags = ['_ALL_'];
    } else {
      agent.domain_tags = domainTagsLine.split(/[,;]/).map(t => t.trim()).filter(Boolean);
    }
  }

  // Extended persona fields (all optional, backwards compatible)
  const epistemic = findAndGet('Epistemic Style') || findAndGet('Epistemic');
  if (epistemic) agent.epistemic_style = epistemic;

  const instBg = findAndGet('Institutional Background') || findAndGet('Institutional') || findAndGet('Former Background');
  if (instBg) agent.institutional_background = instBg;

  const triggers = findAndGet('Conflict Triggers') || findAndGet('Distrust Triggers');
  if (triggers) agent.conflict_triggers = triggers;

  const decision = findAndGet('Decision Style') || findAndGet('Operational Tempo');
  if (decision) agent.decision_style = decision;

  const adversary = findAndGet('Adversary Model') || findAndGet('Adversary Lens') || findAndGet('Threat Model');
  if (adversary) agent.adversary_model = adversary;

  const incentives = findAndGet('Incentives') || findAndGet('Institutional Incentives') || findAndGet('Career Incentives');
  if (incentives) agent.institutional_incentives = incentives;

  // ── Optimal-SME extended fields ──────────────────────────────────────────────
  // Flat identity / epistemics / tradecraft fields
  const set = (label, key) => { const v = findAndGet(label); if (v) agent[key] = v; };
  set('Professional Background', 'professional_background');
  set('Expertise Level', 'expertise_level');
  set('Role Type', 'role_type');
  set('Reasoning Style', 'reasoning_style');
  set('Source Preferences', 'source_preferences');
  set('Analytical Framework', 'analytical_framework');
  set('Debiasing Instruction', 'debiasing_instruction');

  // Severity may be written as "Severity Default:" in the template
  const sevDef = findAndGet('Severity Default');
  if (sevDef) {
    const s = sevDef.toUpperCase();
    if (['CRITICAL','HIGH','MEDIUM','LOW'].includes(s)) agent.severity_default = s;
  }

  // Domain Fluency → domain_expertise { label: 0-10 }
  for (const l of getSubBlockLines(lines, 'Domain Fluency')) {
    const m = l.match(/\*\*(.+?):\*\*\s*(\d+)\s*\/\s*10/) || l.match(/[-*]\s*(.+?):\s*(\d+)\s*\/\s*10/);
    if (m) agent.domain_expertise[m[1].replace(/\*/g, '').trim()] = parseInt(m[2], 10);
  }

  // Expertise Boundaries → jsonb
  const eb = agent.expertise_boundaries;
  const strong = findAndGet('Strong');   if (strong) eb.strong = splitList(strong);
  const moderate = findAndGet('Moderate'); if (moderate) eb.moderate = splitList(moderate);
  const weak = findAndGet('Weak');       if (weak) eb.weak = splitList(weak);
  const deferTo = findAndGet('Defer To'); if (deferTo) eb.defer_to = splitList(deferTo);
  const forbidden = findAndGet('Forbidden Overreach'); if (forbidden) eb.forbidden_overreach = forbidden;

  // Analytic Tradecraft → jsonb
  const tc = agent.tradecraft;
  const ci = findAndGet('Common Indicators');       if (ci) tc.common_indicators = splitList(ci);
  const cfp = findAndGet('Common False Positives');  if (cfp) tc.common_false_positives = splitList(cfp);
  const fm = findAndGet('Failure Modes');            if (fm) tc.failure_modes = splitList(fm);

  // Risk Posture → jsonb (adversary_model / red_team_focus / decision_style already flat above)
  const rp = agent.risk_posture;
  const rSens = findAndGet('Risk Sensitivity');          if (rSens) rp.risk_sensitivity = rSens.toLowerCase();
  const fnt = findAndGet('False Negative Tolerance');    if (fnt) rp.false_negative_tolerance = fnt.toLowerCase();
  const fpt = findAndGet('False Positive Tolerance');    if (fpt) rp.false_positive_tolerance = fpt.toLowerCase();
  const eBias = findAndGet('Escalation Bias');           if (eBias) rp.escalation_bias = eBias;

  // Debate Behavior + belief-update rules → jsonb
  const db = agent.debate_behavior;
  const dRole = findAndGet('Debate Role');       if (dRole) db.debate_role = dRole;
  const rebut = findAndGet('Rebuttal Style');    if (rebut) db.rebuttal_style = rebut;
  const wcm = findAndGet('What Changes Mind');   if (wcm) db.what_changes_mind = wcm;
  const ut = agent.update_triggers;
  const fast = findAndGet('Updates Fast When');            if (fast) ut.fast_when = fast;
  const slow = findAndGet('Updates Slow When');            if (slow) ut.slow_when = slow;
  const resist = findAndGet('Resistant To Update When');   if (resist) ut.resistant_when = resist;

  return agent;
}

export function parseMultiAgentMarkdown(text) {
  const lines = text.split('\n');
  const categoryName = parseCategoryHeader(lines);

  // Split into per-agent blocks by ## headings
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (line.startsWith('## ') && current.length > 0) {
      blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0 && current.some(l => l.startsWith('## '))) blocks.push(current);

  const agents = blocks
    .map(parseAgentBlock)
    .filter(a => a.name);

  return { categoryName, agents };
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

const DOMAIN_COLORS = ['#F0A500','#2E86AB','#27AE60','#C0392B','#7B2D8B','#E67E22','#16A085','#8E44AD'];

async function resolveOrCreateDomain(name, existingDomains, createdCache, db) {
  const key = name.toLowerCase().trim();
  if (createdCache[key]) return createdCache[key];
  const existing = existingDomains.find(d => d.name.toLowerCase() === key);
  if (existing) { createdCache[key] = existing.id; return existing.id; }
  const color = DOMAIN_COLORS[Object.keys(createdCache).length % DOMAIN_COLORS.length];
  const created = await db.Domain.create({ name, color, description: `Auto-created during agent import` });
  createdCache[key] = created.id;
  return created.id;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentImportModal({ existingDomains, onClose, onDone }) {
  const { db } = useWorkspace();
  const [showFormat, setShowFormat] = useState(false);
  const [parsed, setParsed] = useState(null); // { categoryName, agents }
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const fileRef = useRef();

  const handleFiles = (files) => {
    const file = files[0];
    if (!file) return;
    setFileName(file.name);
    setErrors([]);
    setParsed(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const { categoryName, agents } = parseMultiAgentMarkdown(e.target.result);
      if (agents.length === 0) {
        setErrors(['No SMEs found. Make sure each SME starts with a ## heading.']);
      } else {
        setParsed({ categoryName, agents });
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleImport = async () => {
    setImporting(true);
    const createdDomains = {};
    let count = 0;

    // Always fetch fresh domains before import to avoid stale cache issues
    const freshDomains = await db.Domain.list();

    for (const agent of parsed.agents) {
      let domain_id = null;

      // Use only domain tags (first one if multiple)
      const domainName = agent.domain_tags[0] !== '_ALL_' ? agent.domain_tags[0] : null;

      if (domainName) {
        domain_id = await resolveOrCreateDomain(domainName, freshDomains, createdDomains, db);
      }

      const { domain_tags, _id_prefix, ...agentData } = agent;
      await db.Agent.create({ ...agentData, domain_id });
      count++;
    }

    setImportCount(count);
    setImporting(false);
    setDone(true);
    onDone(); // reload parent
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div data-ui="surface" className="w-[620px] max-h-[90vh] overflow-y-auto rounded-lg" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b" style={{ backgroundColor: 'var(--wr-bg-card)', borderColor: 'var(--wr-border)' }}>
          <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>IMPORT SMEs</h2>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>

        <div className="p-6 space-y-5">

          {/* Format Guide */}
          <div data-ui="surface" className="rounded" style={{ border: '1px solid var(--wr-border)', backgroundColor: 'var(--wr-bg-secondary)' }}>
            <button data-ui="disclosure"
              onClick={() => setShowFormat(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold tracking-widest font-mono"
              style={{ color: 'var(--wr-text-secondary)' }}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} />
                MARKDOWN FORMAT GUIDE
              </span>
              {showFormat ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showFormat && (
              <div className="px-4 pb-4 border-t space-y-4" style={{ borderColor: 'var(--wr-border)' }}>
                <div className="mt-3 space-y-2 text-xs" style={{ color: 'var(--wr-text-secondary)' }}>
                  <p>A single <code className="px-1 rounded" style={{ backgroundColor: 'var(--wr-bg-card)', color: 'var(--wr-amber)' }}>.md</code> file can contain <strong>one or many SMEs</strong>.</p>
                  <p><strong style={{ color: 'var(--wr-text-primary)' }}>File structure:</strong></p>
                  <ul className="space-y-1.5 ml-2">
                    <li><span style={{ color: 'var(--wr-amber)' }}>## SME Name</span> — H2 heading starts each SME and becomes the SME's display name <span style={{ color: '#C0392B' }}>(required)</span></li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>**Persona:**</span> — who this expert is and how they think</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>**Cognitive Bias:**</span> — what they systematically underweight</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>**Primary Focus:**</span> — what they hunt for (maps to Red Team Focus)</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>**Severity:**</span> — CRITICAL / HIGH / MEDIUM / LOW (default: HIGH)</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>**Vectors:**</span> — Human / Technical / Physical / Futures (0–100 each)</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>**Tags:**</span> — comma-separated keyword tags</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>**Domain Tags:**</span> — comma-separated domain names to assign SMEs <span style={{ color: '#C0392B' }}>(required)</span></li>
                  </ul>
                  <p className="text-xs pt-1" style={{ color: 'var(--wr-text-primary)' }}><strong>Optimal-SME blocks (optional, all improve reasoning quality):</strong></p>
                  <ul className="space-y-1.5 ml-2">
                    <li><span style={{ color: 'var(--wr-amber)' }}>### Domain Fluency</span> — <code>* **label:** N/10</code> bullets scoring depth per sub-dimension</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>### Expertise Boundaries</span> — Strong / Moderate / Weak / Defer To / Forbidden Overreach (keeps the SME in its lane)</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>### Analytic Tradecraft</span> — Analytical Framework / Common Indicators / Common False Positives / Failure Modes</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>### Bias Model</span> — Cognitive Bias + Debiasing Instruction (the habit that counters it)</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>### Risk Posture</span> — Severity Default / Risk Sensitivity / False Negative &amp; Positive Tolerance (FP/FN asymmetry)</li>
                    <li><span style={{ color: 'var(--wr-amber)' }}>### Debate Behavior</span> — Debate Role / What Changes Mind / Updates Fast/Slow/Resistant When</li>
                    <li>Plus flat fields: <span style={{ color: 'var(--wr-amber)' }}>Professional Background, Expertise Level, Reasoning Style, Source Preferences</span></li>
                  </ul>
                  <p className="text-xs pt-1" style={{ color: 'var(--wr-text-muted)' }}>
                   Domains are matched by name (case-insensitive) or auto-created if they don't exist. If an SME has multiple domain tags, the first one will be used. Fields not recognized are safely ignored.
                  </p>
                </div>
                <pre className="text-xs rounded p-3 overflow-x-auto" style={{ backgroundColor: 'var(--wr-bg-primary)', color: 'var(--wr-text-secondary)', border: '1px solid var(--wr-border)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>
{FORMAT_EXAMPLE}
                </pre>
              </div>
            )}
          </div>

          {/* Drop Zone */}
          {!done && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current.click()}
              className="rounded border-2 border-dashed flex flex-col items-center justify-center py-10 cursor-pointer transition-colors hover:border-amber-500/50"
              style={{ borderColor: parsed ? 'rgba(240,165,0,0.4)' : 'var(--wr-border)' }}
            >
              <Upload className="w-8 h-8 mb-3" style={{ color: parsed ? 'var(--wr-amber)' : 'var(--wr-text-muted)' }} />
              {parsed ? (
                <p className="text-sm font-medium" style={{ color: 'var(--wr-amber)' }}>{fileName} — click to replace</p>
              ) : (
                <>
                  <p className="text-sm font-medium" style={{ color: 'var(--wr-text-secondary)' }}>Drop a .md file here or click to browse</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>Single file containing one or more SMEs</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".md,.txt" className="hidden" onChange={e => handleFiles(e.target.files)} />
            </div>
          )}

          {/* Errors */}
          {errors.map((e, i) => (
            <div data-ui="surface" key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded" style={{ backgroundColor: 'rgba(192,57,43,0.1)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.2)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {e}
            </div>
          ))}

          {/* Preview */}
          {parsed && !done && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
                  READY TO IMPORT — {parsed.agents.length} SME{parsed.agents.length !== 1 ? 'S' : ''}
                </p>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {parsed.agents.map((agent, i) => (
                  <div data-ui="surface" key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</p>
                      <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</p>
                    </div>
                    <span data-ui="badge" className="ml-3 text-xs px-2 py-0.5 rounded font-bold font-mono flex-shrink-0"
                      style={{
                        backgroundColor: `${{'CRITICAL':'#C0392B','HIGH':'#D68910','MEDIUM':'#2E86AB','LOW':'#27AE60'}[agent.severity_default]}22`,
                        color: {'CRITICAL':'#C0392B','HIGH':'#D68910','MEDIUM':'#2E86AB','LOW':'#27AE60'}[agent.severity_default]
                      }}>
                      {agent.severity_default}
                    </span>
                  </div>
                ))}
              </div>
              {parsed.agents.some(a => !a.domain_tags.length) && (
               <p className="text-xs" style={{ color: '#C0392B' }}>
                 ⚠ Some SMEs are missing Domain Tags. All SMEs must have at least one domain tag to be imported.
               </p>
              )}
            </div>
          )}

          {/* Success */}
          {done && (
            <div className="flex flex-col items-center py-8 gap-3">
              <CheckCircle2 className="w-10 h-10" style={{ color: '#27AE60' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>
                {importCount} SME{importCount !== 1 ? 's' : ''} imported successfully
              </p>

              <WrButton onClick={onClose}>Done</WrButton>
            </div>
          )}
        </div>

        {/* Footer */}
        {!done && parsed && (
          <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t" style={{ backgroundColor: 'var(--wr-bg-card)', borderColor: 'var(--wr-border)' }}>
            <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
            <WrButton onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : `Import ${parsed.agents.length} SME${parsed.agents.length !== 1 ? 'S' : ''}`}
            </WrButton>
          </div>
        )}
      </div>
    </div>
  );
}