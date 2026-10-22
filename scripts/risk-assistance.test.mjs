import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionReasons,riskAdvicePrompt,validateRiskAdvice} from '../src/lib/riskAssistance.js';
test('attention queue includes missing evidence, overdue work and changed reviews but excludes archives',()=>{
 const r={review_status:'reviewed',evidence:[{text:'Evidence'}]};
 assert.deepEqual(attentionReasons(r,null,[{status:'verified'}]),[]);
 assert.deepEqual(attentionReasons(r,null,[{status:'accepted',due_date:'2026-01-01'}],true,'2026-02-01'),['Reassessment needed','Overdue response']);
 assert.ok(attentionReasons({...r,evidence:[]},null,[]).includes('No recorded evidence'));
 assert.deepEqual(attentionReasons({...r,review_status:'archived'},null,[],true),[]);
});
test('AI advice must contain actionable criteria, tradeoffs and uncertainty without invalid purposes',()=>{
 const s={title:'Test backup',action_type:'verify',rationale:'Evidence gap',tradeoffs:'Requires downtime',uncertainties:'Unknown load',completion_criteria:'Attach measured results'};
 assert.equal(validateRiskAdvice({summary:'Test before choosing',suggestions:[s]}).suggestions[0].action_type,'verify');
 for(const bad of [{...s,completion_criteria:''},{...s,action_type:'approved'},{...s,uncertainties:null}])assert.throws(()=>validateRiskAdvice({summary:'Advice',suggestions:[bad]}));
 assert.throws(()=>validateRiskAdvice({summary:'Advice',suggestions:[]}));
});
test('advice context contains selected finding evidence and current linked actions',()=>{
 const value=JSON.parse(riskAdvicePrompt({record:{name:'Power',evidence:[{text:'Test failed'}]},scenario:{name:'Recovery',context_document:'Known facts',secret:'exclude'},actions:[{title:'Existing check',status:'proposed'}],mode:'decision',goal:'Choose within a week'}));
 assert.equal(value.analyst_goal,'Choose within a week');assert.equal(value.context.finding.evidence[0].text,'Test failed');assert.equal(value.context.existing_actions[0].title,'Existing check');assert.equal('secret' in value.context.scenario,false);
});
