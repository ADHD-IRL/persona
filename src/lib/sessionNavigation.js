export const trackerPath=(id,tab)=>'/session-tracker?'+new URLSearchParams({session:id,...(tab?{tab}:{})});
export function sessionRunPath(session){
 if(session.analysis_job_id)return '/analysis/'+session.analysis_job_id;
 return '/sessions/'+session.id+(session.mode==='panel'?'/panel':session.mode==='live'?'/live':'');
}
export function analysisSessions(job){
 const rows=[...(job.result?.sessions||[]).map(s=>({id:s.sessionId,name:s.option?.name||'Session',reused:s.reused})),...(job.activity?.options||[]).filter(s=>s.session_id).map(s=>({id:s.session_id,name:s.name||'Session',reused:s.reused}))];
 return rows.filter((r,i)=>r.id&&rows.findIndex(s=>s.id===r.id)===i);
}
