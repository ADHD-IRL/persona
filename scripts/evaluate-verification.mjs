import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verdicts} from '../src/lib/verification.js';
export function evaluateExamples(examples,predictions=null) {
 if(!examples.length)throw new Error('No reviewed examples supplied.');
 const ids=new Set();for(const e of examples){if(!e.id||ids.has(e.id)||!verdicts.includes(e.label))throw new Error('Examples need unique IDs and valid analyst labels.');ids.add(e.id);}
 let predicted;
 if(predictions){predicted=new Map();for(const p of predictions){if(!ids.has(p.id)||predicted.has(p.id)||!verdicts.includes(p.label))throw new Error('Predictions need unique matching IDs and valid labels.');predicted.set(p.id,p.label);}}
 else predicted=new Map(examples.filter(e=>verdicts.includes(e.model_prediction)).map(e=>[e.id,e.model_prediction]));
 const confusion={},per_label={};let correct=0;
 for(const e of examples){const p=predicted.get(e.id)||'missing';(confusion[e.label]??={})[p]=((confusion[e.label]||{})[p]||0)+1;if(e.label===p)correct++;}
 const labels=verdicts.filter(l=>examples.some(e=>e.label===l)||[...predicted.values()].includes(l));
 for(const l of labels){const tp=examples.filter(e=>e.label===l&&predicted.get(e.id)===l).length,fp=examples.filter(e=>e.label!==l&&predicted.get(e.id)===l).length,fn=examples.filter(e=>e.label===l&&predicted.get(e.id)!==l).length;per_label[l]={tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0};}
 const support=per_label.supports;
 return {examples:examples.length,prediction_coverage:predicted.size/examples.length,accuracy:correct/examples.length,macro_f1:labels.reduce((n,l)=>n+per_label[l].f1,0)/labels.length,supported_claim_precision:support?.precision??null,false_support_fraction:support&&support.tp+support.fp?support.fp/(support.tp+support.fp):null,confusion,per_label,note:'Label agreement on these examples only. This does not measure retrieval recall, citation entailment, real-world truth probability, or generalization. Missing predictions count against accuracy and recall.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [gold,predictions]=process.argv.slice(2);if(!gold)throw new Error('Usage: node scripts/evaluate-verification.mjs reviewed.jsonl [predictions.jsonl]');const read=p=>fs.readFileSync(p,'utf8').split(/\r?\n/).filter(s=>s.trim()).map(JSON.parse);console.log(JSON.stringify(evaluateExamples(read(gold),predictions?read(predictions):null),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
