import test from 'node:test';
import assert from 'node:assert/strict';
import {replayDebatePulse,makePoll,parseStrawPoll,partialPanelCaption} from '../src/lib/panelPulse.js';
const agents=[{id:'a',name:'Alpha',discipline:'Security'},{id:'b',name:'Beta',discipline:'Operations'}];
const turn=(id,text='I agree. Same here.')=>({id,role:'agent',agent_id:id.endsWith('1')?'a':'b',author_name:'Alpha',content:text});
const pollRow=metadata=>({role:'system',content:'Poll',metadata});
const answers={a:{name:'Alpha',stance:'for',confidence:70,rationale:'Conditional'},b:{name:'Beta',stance:'against',confidence:60,rationale:'Capacity unknown'}};
test('pulse replays exactly once per durable SME contribution',()=>{
 const messages=[{role:'user',content:'Initial question'},turn('t1','According to section 4, capacity is 120 MW; Beta, your estimate overlooks the reserve.'),turn('t2')];
 const a=replayDebatePulse(messages,agents),b=replayDebatePulse(structuredClone(messages),agents);assert.deepEqual(a,b);assert.equal(a.history.length,2);assert.equal(a.history[0].movement,null);assert.equal(a.history[0].disagreement,null);assert.equal(a.events.filter(e=>e.type==='human').length,1);
});
test('first straw poll does not invent movement; repeat polls require matching proposition and roster',()=>{
 const first=makePoll(answers,null,'Approve plan');assert.equal(first.hasBaseline,false);assert.equal(makePoll(answers,first,'Different proposal').hasBaseline,false);assert.equal(makePoll({a:answers.a},first,'Approve plan').hasBaseline,false);
 const second=makePoll({...answers,b:{...answers.b,confidence:80}},first,'Approve plan');assert.equal(second.hasBaseline,true);assert.equal(second.positions.b.confDelta,20);
 const p=replayDebatePulse([pollRow(first),turn('t1'),pollRow(second),turn('t2')],agents);assert.equal(p.history[0].movement,null);assert.ok(p.history[1].movement>0);assert.equal(p.events.filter(e=>e.type==='poll').length,2);
});
test('poll data becomes stale after four turns and phase boundaries reset dry streak',()=>{
 const first=makePoll(answers,null,'Approve'),second=makePoll(answers,first,'Approve');const msgs=[pollRow(second),...Array.from({length:5},(_,i)=>turn('t'+i))];const p=replayDebatePulse(msgs,agents);assert.equal(p.history.at(-1).movement,null);assert.equal(p.history.at(-1).disagreement,null);
 const reset=replayDebatePulse([...msgs,{role:'system',content:'Next phase',metadata:{kind:'phase_change'}},turn('t6')],agents);assert.ok(reset.history.at(-1).dry<=1);
});
test('invalid poll responses are rejected; streaming caption exposes only response text',()=>{
 for(const raw of ['{}','{"stance":"for","confidence":101,"rationale":"x"}','{"stance":"yes","confidence":50,"rationale":"x"}'])assert.throws(()=>parseStrawPoll(raw));
 assert.equal(parseStrawPoll('{"stance":"mixed","confidence":50,"rationale":"Need evidence"}').stance,'mixed');
 assert.equal(partialPanelCaption('{"response":"Hello\\nworld","positions":['),'Hello\nworld');assert.equal(partialPanelCaption('{"positions":[]'),'');
});
test('repetition advises pause without modifying phase state or declaring consensus without polls',()=>{
 const p=replayDebatePulse(Array.from({length:6},(_,i)=>turn('t'+i)),agents);assert.equal(p.verdict.kind,'exhaustion');assert.equal(p.events.some(e=>e.kind==='consensus'),false);assert.equal(p.latestPoll,null);
});

test('streaming caption retains visible words across incomplete JSON escapes',()=>{
 assert.equal(partialPanelCaption('{"response":"Hello\\u20'),'Hello');
 assert.equal(partialPanelCaption('{"response":"Hello\\u2014world'),'Hello—world');
 assert.equal(partialPanelCaption('{"response":"Visible\\'),'Visible');
 assert.equal(partialPanelCaption('{"response":"Line one\\nLine two'),'Line one\nLine two');
});
