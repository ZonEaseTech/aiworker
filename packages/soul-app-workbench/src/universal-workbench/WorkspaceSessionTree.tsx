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
            className="min-w-0 cursor-pointer"
            data-selected={selectedNodeId === ws.id ? 'true' : undefined}
            onClick={() => onSelectNode({ id: ws.id, kind: 'workspace', label: ws.label, workspaceId: ws.id })}
          >
            <button type="button">
              <ItemContent className="min-w-0">
                <ItemTitle className="truncate text-xs font-semibold uppercase tracking-wide">{ws.label}</ItemTitle>
              </ItemContent>
            </button>
          </Item>
          {ws.sessions.map(session => (
            <Item
              key={session.id}
              asChild
              variant="default"
              size="xs"
              className="min-w-0 cursor-pointer pl-4"
              data-selected={selectedNodeId === session.id ? 'true' : undefined}
              onClick={() => onSelectNode(session)}
            >
              <button type="button">
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="truncate text-sm">{session.label}</ItemTitle>
                  {session.detail ? <ItemDescription className="truncate text-xs">{session.detail}</ItemDescription> : null}
                </ItemContent>
              </button>
            </Item>
          ))}
          <Item
            asChild
            variant="muted"
            size="xs"
            className="min-w-0 cursor-pointer pl-4"
            onClick={onCreateSession}
          >
            <button type="button">
              <ItemContent className="min-w-0">
                <ItemDescription className="flex items-center gap-1 text-xs">
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                  New Session
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>
        </ItemGroup>
      ))}
    </ItemGroup>
  )
}
