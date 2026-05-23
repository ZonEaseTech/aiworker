import {
  Add01Icon,
  ArrowRight01Icon,
  PanelBottom,
  PanelLeftIcon,
  PanelRightIcon,
  Search01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@zonease/aiworker-ui/components/breadcrumb'
import { ItemActions, ItemContent, ItemDescription, ItemTitle } from '@zonease/aiworker-ui/components/item'
import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@zonease/aiworker-ui/components/sidebar'
import { Fragment } from 'react'

export function HostTopBar({
  locatorSegments,
  onToggleSidebar,
  sidebarCollapsed,
}: {
  locatorSegments: string[]
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
}) {
  const sidebarLabel = sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'
  const locatorItems = locatorSegments.map((segment, index) => ({
    key: locatorSegments.slice(0, index + 1).join('/'),
    segment,
    showSeparator: index > 0,
  }))

  return (
    <ItemActions asChild className="h-10 min-w-0 justify-between gap-3 bg-sidebar px-2.5 text-sidebar-foreground">
      <header data-slot="host-top-bar" data-host-slot="host-top-bar" aria-label="Host actions">
        <ItemActions className="min-w-0 gap-2">
          <SidebarMenuButton
            aria-label={sidebarLabel}
            aria-pressed={!sidebarCollapsed}
            className="size-7 w-7 justify-center p-0"
            isActive={!sidebarCollapsed}
            size="sm"
            title={sidebarLabel}
            type="button"
            onClick={onToggleSidebar}
          >
            <HugeiconsIcon icon={PanelLeftIcon} strokeWidth={2} aria-hidden="true" />
          </SidebarMenuButton>
          <Breadcrumb className="min-w-0 overflow-hidden" aria-label="Current Soul worker">
            <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
              {locatorItems.map(item => (
                <Fragment key={item.key}>
                  {item.showSeparator ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate">
                      {item.segment}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </ItemActions>
        <ItemActions className="min-w-0 gap-1" aria-label="Reserved Host panels">
          <SidebarMenuButton
            aria-label="Open workspace terminal"
            className="size-7 w-7 justify-center p-0"
            size="sm"
            title="Workspace terminal"
            type="button"
            disabled
          >
            <HugeiconsIcon icon={PanelBottom} strokeWidth={2} aria-hidden="true" />
          </SidebarMenuButton>
          <SidebarMenuButton
            aria-label="Open right panel"
            className="size-7 w-7 justify-center p-0"
            size="sm"
            title="Right panel"
            type="button"
            disabled
          >
            <HugeiconsIcon icon={PanelRightIcon} strokeWidth={2} aria-hidden="true" />
          </SidebarMenuButton>
        </ItemActions>
      </header>
    </ItemActions>
  )
}

export function HostSidebarActions({
  onCreateWorker,
  onOpenSoulApps,
}: {
  onCreateWorker: () => void
  onOpenSoulApps: () => void
}) {
  return (
    <SidebarGroup className="min-w-0 shrink-0 px-0 py-0" aria-label="Host navigation">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={onCreateWorker}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              New Soul worker
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" disabled>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              Search
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={onOpenSoulApps}>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              Soul Apps
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function HostSidebarFooter({
  onOpenSettings,
  runtimeVersion,
}: {
  onOpenSettings: () => void
  runtimeVersion: string
}) {
  const version = runtimeVersion.startsWith('v') ? runtimeVersion : `v${runtimeVersion}`

  return (
    <SidebarFooter data-host-slot="host-sidebar-footer" className="mt-auto shrink-0 p-0 pt-3">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton type="button" className="justify-between" onClick={onOpenSettings}>
            <ItemContent asChild className="min-w-0 flex-none flex-row items-center gap-2">
              <span>
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                <ItemTitle asChild>
                  <span>Platform settings</span>
                </ItemTitle>
              </span>
            </ItemContent>
            <ItemDescription asChild className="max-w-full truncate">
              <span>{version}</span>
            </ItemDescription>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
