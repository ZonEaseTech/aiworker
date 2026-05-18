import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cx } from '../utils/cx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function Input({ className, invalid = false, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={props['aria-invalid'] ?? (invalid ? true : undefined)}
      className={cx('ui-input', className)}
    />
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function Textarea({ className, invalid = false, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      aria-invalid={props['aria-invalid'] ?? (invalid ? true : undefined)}
      className={cx('ui-textarea', className)}
    />
  )
}
