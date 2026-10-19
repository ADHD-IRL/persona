import {WorkflowButton,workflowAction} from '@/components/ui/WorkflowControls';
import ConvenePanelButton from '@/components/session/ConvenePanelButton';
import {analysisSessions,trackerPath} from '@/lib/sessionNavigation';
export { default as ActionEditor } from '@/components/analysis/ActionEditor';
import AnalysisStatus from '@/components/analysis/AnalysisStatus';
import { suggestRisks, activeRisk } from '@/lib/riskWorkflow';
import { cloneElement, useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { apiRequest } from '@/lib/apiClient';
import { recommendPanel, readiness, scenarioWithContext } from '@/lib/analysisWorkflow';
import { readKV, setupKey } from '@/lib/decisionRunner';

const blank = { mode: 'risk', question: '', constraints: '', scenario_id: '', context: '', context_in_scenario: false, decision_id: '', criteria: '', assumptions: '', options: [{ name: '', description: '' }, { name: '', description: '' }], agent_ids: [], threat_ids: [], chain_ids: [] };
const field = 'w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100';
function Box({ title, children }) { return <section data-ui="surface" className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-3"><h2 className="font-semibold text-lg">{title}</h2>{children}</section>; }
function Button(props) { return <WorkflowButton {...props}/>; }
function Field({ label, children, hideLabel = false }) { const id = useId(); return <div className="space-y-1 text-sm"><label className={hideLabel ? 'sr-only' : 'block'} htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>; }
const links = 'text-amber-300 underline';

export default function Analysis() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { workspace, db } = useWorkspace();
  const api = (suffix = '', options, query = {}) => apiRequest(`/api/analyses${suffix}?${new URLSearchParams({workspace_id:workspace.id,...query})}`, options);
  const [form, setForm] = useState(blank), [step, setStep] = useState(0);
  const [agents, setAgents] = useState([]), [scenarios, setScenarios] = useState([]), [decisions, setDecisions] = useState([]);
  const [threats, setThreats] = useState([]), [chains, setChains] = useState([]), [riskSearch, setRiskSearch] = useState('');
  const [job, setJob] = useState(null), [actions, setActions] = useState([]);
  const [showDebate,setShowDebate]=useState(false),[refreshError,setRefreshError]=useState(''),[lastChecked,setLastChecked]=useState(null);
  const [freshness, setFreshness] = useState(null), [search, setSearch] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [existingOptions, setExistingOptions] = useState([]), [existingAssumptions, setExistingAssumptions] = useState([]);
  const draftKey = `agd_analysis_draft_${workspace.id}`;
  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));
  useEffect(() => {
    let live = true;
    setLoaded(false); setStep(0); setError(''); setJob(null);
    Promise.all([db.Agent.list(), db.Scenario.list(), db.Decision.list(), db.Threat.list(), db.Chain.list()]).then(async ([a, s, d, t, c]) => {
      if (!live) return;
      setAgents(a); setScenarios(s); setDecisions(d); setThreats(t); setChains(c);
      let draft = blank;
      try { draft = { ...blank, ...JSON.parse(localStorage.getItem(draftKey) || '{}') }; } catch { /* optional draft */ }
      if (params.get('decision')) {
        const decision = d.find(x => x.id === params.get('decision'));
        const setup = decision ? await readKV(db, setupKey(decision.id)) : null;
        if (decision) draft = { ...blank, mode: 'compare', question: decision.title, decision_id: decision.id, scenario_id: setup?.scenario_id || '', agent_ids: (setup?.agent_ids || []).filter(agentId => a.some(x => x.id === agentId)).slice(0, 8) };
      }
      if (params.get('from')) {
        const previous = await api(`/${params.get('from')}`);
        draft = { ...blank, ...previous.input };
      }
      if (params.get('scenario') || params.get('threat') || params.get('chain')) {
        const linked = t.find(r => r.id === params.get('threat')) || c.find(r => r.id === params.get('chain'));
        draft = { ...blank, scenario_id: params.get('scenario') || linked?.scenario_id || '', question: linked ? 'Assess and mitigate: ' + linked.name : '', threat_ids: params.get('threat') ? [params.get('threat')] : [], chain_ids: params.get('chain') ? [params.get('chain')] : [] };
      }
      if (params.get('fresh')) draft.force_recompute = true;
      if (params.get('new') === '1') draft = {...blank};
      if (live) { setForm(draft); setLoaded(true); }
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [db, id, params.toString()]);
  useEffect(() => { if (loaded && !id) { try { localStorage.setItem(draftKey, JSON.stringify(form)); } catch { /* optional draft */ } } }, [loaded, form, id, draftKey]);
  useEffect(() => {
    let live = true;
    setExistingOptions([]); setExistingAssumptions([]);
    if (form.decision_id) Promise.all([db.DecisionOption.filter({ decision_id: form.decision_id }), db.DecisionAssumption.filter({ decision_id: form.decision_id })]).then(([o, a]) => { if (live) { setExistingOptions(o); setExistingAssumptions(a); } }).catch(e => setError(e.message));
    return () => { live = false; };
  }, [db, form.decision_id]);
  useEffect(() => { setShowDebate(false); setRefreshError(''); setLastChecked(null); }, [id, db]);
  useEffect(() => {
    if (!id) return;
    let live = true, pending = false, controller;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const [run, records] = await Promise.all([api(`/${id}`, {signal:controller.signal}, {debate:showDebate?'1':'0'}), apiRequest('/api/data/Mitigation?'+new URLSearchParams({workspace_id:workspace.id,filters:JSON.stringify({analysis_job_id:id}),limit:'500'}),{signal:controller.signal})]);
        if (live) { setJob(run); setActions(records); setRefreshError(''); setLastChecked(Date.now()); }
      } catch (e) { if (live) setRefreshError(e.name === 'AbortError' ? 'The server did not respond within 12 seconds' : e.message); }
      finally { clearTimeout(timeout); pending = false; }
    };
    refresh(); const timer = setInterval(refresh, 3000);
    return () => { live = false; clearInterval(timer); controller?.abort(); };
  }, [db, id, showDebate]);
  useEffect(() => {
    if (!id || !job || ['queued', 'running'].includes(job.status)) return;
    let live = true;
    const check = () => api(`/${id}/freshness`).then(value => { if (live) setFreshness(value); }).catch(e => { if (live) setError(e.message); });
    check(); window.addEventListener('focus', check);
    return () => { live = false; window.removeEventListener('focus', check); };
  }, [id, job?.status]);
  const selectedScenario = scenarios.find(s => s.id === form.scenario_id);
  const contextIncluded = !!selectedScenario && !!form.context_in_scenario;
  const effectiveScenario = selectedScenario ? scenarioWithContext(selectedScenario, form.context, contextIncluded) : { context_document: form.context };
  const selectedDecision = decisions.find(d => d.id === form.decision_id);
  const selectedAgents = agents.filter(a => form.agent_ids.includes(a.id));
  const recommendations = useMemo(() => recommendPanel(agents, `${form.question} ${effectiveScenario.context_document}`), [agents, form.question, effectiveScenario.context_document]);
  const checks = readiness({ ...form, scenario: effectiveScenario, decision: selectedDecision || { acceptance_criteria: form.criteria }, options: form.decision_id ? existingOptions : form.options, assumptions: form.decision_id ? existingAssumptions : form.assumptions.trim().split('\n').filter(Boolean), agents: selectedAgents });
  if (selectedScenario && !contextIncluded && !form.context.trim()) checks.errors.push('Add context and supporting information, or confirm it is included in the scenario.');
  async function run() {
    setBusy(true); setError('');
    try {
      let scenarioId = form.scenario_id, decisionId = form.decision_id;
      if (!scenarioId) {
        const scenario = await db.Scenario.create({ name: form.question.slice(0, 160), description: form.question, context_document: form.context });
        scenarioId = scenario.id; setScenarios(s => [...s, scenario]); setForm(f => ({ ...f, scenario_id: scenarioId, context_in_scenario: true }));
      }
      if (form.mode === 'compare' && !decisionId) {
        const decision = await db.Decision.create({ title: form.question, description: form.constraints, acceptance_criteria: form.criteria });
        decisionId = decision.id; setDecisions(d => [...d, decision]); update('decision_id', decisionId);
        for (const [index, option] of form.options.entries()) await db.DecisionOption.create({ decision_id: decisionId, name: option.name, description: option.description, sort_order: index });
        for (const text of form.assumptions.split('\n').filter(s => s.trim())) await db.DecisionAssumption.create({ decision_id: decisionId, text: text.trim() });
      }
      const result = await api('', { method: 'POST', body: { mode: form.mode, question: form.question, constraints: form.constraints, scenario_id: scenarioId, context_in_scenario: !selectedScenario || contextIncluded, context: selectedScenario && !contextIncluded ? form.context : '', decision_id: form.mode === 'compare' ? decisionId : null, assumptions: form.assumptions, agent_ids: form.agent_ids, threat_ids: form.threat_ids, chain_ids: form.chain_ids, force_recompute: !!form.force_recompute } });
      localStorage.removeItem(draftKey); navigate(`/analysis/${result.id}`);
    } catch (e) { setError(e.message + ' Any saved scenario or decision remains available; review it before retrying.'); }
    finally { setBusy(false); }
  }
  async function operate(action) {
    setBusy(true); setError('');
    try { setJob(await api(`/${id}/${action}`, { method: 'POST', body: {} })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function addAction(index) {
    setBusy(true); setError('');
    try { const action = await api(`/${id}/actions`, { method: 'POST', body: { index } }); setActions(old => [...old.filter(a => a.id !== action.id), action]); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="max-w-5xl mx-auto p-6 space-y-6 text-slate-100">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">{id ? 'Analysis progress and brief' : 'Start session'}</h1><p className="text-slate-400 mt-2">Prepare → Run → Review in Session Tracker</p></div><div className="flex flex-wrap items-center gap-2"><Link data-ui="action" className={workflowAction} to="/session-tracker">Session Tracker</Link><Link data-ui="action" className={workflowAction} to="/guide">User guide</Link></div></header>
    {error && <p role="alert" className="rounded bg-red-950 border border-red-700 p-3">{error}</p>}
    {refreshError && !job && <p role="alert" className="text-amber-300">Unable to load analysis status: {refreshError}. Retrying automatically.</p>}
    {!loaded && !job && !error && <p role="status">Loading your workspace…</p>}
    {id && job ? <>
      <Box title={job.snapshot.question}>
        <AnalysisStatus job={job} showDebate={showDebate} onToggleDebate={()=>setShowDebate(v=>!v)} refreshError={refreshError} lastChecked={lastChecked} />
        {['running', 'queued'].includes(job.status) && <><p>You can close this browser tab. The local Node server continues the analysis while the computer and server stay running.</p><Button disabled={busy || job.cancel_requested} onClick={() => operate('cancel')}>{job.cancel_requested ? 'Stopping…' : 'Stop analysis'}</Button></>}
        {job.error && <p className="text-red-300">{job.error}</p>}
        {['failed', 'cancelled'].includes(job.status) && <Button disabled={busy} onClick={() => operate('resume')}>Resume saved inputs</Button>}
        <div className="flex flex-wrap gap-5"><Link data-ui="action" className={links} to={`/analysis?from=${id}`}>Review current inputs and reassess</Link><Link data-ui="action" className={links} to="/analysis?new=1">Start another session</Link></div>
        {freshness?.stale && <p className="text-amber-300">Inputs changed: {freshness.changes.join(', ')}. These results describe the saved inputs. Review and reassess before relying on them.</p>}
      </Box>
      <Box title="Continue in Session Tracker"><p>Manage findings, follow-up, evidence, and your conclusion in one place. A comparison creates a separate debate for each option.</p><div className="flex flex-wrap gap-2">{analysisSessions(job).map(session=><Link data-ui="action" key={session.id} className={workflowAction} to={trackerPath(session.id)}>{session.name}: open Session Tracker</Link>)}</div>{!analysisSessions(job).length&&<p className="text-sm text-slate-400">The first session will appear here when the worker creates it. You can also return to Session Tracker to find this analysis under Analysis progress.</p>}</Box>
      {job.result && <>
        <Box title="Decision brief">
          <p className="text-xl">{job.result.assessment?.headline || job.result.brief.headline}</p>
          {job.result.assessment && <p>Outcome: {job.result.assessment.recommendation_status.replaceAll('_', ' ')} · model confidence: {job.result.assessment.confidence}</p>}
          <p className="text-sm text-slate-400">These are model-generated perspectives, not independent expert votes. Supplied information and quotations still need human verification; confidence is not a measured probability.</p>
          {job.result.brief.findings.map((finding, index) => <article key={index} className="border-t border-slate-700 pt-3 space-y-2"><h3 className="font-semibold">{index + 1}. {finding.title}</h3><p>{finding.impact}</p><p className="text-xs text-amber-300">{finding.basis.replaceAll('_', ' ')}</p>{finding.references.length ? finding.references.map((r, j) => <blockquote key={j} className="border-l-2 border-slate-500 pl-3 text-sm"><a data-ui="reference" className={links} href={`#evidence-${r.id}`}>{job.result.evidence.find(e => e.id === r.id)?.label}</a><p>“{r.quote}”</p></blockquote>) : <p className="text-sm text-slate-400">No exact supporting quotation was verified for this finding.</p>}</article>)}
        </Box>
        <Box title="Unresolved questions and what could change the conclusion">
          <ul className="list-disc pl-5 space-y-2">{[...job.result.brief.disagreements, ...job.result.brief.revisit, ...(job.result.assessment?.conditions_to_revisit || [])].map((s, i) => <li key={i}>{s}</li>)}</ul>
          {!job.result.brief.disagreements.length && <p className="text-slate-400">The brief reported no unresolved disagreements; this is not proof of consensus.</p>}
        </Box>
        {job.result.assessment && <Box title="Option comparison"><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Option</th><th className="p-2">Acceptance</th><th className="p-2">Assessment</th></tr></thead><tbody>{job.result.assessment.options.map(o => <tr key={o.option_id} className="border-t border-slate-700"><td className="p-2">{job.snapshot.options.find(x => x.id === o.option_id)?.name}<p>{o.verdict}</p></td><td className="p-2">{o.meets_acceptance_criteria}<p>{o.acceptance_note}</p></td><td className="p-2">{o.risk_summary}</td></tr>)}</tbody></table></div><Link data-ui="action" className={links} to={`/decisions/${job.snapshot.decision.id}`}>Review or record the human decision</Link></Box>}
        <Box title="Suggested follow-up"><p className="text-sm text-slate-400">Save a suggestion once, then manage its status and completion evidence in Session Tracker. Analysis-wide suggestions attach to the first debate in this analysis.</p><p className="text-sm text-slate-400">{actions.length} actions tracked · {actions.filter(a => a.status === 'verified').length} verified{job.result.elapsed_seconds != null ? ` · Analysis completed in ${Math.ceil(job.result.elapsed_seconds / 60)} minutes, including queue time` : ''}</p>
          {job.result.brief.actions.map((action, index) => { const saved = actions.find(a => a.action_index === index); return <article key={index} className="border-t border-slate-700 pt-3 space-y-2"><h3 className="font-semibold">{action.title}</h3><p className="text-sm">Complete when: {action.completion_criteria || 'Define a measurable completion condition.'}</p><div className="flex gap-3 flex-wrap">{action.evidence_ids.map(e => <a data-ui="reference" key={e} className={links} href={`#evidence-${e}`}>{job.result.evidence.find(x => x.id === e)?.label}</a>)}</div>{saved ? <Link data-ui="action" className={workflowAction} to={saved.session_id?trackerPath(saved.session_id,'followup'):'/session-tracker'}>Manage saved follow-up in Session Tracker</Link> : <Button disabled={busy} onClick={() => addAction(index)}>Save suggested follow-up</Button>}</article>; })}
          {!job.result.brief.actions.length && <p>No actions were proposed. Review the full debate before defining next steps.</p>}
        </Box>
        {job.result.changes && <Box title="What changed since the previous analysis"><p>Changed inputs: {job.result.changes.inputs.join(', ') || 'None; the model may still produce different wording.'}</p><p>Previous conclusion: {job.result.changes.previousHeadline}</p><p>Current conclusion: {job.result.brief.headline}</p><Link data-ui="action" className={links} to={`/analysis/${job.result.changes.previousId}`}>Open previous results</Link></Box>}
        <Box title="Full debate and evidence"><div className="space-y-2">{job.result.sessions.map(s => <p key={s.sessionId}><Link data-ui="action" className={links} to={`/sessions/${s.sessionId}`}>{s.option.name}: open full debate</Link> · <Link data-ui="action" className={links} to={`/session-tracker?session=${s.sessionId}`}>Manage session</Link> {s.reused && <span className="text-slate-400">(unchanged inputs; reused assessment)</span>}</p>)}</div>{job.result.evidence.map(e => <details key={e.id} id={`evidence-${e.id}`} className="border-t border-slate-700 pt-2"><summary className="cursor-pointer">{e.label} · {e.kind === 'supplied' ? 'supplied information' : 'model output'}</summary><p className="whitespace-pre-wrap text-sm mt-2">{e.text}</p></details>)}</Box>
      </>}
      <details><summary className="cursor-pointer">Saved input snapshot</summary><pre className="text-xs overflow-auto max-h-96 mt-3">{JSON.stringify(job.snapshot, null, 2)}</pre></details>
    </> : !id && loaded ? <>
      <Box title="Guided analysis"><p>Use this path for risk analysis, challenging a plan, or comparing options. Review the question and SME panel, then run in the background. When it finishes, Session Tracker is your dashboard.</p><p className="text-sm text-slate-400">Your unfinished setup is saved in this browser. Existing work is in <Link data-ui="action" className={links} to="/session-tracker">Session Tracker</Link>.</p><details><summary className="cursor-pointer text-amber-300">Advanced: manual or live facilitation</summary><div className="space-y-3 mt-3"><p className="text-sm">Use manual setup to control rounds yourself, or convene a live panel for an interactive discussion. Browser-driven runs need the debate page open.</p><div className="flex flex-wrap gap-3"><Link data-ui="action" className={workflowAction} to={'/sessions/new'+(form.scenario_id?'?scenario='+encodeURIComponent(form.scenario_id):'')}>Manual / facilitated setup</Link><ConvenePanelButton variant="secondary" className="rounded-full"/></div></div></details></Box>
      <nav aria-label="Analysis setup steps" className="flex flex-wrap gap-3">{['1. Question and context', '2. Review panel', '3. Ready to run'].map((label, i) => <button data-ui="action" key={label} onClick={() => setStep(i)} aria-current={step === i ? 'step' : undefined} className={`px-4 py-2 rounded-full focus-visible:ring-2 focus-visible:ring-amber-400 ${step === i ? 'bg-slate-700' : 'text-slate-400'}`}>{label}</button>)}</nav>
      {step === 0 && <Box title="What do you need to understand?">
        <Field label="Goal"><select className={field} value={form.mode} onChange={e => update('mode', e.target.value)}><option value="risk">Find risks</option><option value="challenge">Challenge a plan</option><option value="compare">Compare options</option></select></Field>
        <Field label="Question or objective"><textarea className={field} rows={2} value={form.question} onChange={e => update('question', e.target.value)} placeholder="Which deployment approach meets our availability and budget requirements?" /></Field>
        <Field label="Scenario — select from dropdown"><select className={field} value={form.scenario_id} onChange={e => setForm(f => ({ ...f, scenario_id: e.target.value, context_in_scenario: false }))}><option value="">Select an existing scenario or create one below</option>{scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        {selectedScenario && <><p className="text-sm whitespace-pre-wrap max-h-48 overflow-auto">{selectedScenario.context_document}</p><Link data-ui="action" className={links} to="/scenarios">Edit scenarios</Link></>}
        <section className="space-y-2" aria-labelledby="scenario-context-heading">
          <h3 id="scenario-context-heading" className="text-sm font-semibold">Context and supporting information</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 shrink-0 accent-amber-400" aria-describedby="scenario-context-help" checked={contextIncluded} disabled={!selectedScenario?.context_document?.trim()} onChange={e => update('context_in_scenario', e.target.checked)} />Context and supporting information is included in the scenario.</label>
          <p id="scenario-context-help" className="text-xs text-slate-400">{!selectedScenario ? 'Select an existing scenario above to use this checkbox.' : !selectedScenario.context_document?.trim() ? 'This scenario has no saved context. Add supporting information below or edit the scenario.' : 'Check this box to use the context already saved in the selected scenario.'}</p>
          {contextIncluded ? <p className="text-sm text-slate-400">The analysis will use the selected scenario’s context. Uncheck the box to add supporting information.</p> : <textarea rows={6} className={field} aria-labelledby="scenario-context-heading" value={form.context} onChange={e => update('context', e.target.value)} placeholder="Include the environment, stakeholders, known facts, sources, and uncertainties, not just a title or short description." />}
        </section>
        <Field label="Constraints" hideLabel><textarea className={field} value={form.constraints} onChange={e => update('constraints', e.target.value)} placeholder="Constraints: budget, deadline, non-negotiable requirements" /></Field>
        {form.mode === 'compare' && <><Field label="Decision"><select className={field} value={form.decision_id} onChange={e => update('decision_id', e.target.value)}><option value="">Create a decision from this question</option>{decisions.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>{selectedDecision ? <><p>Acceptance criteria: {selectedDecision.acceptance_criteria || 'Missing'}</p><ul>{existingOptions.map(o => <li key={o.id}>{o.name}: {o.description}</li>)}</ul><Link data-ui="action" className={links} to={`/decisions/${selectedDecision.id}`}>Edit options, criteria, and assumptions</Link></> : <><Field label="Acceptance criteria"><textarea className={field} value={form.criteria} onChange={e => update('criteria', e.target.value)} placeholder="What must an acceptable option achieve?" /></Field>{form.options.map((o, i) => <div key={i} className="space-y-2 border border-slate-700 p-3"><Field label={`Option ${i + 1} name`}><input className={field} value={o.name} onChange={e => update('options', form.options.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></Field><Field label={`Option ${i + 1} description`}><textarea className={field} value={o.description} onChange={e => update('options', form.options.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></Field>{form.options.length > 2 && <button data-ui="action" className={links} onClick={() => update('options', form.options.filter((_, j) => j !== i))}>Remove option</button>}</div>)}{form.options.length < 6 && <button data-ui="action" className={links} onClick={() => update('options', [...form.options, { name: '', description: '' }])}>Add option</button>}</>}</>}
        {!(form.mode === 'compare' && form.decision_id) && <Field label="Assumptions, one per line"><textarea className={field} value={form.assumptions} onChange={e => update('assumptions', e.target.value)} /></Field>}
        <section className="space-y-3 border-t border-slate-700 pt-4"><h3 className="font-semibold">Threats and chains to examine</h3><p className="text-sm text-slate-400">Suggestions match the scenario, domain, and question. Only checked records enter the debate. Unreviewed findings remain hypotheses.</p><Button onClick={() => { update('threat_ids', suggestRisks(threats, selectedScenario, form.question).map(r => r.id)); update('chain_ids', suggestRisks(chains, selectedScenario, form.question).map(r => r.id)); }}>Use relevant suggestions</Button><input className={field} aria-label="Search threats and chains" placeholder="Search threats and chains" value={riskSearch} onChange={e => setRiskSearch(e.target.value)} />{[['Threats', threats, 'threat_ids'], ['Chains', chains, 'chain_ids']].map(([label, records, key]) => <div key={key}><h4>{label} · {form[key].length} selected</h4><div className="max-h-48 overflow-y-auto">{records.filter(r => activeRisk(r) && (form[key].includes(r.id) || (riskSearch ? (r.name+' '+r.description).toLowerCase().includes(riskSearch.toLowerCase()) : r.scenario_id === form.scenario_id))).slice(0,100).map(r => <label key={r.id} className="flex gap-2 p-1"><input type="checkbox" checked={form[key].includes(r.id)} disabled={!form[key].includes(r.id) && form[key].length >= 30} onChange={e => update(key,e.target.checked ? [...form[key],r.id] : form[key].filter(x => x !== r.id))} />{r.name} · {r.review_status || 'needs review'}</label>)}</div></div>)}</section>
        <Button onClick={() => { if (!selectedAgents.length) update('agent_ids', recommendations.map(a => a.id)); setStep(1); }}>Review suggested panel</Button>
      </Box>}
      {step === 1 && <Box title="A small panel with complementary perspectives"><p>Suggestions use topic matches and discipline diversity. Review their suitability; more SMEs do not automatically mean stronger evidence.</p><Button onClick={() => update('agent_ids', recommendations.map(a => a.id))}>Use suggested panel</Button><p>{selectedAgents.length} selected · choose 3–8</p>{selectedAgents.map(a => <article key={a.id} className="border-t border-slate-700 pt-2"><strong>{a.name}</strong> · {a.discipline}<p className="text-sm text-slate-400">{recommendations.find(r => r.id === a.id)?.selection_reason || 'Manually selected perspective.'}</p><button data-ui="action" className={links} onClick={() => update('agent_ids', form.agent_ids.filter(x => x !== a.id))}>Remove</button></article>)}<Field label="Find another SME"><input className={field} value={search} onChange={e => setSearch(e.target.value)} /></Field>{search && agents.filter(a => !form.agent_ids.includes(a.id) && `${a.name} ${a.discipline}`.toLowerCase().includes(search.toLowerCase())).slice(0, 10).map(a => <p key={a.id}><button data-ui="action" disabled={selectedAgents.length >= 8} className={links} onClick={() => update('agent_ids', [...form.agent_ids, a.id])}>Add {a.name} · {a.discipline}</button></p>)}<Button onClick={() => setStep(2)}>Check readiness</Button></Box>}
      {step === 2 && <Box title="Review and run"><p>{form.question}</p><p>{selectedAgents.length} SMEs · {form.mode === 'compare' ? (form.decision_id ? existingOptions.length : form.options.length) : 1} scenario/option assessments · two rounds, synthesis, and a decision brief</p><p className="text-slate-400">The server uses its configured MITRE AIP model. Relevant knowledge-base excerpts are included automatically. Unchanged option assessments can be reused.</p>{checks.errors.map(s => <p className="text-red-300" key={s}>{s}</p>)}{checks.warnings.map(s => <p className="text-amber-300" key={s}>{s}</p>)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.force_recompute} onChange={e => update('force_recompute', e.target.checked)} />Run fresh assessments instead of reusing unchanged results</label><Button disabled={busy || checks.errors.length > 0} onClick={run}>{busy ? 'Starting…' : 'Run analysis in background'}</Button></Box>}

    </> : null}
  </div>;
}
