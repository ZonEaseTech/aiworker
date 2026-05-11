import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export type ButtonVariant = 'close' | 'ghost' | 'icon' | 'plain' | 'primary' | 'secondary'

const buttonVariantClass: Record<ButtonVariant, string> = {
  close: 'settings-close',
  ghost: 'ghost',
  icon: 'icon-btn',
  plain: '',
  primary: 'primary',
  secondary: 'secondary',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  iconOnly?: boolean
  variant?: ButtonVariant
}

export function Button({
  children,
  className,
  icon,
  iconOnly = false,
  type = 'button',
  variant = 'plain',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(buttonVariantClass[variant], iconOnly && variant !== 'icon' ? 'icon-btn' : undefined, className)}
    >
      {icon}
      {children}
    </button>
  )
}
