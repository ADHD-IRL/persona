import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisProgress,elapsedLabel } from '../src/lib/analysisProgress.js';
const agents=[{id:'a',round1_done:true,round2_done:false},{id:'b',round1_done:false,round2_done:false}];
const job={status:'running',snapshot:{mode:'risk',agents},progress:{stage:'round1',agentIndex:2},activity:{options:[{id:'scenario',agents,synthesis_done:false}]},checkpoints:{}};
test('progress counts saved responses, not the currently running SME index',()=>{
 const p=analysisProgress(job);assert.equal(p.responses,1);assert.equal(p.total,7);assert.equal(p.completed,1);assert.equal(p.percent,14);
 assert.match(p.title,/Round 1/);
});
test('comparison counts all options and reused evidence without finishing early',()=>{
 const done=agents.map(a=>({...a,round1_done:true,round2_done:true}));
 const compare={...job,snapshot:{...job.snapshot,mode:'compare',options:[{id:'one'},{id:'two'}]},activity:{options:[{agents:done,synthesis_done:true,reused:true},{agents:done,synthesis_done:true}]},progress:{stage:'comparison'}};
 assert.equal(analysisProgress(compare).completed,10);assert.equal(analysisProgress(compare).total,13);
 assert.equal(analysisProgress({...compare,progress:{stage:'decision_brief'}}).completed,11);
 assert.equal(analysisProgress({...compare,progress:{stage:'saving_findings'},checkpoints:{reviewBrief:{}}}).percent,92);
 assert.equal(analysisProgress({...compare,status:'complete'}).percent,100);
});
test('queued, failed, stopped and cancellation states override old running-stage labels',()=>{
 assert.match(analysisProgress({...job,status:'queued'}).title,/Queued/);
 assert.match(analysisProgress({...job,status:'failed'}).title,/attention/);
 assert.match(analysisProgress({...job,status:'cancelled'}).title,/stopped/);
 assert.match(analysisProgress({...job,cancel_requested:true}).title,/Stopping/);
 assert.equal(analysisProgress({...job,status:'failed'}).responses,1);
});
test('elapsed labels never present negative time or invented estimates',()=>{
 assert.equal(elapsedLabel(-500),'0s');assert.equal(elapsedLabel(61000),'1m 1s');assert.equal(elapsedLabel(3660000),'1h 1m');
});
