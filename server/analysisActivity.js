// Read-only projection of durable debate evidence; no model calls or writes.
export async function readAnalysisActivity(client, job, includeDebate = false) {
 const options = job.snapshot.mode === 'compare' ? job.snapshot.options : [{ id:'scenario', name:job.snapshot.question }];
 const sessions = options.map(option => ({ option, checkpoint:job.checkpoints?.[option.id] || {}, result:job.result?.sessions?.find(s => s.option?.id === option.id) }));
 const ids = [...new Set(sessions.map(s => s.checkpoint.sessionId || s.result?.sessionId).filter(Boolean))];
 const valid = ids.length ? (await client.query('SELECT id FROM sessions WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[job.workspace_id,ids])).rows.map(s=>s.id) : [];
 const turns = valid.length ? (await client.query('SELECT session_id,agent_id,status,coalesce(length(round1_assessment),0)>0 AS round1_done,coalesce(length(round2_rebuttal),0)>0 AS round2_done'+(includeDebate?',round1_assessment,round2_rebuttal,round1_severity,round2_revised_severity':'')+' FROM session_agents WHERE workspace_id=$1 AND session_id=ANY($2::uuid[])',[job.workspace_id,valid])).rows : [];
 const syntheses = valid.length ? (await client.query('SELECT session_id,coalesce(length(raw_text),0)>0 AS complete'+(includeDebate?',raw_text':'')+' FROM session_syntheses WHERE workspace_id=$1 AND session_id=ANY($2::uuid[]) ORDER BY created_at',[job.workspace_id,valid])).rows : [];
 return { checked_at:new Date().toISOString(), includes_debate:includeDebate, options:sessions.map(({option,checkpoint,result})=>{
  const sessionId=checkpoint.sessionId || result?.sessionId;
  const synthesis=syntheses.find(s=>s.session_id===sessionId);
  return {id:option.id,name:option.name,session_id:valid.includes(sessionId)?sessionId:null,reused:!!(checkpoint.reused||result?.reused),synthesis_done:!!synthesis?.complete,
   ...(includeDebate?{synthesis:synthesis?.raw_text||''}:{}),
   agents:(job.snapshot.agents||[]).map(agent=>{
    const turn=turns.find(t=>t.session_id===sessionId&&t.agent_id===agent.id);
    return {id:agent.id,name:agent.name,discipline:agent.discipline,round1_done:!!turn?.round1_done,round2_done:!!turn?.round2_done,
     ...(includeDebate?{round1:turn?.round1_assessment||'',round2:turn?.round2_rebuttal||'',severity1:turn?.round1_severity,severity2:turn?.round2_revised_severity}:{})};
   })};
 })};
}
