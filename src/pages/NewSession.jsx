import {workflowAction} from '@/components/ui/WorkflowControls';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Swords, Plus, X, ChevronRight, Zap, BarChart2, Globe, Link2, Sparkles, Loader2, AlertCircle, UserPlus, ChevronDown, ChevronUp, Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import WrButton from '@/components/ui/WrButton';
import SeverityBadge, { agentDefaultSeverityTitle } from '@/components/ui/SeverityBadge';
import { WrInput, WrSelect } from '@/components/ui/WrInput';
import AgentFormModal from '@/components/agents/AgentFormModal';
import { recommendAgents, generateAgent as generateAgentLLM } from '@/lib/llm';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const MODES = [
  {
    id: 'classic',
    icon: BarChart2,
    label: 'Classic Analysis',
    description: 'Two-round structured assessment. SMEs work independently, then rebuttal round produces a scored synthesis.',
    color: '#2E86AB',
  },
  {
    id: 'live',
    icon: Zap,
    label: 'Live Debate',
    description: 'Real-time streaming debate room. Watch SMEs think, interject with questions, and direct the conversation.',
    color: '#F0A500',
  },
  {
    id: 'panel',
    icon: Users,
    label: 'Expert Panel',
    description: 'A standing panel that works through the problem with you. SMEs speak up when a topic is theirs, defer when it is not, and argue with each other — for expertise you cannot convene in person.',
    color: '#9B59B6',
  },
];

export default function NewSession() {
  const { db } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [domains, setDomains] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [agents, setAgents] = useState([]);
  const [chains, setChains] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [decisionOptions, setDecisionOptions] = useState([]);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: `Session ${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`,
    // 'risk' = normal risk debate · 'decision' = evaluate a specific decision option
    focus: searchParams.get('decision') ? 'decision' : 'risk',
    decision_id: searchParams.get('decision') || '',
    decision_option_id: searchParams.get('option') || '',
    domain_id: '',
    scenario_id: searchParams.get('scenario') || '',
    phase_focus: '',
    context_override: '',
    facilitator_note: '',
    pinned_chain_ids: [],
    mode: searchParams.get('mode') === 'live' ? 'live' : 'classic',
    source_pins: [],
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [newPinUrl, setNewPinUrl] = useState('');
  const [newPinLabel, setNewPinLabel] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recError, setRecError] = useState('');
  const [showRecs, setShowRecs] = useState(false);
  const [createFromRec, setCreateFromRec] = useState(null); // full agent object ready for modal
  const [generatingAgent, setGeneratingAgent] = useState(null); // rec being generated (shows spinner)
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const addPin = () => {
    const url = newPinUrl.trim();
    if (!url || !url.startsWith('http')) return;
    set('source_pins', [...form.source_pins, { url, label: newPinLabel.trim() }]);
    setNewPinUrl('');
    setNewPinLabel('');
  };
  const removePin = (i) => set('source_pins', form.source_pins.filter((_, idx) => idx !== i));

  useEffect(() => {
    if (!db) return;
    Promise.all([
      db.Domain.list(),
      db.Scenario.list(),
      db.Agent.list(),
      db.Chain.list(),
      db.Decision ? db.Decision.list('-created_at').catch(() => []) : [],
      db.DecisionOption ? db.DecisionOption.list().catch(() => []) : [],
    ]).then(([d,s,a,ch,dec,opts]) => {
      setDomains(d); setScenarios(s); setAgents(a); setChains(ch);
      setDecisions(dec || []); setDecisionOptions(opts || []);
    });
  }, [db]);

  const togglePinnedChain = (chainId) => {
    const current = form.pinned_chain_ids;
    if (current.includes(chainId)) {
      set('pinned_chain_ids', current.filter(id => id !== chainId));
    } else if (current.length < 3) {
      set('pinned_chain_ids', [...current, chainId]);
    }
  };

  const toggleAgent = (agent) => {
    if (selectedAgents.find(a => a.id === agent.id)) {
      setSelectedAgents(selectedAgents.filter(a => a.id !== agent.id));
    } else {
      setSelectedAgents([...selectedAgents, agent]);
    }
  };

  const selectedScenario = scenarios.find(s => s.id === form.scenario_id);
  const selectedDomain = domains.find(d => d.id === form.domain_id);
  const domainById = id => domains.find(d => d.id === id);
  const filteredAgents = agents.filter(a => !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.discipline?.toLowerCase().includes(search.toLowerCase()));

  const handleGetRecommendations = async () => {
    setLoadingRecs(true);
    setRecError('');
    setShowRecs(false);
    try {
      const recs = await recommendAgents({
        scenarioName: selectedScenario?.name || form.name,
        scenarioDescription: selectedScenario?.description || selectedScenario?.context_document?.slice(0, 400),
        domain: selectedDomain?.name,
        existingAgents: agents,
        count: 5,
      });
      setRecommendations(recs);
      setShowRecs(true);
    } catch (e) {
      setRecError(e.message || 'Failed to get recommendations');
    } finally {
      setLoadingRecs(false);
    }
  };

  const handleOpenCreateFromRec = async (rec) => {
    setGeneratingAgent(rec.name);
    try {
      const profile = await generateAgentLLM({
        expert_type: rec.expert_type,
        prior_background: '',
        key_focus: rec.key_focus,
        bias_toward: rec.cognitive_bias,
        domain_id: form.domain_id || '',
      });
      setCreateFromRec({
        ...profile,
        name: rec.name || profile.name,
        discipline: rec.discipline || profile.discipline,
        domain_id: form.domain_id || '',
        severity_default: rec.severity_default || profile.severity_default || 'HIGH',
        is_ai_generated: true,
      });
    } catch (e) {
      setRecError(`Failed to generate SME profile: ${e.message}`);
    } finally {
      setGeneratingAgent(null);
    }
  };

  const handleSaveNewAgent = async (agentForm) => {
    try {
      const saved = await db.Agent.create({ ...agentForm });
      setAgents(prev => [...prev, saved]);
      setSelectedAgents(prev => [...prev, saved]);
      setCreateFromRec(null);
    } catch (e) {
      alert(e.message || 'Failed to create SME');
    }
  };

  const handleSaveBlankAgent = async (agentForm) => {
    try {
      const saved = await db.Agent.create({ ...agentForm, is_ai_generated: agentForm.is_ai_generated || false });
      setAgents(prev => [...prev, saved]);
      setSelectedAgents(prev => [...prev, saved]);
      setShowNewAgentModal(false);
    } catch (e) {
      alert(e.message || 'Failed to create SME');
    }
  };

  const matchingAgent = (rec) =>
    agents.find(a =>
      a.discipline?.toLowerCase().includes(rec.discipline?.split(' ')[0]?.toLowerCase()) ||
      a.name?.toLowerCase().includes(rec.name?.split(' ')[0]?.toLowerCase())
    );

  const handleStart = async () => {
    if (!form.name || selectedAgents.length < 1) return;
    if (form.focus === 'decision' && (!form.decision_id || !form.decision_option_id)) {
      setSaveError('Decision Focus needs a decision and an option selected — or switch to Risk Debate.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        name: form.name,
        domain_id: form.domain_id || null,
        scenario_id: form.scenario_id || null,
        phase_focus: form.phase_focus,
        context_override: form.context_override,
        facilitator_note: form.facilitator_note || null,
        pinned_chain_ids: form.pinned_chain_ids,
        mode: form.mode,
        source_pins: form.source_pins,
        status: 'pending',
        agent_ids: selectedAgents.map(a => a.id),
        decision_id: form.focus === 'decision' ? (form.decision_id || null) : null,
        decision_option_id: form.focus === 'decision' ? (form.decision_option_id || null) : null,
      };
      const session = await db.Session.create(payload);
      for (const agent of selectedAgents) {
        await db.SessionAgent.create({ session_id: session.id, agent_id: agent.id, status: 'pending' });
      }
      navigate('/session-tracker?session='+session.id);
    } catch (err) {
      setSaveError(err.message || 'Failed to create session');
      setSaving(false);
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      <PageHeader
        icon={Swords}
        title="ADVANCED SESSION SETUP"
        subtitle="Manual or facilitated debate — you control when each round runs"
        actions={<Link data-ui="action" className={workflowAction} to={'/analysis'+(form.scenario_id?'?scenario='+encodeURIComponent(form.scenario_id):'')}>Return to guided start</Link>}
      />

      <div className="p-6 max-w-5xl mx-auto">

        {/* Mode picker */}
        <div className="mb-5">
          <p className="text-xs font-bold tracking-widest font-mono mb-3" style={{ color: 'var(--wr-text-muted)' }}>SESSION MODE</p>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map(mode => {
              const Icon = mode.icon;
              const isSelected = form.mode === mode.id;
              return (
                <button data-ui="card"
                  key={mode.id}
                  onClick={() => set('mode', mode.id)}
                  className="text-left p-4 rounded-2xl transition-all"
                  style={{
                    backgroundColor: isSelected ? `${mode.color}0d` : 'var(--wr-bg-card)',
                    border: `1.5px solid ${isSelected ? mode.color : 'var(--wr-border)'}`,
                  }}
                >
                  {/* Radio indicator + icon row */}
                  <div className="flex items-center gap-2.5 mb-3">
                    {/* Circular radio dot */}
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center transition-all"
                      style={{
                        border: `1.5px solid ${isSelected ? mode.color : 'var(--wr-border)'}`,
                        backgroundColor: isSelected ? `${mode.color}18` : 'transparent',
                      }}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: mode.color }} />
                      )}
                    </div>
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${mode.color}18` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: mode.color }} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: isSelected ? mode.color : 'var(--wr-text-primary)' }}>
                      {mode.label}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-muted)' }}>
                    {mode.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Session Setup */}
        <div data-ui="surface" className="rounded p-5 mb-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <h2 className="text-xs font-bold tracking-widest mb-4 font-mono" style={{ color: 'var(--wr-text-muted)' }}>SESSION SETUP</h2>

          {/* Session focus: normal risk debate vs decision option evaluation */}
          <div className="mb-4">
            <label className="block text-xs font-bold tracking-widest font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>SESSION FOCUS</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'risk', label: 'Risk Debate', desc: 'Open red-team analysis of the scenario' },
                { id: 'decision', label: 'Decision Focus', desc: 'Assess one option of a decision against the scenario' },
              ].map(f => {
                const active = form.focus === f.id;
                return (
                  <button data-ui="card" key={f.id} type="button" onClick={() => set('focus', f.id)}
                    className="text-left rounded p-3 transition-all"
                    style={{ backgroundColor: active ? 'rgba(240,165,0,0.08)' : 'var(--wr-bg-secondary)', border: `1px solid ${active ? 'rgba(240,165,0,0.4)' : 'var(--wr-border)'}` }}>
                    <span className="text-sm font-semibold" style={{ color: active ? 'var(--wr-amber)' : 'var(--wr-text-primary)' }}>{f.label}</span>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>{f.desc}</p>
                  </button>
                );
              })}
            </div>
            {form.focus === 'decision' && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <WrSelect label="DECISION" value={form.decision_id} onChange={v => { set('decision_id', v); set('decision_option_id', ''); }}>
                  <option value="">Select decision...</option>
                  {decisions.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </WrSelect>
                <WrSelect label="OPTION BEING ASSESSED" value={form.decision_option_id} onChange={v => set('decision_option_id', v)}>
                  <option value="">Select option...</option>
                  {decisionOptions.filter(o => o.decision_id === form.decision_id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </WrSelect>
                {form.decision_id && decisions.length === 0 && (
                  <p className="col-span-2 text-xs" style={{ color: 'var(--wr-text-muted)' }}>No decisions yet — create one on the Decisions page first.</p>
                )}
                <p className="col-span-2 text-xs" style={{ color: 'var(--wr-text-muted)' }}>
                  The decision, its acceptance criteria, the selected option, and its assumptions are injected into every SME prompt so the panel assesses <strong>this option specifically</strong>.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <WrInput label="SESSION NAME" value={form.name} onChange={v => set('name',v)} className="col-span-2" />
            <WrSelect label="DOMAIN" value={form.domain_id} onChange={v => set('domain_id',v)}>
              <option value="">Select domain...</option>
              {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </WrSelect>
            <WrSelect label="SCENARIO" value={form.scenario_id} onChange={v => set('scenario_id',v)}>
              <option value="">Select scenario...</option>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </WrSelect>
            <WrInput label="PHASE / FOCUS" value={form.phase_focus} onChange={v => set('phase_focus',v)} placeholder="e.g. Design Phase, Week 4..." className="col-span-2" />
          </div>

          {/* Facilitator note */}
          <div className="mt-4">
            <label className="block text-xs font-bold tracking-widest font-mono mb-1.5" style={{ color: 'var(--wr-text-muted)' }}>
              FACILITATOR NOTE <span style={{ color: 'var(--wr-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={form.facilitator_note}
              onChange={e => set('facilitator_note', e.target.value)}
              placeholder="Guidance injected into Round 2 SME prompts — e.g. 'Focus on supply chain dependencies...'"
              rows={2}
              className="w-full text-xs px-3 py-2 rounded outline-none resize-none"
              style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
            />
          </div>
          {selectedScenario?.context_document && (
            <div data-ui="surface" className="mt-4 p-3 rounded" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
              <p className="text-xs font-bold font-mono mb-2" style={{ color: 'var(--wr-text-muted)' }}>CONTEXT DOCUMENT PREVIEW</p>
              <p className="text-xs line-clamp-4" style={{ color: 'var(--wr-text-secondary)' }}>{selectedScenario.context_document}</p>
            </div>
          )}
        </div>

        {/* Agent Selection */}
        <div data-ui="surface" className="rounded p-5 mb-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>SELECT SMEs</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: selectedAgents.length >= 3 ? '#27AE60' : 'var(--wr-amber)' }}>
                {selectedAgents.length} selected {selectedAgents.length < 3 && '(min 3)'}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button data-ui="action"
                    onClick={handleGetRecommendations}
                    disabled={loadingRecs}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: 'rgba(240,165,0,0.1)',
                      border: '1px solid rgba(240,165,0,0.3)',
                      color: 'var(--wr-amber)',
                      opacity: loadingRecs ? 0.6 : 1,
                      cursor: loadingRecs ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loadingRecs
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Recommending...</>
                      : <><Sparkles className="w-3 h-3" /> Get Recommendations</>
                    }
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">AI suggests 5 complementary SME types suited to this scenario</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {recError && (
            <div data-ui="surface" className="flex items-center gap-2 mb-3 px-3 py-2 rounded text-xs" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: '#C0392B' }}>
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {recError}
            </div>
          )}

          {/* AI Recommendations panel */}
          {recommendations.length > 0 && (
            <div data-ui="surface" className="mb-4 rounded" style={{ border: '1px solid rgba(240,165,0,0.25)', backgroundColor: 'rgba(240,165,0,0.04)' }}>
              <button data-ui="disclosure"
                onClick={() => setShowRecs(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold font-mono tracking-widest"
                style={{ color: 'var(--wr-amber)' }}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI RECOMMENDATIONS ({recommendations.length})
                </span>
                {showRecs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showRecs && (
                <div className="px-4 pb-4 space-y-2">
                  <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>
                    Suggested SMEs for this scenario. Add an existing match or create a new SME.
                  </p>
                  {recommendations.map((rec, i) => {
                    const existing = matchingAgent(rec);
                    const alreadySelected = existing && selectedAgents.find(a => a.id === existing.id);
                    const SEV_COLOR = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
                    return (
                      <div data-ui="surface" key={i} className="rounded p-3" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{rec.name}</span>
                              <span data-ui="badge" className="text-xs px-1.5 py-0.5 rounded font-mono"
                                style={{ backgroundColor: `${SEV_COLOR[rec.severity_default] || '#D68910'}18`, color: SEV_COLOR[rec.severity_default] || '#D68910', border: `1px solid ${SEV_COLOR[rec.severity_default] || '#D68910'}40` }}>
                                {rec.discipline}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-muted)' }}>{rec.rationale}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            {existing ? (
                              <button data-ui="action"
                                onClick={() => !alreadySelected && toggleAgent(existing)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap"
                                style={{
                                  backgroundColor: alreadySelected ? 'rgba(39,174,96,0.12)' : 'rgba(39,174,96,0.1)',
                                  border: `1px solid ${alreadySelected ? '#27AE60' : 'rgba(39,174,96,0.35)'}`,
                                  color: '#27AE60',
                                  cursor: alreadySelected ? 'default' : 'pointer',
                                  opacity: alreadySelected ? 0.7 : 1,
                                }}
                              >
                                {alreadySelected ? '✓ Added' : `+ ${existing.name}`}
                              </button>
                            ) : null}
                            <button data-ui="action"
                              onClick={() => generatingAgent !== rec.name && handleOpenCreateFromRec(rec)}
                              disabled={generatingAgent === rec.name}
                              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap"
                              style={{ backgroundColor: 'rgba(46,134,171,0.1)', border: '1px solid rgba(46,134,171,0.35)', color: '#2E86AB', cursor: generatingAgent === rec.name ? 'not-allowed' : 'pointer', opacity: generatingAgent === rec.name ? 0.6 : 1 }}
                            >
                              {generatingAgent === rec.name
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Building...</>
                                : <><UserPlus className="w-3 h-3" /> {existing ? 'Create New' : 'Create SME'}</>
                              }
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Library */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium" style={{ color: 'var(--wr-text-muted)' }}>SME LIBRARY</p>
                <button data-ui="action"
                  onClick={() => setShowNewAgentModal(true)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                  style={{ backgroundColor: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', color: 'var(--wr-amber)', cursor: 'pointer' }}
                >
                  <Plus className="w-3 h-3" /> New SME
                </button>
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SMEs..."
                className="w-full px-2 py-1.5 text-xs rounded mb-2 outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
              {agents.length === 0 ? (
                <div data-ui="surface" className="p-4 rounded text-center" style={{ border: '1px dashed var(--wr-border)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--wr-text-muted)' }}>No SMEs in your library yet.</p>
                  <button data-ui="action"
                    onClick={handleGetRecommendations}
                    disabled={loadingRecs}
                    className="flex items-center gap-1 text-xs mx-auto px-2.5 py-1 rounded"
                    style={{ backgroundColor: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)', color: 'var(--wr-amber)', cursor: 'pointer' }}
                  >
                    <Sparkles className="w-3 h-3" /> Get suggestions
                  </button>
                </div>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {filteredAgents.map(agent => {
                    const dom = domainById(agent.domain_id);
                    const isSelected = selectedAgents.find(a => a.id === agent.id);
                    return (
                      <button data-ui="card" key={agent.id} onClick={() => toggleAgent(agent)}
                        className="w-full text-left p-2 rounded flex items-center gap-2 transition-colors"
                        style={{
                          backgroundColor: isSelected ? 'rgba(240,165,0,0.08)' : 'var(--wr-bg-secondary)',
                          border: `1px solid ${isSelected ? 'rgba(240,165,0,0.3)' : 'var(--wr-border)'}`,
                        }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</p>
                        </div>
                        {dom && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dom.color }} />}
                        <SeverityBadge severity={agent.severity_default} size="xs" title={agentDefaultSeverityTitle(agent.severity_default)} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--wr-text-muted)' }}>SESSION SMEs ({selectedAgents.length})</p>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {selectedAgents.length === 0 ? (
                  <div data-ui="surface" className="p-4 rounded text-center" style={{ border: '1px dashed var(--wr-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Click SMEs to add them</p>
                  </div>
                ) : (
                  selectedAgents.map((agent, i) => {
                    const dom = domainById(agent.domain_id);
                    return (
                      <div data-ui="surface" key={agent.id} className="p-2 rounded flex items-center gap-2"
                        style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid rgba(240,165,0,0.2)' }}>
                        <span className="text-xs font-mono w-5 flex-shrink-0" style={{ color: 'var(--wr-amber)' }}>{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{agent.name}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{agent.discipline}</p>
                        </div>
                        {dom && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dom.color }} />}
                        <button aria-label="Close" data-ui="icon" onClick={() => toggleAgent(agent)} className="text-red-400 hover:text-red-300 p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pinned Chains — inject chain context into agent prompts */}
        <div data-ui="surface" className="rounded p-5 mb-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} />
              <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>PIN THREAT CHAINS</h2>
            </div>
            <span className="text-xs font-mono" style={{ color: form.pinned_chain_ids.length >= 3 ? '#C0392B' : 'var(--wr-text-muted)' }}>
              {form.pinned_chain_ids.length}/3 selected
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--wr-text-muted)' }}>
            Select up to 3 chains to inject as context into SME prompts — SMEs will reason about compound threats.
            Chains are generated during synthesis or created in the{' '}
            <a data-ui="reference" href="/chains" className="underline" style={{ color: 'var(--wr-amber)' }}>Chain Library</a>.
          </p>
          {chains.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--wr-text-muted)' }}>
              No chains in your library yet. Run a synthesis on a completed session to auto-generate chains, or build one manually in the Chain Library.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {chains.map(chain => {
                const isSelected = form.pinned_chain_ids.includes(chain.id);
                const isDisabled = !isSelected && form.pinned_chain_ids.length >= 3;
                return (
                  <button data-ui="card"
                    key={chain.id}
                    onClick={() => !isDisabled && togglePinnedChain(chain.id)}
                    disabled={isDisabled}
                    className="w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all"
                    style={{
                      backgroundColor: isSelected ? 'rgba(240,165,0,0.08)' : 'var(--wr-bg-secondary)',
                      border: `1.5px solid ${isSelected ? 'rgba(240,165,0,0.4)' : 'rgba(138,155,181,0.25)'}`,
                      opacity: isDisabled ? 0.4 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {/* Visible checkbox */}
                    <div
                      className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all"
                      style={{
                        border: `2px solid ${isSelected ? 'var(--wr-amber)' : 'rgba(138,155,181,0.5)'}`,
                        backgroundColor: isSelected ? 'var(--wr-amber)' : 'transparent',
                      }}
                    >
                      {isSelected && <span style={{ color: '#0D1B2A', fontSize: 10, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: isSelected ? 'var(--wr-amber)' : 'var(--wr-text-primary)' }}>{chain.name}</p>
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>
                        {chain.steps?.length || 0} steps
                        {chain.is_ai_generated && <span className="ml-1.5 font-mono" style={{ color: '#9B59B6' }}>AI</span>}
                        {chain.description ? ` · ${chain.description.slice(0, 70)}` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Source Documents — shown for Live Debate mode */}
        {form.mode === 'live' && (
          <div data-ui="surface" className="rounded p-5 mb-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>SOURCE DOCUMENTS</h2>
              <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{form.source_pins.length} pinned</span>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
              URLs SMEs can fetch during the debate — reports, advisories, articles. SMEs see the list and decide when to read them.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                value={newPinUrl}
                onChange={e => setNewPinUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPin()}
                placeholder="https://..."
                className="flex-1 px-2 py-1.5 text-xs rounded outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
              />
              <input
                value={newPinLabel}
                onChange={e => setNewPinLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPin()}
                placeholder="Label (optional)"
                className="w-40 px-2 py-1.5 text-xs rounded outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
              />
              <button data-ui="action" onClick={addPin}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold flex-shrink-0"
                style={{ backgroundColor: 'rgba(26,188,156,0.15)', border: '1px solid #1ABC9C', color: '#1ABC9C' }}>
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {form.source_pins.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No sources pinned — SMEs will use Wikipedia and any URLs you paste in your questions.</p>
            ) : (
              <div className="space-y-1">
                {form.source_pins.map((pin, i) => (
                  <div data-ui="surface" key={i} className="flex items-center gap-2 px-2 py-1.5 rounded"
                    style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                    <Globe className="w-3 h-3 flex-shrink-0" style={{ color: '#1ABC9C' }} />
                    <div className="flex-1 min-w-0">
                      {pin.label && <p className="text-xs font-medium truncate" style={{ color: 'var(--wr-text-primary)' }}>{pin.label}</p>}
                      <p className="text-xs truncate" style={{ color: 'var(--wr-text-muted)' }}>{pin.url}</p>
                    </div>
                    <button aria-label="Close" data-ui="icon" onClick={() => removePin(i)} className="text-red-400 hover:text-red-300 p-0.5 flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Launch */}
        <div className="flex items-center justify-end gap-4">
          {saveError && (
            <p className="text-xs font-mono" style={{ color: '#C0392B' }}>
              Error: {saveError}
            </p>
          )}
          <WrButton
            size="lg"
            onClick={handleStart}
            disabled={saving || selectedAgents.length < 1 || !form.name}
            className="px-8"
          >
            {saving ? 'Creating...' : <><ChevronRight className="w-4 h-4" /> Create session and open tracker</>}
          </WrButton>
        </div>
      </div>

      {createFromRec && (
        <AgentFormModal
          mode="manual"
          domains={domains}
          agent={createFromRec}
          onClose={() => setCreateFromRec(null)}
          onSave={handleSaveNewAgent}
        />
      )}

      {showNewAgentModal && (
        <AgentFormModal
          domains={domains}
          onClose={() => setShowNewAgentModal(false)}
          onSave={handleSaveBlankAgent}
        />
      )}
    </div>
  );
}
