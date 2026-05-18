import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface SettingsShellProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  content: ReactNode
  sidebar: ReactNode
}

export function SettingsShell({
  className,
  content,
  sidebar,
  ...props
}: SettingsShellProps) {
  return (
    <div {...props} className={cx('settings-shell', className)}>
      <aside className="settings-sidebar">{sidebar}</aside>
      <section className="settings-content">{content}</section>
    </div>
  )
}

export interface SegmentedControlOption {
  description?: ReactNode
  label: ReactNode
  value: string
}

export interface SegmentedControlProps {
  ariaLabel: string
  onChange: (value: string) => void
  options: SegmentedControlOption[]
  value: string
}

export function SegmentedControl({
  ariaLabel,
  onChange,
  options,
  value,
}: SegmentedControlProps) {
  return (
    <div
      className="seg-control"
      role="group"
      aria-label={ariaLabel}
      style={{ '--seg-cols': Math.max(1, options.length) } as CSSProperties}
    >
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={cx('seg-btn', option.value === value && 'active')}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          <span className="seg-title">{option.label}</span>
          {option.description ? <span className="seg-meta">{option.description}</span> : null}
        </button>
      ))}
    </div>
  )
}
