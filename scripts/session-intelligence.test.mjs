import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionRecords,blankCloseout,sessionBrief,trackerFingerprint} from '../src/lib/sessionTracker.js';
import {searchDocuments,searchSession,earlierSessions,compareRecords,prioritizedFindings,impactFingerprint} from '../src/lib/sessionIntelligence.js';
const session={id:'s1',name:'Selected',scenario_id:'sc',created_at:'2026-10-15T10:00:00Z'};
const threat={id:'t',session_id:'s1',name:'Backup unavailable',description:'Maintenance evidence missing',review_status:'reviewed'};
const data={threats:[threat,{id:'private',session_id:'s2',name:'PRIVATEFINDING'}],chains:[],actions:[],turns:[{id:'turn',session_id:'s1',agent_id:'a',round1_assessment:'POWER recovery exceeds the target',round2_rebuttal:'Validation needs an exercise'},{id:'other',session_id:'s2',round1_assessment:'PRIVATEDEBATE'}],messages:[{id:'message',session_id:'s1',role:'user',content:'Did the UPS survive?'},{id:'private-message',session_id:'s2',content:'PRIVATEMESSAGE'}],sources:[{id:'source',session_id:'s1',title:'Test log',content_snippet:'Ninety seconds'}],syntheses:[{id:'sy',session_id:'s1',raw_text:'Recovery remains unverified'}],agents:[{id:'a',name:'Operations SME'}],scenarios:[{id:'sc',context_document:'Critical service'}]};
const records=sessionRecords(session,data),notes={...blankCloseout,decision:'Proceed after an exercise'};
test('session search covers debate, live messages, sources, draft and excludes other sessions',()=>{
 const docs=searchDocuments(session,records,data,notes);
 for(const query of ['power TARGET','ups','Ninety','unverified','Proceed','Maintenance','Critical'])assert.ok(searchSession(docs,query).length,query);
 for(const query of ['PRIVATEDEBATE','PRIVATEFINDING','PRIVATEMESSAGE'])assert.equal(searchSession(docs,query).length,0,query);
 assert.equal(searchSession(docs,'power','Debate').length,1);assert.equal(searchSession(docs,'power','Source').length,0);assert.equal(searchSession(docs,'   ').length,0);
});
test('search preserves full content and produces a nearby excerpt for late matches',()=>{
 const text='x'.repeat(1000)+' evidence target '+'y'.repeat(500),hit=searchSession([{title:'Long record',text,type:'Debate'}],'evidence')[0];
 assert.ok(hit.snippet.includes('evidence'));assert.equal(hit.text,text);
});
test('earlier debate selection excludes other scenarios, future, incomplete and unknown dates',()=>{
 const rows=[{id:'old',scenario_id:'sc',status:'complete',created_at:'2026-10-10'},{id:'newer',scenario_id:'sc',status:'complete',created_at:'2026-10-14'},{id:'future',scenario_id:'sc',status:'complete',created_at:'2026-10-20'},{id:'pending',scenario_id:'sc',status:'round1',created_at:'2026-10-14'},{id:'other',scenario_id:'other',status:'complete',created_at:'2026-10-14'},{id:'missing',scenario_id:'sc',status:'complete'}];
 assert.deepEqual(earlierSessions(session,rows).map(s=>s.id),['newer','old']);assert.equal(earlierSessions({...session,scenario_id:null},rows).length,0);
});
test('comparison identifies exact-name changes without treating provenance or timestamps as content',()=>{
 const before=[{id:'a',name:'Backup loss',description:'Old',severity:'HIGH'},{id:'b',name:'Keep',created_at:'yesterday'}];
 const after=[{id:'a2',name:'Backup loss',description:'New',severity:'HIGH'},{id:'b2',name:'Keep',created_at:'today'}];
 const diff=compareRecords(before,after);assert.equal(diff[0].status,'Changed');assert.deepEqual(diff[0].fields,['description']);assert.equal(diff[1].status,'Unchanged');
});
test('renamed and ambiguous findings are not silently merged or resolved',()=>{
 const diff=compareRecords([{id:'a',name:'Repeated'},{id:'b',name:'Repeated'},{id:'c',name:'Old name'}],[{id:'x',name:'Repeated'},{id:'y',name:'New name'}]);
 assert.equal(diff.filter(r=>r.status==='Added').length,2);assert.equal(diff.filter(r=>r.status==='Absent from selected debate').length,3);assert.equal(diff[0].ambiguous,true);
 assert.equal(compareRecords([{id:'a',name:'Old'}],[{id:'a',name:'Renamed'}])[0].status,'Changed');
});
test('decision impact ranks by analyst judgement, invalidates stale decisions, and does not equate reviewed with resolved',()=>{
 const items={...records,threats:[threat,{...threat,id:'t2',name:'Second'},{...threat,id:'t3',name:'Third'},{...threat,id:'t4',name:'Archived',review_status:'archived'}]};
 const assessments={'Threat:t':{level:'could_change',fingerprint:impactFingerprint(threat,notes)},'Threat:t2':{level:'could_reverse',fingerprint:impactFingerprint(items.threats[1],notes)},'Threat:t3':{resolved:true,level:'limited',fingerprint:impactFingerprint(items.threats[2],notes)}};
 assert.deepEqual(prioritizedFindings(items,assessments,notes).map(r=>r.key),['Threat:t2','Threat:t']);
 const changed=prioritizedFindings(items,assessments,{...notes,decision:'Do not proceed'});assert.equal(changed.length,3);assert.ok(changed.every(r=>r.stale&&r.level==='unassessed'));
 const changedFinding=prioritizedFindings({...records,threats:[{...threat,description:'New evidence'}]},assessments,notes);assert.equal(changedFinding[0].stale,true);
});
test('impact assessment changes invalidate completed review and export retains scoped rationale',()=>{
 const impacts={'Threat:t':{level:'could_reverse',criterion:'Recovery target',rationale:'Launch depends on it',reversal_condition:'Recovery exceeds target'},'Threat:private':{rationale:'SECRET'}};
 assert.notEqual(trackerFingerprint(session,records,null,[],null,null),trackerFingerprint(session,records,null,[],null,null,impacts));
 const brief=sessionBrief(session,records,notes,null,impacts);assert.ok(brief.includes('Recovery target'));assert.ok(!brief.includes('SECRET'));
});

test('adding impact support does not invalidate reviews that have no impact assessments',()=>{
 const value=JSON.parse(trackerFingerprint(session,records,null,[],null,null));
 assert.equal('decisionImpacts' in value,false);
});
