import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from './timeline/engine-readiness'
import type { SessionTurnDraft } from './SessionTurnComposer'
import type { WorkspaceSessionTreeNode } from './WorkspaceSessionTree'

import { SidebarLeftIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@zonease/aiworker-ui/components/button'
import { useMemo, useState } from 'react'
import { SessionChatView } from './SessionChatView'
import { SessionDetail } from './SessionDetail'
import { WorkspaceSessionTree } from './WorkspaceSessionTree'

export interface UniversalWorkbenchAppProps {
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  sessions: LocalSession[]
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workspace: LocalWorkspace | null
  workspaces: LocalWorkspace[]
  onBackToWorkspace: () => void
  onCreateSession: (workspaceId: string, input: string) => Promise<void>
  onRefresh: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>, draft?: SessionTurnDraft) => Promise<void> | void
  onTurnInputChange: (value: string) => void
}

export function UniversalWorkbenchApp({
  engineReadiness,
  events,
  sessions,
  turnInput,
  turnSubmitting,
  turns,
  workspace,
  workspaces,
  onBackToWorkspace,
  onCreateSession,
  onRefresh,
  onSubmitTurn,
  onTurnInputChange,
}: UniversalWorkbenchAppProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [newSessionInput, setNewSessionInput] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspace?.id ?? null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )
  const selectedWorkspace = useMemo(
    () => workspaces.find(w => w.id === selectedWorkspaceId) ?? workspace ?? workspaces[0] ?? null,
    [workspaces, selectedWorkspaceId, workspace],
  )
  const workspaceEvents = useMemo(
    () => events.filter(e =>
      selectedSession
        ? e.turnId && turns.some(t => t.id === e.turnId && t.sessionId === selectedSession.id)
        : false,
    ),
    [events, selectedSession, turns],
  )
  const sessionTurns = useMemo(
    () => selectedSession ? turns.filter(t => t.sessionId === selectedSession.id) : [],
    [selectedSession, turns],
  )

  const treeNodes = useMemo<WorkspaceSessionTreeNode[]>(() => {
    const nodes: WorkspaceSessionTreeNode[] = []
    for (const ws of workspaces) {
      nodes.push({ id: ws.id, kind: 'workspace', label: ws.name, workspaceId: ws.id })
      for (const session of sessions.filter(s => s.workspaceId === ws.id)) {
        nodes.push({
          id: session.id,
          kind: 'session',
          label: session.capabilityTemplateId,
          detail: session.status,
          sessionId: session.id,
          workspaceId: ws.id,
        })
      }
    }
    return nodes
  }, [workspaces, sessions])

  async function handleCreateSession(workspaceId: string) {
    if (!newSessionInput.trim())
      return
    await onCreateSession(workspaceId, newSessionInput.trim())
    setNewSessionInput('')
  }

  return (
    <div className="flex h-full min-h-0" data-slot="universal-workbench">
      {!sidebarCollapsed && (
        <aside className="w-56 min-w-0 flex-shrink-0 overflow-y-auto border-r p-3" data-slot="workbench-sidebar">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</span>
            <Button
              aria-label="Collapse sidebar"
              className="size-6"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setSidebarCollapsed(true)}
            >
              <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
          <WorkspaceSessionTree
            nodes={treeNodes}
            selectedNodeId={selectedSession?.id ?? selectedWorkspace?.id ?? null}
            onCreateSession={() => selectedWorkspace && handleCreateSession(selectedWorkspace.id)}
            onSelectNode={(node) => {
              if (node.kind === 'session') {
                setSelectedSessionId(node.sessionId ?? null)
              }
              else {
                setSelectedWorkspaceId(node.workspaceId)
                setSelectedSessionId(null)
              }
            }}
          />
        </aside>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col" data-slot="workbench-main">
        {sidebarCollapsed && (
          <div className="px-3 pt-3">
            <Button
              aria-label="Expand sidebar"
              className="size-6"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setSidebarCollapsed(false)}
            >
              <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
        )}
        {selectedSession && selectedWorkspace
          ? (
              <SessionChatView
                assistantRoleLabel="Assistant"
                detailDrawerOpen={detailDrawerOpen}
                engineReadiness={engineReadiness}
                events={workspaceEvents}
                operatorRoleLabel="You"
                session={selectedSession}
                sessionStatusLabel={selectedSession.status}
                turnInput={turnInput}
                turnSubmitting={turnSubmitting}
                turns={sessionTurns}
                workspace={selectedWorkspace}
                workspaceName={selectedWorkspace.name}
                onBackToWorkspace={() => setSelectedSessionId(null)}
                onRefresh={onRefresh}
                onToggleDetailDrawer={() => setDetailDrawerOpen(v => !v)}
                onSubmitTurn={onSubmitTurn}
                onTurnInputChange={onTurnInputChange}
              />
            )
          : selectedWorkspace
            ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
                    <p className="text-sm text-muted-foreground">Start a new session or select one from the sidebar.</p>
                  </div>
                  <div className="flex w-full max-w-xl gap-2">
                    <input
                      className="flex-1 rounded-md border px-3 py-2 text-sm"
                      placeholder="What do you want to work on?"
                      value={newSessionInput}
                      onChange={e => setNewSessionInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateSession(selectedWorkspace.id)}
                    />
                    <button
                      type="button"
                      className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                      onClick={() => handleCreateSession(selectedWorkspace.id)}
                      disabled={!newSessionInput.trim()}
                    >
                      Start
                    </button>
                  </div>
                </div>
              )
            : (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Select a workspace to get started.</p>
                </div>
              )}
      </main>

      <SessionDetail
        collapsed={!detailDrawerOpen}
        copy={{
          accessibility: { businessArtifactPreview: 'Session detail' },
          workspace: {
            addSourceMaterials: 'Add source materials',
            attachedSourceMaterials: 'Attached source materials',
            closeSourceMaterialPreview: 'Close preview',
            continueSession: 'Continue session',
            eventCount: (n: number) => `${n} events`,
            eventStream: 'Event stream',
            followUpInput: 'Session follow-up input',
            followUpPlaceholder: 'Continue the conversation...',
            materialReadError: 'Failed to read source material.',
            noEvents: 'No events yet.',
            noSelectionDetail: 'Select a session to view details.',
            noSelectionTitle: 'No session selected',
            noTurns: 'No turns yet.',
            previewSourceMaterial: (name: string) => `Preview ${name}`,
            removeSourceMaterial: (name: string) => `Remove ${name}`,
            selectedWorkspace: 'Workspace',
            sendTurn: 'Send',
            sendingTurn: 'Sending...',
            sessionDetail: 'Session detail',
            turnCount: (n: number) => `${n} turns`,
            turnHistory: 'Turn history',
            updated: (d: string) => d,
          },
        }}
        engineReadiness={engineReadiness}
        events={workspaceEvents}
        session={selectedSession}
        template={null}
        turnInput={turnInput}
        turnSubmitting={turnSubmitting}
        turns={sessionTurns}
        workspace={selectedWorkspace}
        onSubmitTurn={onSubmitTurn}
        onTurnInputChange={onTurnInputChange}
      />
    </div>
  )
}
