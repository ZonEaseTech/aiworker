import type { ReactNode } from 'react'

import { cx } from '../utils/cx'

export type WorkerStudioLayoutVariant = 'home' | 'session' | 'workspace'

export interface AppShellProps {
  appearance: string
  children: ReactNode
  className?: string
  resolvedTheme: string
}

export function AppShell({
  appearance,
  children,
  className,
  resolvedTheme,
}: AppShellProps) {
  return (
    <main className={cx('entry-shell', className)} data-appearance={appearance} data-theme={resolvedTheme} data-testid="worker-studio-shell">
      {children}
    </main>
  )
}

export function ShellSidebar({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <aside className={cx('entry-side', className)} aria-label={label}>
      {children}
    </aside>
  )
}

export function ShellMain({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <section className={cx('entry-main', className)} aria-label={label}>
      {children}
    </section>
  )
}

export function WorkerStudioLayout({
  appearance,
  detail,
  detailCollapsed = false,
  dialogs,
  main,
  mainLabel,
  resolvedTheme,
  sidebar,
  sidebarLabel,
  variant,
}: {
  appearance: string
  detail?: ReactNode
  detailCollapsed?: boolean
  dialogs?: ReactNode
  main: ReactNode
  mainLabel: string
  resolvedTheme: string
  sidebar: ReactNode
  sidebarLabel: string
  variant: WorkerStudioLayoutVariant
}) {
  const routeClass = variant === 'session' ? 'workspace-session-route has-artifact-rail' : variant === 'workspace' ? 'workspace-context-route' : 'workspace-home-route'
  return (
    <AppShell appearance={appearance} resolvedTheme={resolvedTheme}>
      <div className={cx('entry workspace-entry', routeClass, variant === 'session' && detailCollapsed ? 'detail-drawer-collapsed' : undefined)}>
        <ShellSidebar label={sidebarLabel} className="soul-sidebar">
          {sidebar}
        </ShellSidebar>
        <ShellMain label={mainLabel} className="workspace-column">
          {main}
        </ShellMain>
        {detail}
        {dialogs}
      </div>
    </AppShell>
  )
}
