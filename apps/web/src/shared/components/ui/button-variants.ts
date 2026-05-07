import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium leading-[1.7] ring-offset-background transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'rounded-pill border border-primary bg-primary text-primary-foreground hover:bg-ink active:bg-cohere-black',
        secondary: '!min-h-0 rounded-xs border border-transparent bg-transparent !px-0 !py-0 text-foreground underline decoration-hairline underline-offset-4 hover:text-action-blue hover:decoration-action-blue',
        destructive: 'rounded-pill border border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground',
        outline: 'rounded-xl border border-primary bg-transparent text-primary hover:bg-soft-stone',
        ghost: 'rounded-sm border border-transparent bg-transparent text-foreground hover:border-hairline hover:bg-soft-stone hover:text-foreground',
        link: '!min-h-0 h-auto rounded-xs border-0 !px-0 !py-0 text-foreground underline decoration-hairline underline-offset-4 hover:text-action-blue hover:decoration-action-blue',
      },
      size: {
        default: 'min-h-11 px-6 py-2.5',
        sm: 'min-h-9 px-4 py-1.5 text-sm',
        lg: 'min-h-12 px-7 py-3 text-base',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
