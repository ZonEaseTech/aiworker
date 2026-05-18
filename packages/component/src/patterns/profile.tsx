import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface ProfileReaderShellProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  actions?: ReactNode
  description?: ReactNode
  empty?: ReactNode
  error?: ReactNode
  loading?: boolean | ReactNode
  title: ReactNode
}

export function ProfileReaderShell({
  actions,
  children,
  className,
  description,
  empty,
  error,
  loading = false,
  title,
  ...props
}: ProfileReaderShellProps) {
  return (
    <article {...props} className={cx('profile-reader-shell', className)}>
      <header className="profile-reader-head">
        <div>
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </div>
        {actions ? <div className="profile-reader-actions">{actions}</div> : null}
      </header>
      {loading ? <div className="profile-reader-state">{loading === true ? 'Loading' : loading}</div> : null}
      {!loading && error ? <div className="profile-reader-state" role="alert">{error}</div> : null}
      {!loading && !error && children ? <div className="profile-reader-body">{children}</div> : null}
      {!loading && !error && !children && empty ? <div className="profile-reader-state">{empty}</div> : null}
    </article>
  )
}
