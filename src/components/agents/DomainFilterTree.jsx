import {useRef,useState} from 'react';
import {ChevronDown,ChevronRight} from 'lucide-react';
import {descendantDomainIds} from '@/lib/domainHierarchy';
export default function DomainFilterTree({domains,agents,value,onChange}){
 const [closed,setClosed]=useState(new Set()),[focused,setFocused]=useState(value||'');const tree=useRef(null);
 const ids=new Set(domains.map(d=>d.id));const children=id=>domains.filter(d=>(ids.has(d.parent_domain_id)?d.parent_domain_id:'')===id).sort((a,b)=>a.name.localeCompare(b.name));
 const visible=[''];const walk=id=>{if(closed.has(id))return;for(const d of children(id)){visible.push(d.id);walk(d.id);}};walk('');
 const focus=id=>{setFocused(id);Array.from(tree.current?.querySelectorAll('[role="treeitem"]')||[]).find(el=>el.dataset.domain===id)?.focus();};
 const toggle=id=>setClosed(v=>{const next=new Set(v);next.has(id)?next.delete(id):next.add(id);return next;});
 function keyDown(e,id){const index=visible.indexOf(id),kids=children(id),parent=domains.find(d=>d.id===id)?.parent_domain_id||'';
  if(e.key==='ArrowDown')focus(visible[Math.min(index+1,visible.length-1)]);
  else if(e.key==='ArrowUp')focus(visible[Math.max(index-1,0)]);
  else if(e.key==='Home')focus('');else if(e.key==='End')focus(visible.at(-1));
  else if(e.key==='ArrowRight'&&kids.length){if(closed.has(id))toggle(id);else focus(kids[0].id);}
  else if(e.key==='ArrowLeft'){if(kids.length&&!closed.has(id))toggle(id);else if(id)focus(parent);}
  else if(e.key==='Enter'||e.key===' ')onChange(id);else return;e.preventDefault();e.stopPropagation();
 }
 function row(d,level=1){const id=d?.id||'',kids=children(id),expanded=!closed.has(id),family=descendantDomainIds(domains,id),count=id?agents.filter(a=>family.has(a.domain_id)).length:agents.length,label=d?.name||'All Domains';return <div key={id} role="treeitem" aria-level={level} aria-selected={value===id} aria-expanded={kids.length?expanded:undefined} aria-label={label+', '+count+' SMEs'+(id&&kids.length?', including child domains':'')} tabIndex={focused===id?0:-1} data-domain={id} data-ui="tree-row" className="sme-domain-item" onFocus={e=>{e.stopPropagation();setFocused(id);}} onKeyDown={e=>keyDown(e,id)} onClick={e=>{e.stopPropagation();setFocused(id);onChange(id);}}><div className="sme-domain-row">{!!kids.length&&<span aria-hidden="true" className="shrink-0 p-0.5" onClick={e=>{e.stopPropagation();toggle(id);focus(id);}}>{expanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</span>}{id&&<span aria-hidden="true" className="w-2.5 h-2.5 shrink-0 rounded-full" style={{backgroundColor:d.color||'var(--wr-text-muted)'}}/>}<span className="min-w-0 flex-1 break-words">{label}</span><span className="text-xs tabular-nums" style={{color:'var(--wr-text-muted)'}}>{count}</span></div>{!!kids.length&&expanded&&<div role="group" className="sme-domain-branches">{kids.map(k=>row(k,level+1))}</div>}</div>;}
 return <div ref={tree} role="tree" aria-label="Filter SMEs by domain" className="flex-1 min-h-0 overflow-y-auto pr-1">{row(null)}</div>;
}
