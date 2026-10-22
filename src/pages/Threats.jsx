import {useBackgroundWork} from '@/components/layout/BackgroundWork';
import MarkdownContent from '@/components/ui/MarkdownContent';
import RiskLibrary from '@/components/risks/RiskLibrary';
import { useState } from 'react';
import { generateThreats as generateThreatsLLM } from '@/lib/llm';
import { X, Sparkles } from 'lucide-react';
import WrButton from '@/components/ui/WrButton';
import SeverityBadge from '@/components/ui/SeverityBadge';
import { WrInput, WrSelect } from '@/components/ui/WrInput';

const SEVERITIES = ['CRITICAL','HIGH','MEDIUM','LOW'];
const SEV_COLORS = { CRITICAL:'#C0392B', HIGH:'#D68910', MEDIUM:'#2E86AB', LOW:'#27AE60' };

function ThreatModal({ threat, domains, scenarios, onSave, onClose }) {
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
  const save=async()=>{setSaving(true);setSaveError('');try{await onSave(form);}catch(e){setSaveError(e.message);}finally{setSaving(false);}};
  const [form, setForm] = useState({ name:'', description:'', severity:'HIGH', domain_id:'', scenario_id:'', category:'', tags:[], likelihood:null, impact:null, ...threat });
  const set = (k,v) => setForm(f => ({...f,[k]:v}));
  const LIK = { 1:'Rare', 2:'Unlikely', 3:'Possible', 4:'Likely', 5:'Almost Certain' };
  const IMP = { 1:'Negligible', 2:'Minor', 3:'Moderate', 4:'Major', 5:'Severe' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor:'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" className="w-[560px] max-h-[90vh] overflow-y-auto rounded-lg p-6" style={{ backgroundColor:'var(--wr-bg-card)', border:'1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color:'var(--wr-amber)' }}>
            {threat?.id ? 'EDIT THREAT' : 'NEW THREAT'}
          </h2>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color:'var(--wr-text-muted)' }} /></button>
        </div>
        <div className="space-y-4">{saveError && <p role="alert" className="text-red-300">{saveError}</p>}
          <WrInput label="NAME" value={form.name} onChange={v => set('name',v)} placeholder="Threat name" />
          <WrInput label="DESCRIPTION" value={form.description} onChange={v => set('description',v)} rows={3} placeholder="Describe this threat..." />
          <div>
            <label className="block text-xs font-medium mb-2 tracking-wide" style={{ color:'var(--wr-text-secondary)' }}>SEVERITY</label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button data-ui="action" key={s} onClick={() => set('severity',s)}
                  className="px-3 py-1.5 rounded text-xs font-bold font-mono transition-all"
                  style={{ backgroundColor: form.severity===s ? SEV_COLORS[s] : `${SEV_COLORS[s]}22`, color: form.severity===s ? '#fff' : SEV_COLORS[s] }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <WrSelect label="DOMAIN" value={form.domain_id} onChange={v => set('domain_id',v)}>
            <option value="">Select domain...</option>
            {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </WrSelect>
          <WrSelect label="SCENARIO (optional)" value={form.scenario_id} onChange={v => set('scenario_id',v)}>
            <option value="">None</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </WrSelect>
          <WrInput label="CATEGORY" value={form.category} onChange={v => set('category',v)} placeholder="e.g. Supply Chain, Cyber, HUMINT..." />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-2 tracking-wide" style={{ color:'var(--wr-text-secondary)' }}>LIKELIHOOD</label>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button data-ui="action" key={n} onClick={() => set('likelihood', form.likelihood===n ? null : n)} title={LIK[n]}
                    className="flex-1 py-1.5 rounded text-xs font-bold font-mono transition-all"
                    style={{ backgroundColor: form.likelihood===n ? '#2E86AB' : 'var(--wr-bg-secondary)', color: form.likelihood===n ? '#fff' : 'var(--wr-text-muted)', border:'1px solid var(--wr-border)' }}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color:'var(--wr-text-muted)' }}>{form.likelihood ? LIK[form.likelihood] : '1 Rare … 5 Almost Certain'}</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-2 tracking-wide" style={{ color:'var(--wr-text-secondary)' }}>IMPACT</label>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button data-ui="action" key={n} onClick={() => set('impact', form.impact===n ? null : n)} title={IMP[n]}
                    className="flex-1 py-1.5 rounded text-xs font-bold font-mono transition-all"
                    style={{ backgroundColor: form.impact===n ? '#C0392B' : 'var(--wr-bg-secondary)', color: form.impact===n ? '#fff' : 'var(--wr-text-muted)', border:'1px solid var(--wr-border)' }}>
                    {n}
                  </button>
                ))}
              </div>
              <MarkdownContent className="text-xs mt-1" style={{ color:'var(--wr-text-muted)' }}>{form.impact ? IMP[form.impact] : '1 Negligible … 5 Severe'}</MarkdownContent>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
          <WrButton disabled={saving || !form.name.trim()} onClick={save}>Save Threat</WrButton>
        </div>
      </div>
    </div>
  );
}

function AiGenerateModal({ scenarios, domains, onGenerated, onClose }) {
 const [genError,setGenError]=useState(''), [saving,setSaving]=useState(false);
  const [scenarioId, setScenarioId] = useState('');
  const [loading, setLoading] = useState(false);
 useBackgroundWork(loading||saving,'Threat recommendations');
  const [generated, setGenerated] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const generate = async () => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;
    setLoading(true);
    try {
      const res = await generateThreatsLLM({ scenarioContext: scenario.context_document, scenarioName: scenario.name });
      setGenerated(res.threats || []);
      setSelected(new Set(res.threats?.map((_,i) => i) || []));
    } catch(e) { setGenError(e.message); } finally { setLoading(false); }
  };

  const save = async () => {
    const toSave = generated.filter((_,i) => selected.has(i));
    setSaving(true); setGenError(''); try { await onGenerated(toSave, scenarioId); } catch(e) { setGenError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor:'rgba(0,0,0,0.7)' }}>
      <div data-ui="surface" className="w-[640px] max-h-[90vh] overflow-y-auto rounded-lg p-6" style={{ backgroundColor:'var(--wr-bg-card)', border:'1px solid var(--wr-border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold tracking-widest font-mono" style={{ color:'var(--wr-amber)' }}>AI GENERATE THREATS</h2>
          <button aria-label="Close" data-ui="icon" onClick={onClose}><X className="w-4 h-4" style={{ color:'var(--wr-text-muted)' }} /></button>
        </div>
        {generated.length === 0 ? (
          <div className="space-y-4">{genError && <p role="alert" className="text-red-300">{genError}</p>}
            <WrSelect label="SELECT SCENARIO" value={scenarioId} onChange={setScenarioId}>
              <option value="">Choose a scenario...</option>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </WrSelect>
            <WrButton onClick={generate} disabled={!scenarioId || loading} className="w-full justify-center">
              <Sparkles className="w-4 h-4" />
              {loading ? 'Generating...' : 'Generate Threats'}
            </WrButton>
          </div>
        ) : (
          <div className="space-y-3">{genError && <p role="alert" className="text-red-300">{genError}</p>}
            <p className="text-xs" style={{ color:'var(--wr-text-muted)' }}>Select threats to save:</p>
            {generated.map((t,i) => (
              <div data-ui="surface" key={i} onClick={() => {
                const s = new Set(selected);
                s.has(i) ? s.delete(i) : s.add(i);
                setSelected(s);
              }} className="p-3 rounded cursor-pointer transition-all" style={{
                backgroundColor: selected.has(i) ? 'rgba(240,165,0,0.08)' : 'var(--wr-bg-secondary)',
                border: `1px solid ${selected.has(i) ? 'rgba(240,165,0,0.3)' : 'var(--wr-border)'}`,
              }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color:'var(--wr-text-primary)' }}>{t.name}</span>
                  <SeverityBadge severity={t.severity} />
                </div>
                <MarkdownContent className="text-xs mt-1" style={{ color:'var(--wr-text-secondary)' }}>{t.description}</MarkdownContent>
              </div>
            ))}
            <div className="flex justify-end gap-2 mt-4">
              <WrButton variant="secondary" onClick={onClose}>Cancel</WrButton>
              <WrButton disabled={saving || !selected.size} onClick={save}>Save {selected.size} Selected</WrButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Threats() { return <RiskLibrary kind="Threat" Editor={ThreatModal} Generator={AiGenerateModal} />; }
