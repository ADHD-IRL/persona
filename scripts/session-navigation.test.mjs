import test from 'node:test';
import assert from 'node:assert/strict';
import {trackerPath,sessionRunPath,analysisSessions} from '../src/lib/sessionNavigation.js';
test('guided sessions always resume through their analysis, while manual modes enter their own rooms',()=>{
 assert.equal(sessionRunPath({id:'s',mode:'live',analysis_job_id:'job'}),'/analysis/job');
 assert.equal(sessionRunPath({id:'s',mode:'panel'}),'/sessions/s/panel');
 assert.equal(sessionRunPath({id:'s',mode:'live'}),'/sessions/s/live');
 assert.equal(sessionRunPath({id:'s',mode:'classic'}),'/sessions/s');
});
test('tracker links preserve the session and requested workflow step',()=>{
 assert.equal(trackerPath('s','followup'),'/session-tracker?session=s&tab=followup');assert.equal(trackerPath('s'),'/session-tracker?session=s');
});
test('progress handoff supports partial work, multi-option results and deduplicates reused sessions',()=>{
 const result=analysisSessions({result:{sessions:[{sessionId:'s1',option:{name:'Option A'}}]},activity:{options:[{session_id:'s1',name:'Option A'},{session_id:'s2',name:'Option B'},{name:'Not started'}]}});
 assert.deepEqual(result.map(s=>s.id),['s1','s2']);assert.equal(analysisSessions({}).length,0);
});
