import type { LocalSession, LocalWorkspace } from '@zonease/aiworker-soul-descriptor'

import { Add01Icon, Archive01Icon, File02Icon, FolderLibraryIcon, MoreHorizontalCircle01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@zonease/aiworker-ui/components/button'
import { CollapsibleGroup } from '@zonease/aiworker-ui/components/collapsible-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@zonease/aiworker-ui/components/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@zonease/aiworker-ui/components/sidebar'
import { useMemo, useState } from 'react'

/**
 * Left panel of the Worker Workbench: a workspace tree with sessions nested under
 * each workspace. The Worker owns and directly renders this navigation — there is
 * no mounted micro-app and no Soul-provided sidebar. Selecting a session routes the
 * main area to render the session chat directly.
 */
export function WorkspaceTree({
  archiveLabel,
  emptyWorkspacesLabel,
  newSessionLabel,
  newWorkspaceLabel,
  noSessionsLabel,
  onCreateSession,
  onCreateWorkspace,
  onArchiveSession,
  onArchiveWorkspace,
  onSelectSession,
  selectedSessionId,
  selectedWorkspaceId,
  sessionsForWorkspace,
  title,
  workspaces,
}: {
  archiveLabel: string
  emptyWorkspacesLabel: string
  newSessionLabel: string
  newWorkspaceLabel: string
  noSessionsLabel: string
  onArchiveWorkspace: (workspace: LocalWorkspace) => void
  onArchiveSession: (workspace: LocalWorkspace, session: LocalSession) => void
  onCreateSession: (workspace: LocalWorkspace) => void
  onCreateWorkspace: () => void
  onSelectSession: (workspace: LocalWorkspace, session: LocalSession) => void
  selectedSessionId: string | null
  selectedWorkspaceId: string | null
  sessionsForWorkspace: (workspace: LocalWorkspace) => LocalSession[]
  title: string
  workspaces: LocalWorkspace[]
}) {
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(() => new Set())
  const toggleWorkspace = (workspaceId: string) => {
    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current)
      if (next.has(workspaceId))
        next.delete(workspaceId)
      else
        next.add(workspaceId)
      return next
    })
  }
  const sessionsByWorkspace = useMemo(
    () => new Map(workspaces.map(workspace => [workspace.id, sessionsForWorkspace(workspace)])),
    [sessionsForWorkspace, workspaces],
  )

  return (
    <SidebarGroup className="min-h-0 min-w-0 flex-1 overflow-hidden px-0 py-0" aria-label="Workspaces" data-testid="workspace-tree">
      <div className="flex h-8 min-w-0 items-center justify-between gap-2 px-2" data-testid="workspace-tree-header">
        <SidebarGroupLabel className="h-auto min-w-0 flex-1 px-0 py-0">{title}</SidebarGroupLabel>
        <SidebarMenuButton
          type="button"
          size="sm"
          aria-label={newWorkspaceLabel}
          title={newWorkspaceLabel}
          className="size-7 w-7 justify-center p-0"
          onClick={onCreateWorkspace}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
        </SidebarMenuButton>
      </div>
      <SidebarGroupContent className="min-h-0 overflow-y-auto pr-1">
        <div className="flex min-w-0 flex-col gap-3" data-testid="workspace-tree-body">
          {workspaces.length > 0
            ? workspaces.map((workspace) => {
                const collapsed = collapsedWorkspaceIds.has(workspace.id)
                const sessions = sessionsByWorkspace.get(workspace.id) ?? []
                return (
                  <CollapsibleGroup
                    key={workspace.id}
                    collapsed={collapsed}
                    controlsId={`workspace-tree-group-${workspace.id}`}
                    data-active={workspace.id === selectedWorkspaceId ? 'true' : undefined}
                    drawerProps={{ 'aria-label': `${workspace.name} sessions`, 'role': 'group' }}
                    title={workspace.name}
                    toggleAriaLabel={`${collapsed ? 'Expand' : 'Collapse'} ${workspace.name}`}
                    action={(
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`More actions for workspace ${workspace.name}`}
                            title={`More actions for workspace ${workspace.name}`}
                            className="size-7"
                          >
                            <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onSelect={() => onArchiveWorkspace(workspace)}>
                            <HugeiconsIcon icon={Archive01Icon} strokeWidth={2} aria-hidden="true" />
                            {archiveLabel}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    onToggle={() => toggleWorkspace(workspace.id)}
                  >
                    <SidebarMenu aria-label={`${workspace.name} sessions`}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          type="button"
                          size="sm"
                          aria-label={`${newSessionLabel} in ${workspace.name}`}
                          className="text-sidebar-foreground/70"
                          onClick={() => onCreateSession(workspace)}
                        >
                          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                          <span className="truncate">{newSessionLabel}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {sessions.length > 0
                        ? sessions.map(session => (
                            <SidebarMenuItem key={session.id}>
                              <SidebarMenuButton
                                type="button"
                                isActive={session.id === selectedSessionId}
                                aria-label={`Open session ${session.title}`}
                                aria-pressed={session.id === selectedSessionId}
                                onClick={() => onSelectSession(workspace, session)}
                              >
                                <HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />
                                <span className="truncate">{session.title}</span>
                              </SidebarMenuButton>
                              <DropdownMenu>
                                <SidebarMenuAction showOnHover asChild>
                                  <DropdownMenuTrigger asChild>
                                    <button type="button" aria-label={`More actions for session ${session.title}`} title={`More actions for session ${session.title}`}>
                                      <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
                                    </button>
                                  </DropdownMenuTrigger>
                                </SidebarMenuAction>
                                <DropdownMenuContent align="start">
                                  <DropdownMenuItem onSelect={() => onArchiveSession(workspace, session)}>
                                    <HugeiconsIcon icon={Archive01Icon} strokeWidth={2} aria-hidden="true" />
                                    {archiveLabel}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </SidebarMenuItem>
                          ))
                        : (
                            <SidebarMenuItem>
                              <span data-slot="item-description" className="block truncate px-2 py-1 text-xs text-sidebar-foreground/60">
                                {noSessionsLabel}
                              </span>
                            </SidebarMenuItem>
                          )}
                    </SidebarMenu>
                  </CollapsibleGroup>
                )
              })
            : (
                <SidebarMenu aria-label="Workspaces">
                  <SidebarMenuItem>
                    <span data-slot="item-description" className="block px-2 py-1 text-xs text-sidebar-foreground/60">
                      {emptyWorkspacesLabel}
                    </span>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      aria-label={`${newWorkspaceLabel} (${emptyWorkspacesLabel})`}
                      title={newWorkspaceLabel}
                      className="text-sidebar-foreground/80"
                      onClick={onCreateWorkspace}
                    >
                      <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} aria-hidden="true" />
                      <span className="truncate">{newWorkspaceLabel}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
