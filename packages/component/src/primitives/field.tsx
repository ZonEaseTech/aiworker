import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  description?: ReactNode
  error?: ReactNode
  label: ReactNode
}

export function Field({
  children,
  className,
  description,
  error,
  label,
  ...props
}: FieldProps) {
  if (description || error) {
    const { htmlFor, ...containerProps } = props

    return (
      <div {...containerProps as HTMLAttributes<HTMLDivElement>} className={cx('settings-field', className)}>
        <label htmlFor={htmlFor}>
          <span>{label}</span>
        </label>
        {description ? <small className="ui-field-description">{description}</small> : null}
        {children}
        {error ? <small className="ui-field-error" role="alert">{error}</small> : null}
      </div>
    )
  }

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
