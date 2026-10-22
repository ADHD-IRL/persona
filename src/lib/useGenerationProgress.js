import {useRef,useState} from 'react';
import {callAnthropicStream} from './llm';
const stages=['Prepare','Generate','Check','Save'];
export default function useGenerationProgress(){
 const [progress,setProgress]=useState(null),lastUpdate=useRef(0);
 const stage=(index,detail,extra={})=>setProgress({stages,stage:index,detail,...extra});
 async function complete(prompt,maxTokens,signal){
  lastUpdate.current=0;
  setProgress(p=>({...p,stages,stage:1,detail:p?.total?p.detail:'Waiting for the model to begin responding',characters:0,lastActivityAt:null}));
  return callAnthropicStream({messages:[{role:'user',content:prompt}],maxTokens,signal,
   onStatus:e=>setProgress(p=>({...p,activity:e.stage==='connecting'?'Request sent; waiting for the server':'Stream open; waiting for model text'})),
   onToken:(text,full)=>{if(!text)return;const now=Date.now();if(now-lastUpdate.current<500)return;lastUpdate.current=now;setProgress(p=>({...p,activity:'Receiving model output',characters:full.length,lastActivityAt:now}));},
   onRecovery:e=>setProgress(p=>({...p,activity:e.message||'Retrying model response',characters:0,lastActivityAt:null})),
   onDone:full=>setProgress(p=>({...p,characters:full.length,activity:'Model response received',lastActivityAt:Date.now()})),
  });
 }
 return {progress,prepare:count=>stage(0,'Preparing '+count+' saved records'),complete,
 section:p=>stage(1,p.message,p.total?{completed:p.section-1,total:p.total,unit:'evidence sections reviewed'}:{}),
 checking:()=>stage(2,'Checking source references and result structure'),saving:()=>stage(3,'Saving validated results to this session'),
 correcting:()=>stage(1,'Correcting invalid source selections · one correction attempt'),clear:()=>setProgress(null)};
}
