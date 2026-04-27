import type { ComponentProps } from 'react'
import type { BadgeVariantProps } from './badge-variants'
import { cn } from '@/shared/lib/utils'
import { badgeVariants } from './badge-variants'

export interface BadgeProps
  extends ComponentProps<'span'>,
  BadgeVariantProps {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
