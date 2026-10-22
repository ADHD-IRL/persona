import {useEffect,useState} from 'react';
export default function ProcessingStatus({label,status='',startedAt,delay=0,compact=false,progress=null}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[startedAt]);
 const elapsed=Math.max(0,Math.floor((now-startedAt)/1000));if(now-startedAt<delay)return null;
 const measured=progress?.total>0,percent=measured?Math.round(100*Math.min(progress.completed,progress.total)/progress.total):null;
 return <div aria-label={label+' progress'} className={compact?'min-w-0 flex-1 space-y-1':'processing-status rounded-xl border border-amber-500/30 bg-[var(--wr-bg-secondary)] px-4 py-3 space-y-2 text-[var(--wr-text-primary)]'}>
 <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm"><span role="status">{label}{progress?.detail?' · '+progress.detail:status?' · '+status:' · Processing…'}</span><span aria-hidden="true" className="text-xs tabular-nums text-slate-400">{elapsed<60?elapsed+'s':Math.floor(elapsed/60)+'m '+elapsed%60+'s'}</span></div>
 {progress?.stages&&<ol aria-label="Processing stages" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{progress.stages.map((step,i)=><li key={step} aria-current={i===progress.stage?'step':undefined} className={i===progress.stage?'font-semibold text-amber-300':i<progress.stage?'text-slate-300':'text-slate-500'}>{i<progress.stage?'✓':i+1}. {step}{i===progress.stage?' — current':''}</li>)}</ol>}
 <div role="progressbar" aria-label={label} aria-valuemin={measured?0:undefined} aria-valuemax={measured?progress.total:undefined} aria-valuenow={measured?progress.completed:undefined} aria-valuetext={progress?.detail||status||'Processing; completion time is not yet known'} className="h-1 overflow-hidden rounded-full bg-slate-700"><div className={measured?'h-full rounded-full bg-amber-400':'processing-sweep h-full w-1/3 rounded-full bg-amber-400'} style={measured?{width:percent+'%'}:undefined}/></div>
 {progress&&<p className="text-xs text-slate-400">{measured?progress.completed+' of '+progress.total+' '+progress.unit+'. ':''}{progress.activity||''}{progress.characters?' · '+progress.characters.toLocaleString()+' characters received':''}{progress.lastActivityAt?' · Last output '+Math.max(0,Math.floor((now-progress.lastActivityAt)/1000))+'s ago':''}</p>}
 {elapsed>=30&&progress?.stage===1&&<p className="text-xs text-slate-400">{progress.lastActivityAt&&now-progress.lastActivityAt<30000?'Response is progressing.':'Waiting for further model output. A pause alone does not confirm an error.'} Generation time is not predictable.</p>}
 {elapsed>=30&&!status&&<p className="text-xs text-slate-400">Still processing. Elapsed time is not an estimated completion time.</p>}
 </div>;
}
