import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {apiRequest} from '@/lib/apiClient';
import {stageDescriptions,analysisProgress} from '@/lib/analysisProgress';
import {WorkflowCard,WorkflowButton,workflowAction} from '@/components/ui/WorkflowControls';
export function AnalysisNotice({job,workspaceId,canWrite,onRefresh,preparing=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const failed=job.status==='failed',active=['queued','running'].includes(job.status);
 if(!failed&&!active)return null;
 const progress=job.snapshot?analysisProgress(job):null;
 const stage=stageDescriptions[job.progress?.stage]||stageDescriptions.preparing;
 async function resume(){setBusy(true);setError('');try{await apiRequest('/api/analyses/'+job.id+'/resume?workspace_id='+workspaceId,{method:'POST',body:{}});await onRefresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <WorkflowCard title={failed?'Analysis needs attention':preparing?'Preparing your session…':'Session in progress'} description={job.input?.question}>
 <p role="status">{failed?'Work stopped. Saved responses are retained.':job.status==='queued'?'Queued · waiting for the analysis worker':stage[0]}</p>
 {!failed&&<p className="text-sm text-slate-400">{stage[1]}{job.progress?.agentName?' Current SME: '+job.progress.agentName+'.':''}</p>}
 {progress&&active&&<p className="text-sm text-slate-400">{progress.responses}/{progress.responseTotal} SME responses saved · {progress.percent}% of analysis work saved (not a time estimate). For comparisons, progress covers all option debates.</p>}
 {failed&&job.error&&<p className="text-sm text-red-300">{typeof job.error==='string'?job.error:job.error.message||'Open analysis details for the error.'}</p>}
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 <div className="flex flex-wrap gap-3">{failed&&canWrite&&<WorkflowButton disabled={busy} onClick={resume}>{busy?'Resuming…':'Resume analysis'}</WorkflowButton>}<Link data-ui="action" className={workflowAction} to={'/analysis/'+job.id}>{failed?'Review analysis details':'View debate and controls'}</Link></div>
 </WorkflowCard>;
}
export default function AnalysisQueue({workspaceId,sessions,selectedJobId,canWrite}){
 const [jobs,setJobs]=useState([]),[error,setError]=useState('');
 async function refresh(){const rows=await apiRequest('/api/analyses?workspace_id='+workspaceId);setJobs(rows);}
 useEffect(()=>{let live=true,pending=false;async function load(){if(pending)return;pending=true;try{const rows=await apiRequest('/api/analyses?workspace_id='+workspaceId);if(live){setJobs(rows);setError('');}}catch(e){if(live)setError(e.message);}finally{pending=false;}}load();const timer=setInterval(load,8000);return()=>{live=false;clearInterval(timer);};},[workspaceId]);
 const visible=jobs.filter(j=>j.id!==selectedJobId&&(j.status==='failed'||(['queued','running'].includes(j.status)&&!sessions.some(s=>s.analysis_job_id===j.id))));
 return <>{error&&<p role="alert" className="text-amber-300">Could not check pending analyses: {error}</p>}{visible.map(job=><AnalysisNotice key={job.id} job={job} workspaceId={workspaceId} canWrite={canWrite} onRefresh={refresh} preparing/>)}</>;
}
