import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePanelTurn,validatedPanelTurn} from '../src/lib/panelWorkflow.js';
test('trailing commas are repaired without changing quoted text',()=>{
 const result=parsePanelTurn('{"response":"Keep comma, } and quote \\"exact\\"","positions":[{"id":"a","claim":"Evidence","credence":0.5,},],}');
 assert.equal(result.response,'Keep comma, } and quote "exact"');assert.equal(result.positions[0].credence,0.5);
});
test('invalid output retries the same turn once then returns validated response',async()=>{
 const prompts=[],progress=[];const result=await validatedPanelTurn({generate:async correction=>{prompts.push(correction);return prompts.length===1?'{bad JSON}':'{"response":"Corrected contribution","positions":[]}';},onRetry:()=>progress.push('retry')});
 assert.equal(result.response,'Corrected contribution');assert.equal(prompts.length,2);assert.match(prompts[1],/double-quoted/);assert.equal(progress.length,1);
});
test('persistent invalid output and invalid positions remain rejected',async()=>{
 for(const text of ['null','{"response":"x","positions":[null]}','{"response":"x","positions":[{"id":"a","claim":"x","credence":2}]}']){let calls=0;await assert.rejects(validatedPanelTurn({generate:async()=>{calls++;return text;}}),/No new turn was saved/);assert.equal(calls,2);}
});
test('transport failures and cancellation are not treated as JSON errors',async()=>{
 let calls=0;await assert.rejects(validatedPanelTurn({generate:async()=>{calls++;throw new Error('Network unavailable');}}),/Network unavailable/);assert.equal(calls,1);
 const controller=new AbortController();await assert.rejects(validatedPanelTurn({signal:controller.signal,generate:async()=>'{bad}',onRetry:()=>controller.abort()}),e=>e.name==='AbortError');
});
