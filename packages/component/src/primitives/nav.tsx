import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export function Nav({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <nav {...props} className={className}>
      {children}
    </nav>
  )
}

export interface NavItemButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  description?: ReactNode
  icon?: ReactNode
  label: ReactNode
}

export function NavItemButton({
  active = false,
  className,
  description,
  icon,
  label,
  type = 'button',
  ...props
}: NavItemButtonProps) {
  return (
    <button {...props} type={type} className={cx(active && 'active', className)}>
      {icon}
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </button>
  )
}
