import {useId} from 'react';
const fieldStyle={backgroundColor:'var(--wr-bg-secondary)',border:'1px solid var(--wr-border)',color:'var(--wr-text-primary)',borderRadius:'var(--ui-field-radius)'};
export function WrInput({label,value,onChange,placeholder,type='text',className='',rows,id:providedId,...props}){
 const generatedId=useId(),id=providedId||generatedId,Tag=rows?'textarea':'input';
 return <div className={className}>{label&&<label htmlFor={id} className="block text-xs font-medium mb-1.5 tracking-wide" style={{color:'var(--wr-text-secondary)'}}>{label}</label>}<Tag {...props} id={id} type={rows?undefined:type} rows={rows} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 text-sm" style={fieldStyle}/></div>;
}
export function WrSelect({label,value,onChange,children,className='',id:providedId,...props}){
 const generatedId=useId(),id=providedId||generatedId;
 return <div className={className}>{label&&<label htmlFor={id} className="block text-xs font-medium mb-1.5 tracking-wide" style={{color:'var(--wr-text-secondary)'}}>{label}</label>}<select {...props} id={id} value={value} onChange={e=>onChange(e.target.value)} className="w-full px-3 py-2 text-sm" style={fieldStyle}>{children}</select></div>;
}
