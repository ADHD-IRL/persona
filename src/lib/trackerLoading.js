const unique=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];
export async function loadTrackerRecords(db,session){
 const shared=async entity=>session.analysis_job_id?db[entity].filter({analysis_job_id:session.analysis_job_id}):[];
 const [ownThreats,sharedThreats,ownChains,sharedChains,ownActions,sharedActions]=await Promise.all([db.Threat.filter({session_id:session.id}),shared('Threat'),db.Chain.filter({session_id:session.id}),shared('Chain'),db.Mitigation.filter({session_id:session.id}),shared('Mitigation')]);
 const linkedChains=(await Promise.all(ownThreats.map(t=>db.Chain.filter({threat_id:t.id})))).flat();
 const chains=unique([...ownChains,...sharedChains,...linkedChains]);
 const linkedActions=(await Promise.all([...ownThreats.map(t=>db.Mitigation.filter({threat_id:t.id})),...chains.filter(c=>c.session_id===session.id||!c.session_id).map(c=>db.Mitigation.filter({chain_id:c.id}))])).flat();
 return {threats:unique([...ownThreats,...sharedThreats]),chains,actions:unique([...ownActions,...sharedActions,...linkedActions])};
}
