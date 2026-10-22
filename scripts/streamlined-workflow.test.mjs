import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTrackerRecords} from '../src/lib/trackerLoading.js';
import {sessionRecords} from '../src/lib/sessionTracker.js';
import {retrieveKnowledge} from '../src/lib/knowledge.js';
import {buildSnapshot} from '../server/analysisService.js';
import {changedInputs} from '../src/lib/analysisWorkflow.js';
import {verificationContext} from '../server/verificationService.js';
test('tracker scoped loading preserves indirect chains/actions without adding another session',async()=>{
 const tables={Threat:[{id:'t',session_id:'s'},{id:'other',session_id:'other'}],Chain:[{id:'c',threat_id:'t'},{id:'foreign',session_id:'other',threat_id:'t'}],Mitigation:[{id:'a',chain_id:'c'},{id:'foreign-a',session_id:'other',threat_id:'t'}]};
 const calls=[],db=Object.fromEntries(Object.entries(tables).map(([kind,rows])=>[kind,{list:()=>{throw Error('Full library scan');},filter:async filter=>{calls.push(filter);return rows.filter(r=>Object.entries(filter).every(([k,v])=>r[k]===v));}}]));
 const data=await loadTrackerRecords(db,{id:'s'}),own=sessionRecords({id:'s'},data);assert.deepEqual(own.threats.map(r=>r.id),['t']);assert.deepEqual(own.chains.map(r=>r.id),['c']);assert.deepEqual(own.actions.map(r=>r.id),['a']);assert.ok(calls.every(c=>Object.keys(c).length===1));
});
test('explicit source selection excludes unselected passages and propagates retrieval errors',async()=>{
 const db={KnowledgeChunk:{list:async()=>[{id:'all',content:'Recovery evidence'}],filter:async ({document_id})=>[{id:document_id,document_id,content:'Recovery evidence'}]}};
 assert.deepEqual((await retrieveKnowledge(db,'Recovery',5,['a'])).map(r=>r.id),['a']);assert.deepEqual(await retrieveKnowledge(db,'Recovery',5,[]),[]);
 db.KnowledgeChunk.filter=async()=>{throw Error('offline');};await assert.rejects(retrieveKnowledge(db,'Recovery',5,['a']),/offline/);
});
test('selected knowledge source changes invalidate analysis even when no passage matched',async()=>{
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let content='Unmatched material';
 const db={Scenario:{get:async()=>({id:id(1),name:'Recovery',context_document:'Recovery test'})},Agent:{get:async id=>({id,name:'SME'})},KnowledgeDocument:{get:async value=>value===id(5)?{id:value,title:'Report',content}:null},KnowledgeChunk:{filter:async()=>[]}};
 const input={mode:'risk',scenario_id:id(1),question:'Assess recovery',context_in_scenario:true,agent_ids:[id(2),id(3),id(4)],knowledge_document_ids:[id(5)]};
 const before=await buildSnapshot(db,input,'test');content='Changed report';const after=await buildSnapshot(db,input,'test');assert.ok(changedInputs(before,after).includes('knowledge_sources'));assert.deepEqual(before.knowledge,[]);await assert.rejects(buildSnapshot(db,{...input,knowledge_document_ids:[id(6)]},'test'),/no longer available/);
});
test('verification reuses a knowledge reference once and reflects later document edits',async()=>{
 let content='First report';const db={Session:{get:async()=>({id:'s'})},Threat:{filter:async()=>[]},Chain:{filter:async()=>[]},KnowledgeDocument:{list:async()=>[{id:'d',title:'Report',content}]},AppConfig:{filter:async()=>[{value:JSON.stringify({sources:[{id:'knowledge-d',knowledge_document_id:'d',title:'Report',quality:'primary',origin:'test'}]})}]}};
 const before=await verificationContext(db,'s');assert.equal(before.sources.length,1);assert.equal(before.sources[0].quality,'primary');content='Second report';const after=await verificationContext(db,'s');assert.equal(after.sources.length,1);assert.equal(after.sources[0].text,content);assert.notEqual(before.sources[0].version,after.sources[0].version);
});

import {migrationChecksum,matchesMigrationChecksum} from '../server/migrate.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('migration checks tolerate line endings but reject changed SQL including the historical baseline',async()=>{const sql='CREATE TABLE test (id int);\n',crlf=sql.replace(/\n/g,'\r\n');assert.equal(migrationChecksum(sql),migrationChecksum(crlf));assert.equal(matchesMigrationChecksum('test.sql',sql,createHash('sha256').update(crlf).digest('hex')),true);assert.equal(matchesMigrationChecksum('test.sql',sql+'-- changed',migrationChecksum(sql)),false);const baseline=await readFile(new URL('../db/migrations/001_local_postgres.sql',import.meta.url),'utf8');const old="b255d3ab02a48cc94606d22828519f141403709527929fcb1e813fedced8d73b";assert.equal(matchesMigrationChecksum('001_local_postgres.sql',baseline,old),true);assert.equal(matchesMigrationChecksum('001_local_postgres.sql',baseline+'-- changed',old),false);});
