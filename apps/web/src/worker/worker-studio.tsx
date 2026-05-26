import type {
  HostedSoulApp,
  LocalWorkerOverlayAsset,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { LocalWorkspaceData } from '../features/local-workspace/api/types'
import type { SettingsSection } from '../features/settings'
import type { WorkerStudioLayoutVariant } from './components/studio-shell'
import type { WorkerStudioLocatorState } from './studio/locator'

import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { navigateWorkerRoute, useWorkerRoute } from '../app/router/worker-route'
import {
  displaySoul,
  messagesFor,
  normalizeLocale,
} from '../features/i18n'
import { createWorker, createWorkspace, loadLocalWorkspaceData, loadWorkerOverlay, saveWorkerOverlay } from '../features/local-workspace/api'
import { CreateWorkerDialog, CreateWorkspaceDialog } from '../features/local-workspace/components'
import { projectNamePlaceholder } from '../features/local-workspace/model'
import { SettingsDialog } from '../features/settings'
import { resolveTheme, useSystemTheme } from '../features/theme/system-theme'
import { StudioMainFrame, WorkerStudioLayout } from './components/studio-shell'
import { mountedChildDefaultPath } from './mounted-child-route'
import { FirstRunSoulAppHome } from './studio/first-run-soul-app-home'
import { HostSidebarActions, HostSidebarFooter, HostTopBar } from './studio/host-chrome'
import { deriveWorkerStudioLocatorState } from './studio/locator'
import {
  persistActiveMountedRoutePreferences,
  readActiveMountedRoutePreferences,
  resolveActiveMountedRoute,
  updateWorkerMountedRoutePreference,
} from './studio/mounted-route-preferences'
import { MountedSoulAppRouteSurface } from './studio/mounted-surface'
import { WorkerHomeFallback, WorkspaceContextNoMountedSurface } from './studio/workspace-fallback'
import { WorkerConfigurationDialog } from './worker-configuration-dialog'
import { WorkerSwitcher } from './worker-workbench-tree'

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
  templates: [],
}

function microAppWorkbenchRoutes(app: HostedSoulApp | null): HostedSoulApp['manifest']['ui']['routes'] {
  return app?.manifest.ui?.routes?.filter(route => route.surface?.renderer === 'micro-app') ?? []
}

export function WorkerStudio() {
  const route = useWorkerRoute()
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerSoulId, setNewWorkerSoulId] = useState<string | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [workspaceTitle, setWorkspaceTitle] = useState('')
  const [query, setQuery] = useState('')
  const [createWorkerOpen, setCreateWorkerOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution')
  const [workerConfigurationOpen, setWorkerConfigurationOpen] = useState(false)
  const [workerConfigurationWorkerId, setWorkerConfigurationWorkerId] = useState<string | null>(null)
  const [workerOverlayAssets, setWorkerOverlayAssets] = useState<LocalWorkerOverlayAsset[]>([])
  const [submitting, setSubmitting] = useState(false)
  const mountedChildRouteMemoryRef = useRef(new Map<string, string>())
  const refreshRequestSeqRef = useRef(0)

  const refresh = useCallback(async (): Promise<LocalWorkspaceData | null> => {
    const requestSeq = refreshRequestSeqRef.current + 1
    refreshRequestSeqRef.current = requestSeq
    setState(current => ({ ...current, loading: true, error: null }))
    try {
      const data = await loadLocalWorkspaceData()
      if (refreshRequestSeqRef.current !== requestSeq)
        return null
      setState({ data, error: null, loading: false })
      return data
    }
    catch (error) {
      if (refreshRequestSeqRef.current !== requestSeq)
        return null
      setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false })
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const data = state.data
  useEffect(() => {
    if (newWorkerSoulId)
      return
    const firstAvailable = data?.souls.find(soul => soul.status === 'available')
    if (firstAvailable)
      setNewWorkerSoulId(firstAvailable.id)
  }, [data, newWorkerSoulId])
  const activeLocale = normalizeLocale(data?.settings.language)
  const copy = messagesFor(activeLocale)
  const locatorState = useMemo(
    () => data
      ? deriveWorkerStudioLocatorState({
          data,
          newWorkerSoulId,
          query,
          route,
          selectedWorkerId,
          selectedWorkspaceId,
        })
      : null,
    [data, query, route, selectedWorkerId, selectedWorkspaceId, newWorkerSoulId],
  )
  const {
    allSessions,
    filteredWorkspaces: filteredProjects,
    isWorkspaceContextRoute,
    selectableWorkers,
    selectedSession,
    selectedSoul,
    selectedSoulApp,
    selectedWorker,
    selectedWorkspace,
    templates,
  } = locatorState ?? emptyWorkerStudioLocatorState
  const workerConfigurationWorker = workerConfigurationWorkerId
    ? selectableWorkers.find(worker => worker.id === workerConfigurationWorkerId) ?? selectedWorker
    : selectedWorker
  const workerOverlayTarget = workerConfigurationOpen ? workerConfigurationWorker : selectedWorker
  const selectedWorkerOverlayId = workerOverlayTarget?.id ?? null
  const selectWorkspaceLocator = useCallback(async (workerId: string, workspaceId: string): Promise<void> => {
    const nextData = await refresh()
    const selectedWorkspace = nextData?.workspaces.find(workspace => workspace.id === workspaceId && workspace.workerId === workerId)
    if (!selectedWorkspace)
      return
    setSelectedWorkerId(workerId)
    setSelectedWorkspaceId(selectedWorkspace.id)
    navigateWorkerRoute({ kind: 'workspace', workerId, workspaceId: selectedWorkspace.id })
  }, [refresh])
  const soulAppForWorker = useCallback((worker: typeof selectedWorker) => {
    if (!worker)
      return null
    return data?.apps.find(app => app.appId === worker.soulId || app.projectedSoul?.id === worker.soulId) ?? null
  }, [data?.apps])
  const workerConfigurationSoulApp = useMemo(
    () => soulAppForWorker(workerConfigurationWorker),
    [soulAppForWorker, workerConfigurationWorker],
  )
  const selectedMountedRoutes = useMemo(
    () => microAppWorkbenchRoutes(selectedSoulApp),
    [selectedSoulApp],
  )
  const workerConfigurationMountedRoutes = useMemo(
    () => microAppWorkbenchRoutes(workerConfigurationSoulApp),
    [workerConfigurationSoulApp],
  )
  const selectedMountedWorkbenchRoute = selectedMountedRoutes[0] ?? null
  const showMountedWorkbenchRoute = Boolean(selectedSoulApp && selectedMountedWorkbenchRoute)
  const workbenchTabs = useMemo(() => {
    if (workerConfigurationMountedRoutes.length <= 1)
      return []
    return workerConfigurationMountedRoutes
      .map(r => ({ id: r.id, label: r.label, path: mountedChildDefaultPath(r.path) }))
  }, [workerConfigurationMountedRoutes])
  const [activeMountedTabMap, setActiveMountedTabMap] = useState<Record<string, string>>(() => readActiveMountedRoutePreferences())
  const updateActiveMountedTabMap = useCallback((updater: (current: Record<string, string>) => Record<string, string>) => {
    setActiveMountedTabMap((current) => {
      const next = updater(current)
      persistActiveMountedRoutePreferences(next)
      return next
    })
  }, [])
  const activeMountedRoute = useMemo(
    () => resolveActiveMountedRoute({
      preferences: activeMountedTabMap,
      routes: selectedMountedRoutes,
      workerId: selectedWorker?.id ?? null,
    }),
    [activeMountedTabMap, selectedMountedRoutes, selectedWorker?.id],
  )
  const mountedWorkspaceId = activeMountedRoute?.surface?.scope === 'app' && !isWorkspaceContextRoute
    ? null
    : selectedWorkspace?.id ?? null
  const workerConfigurationActiveRouteId = useMemo(() => {
    if (!workerConfigurationWorker)
      return null
    const candidate = activeMountedTabMap[workerConfigurationWorker.id]
    if (candidate && workerConfigurationMountedRoutes.some(route => route.id === candidate))
      return candidate
    return workerConfigurationMountedRoutes[0]?.id ?? null
  }, [activeMountedTabMap, workerConfigurationMountedRoutes, workerConfigurationWorker])

  const enabledSoulApps = useMemo(
    () => data?.apps.filter(app => app.status === 'enabled') ?? [],
    [data?.apps],
  )
  const selectedSoulCopy = selectedSoul ? displaySoul(selectedSoul, activeLocale) : null
  const hostLocatorSegments = selectedWorker && selectedSoulCopy
    ? [selectedSoulCopy.name, selectedWorker.name]
    : [copy.app.brand]
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
      setWorkerOverlayAssets([])
      return
    }
    loadWorkerOverlay(selectedWorkerOverlayId)
      .then((result) => {
        if (!cancelled)
          setWorkerOverlayAssets(result.overlay.assets)
      })
      .catch(() => {
        if (!cancelled)
          setWorkerOverlayAssets([])
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
    if (!workerOverlayTarget)
      return
    setWorkerOverlayAssets(assets)
    const overlayOnly = assets.filter(asset => asset.source !== 'baseline')
    const result = await saveWorkerOverlay(workerOverlayTarget.id, {
      assets: overlayOnly.map(asset => ({
        content: asset.content,
        enabled: asset.enabled,
        id: asset.id,
        kind: asset.kind,
        metadataJson: asset.metadataJson,
        target: asset.target,
      })),
    })
    setWorkerOverlayAssets(result.overlay.assets)
  }

  function startSoulApp(app: HostedSoulApp) {
    if (!data)
      return
    const soulId = data.souls.some(soul => soul.id === app.appId)
      ? app.appId
      : app.projectedSoul?.id ?? app.appId
    const soul = data.souls.find(item => item.id === soulId)
    const soulCopy = soul ? displaySoul(soul, activeLocale) : null
    setNewWorkerSoulId(soulId)
    setNewWorkerName(soulCopy?.name ?? app.manifest.name)
    setCreateWorkerOpen(true)
  }

  async function submitWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newWorkerName.trim() || !newWorkerSoulId)
      return
    const result = await createWorker({
      name: newWorkerName.trim(),
      soulId: newWorkerSoulId,
    })
    setSelectedWorkerId(result.worker.id)
    setNewWorkerName('')
    setCreateWorkerOpen(false)
    await refresh()
    navigateWorkerRoute({ kind: 'worker', workerId: result.worker.id })
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data || !selectedSoul || !selectedWorker || !workspaceTitle.trim())
      return
    setSubmitting(true)
    try {
      const workspaceResult = await createWorkspace(selectedWorker.id, {
        metadata: {
          soulId: selectedSoul.id,
        },
        name: workspaceTitle.trim(),
      })
      setSelectedWorkspaceId(workspaceResult.workspace.id)
      setWorkspaceTitle('')
      setCreateWorkspaceOpen(false)
      await refresh()
      navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorker.id, workspaceId: workspaceResult.workspace.id })
    }
    finally {
      setSubmitting(false)
    }
  }

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

  if (!selectedWorker) {
    const availableSouls = data.souls.filter(soul => soul.status === 'available')
    return (
      <WorkerStudioLayout
        appearance={appearance}
        header={(
          <HostTopBar
            sidebarCollapsed={sidebarCollapsed}
            locatorSegments={hostLocatorSegments}
            onToggleSidebar={() => setSidebarCollapsed(current => !current)}
          />
        )}
        mainLabel={copy.accessibility.soulProjectsAndArtifacts}
        resolvedTheme={resolvedTheme}
        sidebarCollapsed={sidebarCollapsed}
        sidebarLabel={copy.workspace.currentWorker}
        variant="home"
        sidebar={(
          <>
            <HostSidebarActions
              onCreateWorker={() => setCreateWorkerOpen(true)}
              onOpenSoulApps={() => openSettings('soul-packs')}
            />
            <Item variant="muted" size="sm" role="region">
              <ItemContent>
                <ItemTitle>{copy.workspace.firstRunRailTitle}</ItemTitle>
                <ItemDescription>{copy.workspace.firstRunRailHint}</ItemDescription>
              </ItemContent>
            </Item>
            <HostSidebarFooter runtimeVersion={data.info.runtimeVersion} onOpenSettings={() => openSettings('execution')} />
          </>
        )}
        main={(
          <StudioMainFrame kicker={copy.app.workspacePill} title={copy.workspace.firstRunTitle}>
            <FirstRunSoulAppHome
              apps={enabledSoulApps}
              copy={copy}
              locale={activeLocale}
              souls={availableSouls}
              onCreateWorker={() => setCreateWorkerOpen(true)}
              onStartApp={startSoulApp}
            />
          </StudioMainFrame>
        )}
        dialogs={(
          <CreateWorkerDialog
            availableSouls={availableSouls}
            copy={copy}
            locale={activeLocale}
            open={createWorkerOpen}
            selectedSoulId={newWorkerSoulId ?? ''}
            workerName={newWorkerName}
            onClose={() => setCreateWorkerOpen(false)}
            onNameChange={setNewWorkerName}
            onSoulChange={setNewWorkerSoulId}
            onSubmit={submitWorker}
          />
        )}
      />
    )
  }

  if (!selectedSoul || !selectedSoulCopy)
    return null

  const showWorkspaceContextSurface = isWorkspaceContextRoute && Boolean(selectedWorkspace)
  const layoutVariant: WorkerStudioLayoutVariant = showWorkspaceContextSurface ? 'workspace' : 'home'

  return (
    <>
      <WorkerStudioLayout
        appearance={appearance}
        header={(
          <HostTopBar
            sidebarCollapsed={sidebarCollapsed}
            locatorSegments={hostLocatorSegments}
            onToggleSidebar={() => setSidebarCollapsed(current => !current)}
          />
        )}
        dialogs={(
          <>
            <CreateWorkerDialog
              availableSouls={data.souls.filter(soul => soul.status === 'available')}
              copy={copy}
              locale={activeLocale}
              open={createWorkerOpen}
              selectedSoulId={newWorkerSoulId ?? ''}
              workerName={newWorkerName}
              onClose={() => setCreateWorkerOpen(false)}
              onNameChange={setNewWorkerName}
              onSoulChange={setNewWorkerSoulId}
              onSubmit={submitWorker}
            />

            <CreateWorkspaceDialog
              copy={copy}
              open={createWorkspaceOpen}
              placeholder={projectNamePlaceholder(selectedSoul.id, copy)}
              workerLabel={`${selectedWorker.name} / ${selectedSoulCopy.name}`}
              submitting={submitting}
              workspaceTitle={workspaceTitle}
              onClose={() => setCreateWorkspaceOpen(false)}
              onSubmit={submitProject}
              onTitleChange={setWorkspaceTitle}
            />

            {settingsOpen
              ? (
                  <SettingsDialog
                    initial={data.settings}
                    initialSection={settingsInitialSection}
                    apps={data.apps}
                    runtimeVersion={data.info.runtimeVersion}
                    templates={data.templates}
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
        sidebarLabel={copy.workspace.currentWorker}
        variant={layoutVariant}
        sidebar={(
          <>
            <HostSidebarActions
              onCreateWorker={() => setCreateWorkerOpen(true)}
              onOpenSoulApps={() => openSettings('soul-packs')}
            />

            <WorkerSwitcher
              selectedWorkerId={selectedWorker?.id ?? null}
              workers={selectableWorkers}
              soulNameForWorker={(worker) => {
                const soul = data.souls.find(item => item.id === worker.soulId)
                return soul ? displaySoul(soul, activeLocale).name : worker.soulId
              }}
              onConfigureWorker={(worker) => {
                setWorkerConfigurationWorkerId(worker.id)
                setWorkerConfigurationOpen(true)
              }}
              onSelectWorker={(worker) => {
                setSelectedWorkerId(worker.id)
                setSelectedWorkspaceId(null)
                navigateWorkerRoute({ kind: 'worker', workerId: worker.id })
              }}
            />

            <HostSidebarFooter runtimeVersion={data.info.runtimeVersion} onOpenSettings={() => openSettings('execution')} />
          </>
        )}
        main={(
          <>
            {showMountedWorkbenchRoute && selectedSoulApp && activeMountedRoute
              ? (
                  <MountedSoulAppRouteSurface
                    key={`${selectedWorker.id}:${activeMountedRoute.id}`}
                    appId={selectedSoulApp.appId}
                    resolvedTheme={resolvedTheme}
                    route={activeMountedRoute}
                    routeMemoryRef={mountedChildRouteMemoryRef}
                    sessionId={activeMountedRoute?.surface?.scope === 'session' ? selectedSession?.id ?? null : null}
                    workerId={selectedWorker.id}
                    workspaceId={mountedWorkspaceId}
                    onSelectWorkspace={workspaceId => selectWorkspaceLocator(selectedWorker.id, workspaceId)}
                  />
                )
              : null}

            {!showMountedWorkbenchRoute && isWorkspaceContextRoute && selectedWorkspace
              ? (
                  <WorkspaceContextNoMountedSurface
                    copy={copy}
                    selectedSoulCopy={selectedSoulCopy}
                    selectedWorkspace={selectedWorkspace}
                    onOpenSettings={() => openSettings()}
                    onRefresh={() => void refresh()}
                  />
                )
              : null}

            {!showMountedWorkbenchRoute && !(isWorkspaceContextRoute && selectedWorkspace)
              ? (
                  <WorkerHomeFallback
                    allSessions={allSessions}
                    copy={copy}
                    data={data}
                    filteredWorkspaces={filteredProjects}
                    locale={activeLocale}
                    query={query}
                    selectedSoul={selectedSoul}
                    selectedSoulCopy={selectedSoulCopy}
                    selectedWorker={selectedWorker}
                    selectedWorkspace={selectedWorkspace}
                    templates={templates}
                    onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
                    onOpenSettings={() => openSettings()}
                    onRefresh={() => void refresh()}
                    onSearch={setQuery}
                    onSelectWorkspace={workspace => selectWorkspaceLocator(workspace.workerId, workspace.id)}
                  />
                )
              : null}
          </>
        )}
      />
      <WorkerConfigurationDialog
        activeWorkbenchTabId={workerConfigurationActiveRouteId}
        assets={workerOverlayAssets}
        open={workerConfigurationOpen}
        worker={workerConfigurationWorker}
        workbenchTabs={workbenchTabs}
        onOpenChange={(open) => {
          setWorkerConfigurationOpen(open)
          if (!open)
            setWorkerConfigurationWorkerId(null)
        }}
        onSaveAssets={saveWorkerOverlayAssets}
        onSelectWorkbenchTab={(tab) => {
          if (workerConfigurationWorker) {
            updateActiveMountedTabMap(prev => updateWorkerMountedRoutePreference({
              current: prev,
              routeId: tab.id,
              workerId: workerConfigurationWorker.id,
            }))
          }
        }}
      />
    </>
  )
}
