import MarkdownContent from '@/components/ui/MarkdownContent';
import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {useWorkspace} from '@/lib/WorkspaceContext';
import {WorkflowCard,WorkflowButton,workflowAction} from '@/components/ui/WorkflowControls';
import {trackerPath} from '@/lib/sessionNavigation';

// Guided jobs own their execution. Legacy/manual rooms remain available only
// for sessions that are not being managed by the background analysis worker.
export default function SessionEntry({children}){
 const {id}=useParams(),{db}=useWorkspace();
 const [loaded,setLoaded]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setLoaded(null);setError('');db.Session.get(id).then(session=>{if(live){if(!session)setError('Session not found.');else setLoaded({id,session});}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id,db]);
 if(error)return <p role="alert" className="p-6 text-red-300">{error}</p>;
 if(loaded?.id!==id)return <p role="status" className="p-6">Opening session…</p>;
 return loaded.session.analysis_job_id?<GuidedDebate key={id} session={loaded.session}/>:children;
}
function GuidedDebate({session}){
 const {db}=useWorkspace();const [data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let live=true,pending=false;async function load(){if(pending)return;pending=true;try{
  const [turns,messages,syntheses]=await Promise.all([db.SessionAgent.filter({session_id:session.id}),db.SessionMessage.filter({session_id:session.id},'created_at'),db.SessionSynthesis.filter({session_id:session.id},'-created_at')]);
  const agents=await Promise.all([...new Set(turns.map(t=>t.agent_id))].map(id=>db.Agent.get(id)));
  if(live){setData({turns,messages,syntheses,agents:agents.filter(Boolean)});setError('');}
 }catch(e){if(live)setError(e.message);}finally{pending=false;}}load();const timer=setInterval(load,8000);return()=>{live=false;clearInterval(timer);};},[db,session.id,refresh]);
 return <div className="session-tracker max-w-6xl mx-auto p-6 space-y-5 text-[var(--wr-text-primary)]"><header className="space-y-3"><h1 className="text-2xl font-bold">{session.name} · Debate transcript</h1><p className="text-sm text-slate-400">Saved responses from the guided analysis. This read-only view refreshes every eight seconds. Use the contextual progress card in Session Tracker to monitor the run and view the debate. Open Run details for the full run record.</p><nav aria-label="Session navigation" className="flex flex-wrap gap-2"><Link data-ui="action" className={workflowAction} to={trackerPath(session.id)}>Return to Session Tracker</Link><Link data-ui="action" className={workflowAction} to={'/analysis/'+session.analysis_job_id}>Run details and brief</Link><WorkflowButton variant="secondary" onClick={()=>setRefresh(n=>n+1)}>Refresh transcript</WorkflowButton></nav></header>
 {error&&<p role="alert" className="text-red-300">{error}</p>}{!data&&!error&&<p role="status">Loading saved responses…</p>}
 {data&&<>{[1,2].map(round=><WorkflowCard key={round} title={'Round '+round+' · '+(round===1?'Assessments':'Rebuttals')}>{!data.turns.some(t=>t[round===1?'round1_assessment':'round2_rebuttal'])&&<p>No responses saved yet.</p>}{data.turns.filter(t=>t[round===1?'round1_assessment':'round2_rebuttal']).map(t=><details key={t.id} className="rounded-xl border border-slate-700 p-3"><summary>{data.agents.find(a=>a.id===t.agent_id)?.name||'SME'}</summary><MarkdownContent className=" break-words leading-relaxed text-sm mt-3">{t[round===1?'round1_assessment':'round2_rebuttal']}</MarkdownContent></details>)}</WorkflowCard>)}<WorkflowCard title="Model synthesis"><MarkdownContent className=" break-words text-sm">{data.syntheses[0]?.raw_text||'No synthesis saved yet.'}</MarkdownContent></WorkflowCard>{!!data.messages.length&&<WorkflowCard title="Saved messages">{data.messages.map(m=><details key={m.id}><summary>{m.metadata?.agentName||m.role}</summary><MarkdownContent className=" break-words text-sm">{m.content}</MarkdownContent></details>)}</WorkflowCard>}</>}
 </div>;
}
