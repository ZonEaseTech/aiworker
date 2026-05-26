import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { cn } from '@zonease/aiworker-ui/lib/utils'

export interface WorkspaceSessionTreeNode {
  id: string
  kind: 'session' | 'workspace'
  label: string
  detail?: string
  sessionId?: string
  workspaceId: string
}

export function WorkspaceSessionTree({
  className,
  nodes,
  onCreateSession,
  onSelectNode,
  selectedNodeId,
}: {
  className?: string
  nodes: WorkspaceSessionTreeNode[]
  onCreateSession: () => void
  onSelectNode: (node: WorkspaceSessionTreeNode) => void
  selectedNodeId?: string | null
}) {
  const workspaces = new Map<string, { id: string, label: string, sessions: WorkspaceSessionTreeNode[] }>()
  for (const node of nodes) {
    if (node.kind === 'workspace') {
      workspaces.set(node.id, { id: node.id, label: node.label, sessions: [] })
    }
  }
  for (const node of nodes) {
    if (node.kind === 'session') {
      const ws = workspaces.get(node.workspaceId)
      if (ws)
        ws.sessions.push(node)
    }
  }

  return (
    <ItemGroup className={cn('min-w-0 gap-1', className)} data-slot="workspace-session-tree">
      {Array.from(workspaces.values()).map(ws => (
        <ItemGroup key={ws.id} className="min-w-0 gap-0.5" data-slot="workspace-group">
          <Item
            asChild
            variant="muted"
            size="xs"
            className="w-full min-w-0 cursor-pointer overflow-hidden text-left"
            data-selected={selectedNodeId === ws.id ? 'true' : undefined}
            title={ws.label}
            onClick={() => onSelectNode({ id: ws.id, kind: 'workspace', label: ws.label, workspaceId: ws.id })}
          >
            <button type="button">
              <ItemContent className="w-full min-w-0 overflow-hidden">
                <ItemTitle className="w-full min-w-0 max-w-full truncate text-xs font-semibold uppercase tracking-wide">{ws.label}</ItemTitle>
              </ItemContent>
            </button>
          </Item>
          {ws.sessions.map(session => (
            <Item
              key={session.id}
              asChild
              variant="default"
              size="xs"
              className="w-full min-w-0 cursor-pointer overflow-hidden pl-4 text-left"
              data-selected={selectedNodeId === session.id ? 'true' : undefined}
              title={session.label}
              onClick={() => onSelectNode(session)}
            >
              <button type="button">
                <ItemContent className="w-full min-w-0 gap-0.5 overflow-hidden">
                  <ItemTitle className="w-full min-w-0 max-w-full truncate text-sm">{session.label}</ItemTitle>
                  {session.detail
                    ? <ItemDescription className="w-full min-w-0 max-w-full truncate text-xs" title={session.detail}>{session.detail}</ItemDescription>
                    : null}
                </ItemContent>
              </button>
            </Item>
          ))}
          <Item
            asChild
            variant="muted"
            size="xs"
            className="w-full min-w-0 cursor-pointer overflow-hidden pl-4 text-left"
            onClick={onCreateSession}
          >
            <button type="button">
              <ItemContent className="w-full min-w-0 overflow-hidden">
                <ItemDescription className="flex w-full min-w-0 max-w-full items-center gap-1 text-xs">
                  <HugeiconsIcon className="shrink-0" icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                  <span className="min-w-0 truncate">New Session</span>
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>
        </ItemGroup>
      ))}
    </ItemGroup>
  )
}
