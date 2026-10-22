import {useBackgroundWork} from '@/components/layout/BackgroundWork';
import RiskLibrary from '@/components/risks/RiskLibrary';
import { useState } from 'react';
import { generateChain as generateChainLLM } from '@/lib/llm';
import { Plus, Sparkles, X, ArrowRight } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import { WrInput, WrSelect } from '@/components/ui/WrInput';

function ChainStepCard({ step, index, agents, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  return (
    <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold font-mono" style={{ color: 'var(--wr-amber)' }}>STEP {step.step_number}</span>
        <div className="flex items-center gap-1">
          <button data-ui="action" onClick={onMoveUp} className="p-1 hover:bg-white/5 rounded text-xs" style={{ color: 'var(--wr-text-muted)' }}>↑</button>
          <button data-ui="action" onClick={onMoveDown} className="p-1 hover:bg-white/5 rounded text-xs" style={{ color: 'var(--wr-text-muted)' }}>↓</button>
          <button aria-label="Close" data-ui="icon" onClick={onRemove} className="p-1 hover:bg-white/5 rounded"><X className="w-3.5 h-3.5 text-red-400" /></button>
        </div>
      </div>
      <div className="space-y-2">
        <select
          value={step.agent_id || ''}
          onChange={e => onUpdate({ ...step, agent_id: e.target.value, agent_label: agents.find(a=>a.id===e.target.value)?.name || step.agent_label })}
          className="w-full px-2 py-1.5 text-xs rounded outline-none"
          style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}
        >
          <option value="">Select SME from library...</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name} — {a.discipline}</option>)}
        </select>
        {!step.agent_id && (
          <input value={step.agent_label || ''} onChange={e => onUpdate({ ...step, agent_label: e.target.value })} placeholder="Or type SME label..."
            className="w-full px-2 py-1.5 text-xs rounded outline-none"
            style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
        )}
        <textarea value={step.step_text || ''} onChange={e => onUpdate({ ...step, step_text: e.target.value })} placeholder="Describe what happens in this step..." rows={3}
          className="w-full px-2 py-1.5 text-xs rounded outline-none resize-none"
          style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }} />
      </div>
    </div>
  );
}

function ChainBuilderPanel({ chain, domains, scenarios, agents, onSave, onClose, mode: initialMode }) {
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
  const save=async()=>{setSaving(true);setSaveError('');try{await onSave(form);}catch(e){setSaveError(e.message);}finally{setSaving(false);}};
  const [form, setForm] = useState({ name:'', description:'', domain_id:'', scenario_id:'', tags:[], steps:[], is_ai_generated:false, ...chain });
  const [aiForm, setAiForm] = useState({ scenario_id:chain?.scenario_id || '', chain_type:'Multi-discipline attack chain', num_steps:5, focus_area:'' });
  const [mode, setMode] = useState(initialMode || 'manual');
  const [generating, setGenerating] = useState(false);
 useBackgroundWork(generating||saving,'Chain generation',{});
  const [genError, setGenError] = useState(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const setAi = (k,v) => setAiForm(f=>({...f,[k]:v}));

  const addStep = () => {
    const steps = [...(form.steps || [])];
    steps.push({ step_number: steps.length + 1, agent_id:'', agent_label:'', step_text:'' });
    set('steps', steps);
  };

  const updateStep = (i, s) => {
    const steps = [...form.steps];
    steps[i] = { ...s, step_number: i + 1 };
    set('steps', steps);
  };

  const removeStep = (i) => {
    const steps = form.steps.filter((_,idx) => idx !== i).map((s,idx) => ({...s, step_number:idx+1}));
    set('steps', steps);
  };

  const moveStep = (i, dir) => {
    const steps = [...form.steps];
    const target = i + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[i], steps[target]] = [steps[target], steps[i]];
    set('steps', steps.map((s,idx) => ({...s, step_number:idx+1})));
  };

  const generateChain = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const scenario = scenarios.find(s => s.id === aiForm.scenario_id);
      const data = await generateChainLLM({
        ...aiForm,
        scenarioContext: scenario?.context_document || '',
        agentList: agents.map(a => ({ name: a.name, discipline: a.discipline }))
      });
      {
        setForm(f => ({
          ...f,
          name: data.name || f.name,
          description: data.description || f.description,
          steps: data.steps || [],
          is_ai_generated: true,
          scenario_id: aiForm.scenario_id,
        }));
        setMode('manual');
      }
    } catch (e) {
      setGenError(e.message || 'Generation failed');
    } finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div data-ui="surface" className="w-[800px] max-h-[92vh] overflow-y-auto rounded-lg" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b" style={{ backgroundColor: 'var(--wr-bg-card)', borderColor: 'var(--wr-border)' }}>
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>
              {chain?.id ? 'EDIT CHAIN' : 'BUILD CHAIN'}
            </h2>
            {!chain?.id && (
              <div data-ui="surface" className="flex rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
                {['manual','ai'].map(m => (
                  <button data-ui="action" key={m} onClick={() => setMode(m)} className="px-3 py-1 text-xs font-medium transition-colors"
                    style={{ backgroundColor: mode===m ? 'var(--wr-amber)' : 'transparent', color: mode===m ? '#0D1B2A' : 'var(--wr-text-secondary)' }}>
                    {m==='manual' ? 'Manual Builder' : 'AI Generator'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /></button>
        </div>

        <div className="p-6">
          {mode === 'ai' ? (
            <div className="space-y-4">{saveError && <p role="alert" className="text-red-300">{saveError}</p>}
              <WrSelect label="SCENARIO" value={aiForm.scenario_id} onChange={v => setAi('scenario_id',v)}>
                <option value="">Select scenario...</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </WrSelect>
              <WrSelect label="CHAIN TYPE" value={aiForm.chain_type} onChange={v => setAi('chain_type',v)}>
                {['Multi-discipline attack chain','Escalation scenario','Supply chain compromise path','Influence & perception chain','Economic cascade chain'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </WrSelect>
              <div>
                <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>NUMBER OF STEPS: {aiForm.num_steps}</label>
                <input type="range" min={3} max={10} value={aiForm.num_steps} onChange={e => setAi('num_steps', parseInt(e.target.value))} className="w-full accent-amber-500" />
              </div>
              <WrInput label="FOCUS AREA (optional)" value={aiForm.focus_area} onChange={v => setAi('focus_area',v)} placeholder="e.g. design phase, LNG market..." />
              {saveError && <p role="alert" className="text-red-300">{saveError}</p>}{genError && (
                <div data-ui="surface" className="flex items-start gap-2 p-3 rounded text-xs" style={{ backgroundColor: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: '#C0392B' }}>
                  <span className="font-bold flex-shrink-0">Error:</span> {genError}
                </div>
              )}
              <WrButton onClick={generateChain} disabled={generating} className="w-full justify-center" size="lg">
                {generating ? <><span className="animate-pulse">Generating Chain...</span></> : <><Sparkles className="w-4 h-4" /> Generate Chain</>}
              </WrButton>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">{saveError && <p role="alert" className="text-red-300">{saveError}</p>}
                <WrInput label="CHAIN NAME" value={form.name} onChange={v => set('name',v)} placeholder="Chain name..." />
                <WrSelect label="DOMAIN" value={form.domain_id} onChange={v => set('domain_id',v)}>
                  <option value="">Select domain...</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </WrSelect>
                <WrSelect label="SCENARIO (optional)" value={form.scenario_id} onChange={v => set('scenario_id',v)}>
                  <option value="">None</option>
                  {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </WrSelect>
                <WrInput label="DESCRIPTION" value={form.description} onChange={v => set('description',v)} rows={3} placeholder="What does this chain represent..." />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>STEPS</p>
                    <WrButton variant="secondary" size="xs" onClick={addStep}><Plus className="w-3 h-3" /> Add Step</WrButton>
                  </div>
                  <div className="space-y-3">
                    {form.steps?.map((step, i) => (
                      <ChainStepCard key={i} step={step} index={i} agents={agents}
                        onUpdate={s => updateStep(i, s)}
                        onRemove={() => removeStep(i)}
                        onMoveUp={() => moveStep(i, -1)}
                        onMoveDown={() => moveStep(i, 1)}
                      />
                    ))}
                    {form.steps?.length === 0 && (
                      <div data-ui="surface" className="text-center py-6 rounded" style={{ border: '1px dashed var(--wr-border)' }}>
                        <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No steps yet. Click "Add Step" to begin.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Visual Preview */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-3 font-mono" style={{ color: 'var(--wr-text-muted)' }}>CHAIN PREVIEW</p>
                <div className="space-y-2">
                  {form.steps?.map((step, i) => (
                    <div key={i}>
                      <div data-ui="surface" className="p-3 rounded text-xs" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                        <span className="font-bold font-mono" style={{ color: 'var(--wr-amber)' }}>STEP {step.step_number} </span>
                        <span style={{ color: 'var(--wr-text-secondary)' }}>{step.agent_label || agents.find(a=>a.id===step.agent_id)?.name || '—'}</span>
                        {step.step_text && <p className="mt-1 line-clamp-2" style={{ color: 'var(--wr-text-muted)' }}>{step.step_text}</p>}
                      </div>
                      {i < form.steps.length - 1 && (
                        <div className="flex justify-center py-1"><ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--wr-amber)' }} /></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {mode === 'manual' && (
          <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t" style={{ backgroundColor: 'var(--wr-bg-card)', borderColor: 'var(--wr-border)' }}>
            <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
            <WrButton disabled={saving || !form.name.trim()} onClick={save}>Save Chain</WrButton>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chains() { return <RiskLibrary kind="Chain" Editor={ChainBuilderPanel} />; }
