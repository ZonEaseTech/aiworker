import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { ManagedSessionComposerDraft } from '@zonease/aiworker-ui/components/session-composer'
import type { EngineReadiness } from './timeline/engine-readiness'
import type { WorkspaceSessionTreeNode } from './WorkspaceSessionTree'

import { Add01Icon, SidebarLeftIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@zonease/aiworker-ui/components/empty'
import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/session-composer'
import { useEffect, useMemo, useState } from 'react'
import { SessionChatView } from './SessionChatView'
import { SessionDetail } from './SessionDetail'
import { WorkspaceSessionTree } from './WorkspaceSessionTree'

export interface UniversalWorkbenchCapabilityTemplate {
  description?: string
  id: string
  name?: string
  outputKind?: string
}

export interface UniversalWorkbenchCreateSessionDraft {
  input: string
  materials?: ManagedSessionComposerDraft['materials']
  mentions?: ManagedSessionComposerDraft['mentions']
  selectedTemplateId?: string
}

export interface UniversalWorkbenchSubmitTurnDraft {
  input: string
  materials?: ManagedSessionComposerDraft['materials']
  mentions?: ManagedSessionComposerDraft['mentions']
}

export interface UniversalWorkbenchAppProps {
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  sessions: LocalSession[]
  selectedSessionId?: string | null
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  templates: readonly UniversalWorkbenchCapabilityTemplate[]
  workspace: LocalWorkspace | null
  workspaces: LocalWorkspace[]
  onBackToWorkspace: () => void
  onCreateSession: (workspaceId: string, draft: UniversalWorkbenchCreateSessionDraft) => Promise<void>
  onCreateWorkspace: () => void
  onSelectSession?: (sessionId: string | null) => void
  onRefresh: () => void
  onSubmitTurn: (draft: UniversalWorkbenchSubmitTurnDraft) => Promise<void> | void
  onTurnInputChange: (value: string) => void
}

export function UniversalWorkbenchApp({
  engineReadiness,
  events,
  sessions,
  selectedSessionId,
  turnInput,
  turnSubmitting,
  turns,
  templates,
  workspace,
  workspaces,
  onBackToWorkspace,
  onCreateSession,
  onCreateWorkspace,
  onRefresh,
  onSelectSession,
  onSubmitTurn,
  onTurnInputChange,
}: UniversalWorkbenchAppProps) {
  const [internalSelectedSessionId, setInternalSelectedSessionId] = useState<string | null>(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspace?.id ?? null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const activeSelectedSessionId = selectedSessionId ?? internalSelectedSessionId
  const selectedSession = useMemo(
    () => sessions.find(s => s.id === activeSelectedSessionId) ?? null,
    [activeSelectedSessionId, sessions],
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
  const templateOptions = useMemo(
    () => templates.map(template => ({
      description: template.description ?? template.outputKind ?? template.id,
      label: template.name ?? template.id,
      value: template.id,
    })),
    [templates],
  )

  useEffect(() => {
    if (templates.length === 0) {
      setSelectedTemplateId(undefined)
      return
    }
    setSelectedTemplateId(current => templates.some(template => template.id === current) ? current : undefined)
  }, [templates])

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

  async function handleCreateSession(workspaceId: string, draft: ManagedSessionComposerDraft) {
    const input = draft.text.trim()
    if (!input && draft.materials.length === 0)
      return
    await onCreateSession(workspaceId, {
      input,
      materials: draft.materials,
      mentions: draft.mentions,
      selectedTemplateId: draft.selectedTemplateId,
    })
  }

  async function handleSubmitTurn(draft: ManagedSessionComposerDraft) {
    const input = draft.text.trim()
    if (!input && draft.materials.length === 0)
      return
    await onSubmitTurn({
      input,
      materials: draft.materials,
      mentions: draft.mentions,
    })
  }

  return (
    <div className="flex h-full min-h-0" data-slot="universal-workbench">
      {!sidebarCollapsed && (
        <aside className="w-56 min-w-0 flex-shrink-0 overflow-y-auto border-r p-3" data-slot="workbench-sidebar">
          <div className="mb-3 flex items-center justify-between gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</span>
            <div className="flex items-center gap-0.5">
              <Button
                aria-label="Create workspace"
                className="size-6"
                size="icon"
                type="button"
                variant="ghost"
                onClick={onCreateWorkspace}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
              </Button>
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
          </div>
          <WorkspaceSessionTree
            nodes={treeNodes}
            selectedNodeId={selectedSession?.id ?? selectedWorkspace?.id ?? null}
            onCreateSession={() => {
              if (!selectedWorkspace)
                return
              setSelectedWorkspaceId(selectedWorkspace.id)
              setInternalSelectedSessionId(null)
              onSelectSession?.(null)
            }}
            onSelectNode={(node) => {
              if (node.kind === 'session') {
                setInternalSelectedSessionId(node.sessionId ?? null)
                onSelectSession?.(node.sessionId ?? null)
              }
              else {
                setSelectedWorkspaceId(node.workspaceId)
                setInternalSelectedSessionId(null)
                onSelectSession?.(null)
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
                onBackToWorkspace={() => {
                  setInternalSelectedSessionId(null)
                  onBackToWorkspace()
                  onSelectSession?.(null)
                }}
                onRefresh={onRefresh}
                onToggleDetailDrawer={() => setDetailDrawerOpen(v => !v)}
                onSubmitTurn={handleSubmitTurn}
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
                  <ManagedSessionComposer
                    ariaLabel="New session input"
                    attachmentLabels={{
                      add: 'Add source materials',
                      attached: 'Attached source materials',
                      closePreview: name => `Close preview for ${name}`,
                      materialReadError: 'Failed to read source material.',
                      preview: (name: string) => `Preview ${name}`,
                      remove: (name: string) => `Remove ${name}`,
                    }}
                    className="w-full max-w-xl"
                    disabled={!engineReadiness.ready}
                    disabledReason={engineReadiness.ready
                      ? templates.length === 0 ? 'No capability templates are available for this Soul worker.' : undefined
                      : engineReadiness.detail}
                    onTemplateChange={setSelectedTemplateId}
                    placeholder="What do you want to work on?"
                    selectedTemplateId={selectedTemplateId}
                    submitAriaLabel="Start"
                    submitDisabled={!engineReadiness.ready || templates.length === 0 || !selectedTemplateId}
                    submitting={turnSubmitting}
                    templateLabel="Capability/template"
                    templateOptions={templateOptions}
                    variant="large"
                    onSubmitDraft={draft => handleCreateSession(selectedWorkspace.id, draft)}
                  />
                </div>
              )
            : workspaces.length === 0
              ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Empty className="min-h-42 items-start justify-center p-4">
                      <EmptyHeader>
                        <EmptyTitle>No workspaces yet</EmptyTitle>
                        <EmptyDescription>Create your first workspace to get started.</EmptyDescription>
                      </EmptyHeader>
                      <Button type="button" variant="ghost" size="lg" onClick={onCreateWorkspace}>
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                        Create workspace
                      </Button>
                    </Empty>
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
        onSubmitTurn={handleSubmitTurn}
        onTurnInputChange={onTurnInputChange}
      />
    </div>
  )
}
