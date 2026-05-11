import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface HeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  actions?: ReactNode
  kicker?: ReactNode
  title: ReactNode
}

export function Header({
  actions,
  children,
  className,
  kicker,
  title,
  ...props
}: HeaderProps) {
  return (
    <header {...props} className={cx('entry-header', className)}>
      <div>
        {kicker ? <span className="kicker">{kicker}</span> : null}
        <h1>{title}</h1>
        {children}
      </div>
      {actions ? <div className="entry-header-right">{actions}</div> : null}
    </header>
  )
}
