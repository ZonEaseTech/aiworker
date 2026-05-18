import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

interface SharedSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  actions?: ReactNode
  description?: ReactNode
  empty?: ReactNode
  error?: ReactNode
  loading?: boolean | ReactNode
  title: ReactNode
}

export type ArtifactPreviewFrameProps = SharedSurfaceProps

export function ArtifactPreviewFrame({
  actions,
  children,
  className,
  description,
  empty,
  error,
  loading = false,
  title,
  ...props
}: ArtifactPreviewFrameProps) {
  return (
    <section {...props} className={cx('artifact-preview-frame', className)}>
      <SurfaceHeader actions={actions} description={description} title={title} />
      {renderSurfaceState({ children, empty, error, loading })}
    </section>
  )
}

export type ReviewPanelShellProps = SharedSurfaceProps

export function ReviewPanelShell({
  actions,
  children,
  className,
  description,
  empty,
  error,
  loading = false,
  title,
  ...props
}: ReviewPanelShellProps) {
  return (
    <section {...props} className={cx('review-panel-shell', className)}>
      <SurfaceHeader actions={actions} description={description} title={title} />
      {renderSurfaceState({ children, empty, error, loading })}
    </section>
  )
}

function SurfaceHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode
  description?: ReactNode
  title: ReactNode
}) {
  return (
    <header className="surface-shell-head">
      <div>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      {actions ? <div className="surface-shell-actions">{actions}</div> : null}
    </header>
  )
}

function renderSurfaceState({
  children,
  empty,
  error,
  loading,
}: {
  children?: ReactNode
  empty?: ReactNode
  error?: ReactNode
  loading?: boolean | ReactNode
}) {
  if (loading)
    return <div className="surface-shell-state">{loading === true ? 'Loading' : loading}</div>
  if (error)
    return <div className="surface-shell-state" role="alert">{error}</div>
  if (children)
    return <div className="surface-shell-body">{children}</div>
  if (empty)
    return <div className="surface-shell-state">{empty}</div>
  return null
}
