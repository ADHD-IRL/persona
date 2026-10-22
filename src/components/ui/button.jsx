import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500 text-black font-semibold hover:bg-amber-400",
        destructive:
          "bg-red-700 text-white hover:bg-red-600",
        outline:
          "border border-amber-500/40 text-amber-500 bg-transparent hover:bg-amber-500/10",
        secondary:
          "border border-[var(--wr-border)] text-[var(--wr-text-secondary)] bg-transparent hover:bg-white/5",
        ghost: "border border-transparent text-[var(--wr-text-secondary)] hover:bg-white/5",
        link: "text-amber-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-full px-3 text-xs",
        lg: "h-10 rounded-full px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      data-ui={variant==='link'?'reference':size==='icon'?'icon':'action'}
      data-variant={({default:'amber',destructive:'danger'})[variant]||variant||'amber'}
      data-size={size==='default'||!size?'md':size}
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
