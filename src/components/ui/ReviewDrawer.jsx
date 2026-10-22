import {useEffect,useId,useRef} from 'react';
import {WorkflowButton} from './WorkflowControls';
export default function ReviewDrawer({title,children,onClose}){
 const ref=useRef(null),heading=useId();
 useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>{dialog.close();};},[]);
 return <dialog ref={ref} aria-labelledby={heading} onCancel={e=>{e.preventDefault();onClose();}} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-3xl border-l border-slate-600 bg-slate-950 text-slate-100 p-0 backdrop:bg-black/60"><header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-950 border-b border-slate-700 p-4"><h2 id={heading} className="min-w-0 flex-1 break-words text-lg font-semibold">{title}</h2><WorkflowButton variant="secondary" size="sm" className="shrink-0 self-start !whitespace-nowrap" onClick={onClose}>Close panel</WorkflowButton></header><div className="p-4 md:p-6 space-y-5">{children}</div></dialog>;
}
