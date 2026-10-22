import {useState} from 'react';
import {WorkflowCheck,WorkflowField} from '@/components/ui/WorkflowControls';
export default function SourcePicker({documents,selected,onChange,single=false}){
 const [search,setSearch]=useState('');
 const visible=documents.filter(d=>(d.title+' '+(d.source||'')).toLowerCase().includes(search.toLowerCase()));
 return <section className="space-y-3"><WorkflowField label="Find a source in Knowledge Base" type="search" value={search} onChange={e=>setSearch(e.target.value)}/><p className="text-xs text-slate-400">Reuse saved documents. Selection makes a document available; matching passages, rather than every document, enter the analysis.</p><div className="max-h-64 overflow-auto space-y-2">{visible.map(d=><WorkflowCheck key={d.id} checked={selected.includes(d.id)} onChange={e=>onChange(single?(e.target.checked?[d.id]:[]):e.target.checked?[...selected,d.id]:selected.filter(id=>id!==d.id))}>{d.title}<span className="block text-xs text-slate-400">{d.source||'Saved document'}</span></WorkflowCheck>)}</div>{!visible.length&&<p>No saved sources match.</p>}<p className="text-xs text-slate-400">{selected.length} selected</p></section>;
}
