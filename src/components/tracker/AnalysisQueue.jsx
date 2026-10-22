import {useBackgroundWork} from '@/components/layout/BackgroundWork';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {apiRequest} from '@/lib/apiClient';
import {stageDescriptions,analysisProgress} from '@/lib/analysisProgress';
import {WorkflowCard,WorkflowButton,workflowAction} from '@/components/ui/WorkflowControls';
export function AnalysisNotice({job,workspaceId,canWrite,onRefresh,preparing=false,onViewDebate}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useBackgroundWork(busy,'Analysis request');
 const failed=job.status==='failed',active=['queued','running'].includes(job.status);
 if(!failed&&!active)return null;
 const progress=job.snapshot?analysisProgress(job):null;
 const stage=stageDescriptions[job.progress?.stage]||stageDescriptions.preparing;
 async function stop(){setBusy(true);setError('');try{await apiRequest('/api/analyses/'+job.id+'/cancel?workspace_id='+workspaceId,{method:'POST',body:{}});await onRefresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function resume(){setBusy(true);setError('');try{await apiRequest('/api/analyses/'+job.id+'/resume?workspace_id='+workspaceId,{method:'POST',body:{}});await onRefresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <WorkflowCard title={failed?'Analysis needs attention':preparing?'Preparing your session…':'Session in progress'} description={job.input?.question}>
 <p role="status">{failed?'Work stopped. Saved responses are retained.':job.status==='queued'?'Queued · waiting for the analysis worker':stage[0]}</p>
 {!failed&&<p className="text-sm text-slate-400">{stage[1]}{job.progress?.agentName?' Current SME: '+job.progress.agentName+'.':''}</p>}
 {progress&&active&&<p className="text-sm text-slate-400">{progress.responses}/{progress.responseTotal} SME responses saved · {progress.percent}% of analysis work saved (not a time estimate). For comparisons, progress covers all option debates.</p>}
 {failed&&job.error&&<p className="text-sm text-red-300">{typeof job.error==='string'?job.error:job.error.message||'Open analysis details for the error.'}</p>}
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 <div className="flex flex-wrap gap-3">{failed&&canWrite&&<WorkflowButton disabled={busy} onClick={resume}>{busy?'Resuming…':'Resume analysis'}</WorkflowButton>}{onViewDebate?<WorkflowButton variant="secondary" onClick={onViewDebate}>View debate</WorkflowButton>:<Link data-ui="action" className={workflowAction} to={'/analysis/'+job.id}>{failed?'Review analysis details':'View run details'}</Link>}</div>
 <details><summary>Run details</summary><div className="space-y-3 mt-3"><p className="text-sm text-slate-400">Saved work is retained when stopped. Resume continues unfinished work using saved inputs.</p>{job.progress?.recovery?.message&&<p>{job.progress.recovery.message}</p>}{active&&canWrite&&<WorkflowButton variant="secondary" disabled={busy||job.cancel_requested} onClick={stop}>{job.cancel_requested?'Stopping…':'Stop analysis'}</WorkflowButton>}<Link data-ui="reference" className="text-amber-300 underline" to={'/analysis/'+job.id}>Full run record</Link></div></details>
 </WorkflowCard>;
}
export default function AnalysisQueue({workspaceId,sessions,selectedJobId,canWrite}){
 const [jobs,setJobs]=useState([]),[error,setError]=useState('');
 async function refresh(){const rows=await apiRequest('/api/analyses?workspace_id='+workspaceId+'&status=1');setJobs(rows);}
 useEffect(()=>{let live=true,pending=false,signature=null;async function load(){if(pending||document.hidden)return;pending=true;try{const rows=await apiRequest('/api/analyses?workspace_id='+workspaceId+'&status=1');if(live){const next=JSON.stringify(rows.map(j=>[j.id,j.status,j.progress?.stage]));if(signature!==null&&next!==signature)window.dispatchEvent(new Event('agd-analysis-queue-change'));signature=next;setJobs(rows);setError('');}}catch(e){if(live)setError(e.message);}finally{pending=false;}}load();const timer=setInterval(load,8000);return()=>{live=false;clearInterval(timer);};},[workspaceId]);
 const visible=jobs.filter(j=>j.id!==selectedJobId&&(j.status==='failed'||(['queued','running'].includes(j.status)&&!sessions.some(s=>s.analysis_job_id===j.id))));
 return <>{error&&<p role="alert" className="text-amber-300">Could not check pending analyses: {error}</p>}{visible.map(job=><AnalysisNotice key={job.id} job={job} workspaceId={workspaceId} canWrite={canWrite} onRefresh={refresh} preparing/>)}</>;
}
