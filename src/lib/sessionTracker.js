import {canonical} from './analysisWorkflow.js';
import {activeRisk} from './riskWorkflow.js';
export const trackerKey=id=>'session_tracker_'+id;
export const trackerTabs=[['overview','1. Overview'],['findings','2. Findings'],['followup','3. Follow-up'],['evidence','4. Evidence'],['closeout','5. Closeout']].map(([value,label])=>({value,label}));
export const blankCloseout={state:'in_review',summary:'',decision:'',open_questions:'',revisit_trigger:'',accepted_risks:''};
export function sessionRecords(session,{threats=[],chains=[],actions=[]}){
 const ownThreats=threats.filter(t=>t.session_id===session.id);
 const threatIds=new Set(ownThreats.map(t=>t.id));
 const ownChains=chains.filter(c=>c.session_id===session.id||(!c.session_id&&threatIds.has(c.threat_id)));
 const chainIds=new Set(ownChains.map(c=>c.id));
 const ownActions=actions.filter(a=>a.session_id===session.id||(!a.session_id&&(chainIds.has(a.chain_id)||threatIds.has(a.threat_id))));
 const belongsJob=r=>session.analysis_job_id&&r.analysis_job_id===session.analysis_job_id;
 const sharedThreats=threats.filter(t=>belongsJob(t)&&!ownThreats.includes(t));
 const unlinked=actions.filter(a=>!a.session_id&&!a.chain_id&&!a.threat_id&&!a.analysis_job_id&&(!a.scenario_id||a.scenario_id===session.scenario_id));
 return {threats:ownThreats,chains:ownChains,actions:ownActions,sharedThreats,unlinked};
}
export function trackerSummary(records,today=new Date().toLocaleDateString('en-CA')){
 const active=[...records.threats,...records.chains].filter(activeRisk);
 const review=active.filter(r=>r.review_status==='needs_review'||!r.review_status);
 const open=records.actions.filter(a=>!['verified','rejected'].includes(a.status));
 const overdue=open.filter(a=>a.due_date?.slice(0,10)<today);
 const withoutCriteria=open.filter(a=>!a.completion_criteria?.trim());
 return {review:review.length,open:open.length,overdue:overdue.length,withoutCriteria:withoutCriteria.length,verified:records.actions.filter(a=>a.status==='verified').length};
}
export function trackerFingerprint(session,records,synthesis,sources,job,scenario,impacts={},verification={}){
 const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
 const checks=(verification?.findings||[]).filter(f=>f.run).map(f=>({id:f.id,run:f.run.id,rating:f.run.rating,stale:f.stale,review:f.review?.id}));
 return canonical({...checks.length?{evidenceChecks:checks}:{},...Object.keys(impacts).length?{decisionImpacts:impacts}:{},scenarioContext:scenario?.context_document||'',session:{id:session.id,status:session.status,scenario_id:session.scenario_id},threats:sorted(records.threats),chains:sorted(records.chains),actions:sorted(records.actions),sharedThreats:sorted(records.sharedThreats),synthesis:synthesis?.raw_text||'',sources:sorted(sources),brief:job?.result?.brief||null});
}
export function sessionBrief(session,records,notes,synthesis,impacts={},verification={}){
 return ['# '+session.name,'## Analyst conclusion',notes.summary||'Not recorded','## Decision',notes.decision||'Not recorded','## Open questions',notes.open_questions||'None recorded','## Revisit when',notes.revisit_trigger||'Not recorded','## Accepted risks / deferred work',notes.accepted_risks||'None recorded','## Findings',...records.threats.map(t=>'- '+t.name+' ['+(t.severity||'unassessed')+'; '+t.review_status+']'), '## Chains',...records.chains.map(c=>'- '+c.name),'## Follow-up',...records.actions.map(a=>'- '+a.title+' ['+a.status+']'+(a.due_date?' — due '+a.due_date.slice(0,10):'')+'\n  Completion criteria: '+(a.completion_criteria||'Not recorded')),'## Analyst decision-impact assessments',...Object.entries(impacts).filter(([key])=>[...records.threats.map(r=>'Threat:'+r.id),...records.chains.map(r=>'Chain:'+r.id)].includes(key)).map(([key,a])=>'- '+([...records.threats,...records.chains].find(r=>r.id===key.split(':')[1])?.name||key)+': '+a.level+' (analyst assessment; recheck against current finding and conclusion)'+String.fromCharCode(10)+'  Criterion: '+(a.criterion||'Not recorded')+String.fromCharCode(10)+'  Rationale: '+(a.rationale||'Not recorded')+String.fromCharCode(10)+'  Would change conclusion: '+(a.reversal_condition||'Not recorded')+String.fromCharCode(10)+'  Evidence needed: '+(a.evidence_needed||'Not recorded')+String.fromCharCode(10)+'  Resolution: '+(a.resolution||'Not recorded')), '## Evidence verification (model-assisted, not a truth probability)',...(verification?.findings||[]).map(f=>'- '+f.name+': '+(f.stale?'Recheck required':f.run?.rating||'Not checked')+'; analyst review: '+(f.review?.created_at||'not recorded')), '## Model synthesis (requires analyst review)',synthesis?.raw_text||'Not available'].join('\n\n');
}
