import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-normal leading-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground',
        secondary: 'border-hairline bg-soft-stone text-secondary-foreground',
        destructive: 'border-destructive bg-transparent text-destructive',
        outline: 'border-border bg-transparent text-foreground',
        success: 'border-success bg-success-soft text-success',
        warning: 'border-warning bg-warning-soft text-warning',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type BadgeVariantProps = VariantProps<typeof badgeVariants>
