import {forwardRef} from 'react';
import {Slot} from '@radix-ui/react-slot';
const WrButton=forwardRef(function WrButton({children,onClick,variant='amber',size='md',disabled,className='',type='button',asChild=false,style,...props},ref){
 const variants={amber:'bg-amber-500 hover:bg-amber-400 text-black font-semibold',ghost:'hover:bg-white/5 text-secondary border border-transparent hover:border-white/10',danger:'bg-red-700 hover:bg-red-600 text-white',outline:'border border-amber-500/40 text-amber-500 hover:bg-amber-500/10',secondary:'border text-sm font-medium hover:bg-white/5'};
 const sizes={xs:'px-3 py-1 text-xs',sm:'px-3 py-1.5 text-xs',md:'px-4 py-2 text-sm',lg:'px-6 py-3 text-sm'};
 const Comp=asChild?Slot:'button';
 return <Comp {...props} ref={ref} data-ui="action" data-size={size} type={asChild?undefined:type} disabled={asChild?undefined:disabled} aria-disabled={disabled||undefined} tabIndex={disabled&&asChild?-1:props.tabIndex} onClick={e=>{if(disabled){e.preventDefault();e.stopPropagation();return;}onClick?.(e);}} className={'rounded-full inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed '+(variants[variant]||variants.amber)+' '+(sizes[size]||sizes.md)+' '+className} style={{...(variant==='secondary'?{borderColor:'var(--wr-border)',color:'var(--wr-text-secondary)'}:{}),...style}}>{children}</Comp>;
});
export default WrButton;
