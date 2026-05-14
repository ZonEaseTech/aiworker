import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label: ReactNode
}

export function Field({
  children,
  className,
  label,
  ...props
}: FieldProps) {
  return (
    <label {...props} className={cx('settings-field', className)}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export interface FieldGroupProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode
}

export function FieldGroup({
  children,
  className,
  label,
  ...props
}: FieldGroupProps) {
  return (
    <div {...props} className={cx('settings-field', className)}>
      <span>{label}</span>
      {children}
    </div>
  )
}
