import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-bold leading-tight ring-offset-background transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-2 border-primary bg-transparent text-foreground hover:border-button-hover hover:bg-button-hover hover:text-primary-foreground active:border-button-active active:bg-button-active active:text-primary-foreground',
        secondary: 'border border-primary bg-transparent text-foreground hover:border-button-hover hover:bg-button-hover hover:text-primary-foreground',
        destructive: 'border-2 border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground',
        outline: 'border border-input bg-transparent text-foreground hover:border-primary hover:text-foreground',
        ghost: 'border border-transparent bg-transparent text-foreground hover:border-primary hover:bg-accent hover:text-accent-foreground',
        link: 'h-auto border-0 px-0 py-0 text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:text-info hover:no-underline',
      },
      size: {
        default: 'min-h-11 px-3 py-2',
        sm: 'min-h-9 px-3 py-2 text-sm',
        lg: 'min-h-12 px-5 py-3 text-lg',
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
