import type { LocalSession, LocalWorkerOverlayAsset, LocalWorkspace } from '@zonease/aiworker-soul-descriptor'
import type { FormEvent } from 'react'
import type { LocalWorkspaceData } from '../features/local-workspace/api/types'
import type { SettingsSection } from '../features/settings'
import type { ChatComposerLabels } from './studio/chat/chat-composer'
import type { WorkerStudioLocatorState } from './studio/locator'

import { Add01Icon, FolderLibraryIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Button } from '@zonease/aiworker-ui/components/button'
import { CardContent } from '@zonease/aiworker-ui/components/card'
import { ItemTitle } from '@zonease/aiworker-ui/components/item'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { navigateWorkerRoute, useWorkerRoute } from '../app/router/worker-route'
import {
  displaySoul,
  messagesFor,
  normalizeLocale,
} from '../features/i18n'
import {
  createSession,
  createWorkspace,
  loadLocalWorkspaceData,
  loadWorkerOverlay,
  saveWorkerOverlayConfigValues,
} from '../features/local-workspace/api'
import { CreateWorkspaceDialog } from '../features/local-workspace/components'
import { projectNamePlaceholder } from '../features/local-workspace/model'
import { SettingsDialog } from '../features/settings'
import { resolveTheme, useSystemTheme } from '../features/theme/system-theme'
import { StudioChromeHeader, StudioEmptyState, StudioMainFrame, StudioTitleBlock, WorkerStudioLayout } from './components/studio-shell'
import { ChatSurface } from './studio/chat/chat-surface'
import { WorkerStudioTopBar } from './studio/host-chrome'
import { deriveWorkerStudioLocatorState } from './studio/locator'
import { WorkspaceTree } from './studio/workspace-tree'
import { WorkerConfigurationDialog } from './worker-configuration-dialog'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

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

export function WorkerStudio() {
  const route = useWorkerRoute()
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [workspaceTitle, setWorkspaceTitle] = useState('')
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution')
  const [workerConfigurationOpen, setWorkerConfigurationOpen] = useState(false)
  const [workerOverlayAssets, dispatchWorkerOverlayAssets] = useReducer(workerOverlayAssetsReducer, [])
  const [submitting, setSubmitting] = useState(false)

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
      ? data.workspaces.filter(workspace => workspace.workerId === selectedWorker.id)
      : [],
    [data, selectedWorker],
  )
  const selectedWorkerOverlayId = selectedWorker?.id ?? null
  const sessionsForWorkspace = useCallback(
    (workspace: LocalWorkspace) => allSessions
      .filter(session => session.workspaceId === workspace.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [allSessions],
  )

  const selectedSoulCopy = selectedSoul ? displaySoul(selectedSoul, activeLocale) : null
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

  async function submitWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data || !selectedSoul || !selectedWorker || !workspaceTitle.trim())
      return
    setSubmitting(true)
    try {
      const workspaceResult = await createWorkspace(selectedWorker.id, {
        metadata: { soulId: selectedSoul.id },
        name: workspaceTitle.trim(),
      })
      setWorkspaceTitle('')
      setCreateWorkspaceOpen(false)
      await refresh()
      navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorker.id, workspaceId: workspaceResult.workspace.id })
    }
    finally {
      setSubmitting(false)
    }
  }

  const startSession = useCallback(async (workspace: LocalWorkspace) => {
    if (!selectedWorker)
      return
    const nextIndex = allSessions.filter(session => session.workspaceId === workspace.id).length + 1
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
  }, [allSessions, copy.workspace.newSession, refresh, selectedWorker])

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
            {selectedSoul
              ? (
                  <CreateWorkspaceDialog
                    copy={copy}
                    open={createWorkspaceOpen}
                    placeholder={projectNamePlaceholder(selectedSoul.id, copy)}
                    workerLabel={selectedWorker ? `${selectedWorker.name} / ${selectedSoulCopy?.name ?? selectedSoul.id}` : ''}
                    submitting={submitting}
                    workspaceTitle={workspaceTitle}
                    onClose={() => setCreateWorkspaceOpen(false)}
                    onSubmit={submitWorkspace}
                    onTitleChange={setWorkspaceTitle}
                  />
                )
              : null}

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
          </>
        )}
        mainLabel={copy.accessibility.soulProjectsAndArtifacts}
        resolvedTheme={resolvedTheme}
        sidebarCollapsed={sidebarCollapsed}
        sidebarLabel={copy.workspace.workspaceList}
        variant={layoutVariant}
        sidebar={(
          <WorkspaceTree
            emptyWorkspacesLabel={copy.projects.empty.title}
            newSessionLabel={copy.workspace.newSession}
            newWorkspaceLabel={copy.workspace.newWorkspace}
            noSessionsLabel={copy.workspace.noWorkspaceSessions}
            selectedSessionId={selectedSession?.id ?? null}
            selectedWorkspaceId={selectedWorkspace?.id ?? null}
            sessionsForWorkspace={sessionsForWorkspace}
            title={copy.workspace.workspaceList}
            workspaces={workspaces}
            onCreateSession={workspace => void startSession(workspace)}
            onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
            onSelectSession={selectSession}
          />
        )}
        main={(
          <WorkbenchMain
            copy={copy}
            composerLabels={composerLabels}
            hasWorkspaces={workspaces.length > 0}
            isWorkspaceContextRoute={isWorkspaceContextRoute}
            selectedSession={selectedSession ?? (selectedWorkspace ? sessionsForWorkspace(selectedWorkspace)[0] ?? null : null)}
            selectedSoulName={selectedSoulCopy?.name ?? selectedSoul?.id ?? copy.app.brand}
            selectedWorkspace={selectedWorkspace}
            onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
            onStartSession={() => {
              if (selectedWorkspace)
                void startSession(selectedWorkspace)
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
  hasWorkspaces,
  isWorkspaceContextRoute,
  onCreateWorkspace,
  onStartSession,
  selectedSession,
  selectedSoulName,
  selectedWorkspace,
}: {
  composerLabels: ChatComposerLabels
  copy: ReturnType<typeof messagesFor>
  hasWorkspaces: boolean
  isWorkspaceContextRoute: boolean
  onCreateWorkspace: () => void
  onStartSession: () => void
  selectedSession: LocalSession | null
  selectedSoulName: string
  selectedWorkspace: LocalWorkspace | null
}) {
  if (isWorkspaceContextRoute && selectedSession) {
    return (
      <>
        <StudioChromeHeader>
          <StudioTitleBlock kicker={copy.workspace.currentSession} title={selectedSession.title} />
        </StudioChromeHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-7 py-4 max-md:px-4">
          <ChatSurface
            key={selectedSession.id}
            composerLabels={composerLabels}
            sessionId={selectedSession.id}
            transcriptAriaLabel={copy.workspace.eventStream}
          />
        </CardContent>
      </>
    )
  }

  if (isWorkspaceContextRoute && selectedWorkspace) {
    return (
      <StudioMainFrame kicker={copy.workspace.currentWorkspace} title={selectedWorkspace.name}>
        <StudioEmptyState
          title={copy.workspace.noWorkspaceSessions}
          detail={copy.workspace.createSessionPrompt(selectedWorkspace.name)}
          action={(
            <Button type="button" variant="ghost" size="lg" onClick={onStartSession}>
              {copy.workspace.newSession}
            </Button>
          )}
        />
      </StudioMainFrame>
    )
  }

  return (
    <StudioMainFrame kicker={copy.app.workspacePill} title={copy.workspace.workspaceList}>
      <StudioEmptyState
        className={hasWorkspaces ? undefined : 'mx-auto min-h-[min(28rem,60vh)] w-full max-w-xl items-center text-center'}
        icon={hasWorkspaces ? undefined : <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} aria-hidden="true" />}
        title={hasWorkspaces ? copy.workspace.noSelectionTitle : copy.projects.empty.title}
        detail={hasWorkspaces ? copy.workspace.noSelectionDetail : copy.projects.empty.detail(selectedSoulName)}
        action={hasWorkspaces
          ? null
          : (
              <Button type="button" size="lg" onClick={onCreateWorkspace}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                {copy.workspace.createWorkspace}
              </Button>
            )}
      />
    </StudioMainFrame>
  )
}
