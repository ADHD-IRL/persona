import test from 'node:test';
import assert from 'node:assert/strict';
import { createLLMProvider, providerConfig } from '../server/llmProvider.js';
import { readAnthropicStream } from '../src/lib/anthropicStream.js';
import { splitEvidence, sectionedCompletion, setSectionReviewSink } from '../src/lib/sectionedCompletion.js';
import { formatKnowledgeContext } from '../src/lib/knowledge.js';
const config = providerConfig({ LLM_PROVIDER: 'mitre_aip', MITRE_AIP_API_KEY: 'test', MITRE_AIP_MODEL: 'test-model' });
const input = { messages: [{role:'user',content:'Keep all facts and minority views'}], system:'Preserve evidence', max_tokens:4096 };
const completion = (reason, content='complete') => Response.json({choices:[{message:{content},finish_reason:reason}]});
const event = value => 'data: '+JSON.stringify(value)+'\n\n';
const wire = (reason, text) => event({ choices:[{delta:{content:text},finish_reason:null}] }) + event({choices:[{delta:{},finish_reason:reason}]})+'data: [DONE]\n\n';
test('output recovery retains exact input and grows only the output budget', async()=>{
 const calls=[],progress=[];
 const provider=createLLMProvider(config,async(_url,options)=>{calls.push(JSON.parse(options.body));return completion(calls.length===1?'length':'stop');});
 const result=await provider.complete(input,undefined,p=>progress.push(p));
 assert.equal(result.content[0].text,'complete'); assert.deepEqual(calls.map(c=>c.max_tokens),[4096,8192]);
 assert.deepEqual(calls[0].messages,calls[1].messages); assert.equal(progress[0].attempt,1);assert.equal(progress.at(-1),null);
});
test('recovery is bounded and exhausted partial responses never succeed',async()=>{
 let count=0;const provider=createLLMProvider(config,async()=>{count++;return completion('length','partial');});
 await assert.rejects(provider.complete({...input,max_tokens:1000}),/bounded recovery/);assert.equal(count,3);
});
test('authentication failures are not retried',async()=>{
 let count=0;const provider=createLLMProvider(config,async()=>{count++;return Response.json({error:{message:'Unauthorized'}},{status:401});});
 await assert.rejects(provider.complete(input),e=>e.status===401);assert.equal(count,1);
});
test('cancellation between attempts prevents another provider request',async()=>{
 let count=0;const controller=new AbortController();const provider=createLLMProvider(config,async()=>{count++;return completion('length');});
 await assert.rejects(provider.complete(input,controller.signal,()=>controller.abort()));assert.equal(count,1);
});
test('stream retry replaces partial text and calls completion only once',async()=>{
 let count=0;const provider=createLLMProvider(config,async()=>new Response(wire(++count===1?'length':'stop',count===1?'discard me':'full answer')));
 let body='';for await(const e of provider.stream(input))body+=event(e);
 const seen=[],done=[],recovery=[];
 const result=await readAnthropicStream(new Response(body).body,{onToken:(_t,full)=>seen.push(full),onDone:t=>done.push(t),onRecovery:e=>recovery.push(e)});
 assert.equal(result,'full answer');assert.deepEqual(done,['full answer']);assert.ok(seen.includes(''));assert.equal(recovery.length,1);
});
test('splitting preserves every source character and source identifier',()=>{
 const text='Beginning '+ 'x'.repeat(25000)+' END_CRITICAL_CAVEAT';const sections=splitEvidence([{id:'source',text}]);
 assert.equal(sections.map(s=>s.text).join(''),text);assert.ok(sections.every(s=>s.source_id==='source'));
 assert.ok(formatKnowledgeContext([{content:text}]).includes('END_CRITICAL_CAVEAT'));
});
function sectionalFixture({badQuote=false,missingCoverage=false}={}){
 let count=0;const reviewed=[];
 const complete=async prompt=>{
  count++;
  if(count===1)throw new Error('maximum context length exceeded');
  if(prompt.includes('SOURCE SECTION:')){
   const section=JSON.parse(prompt.split('SOURCE SECTION:\n')[1]);reviewed.push(section.id);
   return JSON.stringify({section_id:section.id,notes:'Preserve the uncertainty and minority position.',quotes:[badQuote?'invented quote':section.text.slice(-20)]});
  }
  for(const id of reviewed)assert.ok(prompt.includes(id));
  return JSON.stringify({covered_sections:missingCoverage?reviewed.slice(1):reviewed,answer:'Qualified conclusion'});
 };
 return {complete,reviewed};
}
test('context recovery reviews every section and exposes its source-linked audit',async()=>{
 const fixture=sectionalFixture();const audits=[];setSectionReviewSink(e=>audits.push(e));
 try{
  const result=await sectionedCompletion({records:[{id:'scenario',text:'a'.repeat(25000)+'uncertainty'},{id:'SME',text:'Minority view: unknown'}],render:r=>JSON.stringify(r),complete:fixture.complete});
  assert.equal(result,'Qualified conclusion');assert.equal(fixture.reviewed.length,4);assert.equal(audits.at(-1).review.sections.length,4);
 }finally{setSectionReviewSink(null);}
});
for(const mode of ['badQuote','missingCoverage'])test('section validation rejects '+mode,async()=>{
 await assert.rejects(sectionedCompletion({records:[{id:'source',text:'Actual source evidence'}],render:r=>JSON.stringify(r),complete:sectionalFixture({[mode]:true}).complete}),/validation|every evidence section/);
});
test('output failures do not trigger lossy context reduction',async()=>{
 let calls=0;await assert.rejects(sectionedCompletion({records:[{id:'source',text:'Original'}],render:r=>JSON.stringify(r),complete:async()=>{calls++;throw new Error('output token limit');}}),/output token limit/);assert.equal(calls,1);
});

for (const failure of ['quote','id','json','notes']) test('section correction recovers '+failure+' without changing source evidence',async()=>{
 const records=[{id:'source',text:'Exact evidence with a minority view.'},{id:'second',text:'Keep this uncertainty.'}],seen=[],progress=[];let initial=true,retries=0;
 const result=await sectionedCompletion({records,render:JSON.stringify,onProgress:p=>progress.push(p),complete:async prompt=>{
  if(initial){initial=false;throw new Error('maximum context length exceeded');}
  if(prompt.includes('SOURCE SECTION:')){
   const section=JSON.parse(prompt.split('SOURCE SECTION:\n')[1]);seen.push(section);
   if(section.id==='section-2-1'&&retries++===0){
    if(failure==='json')return 'invalid JSON';
    return JSON.stringify({section_id:failure==='id'?'second':section.id,notes:failure==='notes'?'':'Retain uncertainty',quotes:[failure==='quote'?'Invented evidence':section.text]});
   }
   return JSON.stringify({section_id:section.id,notes:'Retain uncertainty',quotes:[section.text]});
  }
  return JSON.stringify({covered_sections:['section-1-1','section-2-1'],answer:'Qualified decision'});
 }});
 assert.equal(result,'Qualified decision');assert.deepEqual(seen.map(s=>s.id),['section-1-1','section-2-1','section-2-1']);assert.deepEqual(seen[1],seen[2]);assert.ok(progress.some(p=>p.message.includes('retry 1 of 2')));
});
test('persistent fabricated quotes stop after three section attempts with source diagnostics',async()=>{
 let calls=0,consolidated=false;
 await assert.rejects(sectionedCompletion({records:[{id:'source',text:'Actual evidence'}],render:JSON.stringify,complete:async prompt=>{
  if(++calls===1)throw new Error('maximum context length exceeded');
  if(!prompt.includes('SOURCE SECTION:'))consolidated=true;
  return JSON.stringify({section_id:'section-1-1',notes:'Review',quotes:['Fabricated evidence']});
 }}),/section 1 of 1.*source source.*after 3 attempts/);
 assert.equal(calls,4);assert.equal(consolidated,false);
});
test('section cancellation is propagated without correction attempts',async()=>{
 let calls=0;
 await assert.rejects(sectionedCompletion({records:[{id:'source',text:'Actual evidence'}],render:JSON.stringify,complete:async()=>{
  if(++calls===1)throw new Error('maximum context length exceeded');
  throw new DOMException('Stopped','AbortError');
 }}),e=>e.name==='AbortError');assert.equal(calls,2);
});
