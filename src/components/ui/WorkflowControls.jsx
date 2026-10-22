import MarkdownContent from '@/components/ui/MarkdownContent';
import WrButton from './WrButton';
import {useId} from 'react';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wr-bg-secondary)]';
const pill = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ' + focus;
export const workflowAction = pill + ' border-[var(--wr-border)] text-[var(--wr-text-secondary)] hover:border-amber-400/60 hover:bg-white/5';
export const workflowLink = 'text-amber-300 underline underline-offset-2 hover:text-amber-200 ' + focus;
const control = 'w-full min-w-0 min-h-10 rounded-xl border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ' + focus;
const style = {backgroundColor:'var(--wr-bg-secondary)',borderColor:'var(--wr-border)',color:'var(--wr-text-primary)'};

export function WorkflowButton({variant='amber',...props}) {
  return <WrButton variant={variant} {...props}/>;
}

export function WorkflowField({label,hint,as='input',children,...props}) {
  const id=useId(), Tag=as;
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium" style={{color:'var(--wr-text-secondary)'}}>{label}</label>
    <Tag {...props} id={id} aria-describedby={hint?id+'-hint':undefined} className={control} style={style}>{children}</Tag>
    {hint&&<p id={id+'-hint'} className="text-xs text-slate-400">{hint}</p>}
  </div>;
}

export function WorkflowChoices({label,value,onChange,options,disabled=false}) {
  const name=useId();
  return <fieldset className="space-y-2">
    <legend className="text-sm font-medium mb-2" style={{color:'var(--wr-text-secondary)'}}>{label}</legend>
    <div className="flex flex-wrap gap-2">{options.map(o=>{
      const unavailable=disabled||o.disabled;
      return <label data-ui="choice" data-state={value===o.value?'checked':'unchecked'} aria-disabled={unavailable||undefined} key={o.value} className={'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-amber-400 '+(unavailable?'opacity-40 cursor-not-allowed ':'cursor-pointer hover:bg-amber-400/10 ')+(value===o.value?'border-amber-400 bg-amber-400/10 text-amber-200':'border-[var(--wr-border)] text-[var(--wr-text-secondary)]')}>
        <input type="radio" name={name} value={o.value} checked={value===o.value} onChange={()=>onChange(o.value)} disabled={unavailable} className="h-4 w-4 shrink-0 accent-amber-400"/>{o.label}
      </label>;
    })}</div>
  </fieldset>;
}

export function WorkflowCheck({children,...props}) {
  return <label className={'flex items-start gap-2 text-sm '+(props.disabled?'opacity-50 cursor-not-allowed':'cursor-pointer')}>
    <input {...props} type="checkbox" className={'mt-0.5 h-4 w-4 shrink-0 rounded accent-amber-400 '+focus}/><span>{children}</span>
  </label>;
}

export function WorkflowCard({title,description,children}) {
  return <section data-ui="surface" className="min-w-0 rounded-2xl border p-4 md:p-5 space-y-4" style={{backgroundColor:'var(--wr-bg-card)',borderColor:'var(--wr-border)'}}>
    {title&&<header><h2 className="text-lg font-semibold">{title}</h2>{description&&<MarkdownContent className="text-sm text-slate-400 mt-1">{description}</MarkdownContent>}</header>}{children}
  </section>;
}
