import { useState } from 'react';
import { X, Sparkles, Loader2, SlidersHorizontal, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import { WrInput, WrSelect } from '@/components/ui/WrInput';
import ProcessingBar from '@/components/ui/ProcessingBar';
import { useElapsed } from '@/hooks/useElapsed';
import { generateAgent as generateAgentLLM, regenerateAgentField } from '@/lib/llm';

const SEVERITIES = ['CRITICAL','HIGH','MEDIUM','LOW'];
const SEV_COLORS = { CRITICAL:'#C0392B', HIGH:'#D68910', MEDIUM:'#2E86AB', LOW:'#27AE60' };

// Textarea field with an optional AI regen button alongside the label
function RegenField({ label, fieldKey, value, onChange, onRegen, regenning, rows = 2, placeholder, optional }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>
          {label}{optional && <span className="ml-1 opacity-50">(optional)</span>}
        </label>
        {onRegen && (
          <button
            type="button"
            onClick={onRegen}
            disabled={regenning}
            title={`Regenerate ${label} with AI`}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all hover:opacity-80"
            style={{ color: 'var(--wr-amber)', backgroundColor: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.18)' }}
          >
            {regenning
              ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> generating…</>
              : <><Sparkles className="w-2.5 h-2.5" /> regen</>
            }
          </button>
        )}
      </div>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-none"
        style={{
          backgroundColor: 'var(--wr-bg-secondary)',
          border: '1px solid var(--wr-border)',
          color: 'var(--wr-text-primary)',
          opacity: regenning ? 0.5 : 1,
        }}
      />
    </div>
  );
}

export default function AgentFormModal({ agent, mode: initialMode, aiSeed, domains, onSave, onClose }) {
  const [mode, setMode] = useState(initialMode || 'manual');
  const [form, setForm] = useState({
    name: '', discipline: '', domain_id: '', persona_description: '', cognitive_bias: '',
    red_team_focus: '', professional_background: '', expertise_level: 'Senior',
    reasoning_style: 'Analytical', severity_default: 'HIGH', vector_human: 50,
    vector_technical: 50, vector_physical: 30, vector_futures: 40, is_ai_generated: false, tags: [],
    epistemic_style: '', institutional_background: '', conflict_triggers: '',
    decision_style: '', adversary_model: '', institutional_incentives: '',
    ...agent,
  });

  // AI Generate form (new agents) — aiSeed pre-fills from deep links (Threat Map gaps)
  const [aiForm, setAiForm] = useState({
    domain_id: '', expert_type: '', prior_background: '', key_focus: '',
    bias_toward: '', institutional_hint: '', adversary_hint: '',
    ...(aiSeed || {}),
  });
  const [generating, setGenerating] = useState(false);
  const genElapsed = useElapsed(generating);

  // Per-field regen state: { fieldKey: true/false }
  const [regenning, setRegenning] = useState({});

  // Full-profile regen panel for existing agents
  const [showRegenPanel, setShowRegenPanel] = useState(false);
  const [regenHints, setRegenHints] = useState({ key_focus: '', bias_toward: '', institutional_hint: '' });
  const [regenningAll, setRegenningAll] = useState(false);

  const [tagInput, setTagInput] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setAi = (k, v) => setAiForm(f => ({ ...f, [k]: v }));

  // Nested jsonb setters (expertise_boundaries, tradecraft, risk_posture, debate_behavior, update_triggers)
  const setNested = (objKey, subKey, v) => setForm(f => ({ ...f, [objKey]: { ...(f[objKey] || {}), [subKey]: v } }));
  const setNestedList = (objKey, subKey, v) => setNested(objKey, subKey, v.split(',').map(s => s.trim()).filter(Boolean));
  const listVal = (objKey, subKey) => { const x = form[objKey]?.[subKey]; return Array.isArray(x) ? x.join(', ') : (x || ''); };
  const fluencyVal = () => Object.entries(form.domain_expertise || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
  const setFluency = (str) => {
    const obj = {};
    str.split(',').forEach(pair => {
      const m = pair.match(/(.+?):\s*(\d+)/);
      if (m) obj[m[1].trim()] = Math.min(10, Math.max(0, parseInt(m[2], 10)));
    });
    set('domain_expertise', obj);
  };

  // Generate full new agent
  const generateAgent = async () => {
    setGenerating(true);
    try {
      const data = await generateAgentLLM(aiForm);
      setForm(f => ({ ...f, ...data, is_ai_generated: true, domain_id: aiForm.domain_id || f.domain_id, name: aiForm.name || data.name || f.name }));
      setMode('manual');
    } finally { setGenerating(false); }
  };

  // Regenerate full profile for existing agent
  const regenFullProfile = async () => {
    setRegenningAll(true);
    try {
      const data = await generateAgentLLM({
        expert_type: `${form.name}, ${form.discipline}`,
        prior_background: form.professional_background || '',
        key_focus: regenHints.key_focus,
        bias_toward: regenHints.bias_toward,
        institutional_hint: regenHints.institutional_hint,
        adversary_hint: '',
      });
      setForm(f => ({ ...f, ...data, is_ai_generated: true }));
      setShowRegenPanel(false);
    } finally { setRegenningAll(false); }
  };

  // Regenerate a single field
  const regenField = async (fieldKey) => {
    setRegenning(r => ({ ...r, [fieldKey]: true }));
    try {
      const text = await regenerateAgentField({ field: fieldKey, agent: form });
      set(fieldKey, text);
    } finally {
      setRegenning(r => ({ ...r, [fieldKey]: false }));
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !form.tags?.includes(tagInput.trim())) {
      set('tags', [...(form.tags || []), tagInput.trim()]);
      setTagInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div className="w-[700px] max-h-[92vh] overflow-y-auto rounded-2xl" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>

        {/* Header */}
        <div className="sticky top-0 z-10 border-b" style={{ backgroundColor: 'var(--wr-bg-card)', borderColor: 'var(--wr-border)' }}>
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
                {agent?.id ? 'EDIT AGENT' : 'NEW AGENT'}
              </h2>
              {!agent?.id && (
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
                  {['manual', 'ai'].map(m => (
                    <button key={m} onClick={() => setMode(m)} className="px-3 py-1 text-xs font-medium transition-colors"
                      style={{ backgroundColor: mode === m ? 'var(--wr-amber)' : 'transparent', color: mode === m ? '#0D1B2A' : 'var(--wr-text-secondary)' }}>
                      {m === 'manual' ? 'Manual' : 'AI Generate'}
                    </button>
                  ))}
                </div>
              )}
              {/* Regen button for existing agents */}
              {agent?.id && (
                <button
                  onClick={() => setShowRegenPanel(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--wr-amber)', backgroundColor: showRegenPanel ? 'rgba(240,165,0,0.12)' : 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.2)' }}
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate Profile
                  {showRegenPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
            <button onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
          </div>

          {/* Full-profile regen panel (existing agents only) */}
          {agent?.id && showRegenPanel && (
            <div className="px-6 pb-4">
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid rgba(240,165,0,0.2)' }}>
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                  Claude will regenerate all text profile fields for <strong style={{ color: 'var(--wr-text-primary)' }}>{form.name}</strong> using the existing name and discipline as context. Optional hints below guide the output.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <WrInput label="KEY FOCUS HINT" value={regenHints.key_focus} onChange={v => setRegenHints(h => ({ ...h, key_focus: v }))} placeholder="What to prioritize..." />
                  <WrInput label="BIAS HINT" value={regenHints.bias_toward} onChange={v => setRegenHints(h => ({ ...h, bias_toward: v }))} placeholder="Bias to emphasize..." />
                  <WrInput label="INSTITUTIONAL HINT" value={regenHints.institutional_hint} onChange={v => setRegenHints(h => ({ ...h, institutional_hint: v }))} placeholder="Agency or sector..." />
                </div>
                <div className="flex items-center gap-2">
                  <WrButton onClick={regenFullProfile} disabled={regenningAll}>
                    {regenningAll
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating…</>
                      : <><Sparkles className="w-3.5 h-3.5" /> Regenerate Full Profile</>}
                  </WrButton>
                  <WrButton variant="secondary" onClick={() => setShowRegenPanel(false)}>Cancel</WrButton>
                  <span className="text-[10px] ml-1 italic" style={{ color: 'var(--wr-text-muted)' }}>All text fields will be overwritten — you can still edit before saving.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          {mode === 'ai' && !agent?.id ? (
            /* ── AI Generate (new agent) ───────────────────────────────── */
            <div className="space-y-4">
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Describe the expert you want and Claude will generate a full profile including all analytical and institutional fields.</p>
              <WrInput label="AGENT NAME" value={aiForm.name || ''} onChange={v => setAi('name', v)} placeholder="e.g. Maritime Security Specialist, Supply Chain Economist..." />
              <WrSelect label="DOMAIN" value={aiForm.domain_id} onChange={v => setAi('domain_id', v)}>
                <option value="">Select domain...</option>
                {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </WrSelect>
              <WrInput label="EXPERT TYPE *" value={aiForm.expert_type} onChange={v => setAi('expert_type', v)} placeholder="e.g. maritime security expert, behavioral economist, former NSA analyst..." />
              <div className="grid grid-cols-2 gap-3">
                <WrInput label="PRIOR BACKGROUND (optional)" value={aiForm.prior_background} onChange={v => setAi('prior_background', v)} placeholder="Career background hints..." />
                <WrInput label="KEY FOCUS AREA (optional)" value={aiForm.key_focus} onChange={v => setAi('key_focus', v)} placeholder="What do they prioritize..." />
                <WrInput label="KNOWN BIAS (optional)" value={aiForm.bias_toward} onChange={v => setAi('bias_toward', v)} placeholder="What they over or underweight..." />
                <WrInput label="INSTITUTIONAL HINT (optional)" value={aiForm.institutional_hint} onChange={v => setAi('institutional_hint', v)} placeholder="Former agency, sector, or org culture..." />
                <WrInput label="ADVERSARY LENS (optional)" value={aiForm.adversary_hint} onChange={v => setAi('adversary_hint', v)} placeholder="Assumed adversary sophistication or lens..." />
              </div>
              <WrButton onClick={generateAgent} disabled={!aiForm.expert_type || generating} className="w-full justify-center" size="lg">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Agent…</> : <><Sparkles className="w-4 h-4" /> Generate Agent</>}
              </WrButton>
              {generating && (
                <ProcessingBar label="Building the full expert profile…" elapsedMs={genElapsed}
                  sublabel="Generating persona, biases, and analytical fields. Usually 10–25 seconds." />
              )}
            </div>
          ) : (
            /* ── Manual Edit ───────────────────────────────────────────── */
            <div className="space-y-6">

              {/* AGENT IDENTITY */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>AGENT IDENTITY</p>
                <div className="grid grid-cols-2 gap-3">
                  <WrInput label="NAME" value={form.name} onChange={v => set('name', v)} placeholder="Agent name" className="col-span-2" />
                  <WrInput label="DISCIPLINE" value={form.discipline} onChange={v => set('discipline', v)} placeholder="e.g. Counterintelligence" />
                  <WrSelect label="DOMAIN" value={form.domain_id} onChange={v => set('domain_id', v)}>
                    <option value="">Select domain...</option>
                    {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </WrSelect>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>TAGS</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {form.tags?.map(t => (
                      <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-secondary)' }}>
                        {t}
                        <button onClick={() => set('tags', form.tags.filter(x => x !== t))} className="text-red-400 ml-1">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add tag..."
                      className="flex-1 px-2 py-1 text-xs rounded-lg outline-none"
                      style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
                    <WrButton variant="secondary" size="xs" onClick={addTag}>Add</WrButton>
                  </div>
                </div>
              </div>

              {/* PROFILE */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>PROFILE</p>
                <div className="space-y-3">
                  <RegenField label="PERSONA DESCRIPTION" fieldKey="persona_description" value={form.persona_description} onChange={v => set('persona_description', v)}
                    onRegen={() => regenField('persona_description')} regenning={!!regenning.persona_description} rows={3}
                    placeholder="Who is this expert, how do they think, what have they seen..." />
                  <RegenField label="COGNITIVE BIAS" fieldKey="cognitive_bias" value={form.cognitive_bias} onChange={v => set('cognitive_bias', v)}
                    onRegen={() => regenField('cognitive_bias')} regenning={!!regenning.cognitive_bias} rows={2}
                    placeholder="What this expert systematically underweights or misses..." />
                  <RegenField label="DEBIASING INSTRUCTION" fieldKey="debiasing_instruction" value={form.debiasing_instruction} onChange={v => set('debiasing_instruction', v)}
                    onRegen={() => regenField('debiasing_instruction')} regenning={!!regenning.debiasing_instruction} rows={2} optional
                    placeholder="The self-correction habit that counters the bias above (paired with it in every prompt)..." />
                  <RegenField label="RED-TEAM FOCUS" fieldKey="red_team_focus" value={form.red_team_focus} onChange={v => set('red_team_focus', v)}
                    onRegen={() => regenField('red_team_focus')} regenning={!!regenning.red_team_focus} rows={2}
                    placeholder="What this agent hunts for in any scenario..." />
                </div>
              </div>

              {/* ANALYTICAL STYLE */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>ANALYTICAL STYLE</p>
                <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>How this expert evaluates evidence and engages in analytical debate.</p>
                <div className="space-y-3">
                  <RegenField label="EPISTEMIC STYLE" fieldKey="epistemic_style" value={form.epistemic_style} onChange={v => set('epistemic_style', v)}
                    onRegen={() => regenField('epistemic_style')} regenning={!!regenning.epistemic_style} rows={2} optional
                    placeholder="Evidence threshold, preferred collection types, tolerance for ambiguity..." />
                  <RegenField label="SOURCE PREFERENCES" fieldKey="source_preferences" value={form.source_preferences} onChange={v => set('source_preferences', v)}
                    onRegen={() => regenField('source_preferences')} regenning={!!regenning.source_preferences} rows={2} optional
                    placeholder="Evidence/collection types this expert weights most: HUMINT / OSINT / telemetry / financial / academic..." />
                  <RegenField label="ANALYTICAL FRAMEWORK" fieldKey="analytical_framework" value={form.analytical_framework} onChange={v => set('analytical_framework', v)}
                    onRegen={() => regenField('analytical_framework')} regenning={!!regenning.analytical_framework} rows={2} optional
                    placeholder="Named methods this expert applies: ACH, MITRE ATT&CK, kill-chain, Bayesian updating..." />
                  <RegenField label="CONFLICT TRIGGERS" fieldKey="conflict_triggers" value={form.conflict_triggers} onChange={v => set('conflict_triggers', v)}
                    onRegen={() => regenField('conflict_triggers')} regenning={!!regenning.conflict_triggers} rows={2} optional
                    placeholder="What arguments or sources this expert distrusts or dismisses..." />
                  <RegenField label="ADVERSARY MODEL" fieldKey="adversary_model" value={form.adversary_model} onChange={v => set('adversary_model', v)}
                    onRegen={() => regenField('adversary_model')} regenning={!!regenning.adversary_model} rows={2} optional
                    placeholder="Assumed adversary sophistication and primary threat lens..." />
                </div>
              </div>

              {/* INSTITUTIONAL PROFILE */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>INSTITUTIONAL PROFILE</p>
                <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>Organizational history and incentive structures that shape how this expert behaves under pressure.</p>
                <div className="space-y-3">
                  <RegenField label="INSTITUTIONAL BACKGROUND" fieldKey="institutional_background" value={form.institutional_background} onChange={v => set('institutional_background', v)}
                    onRegen={() => regenField('institutional_background')} regenning={!!regenning.institutional_background} rows={2} optional
                    placeholder="Former agency, service, or sector; organizational culture imprint..." />
                  <RegenField label="DECISION STYLE" fieldKey="decision_style" value={form.decision_style} onChange={v => set('decision_style', v)}
                    onRegen={() => regenField('decision_style')} regenning={!!regenning.decision_style} rows={2} optional
                    placeholder="Operational tempo, escalation threshold, response posture..." />
                  <RegenField label="INSTITUTIONAL INCENTIVES" fieldKey="institutional_incentives" value={form.institutional_incentives} onChange={v => set('institutional_incentives', v)}
                    onRegen={() => regenField('institutional_incentives')} regenning={!!regenning.institutional_incentives} rows={2} optional
                    placeholder="Career, organizational, and political incentives shaping assessments..." />
                </div>
              </div>

              {/* OPTIMAL SME — competence map, tradecraft, risk posture, debate behavior */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(240,165,0,0.2)' }}>
                <button type="button" onClick={() => setShowAdvanced(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3"
                  style={{ backgroundColor: 'rgba(240,165,0,0.06)' }}>
                  <span className="flex items-center gap-2 text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
                    <SlidersHorizontal className="w-3.5 h-3.5" /> OPTIMAL SME — COMPETENCE, TRADECRAFT & DEBATE
                  </span>
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} />}
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 pt-3 space-y-4" style={{ borderTop: '1px solid var(--wr-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                      These fields most separate a bona fide expert from a confident generalist — they keep the SME in its lane, guard against its discipline's blind spots, and make Round 2 belief-updates real. All optional; all injected into the debate prompt.
                    </p>

                    {/* Competence map */}
                    <div>
                      <p className="text-[11px] font-bold tracking-widest mb-2 font-mono" style={{ color: 'var(--wr-text-secondary)' }}>COMPETENCE MAP</p>
                      <div className="space-y-2">
                        <WrInput label="DOMAIN FLUENCY (label: 0-10, comma-separated)" value={fluencyVal()} onChange={setFluency}
                          placeholder="intelligence tradecraft: 9, cyber technical: 5, insider threat: 8" />
                        <div className="grid grid-cols-2 gap-2">
                          <WrInput label="STRONG IN" value={listVal('expertise_boundaries','strong')} onChange={v => setNestedList('expertise_boundaries','strong', v)} placeholder="comma-separated" />
                          <WrInput label="WEAK IN" value={listVal('expertise_boundaries','weak')} onChange={v => setNestedList('expertise_boundaries','weak', v)} placeholder="comma-separated" />
                          <WrInput label="DEFER TO" value={listVal('expertise_boundaries','defer_to')} onChange={v => setNestedList('expertise_boundaries','defer_to', v)} placeholder="disciplines this SME yields to" />
                          <WrInput label="FORBIDDEN OVERREACH" value={listVal('expertise_boundaries','forbidden_overreach')} onChange={v => setNested('expertise_boundaries','forbidden_overreach', v)} placeholder="what it must never claim as fact" />
                        </div>
                      </div>
                    </div>

                    {/* Analytic tradecraft */}
                    <div>
                      <p className="text-[11px] font-bold tracking-widest mb-2 font-mono" style={{ color: 'var(--wr-text-secondary)' }}>ANALYTIC TRADECRAFT</p>
                      <div className="grid grid-cols-1 gap-2">
                        <WrInput label="COMMON INDICATORS" value={listVal('tradecraft','common_indicators')} onChange={v => setNestedList('tradecraft','common_indicators', v)} placeholder="what it actively looks for (comma-separated)" />
                        <WrInput label="COMMON FALSE POSITIVES" value={listVal('tradecraft','common_false_positives')} onChange={v => setNestedList('tradecraft','common_false_positives', v)} placeholder="what tends to fool this discipline" />
                        <WrInput label="FAILURE MODES" value={listVal('tradecraft','failure_modes')} onChange={v => setNestedList('tradecraft','failure_modes', v)} placeholder="how this discipline characteristically errs" />
                      </div>
                    </div>

                    {/* Risk posture */}
                    <div>
                      <p className="text-[11px] font-bold tracking-widest mb-2 font-mono" style={{ color: 'var(--wr-text-secondary)' }}>RISK POSTURE (FP/FN ASYMMETRY)</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[['risk_sensitivity','RISK SENSITIVITY'],['false_negative_tolerance','FALSE-NEG TOLERANCE'],['false_positive_tolerance','FALSE-POS TOLERANCE']].map(([key, label]) => (
                          <div key={key}>
                            <label className="block text-[10px] font-medium mb-1 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>{label}</label>
                            <div className="flex gap-1">
                              {['low','medium','high'].map(opt => (
                                <button key={opt} type="button" onClick={() => setNested('risk_posture', key, form.risk_posture?.[key] === opt ? '' : opt)}
                                  className="flex-1 px-1 py-1 rounded text-[10px] font-medium capitalize transition-all"
                                  style={{
                                    backgroundColor: form.risk_posture?.[key] === opt ? 'var(--wr-amber)' : 'var(--wr-bg-primary)',
                                    color: form.risk_posture?.[key] === opt ? '#0D1B2A' : 'var(--wr-text-secondary)',
                                    border: `1px solid ${form.risk_posture?.[key] === opt ? 'var(--wr-amber)' : 'var(--wr-border)'}`,
                                  }}>
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <WrInput label="ESCALATION BIAS" value={form.risk_posture?.escalation_bias || ''} onChange={v => setNested('risk_posture','escalation_bias', v)} placeholder="short phrase, e.g. escalates early on ambiguous OT anomalies" />
                      </div>
                    </div>

                    {/* Debate behavior + belief-update rules */}
                    <div>
                      <p className="text-[11px] font-bold tracking-widest mb-2 font-mono" style={{ color: 'var(--wr-text-secondary)' }}>DEBATE BEHAVIOR &amp; BELIEF-UPDATE RULES</p>
                      <div className="grid grid-cols-2 gap-2">
                        <WrInput label="DEBATE ROLE" value={form.debate_behavior?.debate_role || ''} onChange={v => setNested('debate_behavior','debate_role', v)} placeholder="e.g. domain challenger, coalition builder" />
                        <WrInput label="REBUTTAL STYLE" value={form.debate_behavior?.rebuttal_style || ''} onChange={v => setNested('debate_behavior','rebuttal_style', v)} placeholder="how they argue and concede" />
                        <WrInput label="WHAT CHANGES MIND" value={form.debate_behavior?.what_changes_mind || ''} onChange={v => setNested('debate_behavior','what_changes_mind', v)} placeholder="the evidence that moves them" className="col-span-2" />
                        <WrInput label="UPDATES FAST WHEN" value={form.update_triggers?.fast_when || ''} onChange={v => setNested('update_triggers','fast_when', v)} placeholder="revises quickly when..." />
                        <WrInput label="UPDATES SLOW WHEN" value={form.update_triggers?.slow_when || ''} onChange={v => setNested('update_triggers','slow_when', v)} placeholder="revises cautiously when..." />
                        <WrInput label="RESISTANT WHEN" value={form.update_triggers?.resistant_when || ''} onChange={v => setNested('update_triggers','resistant_when', v)} placeholder="digs in when..." className="col-span-2" />
                      </div>
                    </div>

                    {/* Role type */}
                    <div>
                      <label className="block text-[11px] font-bold tracking-widest mb-2 font-mono" style={{ color: 'var(--wr-text-secondary)' }}>ROLE TYPE</label>
                      <div className="flex flex-wrap gap-1.5">
                        {['sme','red-team',"devil's-advocate",'facilitator'].map(rt => (
                          <button key={rt} type="button" onClick={() => set('role_type', rt)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize"
                            style={{
                              backgroundColor: (form.role_type || 'sme') === rt ? '#2E86AB' : 'var(--wr-bg-primary)',
                              color: (form.role_type || 'sme') === rt ? '#fff' : 'var(--wr-text-secondary)',
                              border: `1px solid ${(form.role_type || 'sme') === rt ? '#2E86AB' : 'var(--wr-border)'}`,
                            }}>
                            {rt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PERSONA TUNING */}
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} />
                  <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>PERSONA TUNING</p>
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-mono" style={{ backgroundColor: 'rgba(240,165,0,0.1)', color: 'var(--wr-amber)', border: '1px solid rgba(240,165,0,0.2)' }}>influences LLM output</span>
                </div>
                <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
                  These fields shape how this agent reasons and writes during session assessments.
                </p>
                <div className="space-y-3">
                  <RegenField label="PROFESSIONAL BACKGROUND" fieldKey="professional_background" value={form.professional_background} onChange={v => set('professional_background', v)}
                    onRegen={() => regenField('professional_background')} regenning={!!regenning.professional_background} rows={2}
                    placeholder="e.g. 15 years at NSA, then private sector threat intelligence. Led post-9/11 HUMINT reforms..." />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>EXPERTISE LEVEL</label>
                      <div className="flex flex-wrap gap-1.5">
                        {['Junior', 'Mid-Level', 'Senior', 'Principal', 'World-Class'].map(lvl => (
                          <button key={lvl} onClick={() => set('expertise_level', lvl)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                            style={{
                              backgroundColor: form.expertise_level === lvl ? 'var(--wr-amber)' : 'var(--wr-bg-primary)',
                              color: form.expertise_level === lvl ? '#0D1B2A' : 'var(--wr-text-secondary)',
                              border: `1px solid ${form.expertise_level === lvl ? 'var(--wr-amber)' : 'var(--wr-border)'}`,
                            }}>
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>REASONING STYLE</label>
                      <div className="flex flex-wrap gap-1.5">
                        {['Analytical', 'Intuitive', 'Contrarian', 'Systematic', 'Probabilistic'].map(style => (
                          <button key={style} onClick={() => set('reasoning_style', style)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                            style={{
                              backgroundColor: form.reasoning_style === style ? '#2E86AB' : 'var(--wr-bg-primary)',
                              color: form.reasoning_style === style ? '#fff' : 'var(--wr-text-secondary)',
                              border: `1px solid ${form.reasoning_style === style ? '#2E86AB' : 'var(--wr-border)'}`,
                            }}>
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* VECTOR WEIGHTS */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>VECTOR WEIGHTS</p>
                <div className="space-y-3">
                  {['human', 'technical', 'physical', 'futures'].map(v => (
                    <div key={v} className="flex items-center gap-3">
                      <span className="text-xs w-20 flex-shrink-0 capitalize" style={{ color: 'var(--wr-text-secondary)' }}>{v}</span>
                      <input type="range" min={0} max={100} value={form[`vector_${v}`] || 0}
                        onChange={e => set(`vector_${v}`, parseInt(e.target.value))}
                        className="flex-1 accent-amber-500" />
                      <input type="number" min={0} max={100} value={form[`vector_${v}`] || 0}
                        onChange={e => set(`vector_${v}`, parseInt(e.target.value))}
                        className="w-12 px-2 py-1 text-xs text-center rounded-lg outline-none"
                        style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* DEFAULT SEVERITY */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>DEFAULT SEVERITY</p>
                <div className="flex gap-2">
                  {SEVERITIES.map(s => (
                    <button key={s} onClick={() => set('severity_default', s)}
                      className="px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all"
                      style={{ backgroundColor: form.severity_default === s ? SEV_COLORS[s] : `${SEV_COLORS[s]}22`, color: form.severity_default === s ? (s === 'HIGH' ? '#0D1B2A' : '#fff') : SEV_COLORS[s] }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'manual' && (
          <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t" style={{ backgroundColor: 'var(--wr-bg-card)', borderColor: 'var(--wr-border)' }}>
            <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
            <WrButton onClick={() => onSave(form)}>Save Agent</WrButton>
          </div>
        )}
      </div>
    </div>
  );
}
