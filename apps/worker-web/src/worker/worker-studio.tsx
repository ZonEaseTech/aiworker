import type { LocalSession, LocalWorkerOverlayAsset, LocalWorkspace } from '@zonease/aiworker-soul-descriptor'
import type { FormEvent } from 'react'
import type { LocalWorkspaceData } from '../features/local-workspace/api/types'
import type { SettingsSection } from '../features/settings'
import type { ChatComposerLabels } from './studio/chat/chat-composer'
import type { WorkerStudioLocatorState } from './studio/locator'

import { Add01Icon, Archive01Icon, FolderLibraryIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Button } from '@zonease/aiworker-ui/components/button'
import { CardContent } from '@zonease/aiworker-ui/components/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@zonease/aiworker-ui/components/dialog'
import { ItemTitle } from '@zonease/aiworker-ui/components/item'
import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/managed-session-composer'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { navigateWorkerRoute, useWorkerRoute } from '../app/router/worker-route'
import {
  displaySoul,
  messagesFor,
  normalizeLocale,
} from '../features/i18n'
import {
  archiveSession,
  archiveWorkspace,
  createSession,
  createWorker,
  createWorkspace,
  loadLocalWorkspaceData,
  loadWorkerOverlay,
  saveWorkerOverlayConfigValues,
  submitSessionInvocation,
} from '../features/local-workspace/api'
import { CreateWorkerDialog, CreateWorkspaceDialog } from '../features/local-workspace/components'
import { projectNamePlaceholder } from '../features/local-workspace/model'
import { SettingsDialog } from '../features/settings'
import { resolveTheme, useSystemTheme } from '../features/theme/system-theme'
import { StudioChromeHeader, StudioEmptyState, StudioMainFrame, StudioTitleBlock, WorkerStudioLayout } from './components/studio-shell'
import { ChatSurface } from './studio/chat/chat-surface'
import { sessionDraftToInvocationInput } from './studio/chat/session-draft-input'
import { WorkerStudioTopBar } from './studio/host-chrome'
import { deriveWorkerStudioLocatorState } from './studio/locator'
import { WorkspaceTree } from './studio/workspace-tree'
import { WorkerConfigurationDialog } from './worker-configuration-dialog'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

interface InitialChatSubmission {
  invocationId: string
  sessionId: string
  text: string
}

type PendingArchiveAction
  = | { kind: 'session', label: string, sessionId: string, workerId: string, workspaceId: string }
    | { kind: 'workspace', label: string, workerId: string, workspaceId: string }

type WorkerStudioResolvedLocatorState = Omit<WorkerStudioLocatorState, 'soulSessions' | 'soulWorkspaces'>

const emptyWorkerStudioLocatorState: WorkerStudioResolvedLocatorState = {
  allSessions: [],
  filteredWorkspaces: [],
  isWorkspaceContextRoute: false,
  selectableWorkers: [],
  selectedSession: null,
  selectedSoul: null,
  selectedSoulApp: null,
  selectedWorker: null,
  selectedWorkspace: null,
}

function workerOverlayAssetsReducer(
  _current: LocalWorkerOverlayAsset[],
  assets: LocalWorkerOverlayAsset[],
): LocalWorkerOverlayAsset[] {
  return assets
}

function archiveActionLabel(copy: ReturnType<typeof messagesFor>, kind: PendingArchiveAction['kind']): string {
  if (kind === 'session')
    return copy.workspace.archiveSession
  return copy.workspace.archiveWorkspace
}

function archiveConfirmationTitle(copy: ReturnType<typeof messagesFor>, kind: PendingArchiveAction['kind']): string {
  return copy.workspace.archiveConfirmation[kind].title
}

export function WorkerStudio() {
  const route = useWorkerRoute()
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [workerName, setWorkerName] = useState('')
  const [newWorkerSoulId, setNewWorkerSoulId] = useState('')
  const [createWorkerOpen, setCreateWorkerOpen] = useState(false)
  const [workspaceWorker, setWorkspaceWorker] = useState<LocalWorkspaceData['workers'][number] | null>(null)
  const [workspaceTitle, setWorkspaceTitle] = useState('')
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution')
  const [workerConfigurationOpen, setWorkerConfigurationOpen] = useState(false)
  const [workerOverlayAssets, dispatchWorkerOverlayAssets] = useReducer(workerOverlayAssetsReducer, [])
  const [submitting, setSubmitting] = useState(false)
  const [initialSessionSubmission, setInitialSessionSubmission] = useState<InitialChatSubmission | null>(null)
  const [pendingArchive, setPendingArchive] = useState<PendingArchiveAction | null>(null)

  const refresh = useCallback(async (): Promise<LocalWorkspaceData | null> => {
    setState(current => ({ ...current, loading: true, error: null }))
    try {
      const data = await loadLocalWorkspaceData()
      setState({ data, error: null, loading: false })
      return data
    }
    catch (error) {
      setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false })
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const data = state.data
  const activeLocale = normalizeLocale(data?.settings.language)
  const copy = messagesFor(activeLocale)
  const locatorState = useMemo(
    () => data
      ? deriveWorkerStudioLocatorState({ data, route })
      : null,
    [data, route],
  )
  const {
    allSessions,
    isWorkspaceContextRoute,
    selectedSession,
    selectedSoul,
    selectedWorker,
    selectedWorkspace,
  } = locatorState ?? emptyWorkerStudioLocatorState
  const workspaces = useMemo(
    () => data && selectedWorker
      ? data.workspaces.filter(workspace => workspace.workerId === selectedWorker.id && workspace.status === 'active')
      : [],
    [data, selectedWorker],
  )
  const selectedWorkerOverlayId = selectedWorker?.id ?? null
  const sessionsForWorkspace = useCallback(
    (workspace: LocalWorkspace) => allSessions
      .filter(session => session.workspaceId === workspace.id && session.status === 'active')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [allSessions],
  )

  useEffect(() => {
    if (route.kind !== 'session' || !selectedWorkspace || selectedSession)
      return
    navigateWorkerRoute({
      kind: 'workspace',
      workerId: selectedWorkspace.workerId,
      workspaceId: selectedWorkspace.id,
    }, { replace: true })
  }, [route.kind, selectedSession, selectedWorkspace])

  const availableSouls = useMemo(
    () => data?.souls.filter(soul => soul.status === 'available') ?? [],
    [data],
  )
  const selectedNewWorkerSoulId = newWorkerSoulId || selectedSoul?.id || availableSouls[0]?.id || ''
  const workspaceTargetWorker = selectedWorker ?? workspaceWorker
  const workspaceTargetSoul = workspaceTargetWorker
    ? data?.souls.find(soul => soul.id === workspaceTargetWorker.appId) ?? selectedSoul
    : selectedSoul
  const selectedSoulCopy = selectedSoul ? displaySoul(selectedSoul, activeLocale) : null
  const workspaceTargetSoulCopy = workspaceTargetSoul ? displaySoul(workspaceTargetSoul, activeLocale) : null
  const topBarTitle = selectedSoulCopy?.name ?? copy.app.brand
  const systemTheme = useSystemTheme()
  const appearance = data?.settings.appearance ?? 'system'
  const resolvedTheme = resolveTheme(appearance, systemTheme)

  useEffect(() => {
    document.documentElement.lang = activeLocale
  }, [activeLocale])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    let cancelled = false
    if (!selectedWorkerOverlayId) {
      dispatchWorkerOverlayAssets([])
      return
    }
    loadWorkerOverlay(selectedWorkerOverlayId)
      .then((result) => {
        if (!cancelled)
          dispatchWorkerOverlayAssets(result.overlay.assets)
      })
      .catch(() => {
        if (!cancelled)
          dispatchWorkerOverlayAssets([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedWorkerOverlayId])

  function openSettings(section: SettingsSection = 'execution') {
    setSettingsInitialSection(section)
    setSettingsOpen(true)
  }

  function openWorkspaceCreation() {
    if (workspaceTargetWorker)
      setCreateWorkspaceOpen(true)
    else
      setCreateWorkerOpen(true)
  }

  async function saveWorkerOverlayAssets(assets: LocalWorkerOverlayAsset[]) {
    if (!selectedWorker)
      return
    const previousOverlayAssets = workerOverlayAssets.filter(asset => asset.source !== 'baseline')
    dispatchWorkerOverlayAssets(assets)
    const overlayOnly = assets.filter(asset => asset.source !== 'baseline')
    await saveWorkerOverlayConfigValues(selectedWorker.id, previousOverlayAssets, overlayOnly)
    const result = await loadWorkerOverlay(selectedWorker.id)
    dispatchWorkerOverlayAssets(result.overlay.assets)
  }

  async function reloadWorkerOverlayAssets() {
    if (!selectedWorker)
      return
    const result = await loadWorkerOverlay(selectedWorker.id)
    dispatchWorkerOverlayAssets(result.overlay.assets)
  }

  const selectSession = useCallback((workspace: LocalWorkspace, session: LocalSession) => {
    navigateWorkerRoute({
      kind: 'session',
      sessionId: session.id,
      workerId: workspace.workerId,
      workspaceId: workspace.id,
    })
  }, [])

  async function submitWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const appId = selectedNewWorkerSoulId
    if (!data || !appId || !workerName.trim())
      return
    setSubmitting(true)
    try {
      const result = await createWorker({
        appId,
        name: workerName.trim(),
      })
      setWorkerName('')
      setWorkspaceWorker(result.worker)
      setCreateWorkerOpen(false)
      await refresh()
      navigateWorkerRoute({ kind: 'worker', workerId: result.worker.id })
      setCreateWorkspaceOpen(true)
    }
    finally {
      setSubmitting(false)
    }
  }

  async function submitWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const worker = workspaceTargetWorker
    const soul = workspaceTargetSoul
    if (!data || !soul || !worker || !workspaceTitle.trim())
      return
    setSubmitting(true)
    try {
      const workspaceResult = await createWorkspace(worker.id, {
        metadata: { soulId: soul.id },
        name: workspaceTitle.trim(),
      })
      setWorkspaceTitle('')
      setWorkspaceWorker(null)
      setCreateWorkspaceOpen(false)
      await refresh()
      navigateWorkerRoute({ kind: 'workspace', workerId: worker.id, workspaceId: workspaceResult.workspace.id })
    }
    finally {
      setSubmitting(false)
    }
  }

  const startSession = useCallback(async (workspace: LocalWorkspace) => {
    if (!selectedWorker)
      return
    const nextIndex = sessionsForWorkspace(workspace).length + 1
    const result = await createSession({
      title: `${copy.workspace.newSession} ${nextIndex}`,
      workerId: workspace.workerId,
      workspaceId: workspace.id,
    })
    await refresh()
    navigateWorkerRoute({
      kind: 'session',
      sessionId: result.session.id,
      workerId: workspace.workerId,
      workspaceId: workspace.id,
    })
  }, [copy.workspace.newSession, refresh, selectedWorker, sessionsForWorkspace])

  const startSessionWithInput = useCallback(async (workspace: LocalWorkspace, input: string) => {
    if (!selectedWorker)
      return
    const trimmed = input.trim()
    if (trimmed.length === 0)
      return
    const nextIndex = sessionsForWorkspace(workspace).length + 1
    const sessionResult = await createSession({
      title: `${copy.workspace.newSession} ${nextIndex}`,
      workerId: workspace.workerId,
      workspaceId: workspace.id,
    })
    const invocationResult = await submitSessionInvocation(sessionResult.session.id, { input: trimmed, waitForCompletion: false })
    setInitialSessionSubmission({
      invocationId: invocationResult.invocation.id,
      sessionId: sessionResult.session.id,
      text: trimmed,
    })
    await refresh()
    navigateWorkerRoute({
      kind: 'session',
      sessionId: sessionResult.session.id,
      workerId: workspace.workerId,
      workspaceId: workspace.id,
    })
  }, [copy.workspace.newSession, refresh, selectedWorker, sessionsForWorkspace])

  const displayedSession = useMemo(
    () => route.kind === 'session'
      ? selectedSession
      : selectedSession ?? (selectedWorkspace ? sessionsForWorkspace(selectedWorkspace)[0] ?? null : null),
    [route.kind, selectedSession, selectedWorkspace, sessionsForWorkspace],
  )

  const requestArchiveSelectedWorkspace = useCallback(() => {
    if (!selectedWorkspace || !selectedWorker)
      return
    setPendingArchive({
      kind: 'workspace',
      label: selectedWorkspace.name,
      workerId: selectedWorker.id,
      workspaceId: selectedWorkspace.id,
    })
  }, [selectedWorker, selectedWorkspace])

  const requestArchiveSelectedSession = useCallback(() => {
    if (!displayedSession || !selectedWorkspace)
      return
    setPendingArchive({
      kind: 'session',
      label: displayedSession.title,
      sessionId: displayedSession.id,
      workerId: selectedWorkspace.workerId,
      workspaceId: selectedWorkspace.id,
    })
  }, [displayedSession, selectedWorkspace])

  const confirmPendingArchive = useCallback(async () => {
    const action = pendingArchive
    if (!action)
      return
    setPendingArchive(null)
    if (action.kind === 'workspace') {
      await archiveWorkspace(action.workspaceId)
      navigateWorkerRoute({ kind: 'worker', workerId: action.workerId })
      await refresh()
      return
    }
    await archiveSession(action.sessionId)
    navigateWorkerRoute({
      kind: 'workspace',
      workerId: action.workerId,
      workspaceId: action.workspaceId,
    })
    await refresh()
  }, [pendingArchive, refresh])

  const composerLabels: ChatComposerLabels = useMemo(() => ({
    ariaLabel: copy.workspace.createSessionPlaceholder,
    attachment: {
      add: copy.workspace.addSourceMaterials,
      attached: copy.workspace.attachedSourceMaterials,
      closePreview: () => copy.workspace.closeSourceMaterialPreview,
      materialReadError: copy.workspace.materialReadError,
      preview: copy.workspace.previewSourceMaterial,
      remove: copy.workspace.removeSourceMaterial,
    },
    placeholder: copy.workspace.createSessionPlaceholder,
    submitAriaLabel: copy.workspace.sendInvocation,
  }), [copy])

  if (state.loading && !data) {
    return (
      <main className="grid min-h-screen place-items-center" data-slot="app-shell" data-appearance={appearance} data-theme={resolvedTheme}>
        <ItemTitle>{copy.app.loading}</ItemTitle>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="grid min-h-screen place-items-center" data-slot="app-shell" data-appearance={appearance} data-theme={resolvedTheme}>
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      </main>
    )
  }

  if (!data)
    return null

  const layoutVariant = route.kind === 'session' && selectedSession ? 'session' : 'workspace'

  return (
    <>
      <WorkerStudioLayout
        appearance={appearance}
        header={(
          <WorkerStudioTopBar
            configureLabel={copy.workspace.configure}
            settingsLabel={copy.accessibility.openSettings}
            sidebarCollapsed={sidebarCollapsed}
            title={topBarTitle}
            onConfigureWorker={selectedWorker ? () => setWorkerConfigurationOpen(true) : undefined}
            onOpenSettings={() => openSettings('execution')}
            onToggleSidebar={() => setSidebarCollapsed(current => !current)}
          />
        )}
        dialogs={(
          <>
            {workspaceTargetSoul
              ? (
                  <CreateWorkspaceDialog
                    copy={copy}
                    open={createWorkspaceOpen}
                    placeholder={projectNamePlaceholder(workspaceTargetSoul.id, copy)}
                    workerLabel={workspaceTargetWorker ? `${workspaceTargetWorker.name} / ${workspaceTargetSoulCopy?.name ?? workspaceTargetSoul.id}` : ''}
                    submitting={submitting}
                    workspaceTitle={workspaceTitle}
                    onClose={() => {
                      setWorkspaceWorker(null)
                      setCreateWorkspaceOpen(false)
                    }}
                    onSubmit={submitWorkspace}
                    onTitleChange={setWorkspaceTitle}
                  />
                )
              : null}

            <CreateWorkerDialog
              availableSouls={availableSouls}
              copy={copy}
              locale={activeLocale}
              open={createWorkerOpen}
              selectedSoulId={selectedNewWorkerSoulId}
              workerName={workerName}
              onClose={() => setCreateWorkerOpen(false)}
              onNameChange={setWorkerName}
              onSoulChange={setNewWorkerSoulId}
              onSubmit={submitWorker}
            />

            {settingsOpen
              ? (
                  <SettingsDialog
                    initial={data.settings}
                    initialSection={settingsInitialSection}
                    apps={data.apps}
                    runtimeVersion={data.info.runtimeVersion}
                    onClose={() => setSettingsOpen(false)}
                    onSaved={(settings) => {
                      setState(current => current.data
                        ? { ...current, data: { ...current.data, settings }, loading: false }
                        : current)
                    }}
                    onAppsChanged={() => void refresh()}
                  />
                )
              : null}

            <Dialog open={pendingArchive !== null} onOpenChange={open => !open && setPendingArchive(null)}>
              {pendingArchive
                ? (
                    <DialogContent closeButtonLabel={copy.accessibility.closeDialog}>
                      <DialogHeader>
                        <DialogTitle>{archiveConfirmationTitle(copy, pendingArchive.kind)}</DialogTitle>
                        <DialogDescription>
                          {copy.workspace.archiveConfirmation[pendingArchive.kind].detail(pendingArchive.label)}
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button type="button" variant="outline">
                            {copy.workspace.archiveConfirmation.cancel}
                          </Button>
                        </DialogClose>
                        <Button type="button" variant="destructive" onClick={() => void confirmPendingArchive()}>
                          {archiveActionLabel(copy, pendingArchive.kind)}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  )
                : null}
            </Dialog>
          </>
        )}
        mainLabel={copy.accessibility.soulProjectsAndArtifacts}
        resolvedTheme={resolvedTheme}
        sidebarCollapsed={sidebarCollapsed}
        sidebarLabel={copy.workspace.workspaceList}
        variant={layoutVariant}
        sidebar={(
          <WorkspaceTree
            archiveWorkspaceLabel={copy.workspace.archiveWorkspace}
            emptyWorkspacesLabel={copy.projects.empty.title}
            newSessionLabel={copy.workspace.newSession}
            newWorkspaceLabel={selectedWorker ? copy.workspace.newWorkspace : copy.workspace.createWorker}
            noSessionsLabel={copy.workspace.noWorkspaceSessions}
            selectedSessionId={selectedSession?.id ?? null}
            selectedWorkspaceId={selectedWorkspace?.id ?? null}
            sessionsForWorkspace={sessionsForWorkspace}
            title={copy.workspace.workspaceList}
            workspaces={workspaces}
            onArchiveWorkspace={(workspace) => {
              setPendingArchive({
                kind: 'workspace',
                label: workspace.name,
                workerId: workspace.workerId,
                workspaceId: workspace.id,
              })
            }}
            onCreateSession={workspace => void startSession(workspace)}
            onCreateWorkspace={openWorkspaceCreation}
            onSelectSession={selectSession}
          />
        )}
        main={(
          <WorkbenchMain
            copy={copy}
            composerLabels={composerLabels}
            hasWorker={Boolean(selectedWorker)}
            hasWorkspaces={workspaces.length > 0}
            isWorkspaceContextRoute={isWorkspaceContextRoute}
            initialSessionSubmission={initialSessionSubmission}
            onArchiveSession={requestArchiveSelectedSession}
            onArchiveWorkspace={requestArchiveSelectedWorkspace}
            selectedSession={displayedSession}
            selectedSoulName={selectedSoulCopy?.name ?? selectedSoul?.id ?? copy.app.brand}
            selectedWorkspace={selectedWorkspace}
            onCreateWorkspace={openWorkspaceCreation}
            onStartSessionWithInput={(input) => {
              if (!selectedWorkspace)
                return undefined
              return startSessionWithInput(selectedWorkspace, input)
            }}
          />
        )}
      />
      <WorkerConfigurationDialog
        activeWorkbenchTabId={null}
        assets={workerOverlayAssets}
        copy={copy}
        open={workerConfigurationOpen}
        worker={selectedWorker}
        workbenchTabs={[]}
        onOpenChange={setWorkerConfigurationOpen}
        onReload={reloadWorkerOverlayAssets}
        onSaveAssets={saveWorkerOverlayAssets}
        onSelectWorkbenchTab={() => {}}
      />
    </>
  )
}

function WorkbenchMain({
  composerLabels,
  copy,
  hasWorker,
  hasWorkspaces,
  initialSessionSubmission,
  isWorkspaceContextRoute,
  onArchiveSession,
  onArchiveWorkspace,
  onCreateWorkspace,
  onStartSessionWithInput,
  selectedSession,
  selectedSoulName,
  selectedWorkspace,
}: {
  composerLabels: ChatComposerLabels
  copy: ReturnType<typeof messagesFor>
  hasWorker: boolean
  hasWorkspaces: boolean
  initialSessionSubmission: InitialChatSubmission | null
  isWorkspaceContextRoute: boolean
  onArchiveSession: () => void
  onArchiveWorkspace: () => void
  onCreateWorkspace: () => void
  onStartSessionWithInput: (input: string) => Promise<void> | void
  selectedSession: LocalSession | null
  selectedSoulName: string
  selectedWorkspace: LocalWorkspace | null
}) {
  if (isWorkspaceContextRoute && selectedSession) {
    return (
      <>
        <StudioChromeHeader
          actions={(
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={copy.workspace.archiveWorkspace}
                title={copy.workspace.archiveWorkspace}
                onClick={onArchiveWorkspace}
              >
                <HugeiconsIcon icon={Archive01Icon} strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={copy.workspace.archiveSession}
                title={copy.workspace.archiveSession}
                onClick={onArchiveSession}
              >
                <HugeiconsIcon icon={Archive01Icon} strokeWidth={2} aria-hidden="true" />
              </Button>
            </>
          )}
        >
          <StudioTitleBlock kicker={copy.workspace.currentSession} title={selectedSession.title} />
        </StudioChromeHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-7 py-4 max-md:px-4">
          <ChatSurface
            key={selectedSession.id}
            composerLabels={composerLabels}
            initialActive={initialSessionSubmission?.sessionId === selectedSession.id ? initialSessionSubmission : null}
            sessionId={selectedSession.id}
            transcriptAriaLabel={copy.workspace.eventStream}
          />
        </CardContent>
      </>
    )
  }

  if (isWorkspaceContextRoute && selectedWorkspace) {
    return (
      <>
        <StudioChromeHeader
          actions={(
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={copy.workspace.archiveWorkspace}
              title={copy.workspace.archiveWorkspace}
              onClick={onArchiveWorkspace}
            >
              <HugeiconsIcon icon={Archive01Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
          )}
        >
          <StudioTitleBlock kicker={copy.workspace.currentWorkspace} title={selectedWorkspace.name} />
        </StudioChromeHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-7 py-4 max-md:px-4">
          <div
            className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto"
            data-workspace-empty-chat-entry="true"
          >
            <div
              className="mx-auto flex w-full max-w-3xl flex-col gap-4"
              data-workspace-empty-chat-column="true"
            >
              <StudioEmptyState
                className="mx-auto max-w-xl items-center text-center"
                icon={<HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />}
                title={copy.workspace.noWorkspaceSessions}
                detail={copy.workspace.createSessionPrompt(selectedWorkspace.name)}
              />
              <InitialWorkspaceComposer labels={composerLabels} onSubmit={onStartSessionWithInput} />
            </div>
          </div>
        </CardContent>
      </>
    )
  }

  return (
    <StudioMainFrame kicker={copy.app.workspacePill} title={copy.workspace.workspaceList}>
      <StudioEmptyState
        className={hasWorkspaces ? undefined : 'mx-auto min-h-[min(28rem,60vh)] w-full max-w-xl items-center text-center'}
        icon={<HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} aria-hidden="true" />}
        title={hasWorkspaces ? copy.workspace.noSelectionTitle : copy.projects.empty.title}
        detail={hasWorkspaces
          ? copy.workspace.noSelectionDetail
          : hasWorker ? copy.projects.empty.detail(selectedSoulName) : copy.workspace.createWorkerHint}
        action={hasWorkspaces
          ? (
              <Button type="button" size="lg" onClick={onCreateWorkspace}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                {copy.workspace.newWorkspace}
              </Button>
            )
          : (
              <Button type="button" size="lg" onClick={onCreateWorkspace}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                {hasWorker ? copy.workspace.createWorkspace : copy.workspace.createWorker}
              </Button>
            )}
      />
    </StudioMainFrame>
  )
}

function InitialWorkspaceComposer({
  labels,
  onSubmit,
}: {
  labels: ChatComposerLabels
  onSubmit: (input: string) => Promise<void> | void
}) {
  return (
    <ManagedSessionComposer
      ariaLabel={labels.ariaLabel}
      attachmentLabels={labels.attachment}
      placeholder={labels.placeholder}
      submitAriaLabel={labels.submitAriaLabel}
      onSubmitDraft={async (draft) => {
        const input = sessionDraftToInvocationInput(draft)
        if (input.length === 0)
          return
        await onSubmit(input)
      }}
    />
  )
}
