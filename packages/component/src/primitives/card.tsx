import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean
}

export function Card({
  active = false,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div {...props} className={cx(active && 'active', className)}>
      {children}
    </div>
  )
}

export interface ActionCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: ReactNode
}

export function ActionCard({
  active = false,
  children,
  className,
  type = 'button',
  ...props
}: ActionCardProps) {
  return (
    <button {...props} type={type} className={cx(active && 'active', className)}>
      {children}
    </button>
  )
}
