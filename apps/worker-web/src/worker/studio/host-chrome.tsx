import {
  PanelLeftIcon,
  Settings02Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ItemActions, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { SidebarMenuButton } from '@zonease/aiworker-ui/components/sidebar'

/**
 * Worker Workbench top bar. The Worker owns and directly renders its Workbench;
 * the bar shows the bound Soul name (the single active worker is resolved from the
 * daemon — there is no worker list, switcher, or Soul catalog in v1) plus worker
 * configuration and local settings entry points.
 */
export function WorkerStudioTopBar({
  configureLabel,
  onConfigureWorker,
  onOpenSettings,
  onToggleSidebar,
  settingsLabel,
  sidebarCollapsed,
  title,
}: {
  configureLabel: string
  onConfigureWorker?: () => void
  onOpenSettings: () => void
  onToggleSidebar: () => void
  settingsLabel: string
  sidebarCollapsed: boolean
  title: string
}) {
  const sidebarLabel = sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'

  return (
    <ItemActions asChild className="h-10 min-w-0 justify-between gap-3 bg-sidebar px-2.5 text-sidebar-foreground">
      <header data-slot="worker-top-bar" data-host-slot="worker-top-bar" aria-label="Worker Workbench">
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
          <ItemTitle className="min-w-0 truncate" data-slot="worker-soul-name">{title}</ItemTitle>
        </ItemActions>
        <ItemActions className="min-w-0 gap-1">
          {onConfigureWorker
            ? (
                <SidebarMenuButton
                  aria-label={configureLabel}
                  className="size-7 w-7 justify-center p-0"
                  size="sm"
                  title={configureLabel}
                  type="button"
                  onClick={onConfigureWorker}
                >
                  <HugeiconsIcon icon={Wrench01Icon} strokeWidth={2} aria-hidden="true" />
                </SidebarMenuButton>
              )
            : null}
          <SidebarMenuButton
            aria-label={settingsLabel}
            className="size-7 w-7 justify-center p-0"
            size="sm"
            title={settingsLabel}
            type="button"
            onClick={onOpenSettings}
          >
            <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" />
          </SidebarMenuButton>
        </ItemActions>
      </header>
    </ItemActions>
  )
}
