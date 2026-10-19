import { canonical } from './analysisWorkflow.js';
import { tokenize } from './knowledge.js';
export const VERIFICATION_VERSION = 'evidence-review-1';
export const ratings = ['Strong support','Partial support','Inference','Contested','Unverified','Contradicted'];
export const verdicts = ['supports','partial','contradicts','mixed','insufficient','non_factual'];
export const verificationKey = (session,kind,id) => 'verification_'+session+'_'+kind+'_'+id;
export const verificationSourcesKey = session => 'verification_sources_'+session;
export function findingText(finding) { return [finding.name, finding.description, finding.steps?.length ? JSON.stringify(finding.steps) : ''].filter(Boolean).join('\n'); }
export function sourceAge(source, now = Date.now()) {
 const date = Date.parse(source.published_at || '');
 return Number.isFinite(date) && date <= now ? Math.floor((now-date)/86400000) : null;
}
export function sourcePassages(sources, query, limit = 24) {
 const terms = new Set(tokenize(query)), candidates = [];
 for(const source of sources) {
  const text = source.text || '';
  for(let offset=0;offset<text.length;offset+=1800) {
   const passage=text.slice(offset,offset+2200), words=new Set(tokenize(source.title+' '+passage));
   const score=[...terms].filter(w=>words.has(w)).length;
   if(score) candidates.push({...source,text:passage,offset,passage_id:source.id+'@'+offset,score});
  }
 }
 candidates.sort((a,b)=>b.score-a.score||a.passage_id.localeCompare(b.passage_id));
 // Exact duplicate passages do not count as independent corroboration.
 const seen=new Set(), selected=[];
 for(const c of candidates) { const key=c.text.trim();if(seen.has(key))continue;seen.add(key);selected.push(c);if(selected.length===limit)break; }
 return {selected, candidate_count:candidates.length, source_count:sources.length, limited:candidates.length>selected.length};
}
export function verificationSignature(finding,sources,model) {
 return canonical({version:VERIFICATION_VERSION,model,finding:findingText(finding),sources:[...sources].sort((a,b)=>a.id.localeCompare(b.id))});
}
export function evidenceRating(claims) {
 if(claims.some(c=>c.verdict==='mixed'))return 'Contested';
 const factual=claims.filter(c=>c.type==='fact');
 if(factual.some(c=>c.verdict==='contradicts'))return factual.some(c=>c.verdict==='supports')?'Contested':'Contradicted';
 if(claims.every(c=>c.rating==='Strong support'))return 'Strong support';
 if(claims.some(c=>['supports','partial'].includes(c.verdict)))return 'Partial support';
 if(claims.some(c=>c.type!=='fact'))return 'Inference';
 return 'Unverified';
}
export function validateVerification(raw, finding, passages, now=Date.now()) {
 if(!raw || !Array.isArray(raw.claims) || !raw.claims.length || raw.claims.length>12 || raw.coverage_complete!==true)throw new Error('The verifier did not produce a complete claim review.');
 const original=findingText(finding), sources=new Map(passages.map(p=>[p.passage_id,p]));
 const claims=raw.claims.map((c,i)=>{
  if(!['fact','prediction','assumption','recommendation','inference'].includes(c.type)||typeof c.text!=='string'||!c.text.trim()||typeof c.finding_quote!=='string'||!c.finding_quote.trim()||!original.includes(c.finding_quote)||!Array.isArray(c.evidence)||typeof c.rationale!=='string'||!c.rationale.trim()||typeof c.next_check!=='string'||!c.next_check.trim())throw new Error('Invalid claim, finding quotation, or verification action.');
  const evidence=c.evidence.map(e=>{
   const s=sources.get(e.passage_id);
   if(!s||!['supports','partial','contradicts','unrelated'].includes(e.relationship)||typeof e.quote!=='string'||e.quote.trim().length<8||!s.text.includes(e.quote)||typeof e.explanation!=='string'||!e.explanation.trim())throw new Error('The verifier returned an unverified quotation or source reference.');
   return {...e,source_id:s.id,source_title:s.title,origin:s.origin||'unknown',quality:s.quality||'unknown',kind:s.kind,age_days:sourceAge(s,now),url:s.url||'',source_version:s.version};
  });
  const valid=evidence.filter(e=>!['model','scenario'].includes(e.kind));
  const support=valid.filter(e=>e.relationship==='supports'),against=valid.filter(e=>e.relationship==='contradicts');
  const verdict=c.type!=='fact'?'non_factual':support.length&&against.length?'mixed':against.length?'contradicts':support.length?'supports':valid.some(e=>e.relationship==='partial')?'partial':'insufficient';
  // No model confidence enters this rule. Quality/origin/date are source metadata,
  // explicitly declared by an analyst, not established by citation matching.
  const directPrimary=support.some(e=>e.quality==='primary'&&e.origin!=='unknown'&&e.age_days!==null&&e.age_days<=365);
  const rating=verdict==='non_factual'?'Inference':verdict==='mixed'?'Contested':verdict==='contradicts'?'Contradicted':verdict==='supports'?(directPrimary?'Strong support':'Partial support'):verdict==='partial'?'Partial support':'Unverified';
  return {id:'claim-'+(i+1),text:c.text,type:c.type,finding_quote:c.finding_quote,rationale:c.rationale,next_check:c.next_check,evidence,verdict,rating,dimensions:{support:verdict,source_quality:support.length?[...new Set(support.map(e=>e.quality))].join(', '):'No direct supporting evidence',corroboration_origins:[...new Set(support.map(e=>e.origin).filter(o=>o!=='unknown'))],freshness:'Publication age shown per source; 365-day screening rule is not a guarantee of applicability'}};
 });
 return {claims,rating:evidenceRating(claims),method:'Model-assisted semantic assessment; quotations checked exactly; source metadata is analyst-declared. No truth probability.',coverage:'Claim extraction coverage is model-assessed, not independently established.'};
}
export function validateAnalystReview(input,run) {
 if(!Array.isArray(input.judgments)||input.judgments.length!==run.claims.length)throw new Error('Review every extracted claim before saving an example.');
 const seen=new Set(), sources=new Map(run.sources.map(s=>[s.passage_id,s]));
 return input.judgments.map(j=>{
  if(seen.has(j.claim_id)||!run.claims.some(c=>c.id===j.claim_id)||!verdicts.includes(j.label)||typeof j.rationale!=='string'||!j.rationale.trim())throw new Error('Each claim needs a distinct label and analyst rationale.');seen.add(j.claim_id);
  const evidence=(j.evidence||[]).map(e=>{
   const s=sources.get(e.passage_id);
   if(!s||typeof e.quote!=='string'||e.quote.trim().length<8||!s.text.includes(e.quote))throw new Error('Analyst evidence must quote a saved source passage exactly (at least 8 characters).');return {passage_id:e.passage_id,quote:e.quote};
  });
  if(['supports','partial','contradicts','mixed'].includes(j.label)&&!evidence.length)throw new Error('This label requires at least one supporting or opposing evidence quotation.');
  if(j.label==='mixed'&&evidence.length<2)throw new Error('A mixed label requires evidence for both sides.');
  return {claim_id:j.claim_id,label:j.label,rationale:j.rationale.trim(),evidence};
 });
}
export function exportReviewExamples(run,review) {
 return review.judgments.map(j=>({schema:'agentdebate.claim-review.v1',id:review.id+':'+j.claim_id,group_id:run.scenario_id||run.session_id,session_id:run.session_id,finding_id:run.finding_id,finding_text:run.finding,claim:run.claims.find(c=>c.id===j.claim_id),label:j.label,rationale:j.rationale,evidence:j.evidence,sources:run.sources,reviewer_id:review.reviewer_id,reviewed_at:review.created_at,review_status:'single_analyst_review',verification_version:run.version,model:run.model,model_prediction:run.claims.find(c=>c.id===j.claim_id)?.verdict,as_of:run.created_at}));
}
