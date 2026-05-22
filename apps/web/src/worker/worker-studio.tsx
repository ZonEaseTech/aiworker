import type {
  HostedSoulApp,
  LocalWorkerOverlayAsset,
  MountedMicroAppChildEvent,
  MountedMicroAppHostData,
} from '@zonease/aiworker-shared'
import type { FormEvent, MutableRefObject } from 'react'
import type { LocalWorkspaceData } from '../features/local-workspace/api/types'
import type { SettingsSection } from '../features/settings'
import type { ResolvedTheme } from '../features/theme/system-theme'
import type { WorkerStudioLayoutVariant } from './components/studio-shell'

import {
  Add01Icon,
  ArrowRight01Icon,
  File02Icon,
  PanelBottom,
  PanelLeftIcon,
  PanelRightIcon,
  RefreshIcon,
  Search01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Avatar, AvatarFallback } from '@zonease/aiworker-ui/components/avatar'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@zonease/aiworker-ui/components/breadcrumb'
import { Button } from '@zonease/aiworker-ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@zonease/aiworker-ui/components/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@zonease/aiworker-ui/components/sidebar'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { navigateWorkerRoute, useWorkerRoute } from '../app/router/worker-route'
import {
  displaySoul,
  displayTemplate,
  formatStatus,
  messagesFor,
  normalizeLocale,
} from '../features/i18n'
import { createWorker, createWorkspace, loadLocalWorkspaceData, loadWorkerOverlay, projectWorkerWorkspaceOverlay, saveWorkerOverlay } from '../features/local-workspace/api'
import { resolveMountedSurface } from '../features/local-workspace/api/workspace-data'
import { CreateWorkerDialog, CreateWorkspaceDialog, WorkerIdentityBlock, WorkspaceCard } from '../features/local-workspace/components'
import {
  latest,
  projectNamePlaceholder,
  sessionForWorkspace,
  turnForSession,
} from '../features/local-workspace/model'
import { SettingsDialog } from '../features/settings'
import { resolveTheme, useSystemTheme } from '../features/theme/system-theme'
import {
  addMountedMicroAppDataListener,
  addMountedMicroAppRouteListener,
  ensureMicroAppStarted,
  getMountedMicroAppCurrentRoute,
  pushMountedMicroAppRoute,
  replaceMountedMicroAppRoute,
  sendMountedMicroAppData,
  setMountedMicroAppElementData,
} from '../lib/micro-app-runtime'
import { StudioChromeHeader, StudioEmptyState, StudioMainFrame, StudioTitleBlock, WorkerStudioLayout } from './components/studio-shell'
import {
  mountedChildDefaultPath,
  mountedChildPathFromRouteInfo,
  mountedRouteMemoryKey,
  normalizeMountedChildPath,
} from './mounted-child-route'
import { WorkerConfigurationDialog } from './worker-configuration-dialog'
import { WorkerSwitcher } from './worker-workbench-tree'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

type WorkerMessages = ReturnType<typeof messagesFor>

const defaultNewWorkerSoulId = 'aiworker-hr'

interface OpenMountedChildRouteOptions {
  replace?: boolean
}

interface MountedMicroAppSurfaceResponse {
  microApp: {
    data: MountedMicroAppHostData
    name: string
    url: string
  }
  surface: {
    id: string
    kind: string
    label: string
    renderer: 'micro-app'
  }
}

export function WorkerStudio() {
  const route = useWorkerRoute()
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerSoulId, setNewWorkerSoulId] = useState(defaultNewWorkerSoulId)
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

  const refresh = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: null }))
    try {
      const data = await loadLocalWorkspaceData()
      setState({ data, error: null, loading: false })
    }
    catch (error) {
      setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const data = state.data
  const activeLocale = normalizeLocale(data?.settings.language)
  const copy = messagesFor(activeLocale)
  const allSessions = useMemo(() => data?.sessions ?? [], [data?.sessions])
  const routedWorkspace = route.kind === 'workspace' || route.kind === 'session'
    ? data?.workspaces.find(workspace => workspace.id === route.workspaceId) ?? null
    : null
  const routedWorker = route.kind === 'worker'
    ? data?.workers.find(worker => worker.id === route.workerId) ?? null
    : routedWorkspace ? data?.workers.find(worker => worker.id === routedWorkspace.workerId) ?? null : null
  const selectableWorkers = useMemo(() => {
    if (!data)
      return []
    const availableSoulIds = new Set(data.souls.filter(soul => soul.status === 'available').map(soul => soul.id))
    const templatedSoulIds = new Set(data.templates.map(template => template.soulId))
    return data.workers.filter(worker => availableSoulIds.has(worker.soulId) && templatedSoulIds.has(worker.soulId))
  }, [data])
  const routedSelectableWorker = routedWorker && selectableWorkers.some(worker => worker.id === routedWorker.id)
    ? routedWorker
    : null
  const selectedWorker = routedSelectableWorker
    ?? (selectedWorkerId ? selectableWorkers.find(worker => worker.id === selectedWorkerId) ?? null : null)
    ?? selectableWorkers[0]
    ?? null
  const workerConfigurationWorker = workerConfigurationWorkerId
    ? selectableWorkers.find(worker => worker.id === workerConfigurationWorkerId) ?? selectedWorker
    : selectedWorker
  const workerOverlayTarget = workerConfigurationOpen ? workerConfigurationWorker : selectedWorker
  const selectedWorkerOverlayId = workerOverlayTarget?.id ?? null
  const selectedSoul = selectedWorker
    ? data?.souls.find(soul => soul.id === selectedWorker.soulId) ?? null
    : data?.souls.find(soul => soul.id === newWorkerSoulId && soul.status === 'available') ?? data?.souls.find(soul => soul.status === 'available') ?? null
  const selectedSoulApp = useMemo(
    () => data?.apps.find(app => app.appId === selectedSoul?.id || app.projectedSoul?.id === selectedSoul?.id) ?? null,
    [data?.apps, selectedSoul?.id],
  )
  const templates = useMemo(
    () => data?.templates.filter(template => template.soulId === selectedWorker?.soulId) ?? [],
    [data?.templates, selectedWorker?.soulId],
  )
  const selectedMountedWorkbenchRoute = selectedSoulApp?.manifest.ui?.routes?.find(route => route.surface?.renderer === 'micro-app') ?? null
  const showMountedWorkbenchRoute = Boolean(selectedSoulApp && selectedMountedWorkbenchRoute)
  const soulWorkspaces = useMemo(
    () => data?.workspaces.filter(item => item.workerId === selectedWorker?.id) ?? [],
    [data?.workspaces, selectedWorker?.id],
  )
  const soulSessions = useMemo(() => {
    const workspaceIds = new Set(soulWorkspaces.map(item => item.id))
    return allSessions.filter(session => workspaceIds.has(session.workspaceId))
  }, [allSessions, soulWorkspaces])
  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return soulWorkspaces.filter((item) => {
      const latestSession = sessionForWorkspace(item, allSessions)
      const template = data?.templates.find(candidate => candidate.id === latestSession?.capabilityTemplateId)
      const templateCopy = template ? displayTemplate(template, activeLocale) : null
      return !needle
        || item.name.toLowerCase().includes(needle)
        || template?.name.toLowerCase().includes(needle)
        || templateCopy?.name.toLowerCase().includes(needle)
    })
  }, [activeLocale, allSessions, data?.templates, query, soulWorkspaces])
  const routeWorkspaceId = route.kind === 'workspace' || route.kind === 'session' ? route.workspaceId : null
  const routeWorkspace = routeWorkspaceId ? soulWorkspaces.find(item => item.id === routeWorkspaceId) ?? null : null
  const manuallySelectedWorkspace = selectedWorkspaceId && soulWorkspaces.some(item => item.id === selectedWorkspaceId)
    ? soulWorkspaces.find(item => item.id === selectedWorkspaceId) ?? null
    : null
  const explicitSelectedWorkspace = routeWorkspace ?? manuallySelectedWorkspace
  const selectedWorkspace = explicitSelectedWorkspace ?? latest(soulWorkspaces)
  const routeSession = route.kind === 'session'
    ? allSessions.find(session => session.id === route.sessionId && session.workspaceId === route.workspaceId) ?? null
    : null
  const selectedSession = routeSession ?? (route.kind === 'workspace' ? null : selectedWorkspace ? sessionForWorkspace(selectedWorkspace, allSessions) : latest(soulSessions))
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
    const result = await saveWorkerOverlay(workerOverlayTarget.id, {
      assets: assets.map(asset => ({
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

  async function projectSelectedWorkspaceOverlay() {
    if (!workerConfigurationWorker || !selectedWorkspace || selectedWorkspace.workerId !== workerConfigurationWorker.id)
      return null
    const result = await projectWorkerWorkspaceOverlay(workerConfigurationWorker.id, selectedWorkspace.id)
    setState(current => current.data
      ? {
          ...current,
          data: {
            ...current.data,
            workspaces: current.data.workspaces.map(workspace => workspace.id === result.projection.workspace.id ? result.projection.workspace : workspace),
          },
        }
      : current)
    return result.projection.receipt
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

  function renderToolbarSearchInput({
    ariaLabel,
    onChange,
    placeholder,
    value,
  }: {
    ariaLabel: string
    onChange: (value: string) => void
    placeholder: string
    value: string
  }) {
    return (
      <InputGroup className="min-w-36 flex-1 basis-44 md:max-w-70">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      </InputGroup>
    )
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
            selectedSoulId={newWorkerSoulId}
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

  const isWorkspaceContextRoute = (route.kind === 'workspace' || route.kind === 'session') && Boolean(selectedWorkspace)
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
              selectedSoulId={newWorkerSoulId}
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
                    onAppsChanged={() => refresh()}
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
            {showMountedWorkbenchRoute && selectedSoulApp && selectedMountedWorkbenchRoute
              ? (
                  <MountedSoulAppRouteSurface
                    appId={selectedSoulApp.appId}
                    resolvedTheme={resolvedTheme}
                    route={selectedMountedWorkbenchRoute}
                    routeMemoryRef={mountedChildRouteMemoryRef}
                    sessionId={selectedMountedWorkbenchRoute.surface?.scope === 'session' ? selectedSession?.id ?? null : null}
                    workerId={selectedWorker.id}
                    workspaceId={selectedWorkspace?.id ?? null}
                  />
                )
              : null}

            {!showMountedWorkbenchRoute && isWorkspaceContextRoute && selectedWorkspace
              ? (
                  <>
                    <StudioChromeHeader
                      actions={(
                        <>
                          <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.refreshWorkspace} onClick={() => void refresh()}>
                            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.openSettings} onClick={() => openSettings()}>
                            <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    >
                      <StudioTitleBlock kicker={copy.workspace.currentWorkspace} title={selectedWorkspace.name} />
                    </StudioChromeHeader>

                    <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-7 py-10 max-md:p-4 max-md:pt-7">
                      <StudioEmptyState
                        icon={<HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />}
                        title={copy.workspace.noMountedSurface}
                        detail={copy.workspace.noMountedSurfaceDetail(selectedSoulCopy.name)}
                      />
                    </CardContent>
                  </>
                )
              : null}

            {!showMountedWorkbenchRoute && !(isWorkspaceContextRoute && selectedWorkspace)
              ? (
                  <>
                    <StudioChromeHeader
                      actions={(
                        <>
                          <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.refreshWorkspace} onClick={() => void refresh()}>
                            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.openSettings} onClick={() => openSettings()}>
                            <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.workspace}>
                            <Avatar size="sm" aria-hidden="true">
                              <AvatarFallback>{workerInitials(selectedWorker.name)}</AvatarFallback>
                            </Avatar>
                          </Button>
                        </>
                      )}
                    >
                      <StudioTitleBlock kicker={copy.workspace.currentWorker} title={copy.workspace.workspaceTitle(selectedWorker.name)} />
                    </StudioChromeHeader>

                    <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-6 max-md:px-4">
                      <ItemGroup className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
                        <WorkerIdentityBlock
                          compact
                          copy={copy}
                          locale={activeLocale}
                          soul={selectedSoul}
                          soulCopy={selectedSoulCopy}
                          worker={selectedWorker}
                        />
                        <Item variant="muted" size="sm" className="min-w-0 items-start">
                          <ItemContent className="min-w-0 gap-3">
                            <ItemTitle>{`${copy.create.capabilityTemplate} (${templates.length})`}</ItemTitle>
                            <ItemActions className="min-w-0 flex-wrap justify-start gap-1.5">
                              {templates.map(template => (
                                <Badge key={template.id} variant="outline" className="max-w-full truncate">
                                  {displayTemplate(template, activeLocale).name}
                                </Badge>
                              ))}
                            </ItemActions>
                          </ItemContent>
                        </Item>
                      </ItemGroup>

                      <ItemGroup className="min-h-0 gap-3">
                        <ItemActions className="flex-wrap justify-between gap-x-2.5 gap-y-2">
                          <ItemActions className="min-w-0 gap-2">
                            <ItemTitle>{`${copy.workspace.workspaceList} (${filteredProjects.length})`}</ItemTitle>
                            <Button
                              aria-label={copy.workspace.createWorkspace}
                              size="icon"
                              title={copy.workspace.createWorkspace}
                              type="button"
                              variant="ghost"
                              onClick={() => setCreateWorkspaceOpen(true)}
                            >
                              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                            </Button>
                          </ItemActions>

                          <ItemActions className="min-w-0 flex-1 flex-wrap justify-end gap-2">
                            {renderToolbarSearchInput({
                              ariaLabel: copy.accessibility.searchProjects,
                              onChange: setQuery,
                              placeholder: copy.projects.searchPlaceholder,
                              value: query,
                            })}
                          </ItemActions>
                        </ItemActions>

                        <ItemGroup className="grid grid-cols-1 items-stretch gap-3.5 sm:grid-cols-2 2xl:grid-cols-3">
                          {filteredProjects.length > 0
                            ? filteredProjects.map(item => (
                                <WorkspaceCard
                                  key={item.id}
                                  active={selectedWorkspace?.id === item.id}
                                  item={item}
                                  locale={activeLocale}
                                  session={sessionForWorkspace(item, allSessions)}
                                  template={data.templates.find(template => template.id === sessionForWorkspace(item, allSessions)?.capabilityTemplateId)}
                                  turn={turnForSession(sessionForWorkspace(item, allSessions), data.turns)}
                                  onSelect={() => {
                                    setSelectedWorkspaceId(item.id)
                                    navigateWorkerRoute({ kind: 'workspace', workerId: item.workerId, workspaceId: item.id })
                                  }}
                                />
                              ))
                            : (
                                <StudioEmptyState
                                  icon={<HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />}
                                  title={copy.projects.empty.title}
                                  detail={copy.projects.empty.detail(selectedSoulCopy.name)}
                                  action={(
                                    <Button type="button" variant="ghost" size="lg" onClick={() => setCreateWorkspaceOpen(true)}>
                                      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                                      {copy.workspace.createWorkspace}
                                    </Button>
                                  )}
                                />
                              )}
                        </ItemGroup>
                      </ItemGroup>
                    </CardContent>
                  </>
                )
              : null}
          </>
        )}
      />
      <WorkerConfigurationDialog
        assets={workerOverlayAssets}
        open={workerConfigurationOpen}
        worker={workerConfigurationWorker}
        onOpenChange={(open) => {
          setWorkerConfigurationOpen(open)
          if (!open)
            setWorkerConfigurationWorkerId(null)
        }}
        onProjectWorkspaceAssets={projectSelectedWorkspaceOverlay}
        onSaveAssets={saveWorkerOverlayAssets}
        projectionWorkspace={selectedWorkspace?.workerId === workerConfigurationWorker?.id ? selectedWorkspace : null}
      />
    </>
  )
}

function MountedSoulAppRouteSurface({
  appId,
  resolvedTheme,
  route,
  routeMemoryRef,
  sessionId,
  workerId,
  workspaceId,
}: {
  appId: string
  resolvedTheme: ResolvedTheme
  route: HostedSoulApp['manifest']['ui']['routes'][number]
  routeMemoryRef: MutableRefObject<Map<string, string>>
  sessionId?: string | null
  workerId?: string | null
  workspaceId?: string | null
}) {
  const microAppRef = useRef<(HTMLElement & { data?: MountedMicroAppHostData }) | null>(null)
  const [surface, setSurface] = useState<MountedMicroAppSurfaceResponse | null>(null)
  const [childError, setChildError] = useState<string | null>(null)
  const [childReady, setChildReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const childBasePath = mountedChildDefaultPath(route.path)
  const mountedChildRouteMemoryKeyValue = mountedRouteMemoryKey({
    appId,
    surfaceId: route.id,
    workspaceId,
  })
  const mountedMicroAppData = useMemo<MountedMicroAppHostData | null>(() => {
    if (!surface)
      return null
    return {
      ...surface.microApp.data,
      appId: surface.microApp.data.appId ?? appId,
      surfaceId: surface.microApp.data.surfaceId ?? route.id,
      surfaceKind: surface.surface.kind,
      sessionId: sessionId ?? null,
      theme: resolvedTheme,
      workerId: workerId ?? null,
      workspaceId: workspaceId ?? null,
    }
  }, [appId, resolvedTheme, route.id, sessionId, surface, workerId, workspaceId])

  useEffect(() => {
    ensureMicroAppStarted()
  }, [])

  const handleMountedMicroAppChildEvent = useCallback((event: MountedMicroAppChildEvent): void => {
    if (event.type === 'ready') {
      setChildReady(true)
      return
    }
    if (event.type === 'error') {
      setChildError(event.message)
    }
  }, [])

  useEffect(() => {
    if (!surface || !mountedMicroAppData)
      return undefined
    setMountedMicroAppElementData(microAppRef.current, mountedMicroAppData)
    const stopListening = addMountedMicroAppDataListener(surface.microApp.name, (event) => {
      if (event.appId && event.appId !== appId)
        return
      if (event.surfaceId && event.surfaceId !== surface.surface.id)
        return
      handleMountedMicroAppChildEvent(event)
    }, { autoTrigger: true })
    sendMountedMicroAppData(surface.microApp.name, mountedMicroAppData, { force: true })
    return stopListening
  }, [appId, handleMountedMicroAppChildEvent, mountedMicroAppData, surface])

  useEffect(() => {
    if (!surface)
      return undefined
    let active = true
    let stopRouteListening: (() => void) | null = null

    void getMountedMicroAppCurrentRoute(surface.microApp.name).then((currentRoute) => {
      if (!active)
        return
      const currentPath = mountedChildPathFromRouteInfo(currentRoute, childBasePath)
      const rememberedPath = routeMemoryRef.current.get(mountedChildRouteMemoryKeyValue)
      if (rememberedPath) {
        if (rememberedPath !== currentPath) {
          void openMountedChildRoute(
            surface.microApp.name,
            routeMemoryRef,
            mountedChildRouteMemoryKeyValue,
            childBasePath,
            rememberedPath,
            { replace: true },
          )
        }
        return
      }
      routeMemoryRef.current.set(mountedChildRouteMemoryKeyValue, childBasePath)
      if (currentPath !== childBasePath) {
        void openMountedChildRoute(
          surface.microApp.name,
          routeMemoryRef,
          mountedChildRouteMemoryKeyValue,
          childBasePath,
          childBasePath,
          { replace: true },
        )
      }
    })

    void addMountedMicroAppRouteListener(surface.microApp.name, (to) => {
      if (!active)
        return
      routeMemoryRef.current.set(mountedChildRouteMemoryKeyValue, mountedChildPathFromRouteInfo(to, childBasePath))
    }).then((cleanup) => {
      if (!active) {
        cleanup()
        return
      }
      stopRouteListening = cleanup
    })

    return () => {
      active = false
      stopRouteListening?.()
    }
  }, [childBasePath, mountedChildRouteMemoryKeyValue, routeMemoryRef, surface])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setChildError(null)
    resolveMountedSurface<MountedMicroAppSurfaceResponse>(appId, route.id, {
      sessionId,
      theme: resolvedTheme,
      workerId,
      workspaceId,
    })
      .then((response) => {
        if (!cancelled)
          setSurface(response)
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled)
          setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appId, resolvedTheme, route.id, sessionId, workerId, workspaceId])

  return (
    <>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-7 py-3 max-md:px-4">
        {error
          ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )
          : null}
        {childError
          ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{childError}</AlertDescription>
              </Alert>
            )
          : null}
        {loading
          ? <ItemDescription role="status">Loading mounted Soul App surface...</ItemDescription>
          : null}
        {surface
          ? (
              <micro-app
                ref={microAppRef}
                data-child-ready={childReady ? 'true' : 'false'}
                data-slot="soul-app-mounted-micro-app"
                destroy
                baseroute={childBasePath}
                name={surface.microApp.name}
                router-mode="pure"
                title={surface.surface.label}
                url={stableMountedMicroAppUrl(surface.microApp.url)}
                className="min-h-0 w-full flex-1"
              />
            )
          : null}
      </CardContent>
    </>
  )
}

async function openMountedChildRoute(
  microAppName: string,
  routeMemoryRef: MutableRefObject<Map<string, string>>,
  memoryKey: string,
  basePath: string,
  path: string,
  options: OpenMountedChildRouteOptions = {},
): Promise<void> {
  const nextPath = normalizeMountedChildPath(path, basePath)
  if (options.replace)
    await replaceMountedMicroAppRoute(microAppName, nextPath)
  else
    await pushMountedMicroAppRoute(microAppName, nextPath)
  routeMemoryRef.current.set(memoryKey, nextPath)
}

function stableMountedMicroAppUrl(url: string): string {
  return url.split(/[?#]/, 1)[0] || url
}

function HostTopBar({
  locatorSegments,
  onToggleSidebar,
  sidebarCollapsed,
}: {
  locatorSegments: string[]
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
}) {
  const sidebarLabel = sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'
  const locatorItems = locatorSegments.map((segment, index) => ({
    key: locatorSegments.slice(0, index + 1).join('/'),
    segment,
    showSeparator: index > 0,
  }))

  return (
    <ItemActions asChild className="h-10 min-w-0 justify-between gap-3 bg-sidebar px-2.5 text-sidebar-foreground">
      <header data-slot="host-top-bar" data-host-slot="host-top-bar" aria-label="Host actions">
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
          <Breadcrumb className="min-w-0 overflow-hidden" aria-label="Current Soul worker">
            <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
              {locatorItems.map(item => (
                <Fragment key={item.key}>
                  {item.showSeparator ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate">
                      {item.segment}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </ItemActions>
        <ItemActions className="min-w-0 gap-1" aria-label="Reserved Host panels">
          <SidebarMenuButton
            aria-label="Open workspace terminal"
            className="size-7 w-7 justify-center p-0"
            size="sm"
            title="Workspace terminal"
            type="button"
            disabled
          >
            <HugeiconsIcon icon={PanelBottom} strokeWidth={2} aria-hidden="true" />
          </SidebarMenuButton>
          <SidebarMenuButton
            aria-label="Open right panel"
            className="size-7 w-7 justify-center p-0"
            size="sm"
            title="Right panel"
            type="button"
            disabled
          >
            <HugeiconsIcon icon={PanelRightIcon} strokeWidth={2} aria-hidden="true" />
          </SidebarMenuButton>
        </ItemActions>
      </header>
    </ItemActions>
  )
}

function HostSidebarActions({
  onCreateWorker,
  onOpenSoulApps,
}: {
  onCreateWorker: () => void
  onOpenSoulApps: () => void
}) {
  return (
    <SidebarGroup className="min-w-0 shrink-0 px-0 py-0" aria-label="Host navigation">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={onCreateWorker}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              New Soul worker
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" disabled>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              Search
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={onOpenSoulApps}>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
              Soul Apps
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function HostSidebarFooter({
  onOpenSettings,
  runtimeVersion,
}: {
  onOpenSettings: () => void
  runtimeVersion: string
}) {
  const version = runtimeVersion.startsWith('v') ? runtimeVersion : `v${runtimeVersion}`

  return (
    <SidebarFooter data-host-slot="host-sidebar-footer" className="mt-auto shrink-0 p-0 pt-3">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton type="button" className="justify-between" onClick={onOpenSettings}>
            <ItemContent asChild className="min-w-0 flex-none flex-row items-center gap-2">
              <span>
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                <ItemTitle asChild>
                  <span>Platform settings</span>
                </ItemTitle>
              </span>
            </ItemContent>
            <ItemDescription asChild className="max-w-full truncate">
              <span>{version}</span>
            </ItemDescription>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}

function FirstRunSoulAppHome({
  apps,
  copy,
  locale,
  onCreateWorker,
  onStartApp,
  souls,
}: {
  apps: HostedSoulApp[]
  copy: WorkerMessages
  locale: ReturnType<typeof normalizeLocale>
  onCreateWorker: () => void
  onStartApp: (app: HostedSoulApp) => void
  souls: LocalWorkspaceData['souls']
}) {
  if (apps.length === 0) {
    return (
      <StudioEmptyState
        icon={<HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />}
        title={copy.workspace.noSoulApps}
        detail={copy.workspace.noSoulAppsDetail}
        action={(
          <Button type="button" variant="ghost" size="lg" onClick={onCreateWorker}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
            {copy.workspace.createWorker}
          </Button>
        )}
      />
    )
  }

  return (
    <ItemGroup className="w-full max-w-6xl gap-4" aria-label={copy.workspace.firstRunTitle}>
      <ItemDescription className="line-clamp-none max-w-2xl">{copy.workspace.firstRunDetail}</ItemDescription>
      <ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => {
          const soul = soulForApp(app, souls)
          const soulCopy = soul ? displaySoul(soul, locale) : null
          const domain = soulCopy?.domain ?? app.projectedSoul?.domain ?? app.appId
          const description = soulCopy?.description ?? app.manifest.description
          return (
            <Card
              key={app.appId}
              size="sm"
              className="min-h-44"
            >
              <CardHeader>
                <ItemContent className="min-w-0">
                  <CardTitle>{app.manifest.name}</CardTitle>
                  <CardDescription>{domain}</CardDescription>
                </ItemContent>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription className="line-clamp-2">{description}</CardDescription>
              </CardContent>
              <CardFooter className="justify-between gap-2">
                <Badge variant="outline">{`${formatStatus(app.status, locale)} · ${app.version}`}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={copy.workspace.startSoulApp(app.manifest.name)}
                  onClick={() => onStartApp(app)}
                >
                  {copy.workspace.startSoulApp(app.manifest.name)}
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </ItemGroup>
    </ItemGroup>
  )
}

function soulForApp(app: HostedSoulApp, souls: LocalWorkspaceData['souls']) {
  return souls.find(soul => soul.id === app.appId)
    ?? souls.find(soul => soul.id === app.projectedSoul?.id)
    ?? null
}

function workerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1)
    return words.slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase()
  return Array.from(words[0] ?? 'AI').slice(0, 2).join('').toUpperCase()
}
