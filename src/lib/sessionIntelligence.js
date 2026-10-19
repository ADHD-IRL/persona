import {canonical} from './analysisWorkflow.js';
import {activeRisk} from './riskWorkflow.js';

export const impactKey=id=>'session_impact_'+id;
export const impactLevels=[{value:'unassessed',label:'Not assessed'},{value:'could_reverse',label:'Could reverse decision'},{value:'could_change',label:'Could change conditions'},{value:'limited',label:'Limited decision impact'}];
export function readable(value) {
  if(value==null)return '';
  if(Array.isArray(value))return value.map(readable).filter(Boolean).join('\n');
  if(typeof value==='object')return Object.entries(value).filter(([key])=>!['id','workspace_id','created_by','created_at','updated_at'].includes(key)&&!key.endsWith('_id')).map(([k,v])=>readable(v)?k.replaceAll('_',' ')+': '+readable(v):'').join('\n');
  return String(value);
}
export function searchDocuments(session,records,data,notes,impacts={}) {
  const docs=[], add=(key,type,title,text,tab)=>{if(text)docs.push({key,type,title,text,tab});};
  add('session','Context',session.name,readable(session),'overview');
  const scenario=data.scenarios?.find(s=>s.id===session.scenario_id);
  add('scenario','Context','Current linked scenario',readable(scenario),'overview');
  if(data.job?.snapshot)add('inputs','Context','Saved analysis inputs (parent analysis)',readable({question:data.job.snapshot.question,scenario:data.job.snapshot.scenario,constraints:data.job.snapshot.constraints,assumptions:data.job.snapshot.assumptions,decision:data.job.snapshot.decision,options:data.job.snapshot.options,knowledge:data.job.snapshot.knowledge}),'overview');
  if(data.job?.result?.brief)add('brief','Shared analysis','Parent analysis brief (may cover multiple option debates)',readable(data.job.result.brief),'overview');
  for(const [kind,rows,tab] of [['Finding',records.threats,'findings'],['Chain',records.chains,'findings'],['Follow-up',records.actions,'followup']])for(const r of rows)add(kind+':'+r.id,kind,r.name||r.title,readable(r),tab);
  for(const t of data.turns||[]){if(t.session_id!==session.id)continue;const name=data.agents?.find(a=>a.id===t.agent_id)?.name||'SME';for(const [key,label] of [['round0_briefing','Briefing'],['round1_assessment','Round 1'],['round2_rebuttal','Round 2'],['compound_chain_text','Proposed chain']])add(t.id+':'+key,'Debate',name+' · '+label,t[key],'evidence');}
  for(const m of data.messages||[])if(m.session_id===session.id)add('message:'+m.id,'Debate',(m.metadata?.agentName||m.role||'Message')+(m.round?' · Round '+m.round:''),m.content,'evidence');
  for(const s of data.syntheses||[])if(s.session_id===session.id)add('synthesis:'+s.id,'Synthesis','Session synthesis',readable(s),'evidence');
  for(const s of data.sources||[])if(s.session_id===session.id)add('source:'+s.id,'Source',s.title||s.domain||'Recorded source',readable(s),'evidence');
  add('notes','Analyst review','Analyst closeout (current draft)',readable(Object.fromEntries(['summary','decision','open_questions','revisit_trigger','accepted_risks'].map(k=>[k,notes[k]]))),'closeout');
  for(const [key,value] of Object.entries(impacts))if([...records.threats.map(r=>'Threat:'+r.id),...records.chains.map(r=>'Chain:'+r.id)].includes(key))add('impact:'+key,'Decision impact','Decision impact assessment',readable(value),'findings');
  for(const item of data.verification?.findings||[])if([...records.threats,...records.chains].some(r=>r.id===item.id))add('verification:'+item.kind+':'+item.id,'Verification',item.name,readable({run:item.run,review:item.review,stale:item.stale}),'evidence');
  return docs;
}
export function searchSession(docs,query,type='All') {
 const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 if(!terms.length)return [];
 return docs.filter(d=>(type==='All'||d.type===type)&&terms.every(t=>(d.title+' '+d.text).toLocaleLowerCase().includes(t))).map(d=>{
  const lower=d.text.toLocaleLowerCase(),positions=terms.map(t=>lower.indexOf(t)).filter(p=>p>=0),start=Math.max(0,(positions.length?Math.min(...positions):0)-80);
  return {...d,snippet:(start?'…':'')+d.text.slice(start,start+300)+(d.text.length>start+300?'…':'')};
 });
}
export function earlierSessions(session,sessions) {
 return sessions.filter(s=>s.id!==session.id&&s.status==='complete'&&s.scenario_id===session.scenario_id&&!!session.scenario_id&&Date.parse(s.created_at)<Date.parse(session.created_at)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
}
const nameKey=r=>(r.name||r.title||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const comparisonValue=r=>Object.fromEntries(['name','title','description','severity','review_status','confidence','rationale','evidence','steps','status','completion_criteria','notes','due_date'].filter(k=>r[k]!=null).map(k=>[k,r[k]]));
export function compareRecords(before,after) {
 const changes=[],used=new Set();
 for(const r of after){
  const exact=before.find(p=>p.id===r.id&&!used.has(p.id));
  const matches=before.filter(p=>nameKey(r)&&nameKey(p)===nameKey(r));
  const unique=matches.length===1&&after.filter(p=>nameKey(p)===nameKey(r)).length===1;
  const previous=exact||(unique&&!used.has(matches[0].id)?matches[0]:null);
  if(!previous){changes.push({status:'Added',after:r,ambiguous:matches.length>0});continue;}
  used.add(previous.id);
  const a=comparisonValue(previous),b=comparisonValue(r),fields=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>canonical(a[k]??null)!==canonical(b[k]??null));
  changes.push({status:fields.length?'Changed':'Unchanged',before:previous,after:r,fields});
 }
 for(const r of before)if(!used.has(r.id))changes.push({status:'Absent from selected debate',before:r});
 return changes;
}
export const impactFingerprint=(record,notes)=>canonical({finding:comparisonValue(record),conclusion:notes.summary||'',decision:notes.decision||''});
export function prioritizedFindings(records,assessments,notes) {
 const order={could_reverse:0,could_change:1,unassessed:2,limited:3};
 return [['Threat',records.threats],['Chain',records.chains]].flatMap(([kind,rows])=>rows.filter(activeRisk).map(record=>{
  const key=kind+':'+record.id,assessment=assessments[key]||{},stale=!!assessment.fingerprint&&assessment.fingerprint!==impactFingerprint(record,notes);
  return {key,kind,record,assessment,stale,level:stale?'unassessed':assessment.level||'unassessed',resolved:assessment.resolved&&!stale};
 })).filter(r=>!r.resolved).sort((a,b)=>(order[a.level]??2)-(order[b.level]??2)||(a.record.name||'').localeCompare(b.record.name||''));
}
