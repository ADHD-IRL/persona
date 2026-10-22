import {useBackgroundWork} from '@/components/layout/BackgroundWork';
import MarkdownContent from '@/components/ui/MarkdownContent';
import VerificationPanel from './VerificationPanel';
import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {WorkflowCard,WorkflowField,WorkflowChoices,WorkflowCheck,WorkflowButton,workflowLink} from '@/components/ui/WorkflowControls';
import {readKV,writeKV} from '@/lib/appConfigKV';
import {apiRequest} from '@/lib/apiClient';
import {sessionRecords,trackerKey,blankCloseout} from '@/lib/sessionTracker';
import {searchDocuments,searchSession,earlierSessions,compareRecords,readable,impactKey,impactLevels,impactFingerprint,prioritizedFindings} from '@/lib/sessionIntelligence';

export default function SessionIntelligence({session,sessions,records,data,notes,db,workspace,changeTab,onImpactsSaved,onVerificationSaved}) {
 const [tool,setTool]=useState('search'),[expanded,setExpanded]=useState(false);
 return <details onToggle={e=>setExpanded(e.currentTarget.open)} className="rounded-xl border border-slate-700 p-3"><summary className="cursor-pointer">Search this session and compare debates</summary>{expanded&&<WorkflowCard title="Explore and prioritize" description="Find supporting detail, compare debates, and identify what could change your decision.">
  <WorkflowChoices label="Session tools" value={tool} onChange={setTool} options={[{value:'search',label:'Search this session'},...(earlierSessions(session,sessions).length?[{value:'changes',label:'What changed?'}]:[]),{value:'impact',label:'Decision impact'},{value:'verification',label:'Verify findings'}]}/>
  {tool==='verification'&&<VerificationPanel key={session.id} session={session} workspace={workspace} records={records} impacts={data.impacts} notes={notes} onSaved={onVerificationSaved}/>}
  {tool==='search'&&<SessionSearch session={session} records={records} data={data} notes={notes} changeTab={changeTab}/>}
  {tool==='changes'&&<SessionChanges session={session} sessions={sessions} records={records} data={data} notes={notes} db={db} workspace={workspace}/>}
  {tool==='impact'&&<DecisionImpact session={session} records={records} assessments={data.impacts||{}} notes={notes} db={db} canWrite={['admin','analyst'].includes(workspace.role)} onSaved={onImpactsSaved}/>}
 </WorkflowCard>}</details>;
}
function SessionSearch({session,records,data,notes,changeTab}) {
 const [query,setQuery]=useState(''),[type,setType]=useState('All'),[limit,setLimit]=useState(20);
 const docs=useMemo(()=>searchDocuments(session,records,data,notes,data.impacts),[session,records,data,notes]);
 const results=useMemo(()=>searchSession(docs,query,type),[docs,query,type]);
 return <div className="space-y-4">
  <div className="grid md:grid-cols-3 gap-3"><div className="md:col-span-2"><WorkflowField label="Search session content" type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}} placeholder="Find a phrase, fact, SME argument, or follow-up"/></div><WorkflowField label="Content type" as="select" value={type} onChange={e=>{setType(e.target.value);setLimit(20);}}>{['All','Context','Finding','Chain','Follow-up','Debate','Synthesis','Source','Analyst review','Decision impact','Verification','Shared analysis'].map(t=><option key={t}>{t}</option>)}</WorkflowField></div>
  <p className="text-xs text-slate-400">Search matches all entered words, without case sensitivity. Includes saved debate messages, SME responses, sources, findings, follow-up, and your current closeout draft. Linked scenario context, saved parent-analysis inputs, and the shared parent brief are labeled separately. Other sessions’ findings and debate text are excluded.</p>
  {query.trim()&&<p role="status" className="text-sm">{results.length} matching records{results.length>limit?' · showing '+limit:''}</p>}
  {results.slice(0,limit).map(r=><article data-ui="surface" key={r.key} className="rounded-xl border p-4 space-y-2"><p className="text-xs text-amber-300">{r.type}</p><h3 className="font-semibold">{r.title}</h3><MarkdownContent className="text-sm break-words">{r.snippet}</MarkdownContent><details><summary>Read full matching record</summary><MarkdownContent className=" break-words text-sm leading-relaxed p-2">{r.text}</MarkdownContent></details>{session.mode==='panel'&&r.key.startsWith('message:')&&<Link className={workflowLink} to={'/sessions/'+session.id+'/panel?view=debate&turn='+encodeURIComponent(r.key.slice(8))}>Jump to exact debate turn</Link>}<WorkflowButton variant="secondary" onClick={()=>changeTab(r.tab)}>Open {r.tab==='followup'?'follow-up':r.tab}</WorkflowButton></article>)}
  {results.length>limit&&<WorkflowButton variant="secondary" onClick={()=>setLimit(n=>n+20)}>Show more matches</WorkflowButton>}
 </div>;
}
function SessionChanges({session,sessions,records,data,notes,db,workspace}) {
 const candidates=earlierSessions(session,sessions);
 const [chosen,setChosen]=useState('');
 const preferred=candidates.find(s=>(s.decision_option_id||null)===(session.decision_option_id||null));
 const id=chosen||preferred?.id||candidates[0]?.id||'';
 return <div className="space-y-4">
  <p className="text-sm text-slate-400">Compare against an earlier completed debate in the same scenario. The latest earlier debate for the same option is suggested when available. These are the records saved now, not a historical snapshot of later edits. Missing findings are not automatically resolved.</p>
  {!candidates.length?<p>No earlier completed debate for this scenario is available yet.</p>:<><WorkflowField label="Earlier debate" as="select" value={id} onChange={e=>setChosen(e.target.value)}>{candidates.map(s=><option key={s.id} value={s.id}>{s.name} · {new Date(s.created_at).toLocaleString()}</option>)}</WorkflowField><Comparison key={id} id={id} session={session} records={records} data={data} notes={notes} db={db} workspace={workspace}/></>}
 </div>;
}
function TextComparison({title,before,after}) {
 const a=readable(before),b=readable(after),changed=a!==b;
 return <details className="rounded-xl border p-3"><summary>{title} · {changed?'Changed':'Unchanged'}</summary><div className="grid md:grid-cols-2 gap-4 mt-3">{[['Earlier debate',a],['Selected debate',b]].map(([label,text])=><div key={label} className="min-w-0"><h4 className="font-semibold text-sm mb-2">{label}</h4><MarkdownContent className="text-sm break-words">{text||'Not recorded'}</MarkdownContent></div>)}</div></details>;
}
function Comparison({id,session,records,data,notes,db,workspace}) {
 const [baseline,setBaseline]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;(async()=>{
  const [previous,turns,syntheses,sources,messages,review]=await Promise.all([db.Session.get(id),db.SessionAgent.filter({session_id:id}),db.SessionSynthesis.filter({session_id:id},'-created_at'),db.SessionSource.filter({session_id:id}),db.SessionMessage.filter({session_id:id},'created_at'),readKV(db,trackerKey(id))]);
  if(!previous)throw new Error('The earlier debate is no longer available.');
  const job=previous.analysis_job_id?await apiRequest('/api/analyses/'+previous.analysis_job_id+'?workspace_id='+workspace.id):null;
  const agents=await Promise.all([...new Set(turns.map(t=>t.agent_id))].map(agentId=>db.Agent.get(agentId)));
  if(live)setBaseline({agents:agents.filter(Boolean),session:previous,turns,syntheses,sources,messages,notes:{...blankCloseout,...review},job});
 })().catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id,db,workspace.id]);
 if(error)return <p role="alert" className="text-red-300">Could not load the comparison: {error}</p>;
 if(!baseline)return <p role="status">Loading earlier debate…</p>;
 const previous=sessionRecords(baseline.session,data);
 const changes=[['Findings',previous.threats,records.threats],['Chains',previous.chains,records.chains],['Follow-up',previous.actions,records.actions]].map(([label,a,b])=>({label,rows:compareRecords(a,b)}));
 const pickReview=n=>({conclusion:n.summary,decision:n.decision,open_questions:n.open_questions,revisit_trigger:n.revisit_trigger,accepted_risks:n.accepted_risks});
 const context=(s,job)=>({scenario:s.context_override||job?.snapshot?.scenario?.context_document||'Historical context not captured',model:job?.snapshot?.model,focus:s.phase_focus,facilitator_note:s.facilitator_note,constraints:job?.snapshot?.constraints,assumptions:job?.snapshot?.assumptions,decision:job?.snapshot?.decision,options:job?.snapshot?.options});
 const turnText=(turns,agents)=>[...turns].sort((a,b)=>a.agent_id.localeCompare(b.agent_id)).map(t=>({SME:agents.find(a=>a.id===t.agent_id)?.name||t.agent_id,briefing:t.round0_briefing,round1:t.round1_assessment,round2:t.round2_rebuttal,chain:t.compound_chain_text}));
 return <div className="space-y-4">
  <p className="text-sm">Earlier: <Link data-ui="reference" className={workflowLink} to={'/session-tracker?session='+id}>{baseline.session.name}</Link> → Selected: {session.name}</p>
  {baseline.session.decision_option_id!==session.decision_option_id&&<p className="text-amber-300 text-sm">These debates evaluate different decision options. Differences may reflect the option rather than a change over time.</p>}
  {session.status!=='complete'&&<p className="text-amber-300 text-sm">The selected debate is still incomplete. This comparison is provisional.</p>}
  <TextComparison title="Context and decision inputs" before={context(baseline.session,baseline.job)} after={context(session,data.job)}/>
  <TextComparison title="Analyst conclusion and decision (selected includes current draft)" before={pickReview(baseline.notes)} after={pickReview(notes)}/>
  <TextComparison title="Latest model synthesis" before={baseline.syntheses[0]?.raw_text} after={data.syntheses[0]?.raw_text}/>
  <TextComparison title="SME panel and saved responses" before={turnText(baseline.turns,baseline.agents)} after={turnText(data.turns,data.agents)}/>
  <TextComparison title="Saved live-debate messages" before={baseline.messages.map(m=>({role:m.role,content:m.content,round:m.round}))} after={(data.messages||[]).map(m=>({role:m.role,content:m.content,round:m.round}))}/>
  <TextComparison title="Recorded sources" before={baseline.sources.map(s=>({title:s.title,url:s.url,claim:s.cited_claim,excerpt:s.content_snippet}))} after={data.sources.map(s=>({title:s.title,url:s.url,claim:s.cited_claim,excerpt:s.content_snippet}))}/>
  <p className="text-xs text-slate-400">Findings, chains and actions match by shared ID or a unique exact name, ignoring case and extra spaces. Renamed or ambiguous records remain separate; no semantic equivalence is assumed. Changes describe saved text, not validated changes in risk.</p>
  {changes.map(group=><section key={group.label} className="space-y-2"><h3 className="font-semibold">{group.label}</h3><p className="text-sm text-slate-400">{['Added','Changed','Absent from selected debate','Unchanged'].map(status=>group.rows.filter(r=>r.status===status).length+' '+status.toLowerCase()).join(' · ')}</p>{group.rows.filter(r=>r.status!=='Unchanged').map((r,i)=><details key={i} className="rounded-xl border p-3"><summary>{r.status}: {(r.after||r.before).name||(r.after||r.before).title}{r.ambiguous?' (name match needs review)':''}</summary>{(r.fields||['Record']).map(field=><TextComparison key={field} title={field.replaceAll('_',' ')} before={field==='Record'?r.before:r.before[field]} after={field==='Record'?r.after:r.after[field]}/>)}</details>)}</section>)}
 </div>;
}
function DecisionImpact({session,records,assessments,notes,db,canWrite,onSaved}) {
 const [showResolved,setShowResolved]=useState(false);
 const ranked=prioritizedFindings(records,assessments,notes);
 const all=[['Threat',records.threats],['Chain',records.chains]].flatMap(([kind,rows])=>rows.map(record=>({key:kind+':'+record.id,kind,record,assessment:assessments[kind+':'+record.id]||{}})));
 const resolved=all.filter(r=>r.assessment.resolved&&r.assessment.fingerprint===impactFingerprint(r.record,notes));
 return <div className="space-y-4">
  <p className="text-sm">Current decision: {notes.decision||'Not recorded yet — use Closeout to record the decision you are testing.'}</p>
  <p className="text-sm text-slate-400">Analyst-assessed priority: could reverse the decision, could change its conditions, not assessed, then limited impact. Review status and severity do not establish decision impact or resolution. A changed finding or conclusion requires reassessment.</p>
  <div className="flex flex-wrap gap-2 text-sm">{impactLevels.map(level=><span data-ui="badge" key={level.value} className="rounded-full border border-slate-700 px-3 py-2">{ranked.filter(r=>r.level===level.value).length} · {level.label}</span>)}</div>
  {!ranked.length&&<p>No active findings await decision-impact review.</p>}
  {ranked.map(r=><ImpactEditor key={r.key} item={r} session={session} notes={notes} assessments={assessments} db={db} canWrite={canWrite} onSaved={onSaved}/>)}
  {!!resolved.length&&<><WorkflowCheck checked={showResolved} onChange={e=>setShowResolved(e.target.checked)}>Show {resolved.length} resolved decision uncertainties</WorkflowCheck>{showResolved&&resolved.map(r=><ImpactEditor key={r.key} item={r} session={session} notes={notes} assessments={assessments} db={db} canWrite={canWrite} onSaved={onSaved}/>)}</>}
 </div>;
}
function ImpactEditor({item,session,notes,db,canWrite,onSaved}) {
 const {key,kind,record,assessment,stale}=item;
 const [draft,setDraft]=useState({level:'unassessed',criterion:'',rationale:'',evidence_needed:'',reversal_condition:'',resolved:false,resolution:'',...assessment}),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useBackgroundWork(saving,'Decision-impact review');
 const edit=(k,v)=>{setDraft(d=>({...d,[k]:v}));setSaved(false);};
 async function save(){setSaving(true);setError('');try{
  if(draft.level!=='unassessed'&&(!draft.criterion.trim()||!draft.rationale.trim()||!draft.reversal_condition.trim()))throw new Error('Record the affected criterion, reasoning, and what would change the conclusion.');
  if(draft.resolved&&!draft.resolution.trim())throw new Error('Record evidence explaining how this decision uncertainty was resolved.');
  const value={...draft,fingerprint:impactFingerprint(record,notes),saved_at:new Date().toISOString()};
  const latest=await readKV(db,impactKey(session.id))||{};
  const updated={...latest,[key]:value};await writeKV(db,impactKey(session.id),updated);onSaved(updated);setSaved(true);
 }catch(e){setError(e.message);}finally{setSaving(false);}}
 return <details className="rounded-xl border p-3"><summary><span className="font-semibold">{record.name}</span> · {stale?'Reassessment required':impactLevels.find(l=>l.value===assessment.level)?.label||'Not assessed'}{assessment.resolved&&!stale?' · Resolved':''}</summary>
  <div className="space-y-3 pt-3"><MarkdownContent className="text-sm">{record.description}</MarkdownContent><Link data-ui="reference" className={workflowLink} to={'/'+(kind==='Threat'?'threats':'chains')+'?'+new URLSearchParams({id:record.id,session:session.id,scenario:session.scenario_id||''})}>Inspect finding and supporting evidence</Link>
  {stale&&<p className="text-amber-300 text-sm">The finding or analyst conclusion changed. This assessment is counted as not assessed until you review and save it again.</p>}
  <WorkflowField label="Decision impact" as="select" disabled={!canWrite||saving} value={draft.level} onChange={e=>edit('level',e.target.value)}>{impactLevels.map(l=><option key={l.value} value={l.value}>{l.label}</option>)}</WorkflowField>
  {[['criterion','Affected decision criterion','Which requirement, assumption, or acceptance criterion is at stake?'],['rationale','Why this matters to the decision','Explain the connection between the finding and your conclusion.'],['reversal_condition','What would change the conclusion?','State the condition or threshold that would change your choice.'],['evidence_needed','Evidence needed next','What specific observation or source would settle the uncertainty?'],['resolution','Resolution evidence','Record what was checked and why the uncertainty is resolved.']].map(([field,label,placeholder])=><WorkflowField key={field} as="textarea" rows={2} label={label} placeholder={placeholder} disabled={!canWrite||saving} value={draft[field]} onChange={e=>edit(field,e.target.value)}/>)}
  <WorkflowCheck disabled={!canWrite||saving} checked={draft.resolved} onChange={e=>edit('resolved',e.target.checked)}>Decision uncertainty resolved</WorkflowCheck>
  {canWrite&&<WorkflowButton disabled={saving} onClick={save}>{saving?'Saving…':'Save decision impact'}</WorkflowButton>}
  {error&&<p role="alert" className="text-red-300">{error}</p>}{saved&&<p role="status" className="text-emerald-300">Decision impact saved.</p>}
  </div></details>;
}
