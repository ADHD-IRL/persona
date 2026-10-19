import { createHash } from 'node:crypto';
import { withWorkspace, uuid, httpError } from './entities.js';
export function createRiskService(pool) {
 return async (req,user,url,body) => {
  const match = /^\/api\/risks\/(Threat|Chain)\/([^/]+)\/(merge|action)$/.exec(url.pathname);
  if (!match) return null;
  if (req.method !== 'POST') throw httpError(405,'Method not allowed.');
  const [,kind,id,operation]=match, workspace=uuid(url.searchParams.get('workspace_id'));
  uuid(id); const input=await body(req), table=kind==='Threat'?'threats':'chains';
  return withWorkspace(pool,user.id,workspace,true,async client=>{
   const query=(sql,args=[])=>client.query(sql,args);
   // Lock in stable order so concurrent merges cannot deadlock or create cycles.
   const ids=operation==='merge'?[id,uuid(input.target_id)].sort():[id];
   const rows=(await query('SELECT * FROM '+table+' WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[workspace,ids])).rows;
   const source=rows.find(r=>r.id===id);
   if(!source) throw httpError(404,'Finding not found.');
   if(operation==='action') {
    const step=input.step == null ? null : Number(input.step);
    if(step!==null && (kind!=='Chain'||!Number.isInteger(step)||!(source.steps||[]).some(s=>s.step_number===step))) throw httpError(400,'Choose an existing chain step.');
    if(source.merged_into || source.review_status==='archived') throw httpError(400,'Create actions on an active finding.');
    const action=String(input.action||'').trim(), criteria=String(input.completion_criteria||'').trim();
    const key=kind+':'+id+':'+(step??'all')+':'+createHash('sha256').update(action.toLowerCase()).digest('hex');
    if(!action||!criteria) throw httpError(400,'Enter an action and observable completion criteria.');
    const result=await query(`INSERT INTO mitigations(workspace_id,title,completion_criteria,source,scenario_id,session_id,chain_id,threat_id,breaks_steps,evidence_ids,risk_action_key) VALUES($1,$2,$3,'risk_review',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(workspace_id,risk_action_key) WHERE risk_action_key IS NOT NULL DO UPDATE SET risk_action_key=EXCLUDED.risk_action_key RETURNING *`,[workspace,action,criteria,source.scenario_id,source.session_id,kind==='Chain'?id:null,kind==='Threat'?id:source.threat_id,JSON.stringify(step===null?[]:[step]),JSON.stringify((source.evidence||[]).map(e=>e.id).filter(Boolean)),key]);
    return {status:200,data:result.rows[0]};
   }
   const target=rows.find(r=>r.id===input.target_id);
   if(!target||target.id===id||target.merged_into||source.merged_into) throw httpError(400,'Choose two different, unmerged findings.');
   if(source.scenario_id!==target.scenario_id) throw httpError(400,'Merge findings within the same scenario.');
   if(kind==='Chain' && JSON.stringify(source.steps)!==JSON.stringify(target.steps)) throw httpError(400,'Chains must have identical steps before merging so step links remain accurate. Archive distinct paths separately.');
   const evidence=[...(target.evidence||[]),...(source.evidence||[]),{text:source.description||source.name,kind:'merged_record',record_id:source.id}];
   await query('UPDATE '+table+` SET evidence=$1,review_status='needs_review',updated_at=now() WHERE id=$2 AND workspace_id=$3`,[JSON.stringify(evidence),target.id,workspace]);
   if(kind==='Threat') { await query('UPDATE chains SET threat_id=$1,updated_at=now() WHERE threat_id=$2 AND workspace_id=$3',[target.id,id,workspace]); await query('UPDATE mitigations SET threat_id=$1,updated_at=now() WHERE threat_id=$2 AND workspace_id=$3',[target.id,id,workspace]); }
   else { await query('UPDATE mitigations SET chain_id=$1,updated_at=now() WHERE chain_id=$2 AND workspace_id=$3',[target.id,id,workspace]); await query('UPDATE sessions SET pinned_chain_ids=array_replace(pinned_chain_ids,$1,$2) WHERE workspace_id=$3',[id,target.id,workspace]); }
   await query('UPDATE '+table+` SET merged_into=$1,review_status='archived',updated_at=now() WHERE id=$2 AND workspace_id=$3`,[target.id,id,workspace]);
   return {status:200,data:{id:target.id}};
  });
 };
}
