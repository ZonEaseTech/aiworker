import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
}

export function Badge({
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <span {...props} className={cx('count-pill', className)}>
      {children}
    </span>
  )
}
