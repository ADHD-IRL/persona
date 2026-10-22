import {useBackgroundWork} from '@/components/layout/BackgroundWork';
import MarkdownContent from '@/components/ui/MarkdownContent';
import {useEffect,useState} from 'react';
import ReviewDrawer from '@/components/ui/ReviewDrawer';
import {WorkflowField,WorkflowCheck,WorkflowButton} from '@/components/ui/WorkflowControls';
import VerificationPanel from './VerificationPanel';
import ActionEditor from '@/components/analysis/ActionEditor';
import {readKV,writeKV} from '@/lib/appConfigKV';
import {impactKey,impactLevels,impactFingerprint} from '@/lib/sessionIntelligence';
import {apiRequest} from '@/lib/apiClient';
function InlineReview({title,children}){return <section aria-label="Finding detail" className="rounded-xl border border-slate-700 p-4 space-y-4"><h3 className="text-lg font-semibold">{title}</h3>{children}</section>;}
export default function FindingReview({item,session,workspace,db,notes,records,data,onSaved,onNext,onClose,inline=false,navigation=[],onPrevious,onDirtyChange}){
 const {kind,record,key}=item,old=data.impacts?.[key]||{};
 const [draft,setDraft]=useState({review_status:record.review_status||'needs_review',confidence:record.confidence||'unassessed',notes:record.rationale||'',level:'unassessed',criterion:'',rationale:'',reversal_condition:'',evidence_needed:'',resolved:false,resolution:'',...old});
 const [verificationOpen,setVerificationOpen]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false);
 useBackgroundWork(busy,'Finding review',{error});
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 const canWrite=['admin','analyst'].includes(workspace.role),edit=(k,v)=>{setDirty(true);setDraft(d=>({...d,[k]:v}));};
 const verification=data.verification?.findings?.find(f=>f.kind===kind&&f.id===record.id);
 const actionSuggestion=verification?.run?.claims?.find(c=>c.rating!=='Strong support')?.next_check||'Verify the evidence for '+record.name;
 const [action,setAction]=useState(actionSuggestion),[criteria,setCriteria]=useState('Record supporting or opposing source passages and explain whether they change the conclusion.');
 const related=records.actions.filter(a=>kind==='Threat'?a.threat_id===record.id:a.chain_id===record.id);
 async function save(next){setBusy(true);setError('');try{
 if(draft.level!=='unassessed'&&(!draft.criterion.trim()||!draft.rationale.trim()||!draft.reversal_condition.trim()))throw new Error('Add the decision criterion, rationale, and what would change the conclusion.');
 if(draft.resolved&&!draft.resolution.trim())throw new Error('Record resolution evidence before resolving a decision uncertainty.');
 const updatedRecord=await db[kind].update(record.id,{review_status:draft.review_status,confidence:draft.confidence,rationale:draft.notes});
 const latest=await readKV(db,impactKey(session.id))||{};
 await writeKV(db,impactKey(session.id),{...latest,[key]:{level:draft.level,criterion:draft.criterion,rationale:draft.rationale,reversal_condition:draft.reversal_condition,evidence_needed:draft.evidence_needed,resolved:draft.resolved,resolution:draft.resolution,fingerprint:impactFingerprint(updatedRecord,notes),saved_at:new Date().toISOString()}});
 await onSaved();setDirty(false);setNotice('Finding review saved.');if(next)onNext();
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 async function followup(){setBusy(true);setError('');try{await apiRequest('/api/risks/'+kind+'/'+record.id+'/action?workspace_id='+workspace.id,{method:'POST',body:{action,completion_criteria:criteria}});await onSaved();setNotice('Linked follow-up saved.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 const close=()=>{if(!dirty||window.confirm('Discard unsaved finding review edits?'))onClose();};
 const move=fn=>{if(!busy&&(!dirty||window.confirm('Discard unsaved finding review edits?')))fn();};
 const Frame=inline?InlineReview:ReviewDrawer;
 return <Frame title={record.name} onClose={close}>{inline&&<><div className="flex flex-wrap gap-2"><WorkflowButton variant="secondary" size="sm" disabled={!onPrevious||busy} onClick={()=>move(onPrevious)}>Previous</WorkflowButton><WorkflowButton variant="secondary" size="sm" disabled={busy} onClick={()=>move(onNext)}>Next</WorkflowButton></div>{navigation.map(n=><button hidden key={n.key} id={'finding-switch-'+n.key} onClick={()=>move(n.onClick)}/>)}</>}<MarkdownContent>{record.description}</MarkdownContent><p className="text-sm text-slate-400">{kind} · {record.severity||'Severity unassessed'} · {verification?.stale?'Evidence changed — recheck required':verification?.run?.rating||'Evidence not checked'}</p>
 {error&&<p role="alert" className="text-red-300">{error}</p>}{notice&&<p role="status" className="text-emerald-300">{notice}</p>}
 <div className="grid sm:grid-cols-2 gap-3"><WorkflowField label="Review status" as="select" disabled={!canWrite||busy} value={draft.review_status} onChange={e=>edit('review_status',e.target.value)}>{['needs_review','reviewed','monitoring','archived'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</WorkflowField><WorkflowField label="Your evidence confidence" as="select" disabled={!canWrite||busy} value={draft.confidence} onChange={e=>edit('confidence',e.target.value)}>{['unassessed','low','medium','high'].map(s=><option key={s}>{s}</option>)}</WorkflowField></div>
 <WorkflowField label="Analyst notes" as="textarea" rows={3} disabled={!canWrite||busy} value={draft.notes} onChange={e=>edit('notes',e.target.value)}/>
 <WorkflowField label="Decision impact" as="select" disabled={!canWrite||busy} value={draft.level} onChange={e=>edit('level',e.target.value)}>{impactLevels.map(l=><option key={l.value} value={l.value}>{l.label}</option>)}</WorkflowField>
 {old.fingerprint&&old.fingerprint!==impactFingerprint(record,notes)&&<p className="text-amber-300">The finding or conclusion changed. Reassess the saved decision impact.</p>}
 {draft.level!=='unassessed'&&[['criterion','Affected decision criterion'],['rationale','Why this matters'],['reversal_condition','What would change the conclusion?'],['evidence_needed','Evidence needed next']].map(([k,label])=><WorkflowField key={k} label={label} as="textarea" rows={2} disabled={!canWrite||busy} value={draft[k]} onChange={e=>edit(k,e.target.value)}/>)}
 <WorkflowCheck disabled={!canWrite||busy} checked={draft.resolved} onChange={e=>edit('resolved',e.target.checked)}>Decision uncertainty resolved</WorkflowCheck>{draft.resolved&&<WorkflowField label="Resolution evidence" as="textarea" disabled={!canWrite||busy} value={draft.resolution} onChange={e=>edit('resolution',e.target.value)}/>}
 {canWrite&&<div className="flex gap-3"><WorkflowButton disabled={busy} onClick={()=>save(true)}>Save and next</WorkflowButton><WorkflowButton variant="secondary" disabled={busy} onClick={()=>save(false)}>Save review</WorkflowButton></div>}
 <details onToggle={e=>setVerificationOpen(e.currentTarget.open)}><summary>Evidence and verification</summary><div className="mt-4">{verificationOpen&&<VerificationPanel session={session} workspace={workspace} records={records} impacts={data.impacts} notes={notes} onSaved={onSaved} focusKey={key}/>}</div></details>
 <details><summary>Follow-up · {related.length} linked actions</summary><div className="space-y-3 mt-3">{related.map(a=>canWrite?<ActionEditor key={a.id} action={a} db={db} onSave={onSaved}/>:<p key={a.id}>{a.title} · {a.status}</p>)}{canWrite&&<><p className="text-sm">Suggested verification task. Review and edit before saving.</p><WorkflowField label="Follow-up task" as="textarea" value={action} onChange={e=>setAction(e.target.value)}/><WorkflowField label="Complete when" as="textarea" value={criteria} onChange={e=>setCriteria(e.target.value)}/><WorkflowButton variant="secondary" disabled={busy||!action.trim()||!criteria.trim()} onClick={followup}>Save linked follow-up</WorkflowButton></>}</div></details>
 </Frame>;
}
