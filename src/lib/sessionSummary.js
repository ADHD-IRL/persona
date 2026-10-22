import {loadTrackerRecords} from './trackerLoading.js';
import {sessionRecords,trackerKey,blankCloseout} from './sessionTracker.js';
import {readKV} from './appConfigKV.js';
export async function loadSessionSummary(db,id,loadJob){
 const session=await db.Session.get(id);
 if(!session)throw new Error('This session is no longer available.');
 if(session.status!=='complete')return {session};
 const [scoped,syntheses,sources,turns,scenario,review,draft,job,panelSetup]=await Promise.all([
 loadTrackerRecords(db,session),db.SessionSynthesis.filter({session_id:id},'-created_at'),db.SessionSource.filter({session_id:id}),db.SessionAgent.filter({session_id:id}),session.scenario_id?db.Scenario.get(session.scenario_id):null,readKV(db,trackerKey(id)),readKV(db,'tracker_draft_'+id),session.analysis_job_id?loadJob(session.analysis_job_id):null,session.mode==='panel'?readKV(db,'panel_setup_'+id):null]);
 const records=sessionRecords(session,scoped);
 const agents=panelSetup?.agents||job?.snapshot?.agents||(await Promise.all([...new Set(turns.map(t=>t.agent_id))].map(agentId=>db.Agent.get(agentId)))).filter(Boolean);
 return {session,records,question:panelSetup?.question||job?.snapshot?.question||job?.input?.question||session.name,synthesis:syntheses[0],sources,agents,scenario:panelSetup?{...scenario,name:panelSetup.scenario_name||session.name,context_document:panelSetup.context}:job?.snapshot?.scenario||scenario,currentScenario:scenario,snapshot:!!panelSetup||!!job?.snapshot?.scenario,notes:{...blankCloseout,...review},hasDraft:!!draft?.notes,job};
}
