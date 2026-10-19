import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionRecords,trackerSummary,trackerFingerprint,sessionBrief,blankCloseout} from '../src/lib/sessionTracker.js';
const session={id:'s1',scenario_id:'scenario',analysis_job_id:'job',name:'Recovery debate',status:'complete'};
const data={threats:[{id:'t1',session_id:'s1',name:'Power loss',review_status:'needs_review'},{id:'t2',session_id:'s2',scenario_id:'scenario',analysis_job_id:'job',name:'Other option finding'},{id:'t3',scenario_id:'scenario',name:'Unattributed'}],chains:[{id:'c1',threat_id:'t1',name:'Cascade'},{id:'c2',session_id:'s2',threat_id:'t1',name:'Other session chain'}],actions:[{id:'a1',session_id:'s1',title:'Exercise',status:'proposed',due_date:'2026-01-01'},{id:'a2',chain_id:'c1',title:'Test backup',status:'verified',completion_criteria:'Test result',notes:'Passed'},{id:'a3',session_id:'s2',chain_id:'c1',title:'Other session work',status:'proposed'},{id:'a4',scenario_id:'scenario',title:'Unattributed scenario action',status:'proposed'},{id:'a5',analysis_job_id:'job',scenario_id:'scenario',title:'Shared work',status:'proposed'}]};
test('tracker isolates sessions, follows explicit links, and labels shared and unattributed work',()=>{
 const r=sessionRecords(session,data);assert.deepEqual(r.threats.map(x=>x.id),['t1']);assert.deepEqual(r.chains.map(x=>x.id),['c1']);assert.deepEqual(r.actions.map(x=>x.id),['a1','a2']);assert.deepEqual(r.sharedThreats.map(x=>x.id),['t2']);assert.deepEqual(r.unlinked.map(x=>x.id),['a4']);
 const withOrphan=sessionRecords(session,{...data,actions:[...data.actions,{id:'orphan',title:'Legacy unlinked action'}]});assert.ok(withOrphan.unlinked.some(a=>a.id==='orphan'));
});
test('tracker prioritizes review, overdue work and missing completion criteria',()=>{
 const r=sessionRecords(session,data),summary=trackerSummary(r,'2026-10-16');assert.equal(summary.review,2);assert.equal(summary.open,1);assert.equal(summary.overdue,1);assert.equal(summary.withoutCriteria,1);assert.equal(summary.verified,1);
});
test('review change detection is stable under ordering but reacts to evidence and scenario edits',()=>{
 const r=sessionRecords(session,data),base=trackerFingerprint(session,r,{raw_text:'Synthesis'},[],null,{context_document:'Original'});
 assert.equal(base,trackerFingerprint(session,{...r,actions:[...r.actions].reverse()},{raw_text:'Synthesis'},[],null,{context_document:'Original'}));
 assert.notEqual(base,trackerFingerprint(session,r,{raw_text:'Changed synthesis'},[],null,{context_document:'Original'}));
 assert.notEqual(base,trackerFingerprint(session,r,{raw_text:'Synthesis'},[],null,{context_document:'Changed'}));
 assert.notEqual(base,trackerFingerprint(session,{...r,actions:r.actions.map(a=>({...a,status:'implemented'}))},{raw_text:'Synthesis'},[],null,{context_document:'Original'}));
});
test('session export contains the analyst disposition and only session-specific material',()=>{
 const text=sessionBrief(session,sessionRecords(session,data),{...blankCloseout,decision:'Test backup before launch'},{raw_text:'Model synthesis'});
 assert.ok(text.includes('Test backup before launch'));assert.ok(text.includes('Power loss'));assert.ok(text.includes('Model synthesis'));assert.ok(text.includes(String.fromCharCode(10).repeat(2)));assert.ok(!text.includes('Other session work'));assert.ok(!text.includes('Other option finding'));
});
