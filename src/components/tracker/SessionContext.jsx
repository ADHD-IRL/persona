import {useEffect} from 'react';
import {Link} from 'react-router-dom';
import {useWorkspace} from '@/lib/WorkspaceContext';
import {sessionRunPath} from '@/lib/sessionNavigation';
export default function SessionContext({session,scenario,question,active,children}){
 const {workspace}=useWorkspace();
 useEffect(()=>{if(session?.id)try{localStorage.setItem('agd_selected_session_'+workspace.id,session.id);}catch{/* optional */}},[session?.id,workspace.id]);
 if(!session)return null;
 const links=[['tracker','Session Tracker','/session-tracker?session='+session.id],['debate',session.mode==='panel'?'Panel Room':'Debate',sessionRunPath(session)],...(session.status==='complete'?[['summary','Summary','/session-summary?session='+session.id]]:[]),['reports','Reports','/reports?session='+session.id]];
 return <section aria-label="Selected session" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.03] p-3 space-y-2 min-w-0"><div className="flex flex-wrap justify-between items-start gap-3"><div className="min-w-0"><p className="font-semibold break-words">{scenario?.name||session.name}</p><p className="text-xs text-slate-400">{session.mode==='panel'?'Panel Room':'Agent Debate'} · Debate: {(session.status||'pending').replaceAll('_',' ')}{session.created_at?' · '+new Date(session.created_at).toLocaleString():''}</p></div><Link data-ui="reference" className="text-sm text-amber-300 underline underline-offset-2" to={'/session-tracker?session='+session.id+'&choose=1'}>Change session</Link></div><p className="text-sm break-words"><span className="text-slate-400">Question: </span>{question||session.name}</p><nav aria-label="Selected session navigation" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-amber-500/20 pt-2">{links.map(([key,label,to])=><Link key={key} data-ui="reference" aria-current={key===active?'page':undefined} className={'text-sm py-1 '+(key===active?'text-amber-300 font-semibold border-b-2 border-amber-400':'text-slate-400 hover:text-amber-200')} to={to}>{label}</Link>)}</nav>{children}</section>;
}
