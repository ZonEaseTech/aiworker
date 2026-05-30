import type { LocalWorker } from '@zonease/aiworker-soul-protocol'

import { BotIcon, MoreHorizontalCircle01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CollapsibleGroup } from '@zonease/aiworker-ui/components/collapsible-group'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@zonease/aiworker-ui/components/sidebar'
import { useMemo, useState } from 'react'
import { workerIdentityDetail } from './worker-workbench-tree-utils'

export function WorkerSwitcher({
  emptyWorkerLabel = 'No workers yet.',
  onConfigureWorker,
  onSelectWorker,
  selectedWorkerId,
  soulNameForWorker,
  workers,
}: {
  emptyWorkerLabel?: string
  onConfigureWorker: (worker: LocalWorker) => void
  onSelectWorker: (worker: LocalWorker) => void
  selectedWorkerId: null | string
  soulNameForWorker: (worker: LocalWorker) => string
  workers: LocalWorker[]
}) {
  const [collapsedSoulIds, setCollapsedSoulIds] = useState<Set<string>>(() => new Set())
  const soulGroups = useMemo(() => {
    const groups: Array<{ id: string, name: string, workers: LocalWorker[] }> = []
    const bySoulId = new Map<string, { id: string, name: string, workers: LocalWorker[] }>()
    for (const worker of workers) {
      let group = bySoulId.get(worker.soulId)
      if (!group) {
        group = { id: worker.soulId, name: soulNameForWorker(worker), workers: [] }
        bySoulId.set(worker.soulId, group)
        groups.push(group)
      }
      group.workers.push(worker)
    }
    return groups
  }, [soulNameForWorker, workers])
  const workerNameCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const worker of workers)
      counts.set(worker.name, (counts.get(worker.name) ?? 0) + 1)
    return counts
  }, [workers])
  const toggleSoulGroup = (soulId: string) => {
    setCollapsedSoulIds((current) => {
      const next = new Set(current)
      if (next.has(soulId))
        next.delete(soulId)
      else
        next.add(soulId)
      return next
    })
  }

  return (
    <SidebarGroup className="min-h-0 min-w-0 flex-1 overflow-hidden px-0 py-0" aria-label="Workers">
      <SidebarGroupContent className="min-h-0 overflow-y-auto pr-1">
        <div data-testid="worker-switcher" className="flex min-w-0 flex-col gap-3" aria-label="Soul Apps">
          {soulGroups.length > 0
            ? soulGroups.map((group) => {
                const collapsed = collapsedSoulIds.has(group.id)
                return (
                  <CollapsibleGroup
                    key={group.id}
                    collapsed={collapsed}
                    controlsId={`worker-soul-group-${group.id}`}
                    drawerProps={{ 'aria-label': `${group.name} workers`, 'role': 'group' }}
                    meta={group.workers.length}
                    title={group.name}
                    toggleAriaLabel={`${collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
                    onToggle={() => toggleSoulGroup(group.id)}
                  >
                    <SidebarMenu aria-label={`${group.name} workers`}>
                      {group.workers.map((worker) => {
                        const active = worker.id === selectedWorkerId
                        const hasDuplicateName = (workerNameCounts.get(worker.name) ?? 0) > 1
                        const identityDetail = workerIdentityDetail(worker, hasDuplicateName)
                        const workerActionName = hasDuplicateName ? `${worker.name} (${worker.id})` : worker.name
                        return (
                          <SidebarMenuItem key={worker.id}>
                            <SidebarMenuButton
                              type="button"
                              size="lg"
                              isActive={active}
                              aria-label={`Switch to ${workerActionName}`}
                              aria-pressed={active}
                              className="h-11 items-start py-1.5"
                              onClick={() => onSelectWorker(worker)}
                            >
                              <HugeiconsIcon icon={BotIcon} strokeWidth={2} aria-hidden="true" />
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate">{worker.name}</span>
                                <span data-slot="item-description" className="truncate font-normal text-sidebar-foreground/60">{identityDetail}</span>
                              </span>
                            </SidebarMenuButton>
                            <SidebarMenuAction
                              type="button"
                              showOnHover
                              aria-label={`Configure ${workerActionName}`}
                              title={`Configure ${workerActionName}`}
                              onClick={() => onConfigureWorker(worker)}
                            >
                              <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
                            </SidebarMenuAction>
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </CollapsibleGroup>
                )
              })
            : (
                <SidebarMenu aria-label="Workers">
                  <SidebarMenuItem>
                    <SidebarMenuButton type="button" disabled>
                      <HugeiconsIcon icon={BotIcon} strokeWidth={2} aria-hidden="true" />
                      <span>{emptyWorkerLabel}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
