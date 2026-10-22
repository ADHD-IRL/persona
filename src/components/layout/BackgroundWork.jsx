import ProcessingStatus from '@/components/ui/ProcessingStatus';
import {subscribeRequests,getRequests} from '@/lib/requestActivity';
import {createContext,useContext,useId,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {Link,useLocation,useOutlet,UNSAFE_LocationContext,UNSAFE_NavigationContext} from 'react-router-dom';
import WrButton from '@/components/ui/WrButton';

const WorkContext=createContext(null);
export function useBackgroundWork(active,label,{status='',error='',stop,effortKey='',progress=null}={}) {
 const host=useContext(WorkContext),id=useId(),stopRef=useRef(stop);stopRef.current=stop;
 const stopAction=useMemo(()=>()=>stopRef.current?.(),[]),cancel=stop?stopAction:undefined;
 useLayoutEffect(()=>{host?.update(id,{active:!!active,label,status,error,effortKey,progress,stop:cancel});},[host,id,active,label,status,error,effortKey,progress,cancel]);
 useLayoutEffect(()=>()=>host?.remove(id),[host,id]);
}
function routeKey(location){const p=new URLSearchParams(location.search);return location.pathname+'?'+['session','id'].map(k=>k+'='+encodeURIComponent(p.get(k)||'')).join('&');}
function WorkPage({entry,visible,update,remove,onDeferredNavigation,navigation}) {
 const context=useMemo(()=>({update:(id,value)=>update(entry.key,id,value),remove:id=>remove(entry.key,id)}),[entry.key,update,remove]);
 const visibleRef=useRef(visible);visibleRef.current=visible;
 const scopedNavigation=useMemo(()=>({...navigation,navigator:{...navigation.navigator,
  push:(to,state,options)=>visibleRef.current?navigation.navigator.push(to,state,options):onDeferredNavigation(entry.key,to),
  replace:(to,state,options)=>visibleRef.current?navigation.navigator.replace(to,state,options):onDeferredNavigation(entry.key,to),
  go:n=>{if(visibleRef.current)navigation.navigator.go(n);},
 }}),[navigation,visible,entry.key,onDeferredNavigation]);
 return <div hidden={!visible} aria-hidden={!visible||undefined}><WorkContext.Provider value={context}><UNSAFE_NavigationContext.Provider value={scopedNavigation}><UNSAFE_LocationContext.Provider value={{location:entry.location,navigationType:'POP'}}>{entry.outlet}</UNSAFE_LocationContext.Provider></UNSAFE_NavigationContext.Provider></WorkContext.Provider></div>;
}
export default function BackgroundWork(){
 const location=useLocation(),outlet=useOutlet(),navigation=useContext(UNSAFE_NavigationContext),key=routeKey(location);
 const [pages,setPages]=useState(()=>[{key,location,outlet}]),[activities,setActivities]=useState({});
 const current=pages.find(p=>p.key===key);
 if(!current||current.location.key!==location.key){
  setPages(list=>[...list.filter(p=>p.key!==key&&(Object.values(activities[p.key]||{}).some(a=>a.active)||p.retained)),{key,location,outlet}].map(p=>p.key===key?p:{...p,retained:true}));
 }
 const callbacks=useMemo(()=>({
  update:(page,id,value)=>setActivities(all=>{const old=all[page]?.[id];if(old&&Object.keys(value).every(k=>old[k]===value[k]))return all;return {...all,[page]:{...all[page],[id]:{...value,startedAt:value.active?(old?.active&&old.effortKey===value.effortKey?old.startedAt:Date.now()):old?.startedAt}}};}),
  remove:(page,id)=>setActivities(all=>{if(!all[page]?.[id])return all;const next={...all[page]};delete next[id];const result={...all};if(Object.keys(next).length)result[page]=next;else delete result[page];return result;}),
  defer:(page,to)=>setPages(list=>list.map(p=>p.key===page?{...p,resume:typeof to==='string'?to:to.pathname+(to.search||'')+(to.hash||'')}:p)),
 }),[]);
 const requests=useSyncExternalStore(subscribeRequests,getRequests,getRequests);
 const foreground=Object.values(activities[key]||{}).filter(a=>a.active);
 const background=pages.filter(p=>p.key!==key&&p.retained);
 const running=Object.values(activities).some(rows=>Object.values(rows).some(a=>a.active));
 useLayoutEffect(()=>{if(!running)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[running]);
 return <>{foreground.length>0&&<div aria-label="Current processing" className="sticky top-0 z-30 px-4 pt-3 space-y-2 bg-[var(--wr-bg-primary)]">{foreground.map((task,i)=><ProcessingStatus key={i} label={task.label} status={task.status} progress={task.progress} startedAt={task.startedAt}/>)}</div>}{!running&&requests.length>0&&<div className="px-4 pt-2"><ProcessingStatus label={requests[0].label} status={requests.length>1?requests.length+' requests in progress':''} startedAt={requests[0].startedAt} delay={500}/></div>}{background.length>0&&<aside aria-label="Background work" className="m-4 rounded-xl border border-amber-500/30 bg-[var(--wr-bg-secondary)] p-3 space-y-2 text-[var(--wr-text-primary)]"><h2 className="text-sm font-semibold">Background work</h2>{background.map(p=>{const tasks=Object.values(activities[p.key]||{}),active=tasks.filter(t=>t.active),failed=tasks.find(t=>t.error),task=active[0]||failed||tasks[0];return <div key={p.key} className="flex flex-wrap items-center gap-3 text-sm">{active.length?<ProcessingStatus compact label={task.label} status={task.status} progress={task.progress} startedAt={task.startedAt}/>:<span role="status">{task?.label||'Workflow'} · {failed?'Needs attention':'Finished — open to review'}</span>}<WrButton asChild variant="secondary" size="sm"><Link to={p.resume||p.location.pathname+p.location.search}>Return to work</Link></WrButton>{active.find(t=>t.stop)&&<WrButton variant="secondary" size="sm" onClick={()=>active.find(t=>t.stop).stop()}>Stop</WrButton>}{!active.length&&<WrButton variant="ghost" size="sm" onClick={()=>setPages(list=>list.filter(e=>e.key!==p.key))}>Dismiss</WrButton>}</div>;})}<p className="text-xs text-slate-400">You can navigate within AgentDebate. Keep this tab open until browser-based work finishes.</p></aside>}{pages.map(entry=><WorkPage key={entry.key} entry={entry} visible={entry.key===key} update={callbacks.update} remove={callbacks.remove} onDeferredNavigation={callbacks.defer} navigation={navigation}/>)}</>;
}
