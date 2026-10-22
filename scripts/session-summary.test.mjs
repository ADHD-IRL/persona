import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSessionSummary} from '../src/lib/sessionSummary.js';
test('summary uses historical scenario and saved review with session-scoped records',async()=>{
 const session={id:'s',scenario_id:'sc',status:'complete',analysis_job_id:'job'};
 const tables={Threat:[{id:'t',session_id:'s',analysis_job_id:'job'},{id:'other',session_id:'s2',analysis_job_id:'job'}],Chain:[{id:'c',threat_id:'t'},{id:'foreign',session_id:'s2',threat_id:'t'}],Mitigation:[{id:'a',chain_id:'c'},{id:'foreign-action',session_id:'s2',threat_id:'t'}],SessionSource:[{id:'source',session_id:'s'},{id:'other-source',session_id:'s2'}],SessionAgent:[],SessionSynthesis:[{id:'synthesis',session_id:'s',raw_text:'Selected debate'}],AppConfig:[{key:'session_tracker_s',value:JSON.stringify({summary:'Saved conclusion',saved_at:'2026-10-20'})},{key:'tracker_draft_s',value:JSON.stringify({notes:{summary:'Unconfirmed draft'}})}]};
 const db=Object.fromEntries(Object.entries(tables).map(([k,rows])=>[k,{filter:async f=>rows.filter(r=>Object.entries(f).every(([key,v])=>r[key]===v)),list:()=>{throw Error('Unexpected broad request');}}]));
 db.Session={get:async()=>session};db.Scenario={get:async()=>({id:'sc',context_document:'Edited scenario'})};
 const data=await loadSessionSummary(db,'s',async id=>{assert.equal(id,'job');return {snapshot:{scenario:{id:'sc',context_document:'Saved context'},agents:[]}};});
 assert.equal(data.scenario.context_document,'Saved context');assert.equal(data.currentScenario.context_document,'Edited scenario');assert.equal(data.notes.summary,'Saved conclusion');assert.equal(data.hasDraft,true);
 assert.deepEqual(data.records.threats.map(r=>r.id),['t']);assert.deepEqual(data.records.chains.map(r=>r.id),['c']);assert.deepEqual(data.records.actions.map(r=>r.id),['a']);assert.deepEqual(data.sources.map(r=>r.id),['source']);
});
test('summary identifies unfinished sessions without fetching their materials and rejects missing sessions',async()=>{
 const data=await loadSessionSummary({Session:{get:async()=>({id:'s',status:'round1'})}},'s',()=>{throw Error('Unexpected job request');});assert.equal(data.session.status,'round1');assert.equal(data.records,undefined);
 await assert.rejects(loadSessionSummary({Session:{get:async()=>null}},'missing',()=>{}),/no longer available/);
});
