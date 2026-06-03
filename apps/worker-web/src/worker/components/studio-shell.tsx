import type { HTMLAttributes, ReactNode } from 'react'

import { CardContent, CardHeader } from '@zonease/aiworker-ui/components/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@zonease/aiworker-ui/components/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { SidebarContent } from '@zonease/aiworker-ui/components/sidebar'
import { cn } from '@zonease/aiworker-ui/lib/utils'

export type WorkerStudioLayoutVariant = 'home' | 'session' | 'workspace'

export function WorkerStudioLayout({
  appearance,
  detail,
  detailCollapsed = false,
  dialogs,
  header,
  main,
  mainLabel,
  resolvedTheme,
  sidebar,
  sidebarCollapsed = false,
  sidebarLabel,
  variant,
}: {
  appearance: string
  detail?: ReactNode
  detailCollapsed?: boolean
  dialogs?: ReactNode
  header?: ReactNode
  main: ReactNode
  mainLabel: string
  resolvedTheme: string
  sidebar: ReactNode
  sidebarCollapsed?: boolean
  sidebarLabel: string
  variant: WorkerStudioLayoutVariant
}) {
  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground" data-slot="app-shell" data-appearance={appearance} data-theme={resolvedTheme} data-testid="worker-studio-shell">
      {header}
      <div
        className={cn(
          'flex min-h-0 flex-1 overflow-hidden',
          'max-md:max-w-screen max-md:flex-col',
        )}
        data-host-slot="shell-body"
        data-detail-collapsed={variant === 'session' && detailCollapsed ? 'true' : undefined}
        data-sidebar-collapsed={sidebarCollapsed ? 'true' : undefined}
      >
        <SidebarContent
          className={cn(
            'min-h-0 w-80 min-w-0 flex-none gap-4 overflow-hidden bg-sidebar p-4 text-sidebar-foreground',
            sidebarCollapsed && 'hidden',
            variant === 'session' ? 'max-md:max-h-48 max-md:p-3' : 'max-md:max-h-96',
            'max-md:w-full max-md:flex-none',
          )}
          data-host-slot="shell-sidebar"
          aria-label={sidebarLabel}
          role="region"
        >
          {sidebar}
        </SidebarContent>
        <ItemGroup asChild role="region" className="min-h-0 min-w-0 flex-1 gap-0 overflow-hidden">
          <section data-host-slot="shell-main" aria-label={mainLabel}>
            {main}
          </section>
        </ItemGroup>
        {detail}
        {dialogs}
      </div>
    </main>
  )
}

export function StudioMainFrame({
  actions,
  children,
  kicker,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  kicker: string
  title: string
}) {
  return (
    <>
      <StudioChromeHeader actions={actions}>
        <StudioTitleBlock kicker={kicker} title={title} />
      </StudioChromeHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-6 max-md:px-4">
        {children}
      </CardContent>
    </>
  )
}

interface DataAttributes {
  [key: `data-${string}`]: string | undefined
}

export interface StudioChromeHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  actionProps?: HTMLAttributes<HTMLDivElement> & DataAttributes
  actions?: ReactNode
}

export function StudioChromeHeader({
  actionProps,
  actions,
  children,
  className,
  ...props
}: StudioChromeHeaderProps) {
  const { className: actionClassName, ...restActionProps } = actionProps ?? {}

  return (
    <CardHeader
      {...props}
      className={cn('flex min-h-16 flex-row items-center justify-between gap-4 px-7 py-0 max-md:px-4', className)}
    >
      {children}
      {actions
        ? (
            <ItemActions {...restActionProps} className={cn('shrink-0', actionClassName)}>
              {actions}
            </ItemActions>
          )
        : null}
    </CardHeader>
  )
}

export function StudioTitleBlock({
  footer,
  headingLevel = 1,
  kicker,
  meta,
  title,
}: {
  footer?: ReactNode
  headingLevel?: 1 | 2
  kicker: ReactNode
  meta?: ReactNode
  title: ReactNode
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h1'

  return (
    <Item variant="default" size="xs" className="min-w-0 flex-1 p-0">
      <ItemContent className="min-w-0 gap-0.5">
        <ItemDescription className="line-clamp-1">{kicker}</ItemDescription>
        <ItemTitle asChild size="base" className="max-w-full">
          <Heading>{title}</Heading>
        </ItemTitle>
        {meta ? <ItemDescription className="line-clamp-none max-w-full">{meta}</ItemDescription> : null}
        {footer}
      </ItemContent>
    </Item>
  )
}

export interface StudioSectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  meta?: ReactNode
  title: ReactNode
}

export function StudioSectionHeader({
  action,
  className,
  description,
  icon,
  meta,
  title,
  ...props
}: StudioSectionHeaderProps) {
  return (
    <Item {...props} data-section-slot="section-header" variant="default" size="xs" className={cn('min-w-0 px-0 py-0', className)}>
      {icon ? <ItemMedia variant="icon" aria-hidden="true">{icon}</ItemMedia> : null}
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="max-w-full">{title}</ItemTitle>
        {description ? <ItemDescription className="max-w-full">{description}</ItemDescription> : null}
      </ItemContent>
      {meta || action
        ? (
            <ItemActions className="shrink-0">
              {meta}
              {action}
            </ItemActions>
          )
        : null}
    </Item>
  )
}

export interface StudioEmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  title: ReactNode
}

export function StudioEmptyState({
  action,
  className,
  detail,
  icon,
  title,
  ...props
}: StudioEmptyStateProps) {
  return (
    <Empty {...props} className={cn('min-h-42 justify-center p-4', className)}>
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
      {action}
    </Empty>
  )
}
