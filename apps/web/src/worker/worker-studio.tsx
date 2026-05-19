import type { WorkerStudioLayoutVariant } from '@zonease/aiworker-component'
import type {
  HostedSoulApp,
  LocalLesson,
  LocalLessonStatus,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  SoulWorkbenchAction,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { LocalSoulAppSearchResult, LocalSoulAppWorkbenchAction, LocalWorkspaceData } from '../features/local-workspace/api/types'
import type { SettingsSection } from '../features/settings'
import type { ArtifactPreviewState } from './session-detail'
import type { SoulProfilePreviewState, SoulSessionDraft, SoulSessionMaterialDescriptor, SoulSessionMaterialInput, SoulWorkbenchContext } from './souls/types'

import { IconButton, StudioCollapsibleGroup, StudioEmptyState, StudioMainFrame, StudioSectionHeader, WorkerStudioLayout } from '@zonease/aiworker-component'
import { prepareProfileMarkdownForPromotion } from '@zonease/aiworker-shared'
import { findSoulWorkbenchForSoul } from '@zonease/aiworker-shared/soul-workbench-catalog'
import {
  ChevronRight,
  FileText,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { navigateWorkerRoute, parseWorkerRoute, useWorkerRoute } from '../app/router/worker-route'
import {
  displaySoul,
  displayTemplate,
  formatStatus,
  messagesFor,
  normalizeLocale,
} from '../features/i18n'
import { continueSessionTurnStream, createReview, createSessionTurnStream, createWorker, createWorkspace, loadLocalWorkspaceData, promoteProfileRevision, readFile, readProfile, updateLesson, writeFile } from '../features/local-workspace/api'
import { invokeSoulAppAction, searchSoulApp } from '../features/local-workspace/api/workspace-data'
import { CreateWorkerDialog, CreateWorkspaceDialog, WorkerIdentityBlock, WorkspaceCard, WorkspaceSessionComposer } from '../features/local-workspace/components'
import {
  artifactForSession,
  artifactForWorkspace,
  artifactsForWorkspace,
  buildProjectPrompt,
  eventsForSession,
  latest,
  lessonsForWorkspace,
  projectNamePlaceholder,
  reviewForSession,
  reviewsForWorkspace,
  sessionForWorkspace,
  turnForSession,
  turnsForSession,
  upsertSession,
  upsertTurn,
} from '../features/local-workspace/model'
import { resolveEngineReadiness } from '../features/session/engine-readiness'
import { SettingsDialog } from '../features/settings'
import { resolveTheme, useSystemTheme } from '../features/theme/system-theme'
import { WorkerSessionChat } from './session-chat'
import { SessionDetail } from './session-detail'
import { buildSessionProgress } from './session-progress'
import { SoulWorkbenchRenderer } from './souls/registry'
import { hasSpecializedWorkbenchRenderer } from './souls/renderers'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

type WorkerMessages = ReturnType<typeof messagesFor>

const defaultNewWorkerSoulId = 'aiworker-hr'

interface SessionMaterialCopy {
  binaryTitle?: string
  heading: string
  instruction: string
}

const defaultSessionMaterialCopy: SessionMaterialCopy = {
  binaryTitle: 'Uploaded Source Material',
  heading: 'Attached source material:',
  instruction: 'Use these workspace file paths as source material before producing the requested output.',
}

const initialArtifactPreviewState: ArtifactPreviewState = {
  artifactId: null,
  content: '',
  error: null,
  loading: false,
}

const initialProfilePreviewState: SoulProfilePreviewState = {
  content: '',
  error: null,
  loading: false,
  workspaceId: null,
}

type ArtifactPreviewAction
  = | { type: 'idle' }
    | { artifactId: string, type: 'loading' }
    | { artifactId: string, content: string, type: 'loaded' }
    | { artifactId: string, error: string, type: 'failed' }

type ProfilePreviewAction
  = | { type: 'idle' }
    | { type: 'loading', workspaceId: string }
    | { type: 'loaded', content: string, workspaceId: string }
    | { type: 'failed', error: string, workspaceId: string }

interface WorkbenchSearchState {
  error: string | null
  items: LocalSoulAppSearchResult[]
  loading: boolean
  query: string
}

type WorkbenchSearchAction
  = | { query: string, type: 'idle' }
    | { query: string, type: 'loading' }
    | { items: LocalSoulAppSearchResult[], query: string, type: 'loaded' }
    | { error: string, query: string, type: 'failed' }

function artifactPreviewReducer(_state: ArtifactPreviewState, action: ArtifactPreviewAction): ArtifactPreviewState {
  switch (action.type) {
    case 'idle':
      return initialArtifactPreviewState
    case 'loading':
      return { artifactId: action.artifactId, content: '', error: null, loading: true }
    case 'loaded':
      return { artifactId: action.artifactId, content: action.content, error: null, loading: false }
    case 'failed':
      return { artifactId: action.artifactId, content: '', error: action.error, loading: false }
  }
}

function profilePreviewReducer(_state: SoulProfilePreviewState, action: ProfilePreviewAction): SoulProfilePreviewState {
  switch (action.type) {
    case 'idle':
      return initialProfilePreviewState
    case 'loading':
      return { content: '', error: null, loading: true, workspaceId: action.workspaceId }
    case 'loaded':
      return { content: action.content, error: null, loading: false, workspaceId: action.workspaceId }
    case 'failed':
      return { content: '', error: action.error, loading: false, workspaceId: action.workspaceId }
  }
}

function workbenchSearchReducer(state: WorkbenchSearchState, action: WorkbenchSearchAction): WorkbenchSearchState {
  switch (action.type) {
    case 'idle':
      return { error: null, items: [], loading: false, query: action.query }
    case 'loading':
      return { ...state, error: null, loading: true, query: action.query }
    case 'loaded':
      return { error: null, items: action.items, loading: false, query: action.query }
    case 'failed':
      return { error: action.error, items: [], loading: false, query: action.query }
  }
}

export function WorkerStudio() {
  const route = useWorkerRoute()
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerSoulId, setNewWorkerSoulId] = useState(defaultNewWorkerSoulId)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [workspaceTitle, setWorkspaceTitle] = useState('')
  const [workspaceContext, setWorkspaceContext] = useState('')
  const [query, setQuery] = useState('')
  const [createWorkerOpen, setCreateWorkerOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [collapsedWorkerSoulIds, setCollapsedWorkerSoulIds] = useState<Set<string>>(() => new Set())
  const [detailDrawerCollapsed, setDetailDrawerCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution')
  const [submitting, setSubmitting] = useState(false)
  const [turnDraft, setTurnDraft] = useState<{ sessionId: null | string, value: string }>({ sessionId: null, value: '' })
  const [turnSubmitting, setTurnSubmitting] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [profileRevisionSubmitting, setProfileRevisionSubmitting] = useState(false)
  const [lessonBusyId, setLessonBusyId] = useState<string | null>(null)
  const [workbenchActionState, setWorkbenchActionState] = useState<{ busyActionId: string | null, error: string | null }>({
    busyActionId: null,
    error: null,
  })
  const [workbenchSearchState, dispatchWorkbenchSearch] = useReducer(workbenchSearchReducer, {
    error: null,
    items: [],
    loading: false,
    query: '',
  })
  const [streamEvents, setStreamEvents] = useState<LocalSessionEvent[]>([])
  const [streamSessions, setStreamSessions] = useState<LocalSession[]>([])
  const [streamTurns, setStreamTurns] = useState<LocalTurn[]>([])
  const [pendingTurn, setPendingTurn] = useState<LocalTurn | null>(null)
  const [artifactPreview, dispatchArtifactPreview] = useReducer(artifactPreviewReducer, initialArtifactPreviewState)
  const [profilePreview, dispatchProfilePreview] = useReducer(profilePreviewReducer, initialProfilePreviewState)

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
  const allSessions = useMemo(() => {
    const byId = new Map<string, LocalSession>()
    for (const session of data?.sessions ?? [])
      byId.set(session.id, session)
    for (const session of streamSessions)
      byId.set(session.id, session)
    return [...byId.values()]
  }, [data?.sessions, streamSessions])
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
  const preferredHrProfileDraftTemplate = selectedSoul?.id === 'aiworker-hr'
    ? findHrProfileDraftTemplate(templates)
    : null
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId)
    ?? preferredHrProfileDraftTemplate
    ?? templates[0]
    ?? null
  const selectedWorkbench = selectedSoul ? findSoulWorkbenchForSoul(selectedSoul.id) : null
  const showSpecializedWorkbench = hasSpecializedWorkbenchRenderer(selectedWorkbench)
  const soulWorkspaces = useMemo(
    () => data?.workspaces.filter(item => item.workerId === selectedWorker?.id) ?? [],
    [data?.workspaces, selectedWorker?.id],
  )
  const soulSessions = useMemo(() => {
    const workspaceIds = new Set(soulWorkspaces.map(item => item.id))
    return allSessions.filter(session => workspaceIds.has(session.workspaceId))
  }, [allSessions, soulWorkspaces])
  const soulSessionIds = useMemo(() => new Set(soulSessions.map(session => session.id)), [soulSessions])
  const soulArtifacts = useMemo(
    () => data?.artifacts.filter(artifact => artifact.sessionId !== null && soulSessionIds.has(artifact.sessionId)) ?? [],
    [data?.artifacts, soulSessionIds],
  )
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
  const workbenchContract = selectedSoulApp?.mountedContribution.workbench ?? selectedSoulApp?.manifest.ui?.workbench ?? null
  const workbenchPrimaryAction = workbenchContract?.primaryAction ?? null
  const workbenchSearch = workbenchContract?.search ?? null
  const workbenchActions = useMemo(() => {
    const actions: LocalSoulAppWorkbenchAction[] = []
    const seen = new Set<string>()
    const pushAction = (action: LocalSoulAppWorkbenchAction | null | undefined) => {
      if (!action || seen.has(action.id))
        return
      seen.add(action.id)
      actions.push(action)
    }
    pushAction(workbenchContract?.primaryAction)
    for (const action of workbenchContract?.actions ?? [])
      pushAction(action)
    if (workbenchContract?.settings) {
      pushAction({
        ...workbenchContract.settings,
        role: 'settings',
      })
    }
    return actions
  }, [workbenchContract])
  const secondaryWorkbenchActions = workbenchActions.filter(action => action.id !== workbenchPrimaryAction?.id)
  const workerSoulGroups = useMemo(() => {
    if (!data)
      return []

    const groups = new Map<string, {
      domain: string
      id: string
      name: string
      workers: typeof data.workers
    }>()
    for (const soul of data.souls) {
      const soulCopy = displaySoul(soul, activeLocale)
      groups.set(soul.id, {
        domain: soulCopy.domain,
        id: soul.id,
        name: soulCopy.name,
        workers: [],
      })
    }

    for (const worker of selectableWorkers) {
      if (!groups.has(worker.soulId)) {
        groups.set(worker.soulId, {
          domain: worker.soulId,
          id: worker.soulId,
          name: worker.soulId,
          workers: [],
        })
      }
      groups.get(worker.soulId)?.workers.push(worker)
    }

    return [...groups.values()].filter(group => group.workers.length > 0)
  }, [activeLocale, data, selectableWorkers])

  const routeWorkspaceId = route.kind === 'workspace' || route.kind === 'session' ? route.workspaceId : null
  const routeWorkspace = routeWorkspaceId ? soulWorkspaces.find(item => item.id === routeWorkspaceId) ?? null : null
  const manuallySelectedWorkspace = selectedWorkspaceId && soulWorkspaces.some(item => item.id === selectedWorkspaceId)
    ? soulWorkspaces.find(item => item.id === selectedWorkspaceId) ?? null
    : null
  const explicitSelectedWorkspace = routeWorkspace ?? manuallySelectedWorkspace
  const selectedWorkspace = explicitSelectedWorkspace ?? latest(soulWorkspaces)
  const workbenchSelectedWorkspace = showSpecializedWorkbench ? explicitSelectedWorkspace : selectedWorkspace
  const routeSession = route.kind === 'session'
    ? allSessions.find(session => session.id === route.sessionId && session.workspaceId === route.workspaceId) ?? null
    : null
  const selectedSession = routeSession ?? (route.kind === 'workspace' ? null : selectedWorkspace ? sessionForWorkspace(selectedWorkspace, allSessions) : latest(soulSessions))
  const selectedTurn = selectedSession ? turnForSession(selectedSession, data?.turns ?? []) : null
  const selectedArtifact = selectedSession
    ? artifactForSession(selectedSession, data?.artifacts ?? [])
    : selectedWorkspace
      ? artifactForWorkspace(selectedWorkspace, data?.artifacts ?? [], allSessions)
      : latest(soulArtifacts)
  const selectedReview = selectedSession ? reviewForSession(selectedSession, data?.reviews ?? []) : null
  const selectedSessionTurns = useMemo(
    () => selectedSession ? turnsForSession(selectedSession, data?.turns ?? []) : [],
    [data?.turns, selectedSession],
  )
  const displayedSessionTurns = useMemo(() => {
    if (!selectedSession)
      return []
    const byId = new Map<string, LocalTurn>()
    for (const turn of selectedSessionTurns)
      byId.set(turn.id, turn)
    for (const turn of streamTurns.filter(turn => turn.sessionId === selectedSession.id))
      byId.set(turn.id, turn)
    if (pendingTurn?.sessionId === selectedSession.id)
      byId.set(pendingTurn.id, pendingTurn)
    return [...byId.values()].sort((a, b) => a.seq - b.seq)
  }, [pendingTurn, selectedSession, selectedSessionTurns, streamTurns])
  const selectedSessionEvents = useMemo(
    () => selectedSession ? eventsForSession(selectedSession, data?.events ?? []) : [],
    [data?.events, selectedSession],
  )
  const displayedSessionEvents = useMemo(() => {
    if (!selectedSession)
      return []
    const byKey = new Map<string, LocalSessionEvent>()
    for (const event of selectedSessionEvents)
      byKey.set(String(event.id), event)
    for (const event of streamEvents.filter(event => event.sessionId === selectedSession.id))
      byKey.set(String(event.id), event)
    return [...byKey.values()].sort((a, b) => a.seq - b.seq)
  }, [selectedSession, selectedSessionEvents, streamEvents])
  const selectedSessionProgress = useMemo(
    () => selectedSession
      ? buildSessionProgress({
          artifact: selectedArtifact,
          events: displayedSessionEvents,
          locale: activeLocale,
          review: selectedReview,
          session: selectedSession,
          turns: displayedSessionTurns,
        })
      : null,
    [activeLocale, displayedSessionEvents, displayedSessionTurns, selectedArtifact, selectedReview, selectedSession],
  )
  const selectedWorkspaceArtifacts = selectedWorkspace ? artifactsForWorkspace(selectedWorkspace, data?.artifacts ?? []) : []
  const selectedWorkspaceLessons = selectedWorkspace ? lessonsForWorkspace(selectedWorkspace, data?.lessons ?? []) : []
  const selectedWorkspaceReviews = selectedWorkspace ? reviewsForWorkspace(selectedWorkspace, data?.reviews ?? []) : []
  const enabledSoulApps = useMemo(
    () => data?.apps.filter(app => app.status === 'enabled') ?? [],
    [data?.apps],
  )
  const soulWorkspaceIds = useMemo(() => new Set(soulWorkspaces.map(item => item.id)), [soulWorkspaces])
  const soulReviews = useMemo(
    () => data?.reviews.filter(review => soulWorkspaceIds.has(review.workspaceId)) ?? [],
    [data?.reviews, soulWorkspaceIds],
  )
  const soulLessons = useMemo(
    () => data?.lessons.filter(lesson => soulWorkspaceIds.has(lesson.workspaceId)) ?? [],
    [data?.lessons, soulWorkspaceIds],
  )
  const selectedSoulCopy = selectedSoul ? displaySoul(selectedSoul, activeLocale) : null
  const selectedTemplateCopy = selectedTemplate ? displayTemplate(selectedTemplate, activeLocale) : null
  const selectedSessionTemplate = selectedSession ? data?.templates.find(template => template.id === selectedSession.capabilityTemplateId) ?? null : null
  const selectedArtifactCopy = selectedSessionTemplate ? displayTemplate(selectedSessionTemplate, activeLocale) : null
  const hostLocatorSegments = selectedWorker && selectedSoulCopy
    ? [selectedSoulCopy.name, selectedWorker.name]
    : [copy.app.brand]
  const engineReadiness = resolveEngineReadiness(data?.settings ?? null, copy)
  const systemTheme = useSystemTheme()
  const appearance = data?.settings.appearance ?? 'system'
  const resolvedTheme = resolveTheme(appearance, systemTheme)
  const turnInput = selectedSession && turnDraft.sessionId === selectedSession.id ? turnDraft.value : ''
  const setSessionTurnInput = useCallback((value: string) => {
    setTurnDraft({ sessionId: selectedSession?.id ?? null, value })
  }, [selectedSession?.id])

  useEffect(() => {
    document.documentElement.lang = activeLocale
  }, [activeLocale])

  useEffect(() => {
    const searchQuery = query.trim()
    if (!selectedSoulApp || !workbenchSearch || !searchQuery) {
      dispatchWorkbenchSearch({ query: searchQuery, type: 'idle' })
      return
    }
    let cancelled = false
    dispatchWorkbenchSearch({ query: searchQuery, type: 'loading' })
    searchSoulApp(selectedSoulApp.appId, workbenchSearch.protocolProvider, searchQuery, 8)
      .then((response) => {
        if (!cancelled) {
          dispatchWorkbenchSearch({
            items: response.items,
            query: searchQuery,
            type: 'loaded',
          })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          dispatchWorkbenchSearch({
            error: error instanceof Error ? error.message : String(error),
            query: searchQuery,
            type: 'failed',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [query, selectedSoulApp, workbenchSearch])

  function openSettings(section: SettingsSection = 'execution') {
    setSettingsInitialSection(section)
    setSettingsOpen(true)
  }

  async function runWorkbenchAction(action: LocalSoulAppWorkbenchAction) {
    if (!selectedSoulApp || workbenchActionState.busyActionId)
      return null
    setWorkbenchActionState({ busyActionId: action.id, error: null })
    try {
      const response = await invokeSoulAppAction(selectedSoulApp.appId, action.id, {
        source: 'soul-workbench',
      }, {
        sessionId: selectedSession?.id ?? undefined,
        workerId: selectedWorker?.id ?? undefined,
        workspaceId: selectedWorkspace?.id ?? undefined,
      })
      setWorkbenchActionState({
        busyActionId: null,
        error: response.result.ok ? null : response.result.message ?? 'Soul App action failed.',
      })
      if (response.result.refresh)
        await refresh()
      return response.result
    }
    catch (error) {
      setWorkbenchActionState({
        busyActionId: null,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  function toggleWorkerSoulGroup(soulId: string) {
    setCollapsedWorkerSoulIds((current) => {
      const next = new Set(current)
      if (next.has(soulId))
        next.delete(soulId)
      else
        next.add(soulId)
      return next
    })
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

  useEffect(() => {
    if (!selectedArtifact) {
      dispatchArtifactPreview({ type: 'idle' })
      return
    }
    let cancelled = false
    dispatchArtifactPreview({ artifactId: selectedArtifact.id, type: 'loading' })
    readFile(selectedArtifact.workspaceId, selectedArtifact.path)
      .then((content) => {
        if (!cancelled)
          dispatchArtifactPreview({ artifactId: selectedArtifact.id, content, type: 'loaded' })
      })
      .catch((error) => {
        if (!cancelled) {
          dispatchArtifactPreview({
            artifactId: selectedArtifact.id,
            error: error instanceof Error ? error.message : String(error),
            type: 'failed',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedArtifact])

  useEffect(() => {
    if (!workbenchSelectedWorkspace) {
      dispatchProfilePreview({ type: 'idle' })
      return
    }
    let cancelled = false
    dispatchProfilePreview({ type: 'loading', workspaceId: workbenchSelectedWorkspace.id })
    readProfile(workbenchSelectedWorkspace.id)
      .then((content) => {
        if (!cancelled)
          dispatchProfilePreview({ content, type: 'loaded', workspaceId: workbenchSelectedWorkspace.id })
      })
      .catch((error) => {
        if (!cancelled) {
          dispatchProfilePreview({
            error: error instanceof Error ? error.message : String(error),
            type: 'failed',
            workspaceId: workbenchSelectedWorkspace.id,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [workbenchSelectedWorkspace])

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

  async function submitSession(event: FormEvent<HTMLFormElement>, draft?: SoulSessionDraft) {
    event.preventDefault()
    const draftContext = draft?.context ?? workspaceContext
    const draftMaterials = draft?.materials ?? []
    if (!selectedSoul || !selectedWorker || !selectedWorkspace || !selectedTemplate || (!draftContext.trim() && draftMaterials.length === 0) || !engineReadiness.ready)
      return
    setSubmitting(true)
    try {
      const materialCopy = draft?.materialCopy ?? defaultSessionMaterialCopy
      const attachedMaterials = draftMaterials.length > 0
        ? await persistSessionMaterials(selectedWorkspace.id, draftMaterials, materialCopy)
        : []
      const sessionContext = buildSessionContextWithMaterials(draftContext, attachedMaterials, materialCopy)
      const body = buildProjectPrompt(selectedSoul, selectedTemplate, sessionContext)
      let sessionRouteShown = false
      const startedWorkerId = selectedWorker.id
      const startedWorkspaceId = selectedWorkspace.id
      const maybeNavigateToStartedSession = (sessionId: string) => {
        if (sessionRouteShown)
          return
        const currentRoute = parseWorkerRoute(window.location.pathname)
        const stillOnStartedWorker = currentRoute.kind === 'worker' && currentRoute.workerId === startedWorkerId
        const stillOnStartedWorkspace = currentRoute.kind === 'workspace' && currentRoute.workerId === startedWorkerId && currentRoute.workspaceId === startedWorkspaceId
        if (!stillOnStartedWorker && !stillOnStartedWorkspace)
          return
        sessionRouteShown = true
        navigateWorkerRoute({ kind: 'session', sessionId, workerId: startedWorkerId, workspaceId: startedWorkspaceId })
      }
      const sessionResult = await createSessionTurnStream(selectedWorkspace.id, {
        capabilityTemplateId: selectedTemplate.id,
        context: sessionContext,
        input: body,
        metadata: {
          ...(attachedMaterials.length > 0
            ? {
                attachedMaterials,
                materialCount: attachedMaterials.length,
              }
            : {}),
          inputHints: selectedTemplate.inputHints,
          outputKind: selectedTemplate.outputKind,
          requestedFrom: 'worker-web',
          reviewRubric: selectedTemplate.reviewRubric,
        },
        title: selectedWorkspace.name,
      }, selectedWorker.id, {
        onEvent: event => setStreamEvents(current => [...current, event]),
        onSession: (session) => {
          setStreamSessions(current => upsertSession(current, session))
          maybeNavigateToStartedSession(session.id)
        },
        onTurn: turn => setStreamTurns(current => upsertTurn(current, turn)),
      })
      setStreamSessions(current => upsertSession(current, sessionResult.session))
      setStreamTurns(current => upsertTurn(current, sessionResult.turn))
      setWorkspaceContext('')
      await refresh()
      maybeNavigateToStartedSession(sessionResult.session.id)
    }
    finally {
      setSubmitting(false)
    }
  }

  async function submitTurn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSession || !turnInput.trim() || !engineReadiness.ready)
      return
    setTurnSubmitting(true)
    try {
      const prompt = turnInput.trim()
      const now = new Date().toISOString()
      setPendingTurn({
        createdAt: now,
        error: null,
        id: `pending-${now}`,
        input: prompt,
        metadataJson: { optimistic: true },
        response: null,
        seq: (selectedSessionTurns.at(-1)?.seq ?? selectedSessionTurns.length) + 1,
        sessionId: selectedSession.id,
        status: 'running',
        updatedAt: now,
      })
      setTurnDraft({ sessionId: selectedSession.id, value: '' })
      const result = await continueSessionTurnStream(selectedSession.id, {
        input: prompt,
        metadata: {
          requestedFrom: 'worker-web-follow-up',
        },
      }, selectedSession.workerId, {
        onEvent: event => setStreamEvents(current => [...current, event]),
        onTurn: (turn) => {
          setStreamTurns(current => upsertTurn(current, turn))
          setPendingTurn(current => current?.sessionId === turn.sessionId ? null : current)
        },
      })
      setStreamTurns(current => upsertTurn(current, result.turn))
      await refresh()
    }
    catch {
      await refresh()
    }
    finally {
      setPendingTurn(null)
      setTurnSubmitting(false)
    }
  }

  async function submitReview() {
    if (!selectedWorkspace || !selectedSession || !selectedArtifact)
      return
    setReviewSubmitting(true)
    try {
      await createReview({
        artifactId: selectedArtifact.id,
        findingsJson: [{ message: 'Human review requested from Worker Web.' }],
        risksJson: [],
        sessionId: selectedSession.id,
        turnId: selectedTurn?.id ?? null,
        verdict: 'needs_review',
        workspaceId: selectedWorkspace.id,
      })
      await refresh()
    }
    finally {
      setReviewSubmitting(false)
    }
  }

  async function submitProfileRevision(profileMarkdown?: string) {
    if (!selectedWorkspace || !selectedArtifact || profileRevisionSubmitting)
      return
    setProfileRevisionSubmitting(true)
    try {
      const previewContent = artifactPreview.artifactId === selectedArtifact.id && !artifactPreview.loading && !artifactPreview.error
        ? artifactPreview.content.trim()
        : ''
      await promoteProfileRevision(selectedWorkspace.id, {
        artifactId: selectedArtifact.id,
        findingsJson: [{ message: 'Approved from HR workbench.' }],
        profileMarkdown: profileMarkdownForPromotion(previewContent, profileMarkdown),
        risksJson: [],
        verdict: 'pass',
      })
      try {
        const nextProfile = await readProfile(selectedWorkspace.id)
        dispatchProfilePreview({ content: nextProfile, type: 'loaded', workspaceId: selectedWorkspace.id })
      }
      catch (error) {
        dispatchProfilePreview({
          error: error instanceof Error ? error.message : String(error),
          type: 'failed',
          workspaceId: selectedWorkspace.id,
        })
      }
      await refresh()
    }
    finally {
      setProfileRevisionSubmitting(false)
    }
  }

  async function changeLessonStatus(lesson: LocalLesson, status: LocalLessonStatus) {
    setLessonBusyId(lesson.id)
    try {
      await updateLesson(lesson.id, status)
      await refresh()
    }
    finally {
      setLessonBusyId(null)
    }
  }

  function selectWorkbenchAction(action: SoulWorkbenchAction) {
    const nextTemplate = templates.find(template => template.id === action.templateId) ?? selectedTemplate
    if (nextTemplate)
      setSelectedTemplateId(nextTemplate.id)
    const target = selectedWorkspace?.name ?? selectedWorker?.name ?? selectedSoulCopy?.name ?? 'this people profile'
    setWorkspaceContext([
      `Workbench action: ${action.label}`,
      `Scope: ${action.scope}`,
      `Target: ${target}`,
      '',
      action.prompt,
      '',
      'Return this as a profile-bound artifact proposal with source-backed claims, missing evidence, risks, next-step notes, and human review notes.',
    ].join('\n'))
  }

  function renderWorkbenchActionButton(action: LocalSoulAppWorkbenchAction, icon: 'plus' | 'settings' = 'plus') {
    const busy = workbenchActionState.busyActionId === action.id
    const Icon = icon === 'settings' ? Settings : Plus
    return (
      <button
        key={action.id}
        aria-busy={busy}
        className="shell-primary-action"
        disabled={Boolean(workbenchActionState.busyActionId)}
        title="Provided by the Soul App protocol"
        type="button"
        onClick={() => void runWorkbenchAction(action)}
      >
        <Icon aria-hidden="true" size={14} />
        <span>{action.label}</span>
      </button>
    )
  }

  function renderWorkbenchSearchInput() {
    return workbenchSearch
      ? (
          <label className="toolbar-search">
            <span className="search-icon" aria-hidden="true">
              <Search size={13} />
            </span>
            <input
              aria-label={copy.accessibility.searchProjects}
              placeholder={workbenchSearch.placeholder}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
        )
      : null
  }

  const workbenchStatus = workbenchActionState.error
    ? (
        <p className="shell-action-status error" role="alert">
          {workbenchActionState.error}
        </p>
      )
    : null
  const workbenchSearchResults = workbenchSearch && workbenchSearchState.query
    ? (
        <div className="shell-search-results" role="status" aria-live="polite">
          {workbenchSearchState.loading ? <span className="shell-search-note">Searching</span> : null}
          {workbenchSearchState.error ? <span className="shell-search-note error">{workbenchSearchState.error}</span> : null}
          {!workbenchSearchState.loading && !workbenchSearchState.error
            ? workbenchSearchState.items.map(item => (
                <button key={item.id} type="button" className="shell-search-result">
                  <strong>{item.title}</strong>
                  {item.summary ? <span>{item.summary}</span> : null}
                </button>
              ))
            : null}
        </div>
      )
    : null
  const workbenchBridge = workbenchContract
    ? {
        actionDescriptors: workbenchActions,
        actionRoles: new Set(workbenchActions.map(action => action.role)),
        busyActionId: workbenchActionState.busyActionId,
        onAction: runWorkbenchAction,
        results: workbenchSearchResults,
        search: renderWorkbenchSearchInput(),
        status: workbenchStatus,
      }
    : null

  if (state.loading && !data) {
    return (
      <main className="od-loading-shell" data-appearance={appearance} data-theme={resolvedTheme}>
        <span>{copy.app.loading}</span>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="od-loading-shell" data-appearance={appearance} data-theme={resolvedTheme}>
        <span role="alert">{state.error}</span>
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
            <section className="workspace-rail-card first-run-rail-card">
              <StudioSectionHeader
                className="rail-section-head"
                title={copy.workspace.firstRunRailTitle}
                description={copy.workspace.firstRunRailHint}
              />
            </section>
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

  if (!selectedSoul || !selectedTemplate || !selectedSoulCopy || !selectedTemplateCopy)
    return null

  const isWorkspaceContextRoute = (route.kind === 'workspace' || route.kind === 'session') && Boolean(selectedWorkspace)
  const showWorkspaceContextSurface = isWorkspaceContextRoute && Boolean(selectedWorkspace)
  const showSessionSurface = route.kind === 'session' && Boolean(selectedWorkspace && selectedSession)
  const layoutVariant: WorkerStudioLayoutVariant = showSessionSurface ? 'session' : showWorkspaceContextSurface ? 'workspace' : 'home'
  const soulWorkbenchContext: SoulWorkbenchContext | null = selectedWorkbench
    ? {
        artifactPreview,
        artifacts: soulArtifacts,
        copy,
        engineReadiness,
        lessons: soulLessons,
        locale: activeLocale,
        reviews: soulReviews,
        selectedArtifact: workbenchSelectedWorkspace ? selectedArtifact : null,
        selectedTemplate,
        selectedWorkspace: workbenchSelectedWorkspace,
        workbenchBridge,
        sessions: soulSessions,
        soul: selectedSoul,
        soulCopy: selectedSoulCopy,
        submitting,
        templates,
        value: workspaceContext,
        workbench: selectedWorkbench,
        workerName: selectedWorker.name,
        workspaces: soulWorkspaces,
        onActionSelect: selectWorkbenchAction,
        onContextChange: setWorkspaceContext,
        onCreateWorkspace: () => setCreateWorkspaceOpen(true),
        onOpenConnectors: () => openSettings('connectors'),
        onOpenSettings: () => openSettings('execution'),
        onOpenSession: session => navigateWorkerRoute({ kind: 'session', sessionId: session.id, workerId: session.workerId, workspaceId: session.workspaceId }),
        onOpenWorkspace: workspace => navigateWorkerRoute({ kind: 'workspace', workerId: workspace.workerId, workspaceId: workspace.id }),
        onPromoteProfileRevision: submitProfileRevision,
        onRefresh: () => void refresh(),
        onSubmitSession: submitSession,
        onTemplateChange: setSelectedTemplateId,
        profilePreview,
        profileRevisionSubmitting,
      }
    : null

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
      detail={showSessionSurface
        ? (
            <SessionDetail
              artifact={selectedArtifact}
              artifactCopy={selectedArtifactCopy}
              artifactPreview={artifactPreview}
              artifacts={selectedWorkspaceArtifacts}
              copy={copy}
              engineReadiness={engineReadiness}
              events={displayedSessionEvents}
              lessonBusyId={lessonBusyId}
              lessons={selectedWorkspaceLessons}
              locale={activeLocale}
              mode="artifact"
              collapsed={detailDrawerCollapsed}
              review={selectedReview}
              reviewSubmitting={reviewSubmitting}
              reviews={selectedWorkspaceReviews}
              session={selectedSession}
              template={selectedSessionTemplate}
              turnInput={turnInput}
              turnSubmitting={turnSubmitting}
              turns={displayedSessionTurns}
              workspace={selectedWorkspace}
              onLessonStatus={(lesson, status) => void changeLessonStatus(lesson, status)}
              onReview={() => void submitReview()}
              onSubmitTurn={submitTurn}
              onTurnInputChange={setSessionTurnInput}
              progress={selectedSessionProgress}
            />
          )
        : null}
      detailCollapsed={detailDrawerCollapsed}
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

          <section className="newproj worker-list-panel soul-catalog-panel soul-rail-panel">
            <div className="newproj-body">
              <StudioSectionHeader
                className="section-head compact with-action"
                title={copy.workspace.workerList}
                description={copy.workspace.workerListHint}
                action={(
                  <IconButton
                    aria-label={copy.workspace.createWorker}
                    title={copy.workspace.createWorker}
                    onClick={() => setCreateWorkerOpen(true)}
                  >
                    <Plus aria-hidden="true" size={16} />
                  </IconButton>
                )}
              />
              <div className="worker-list-rail soul-rail" role="listbox" aria-label={copy.workspace.currentWorker}>
                {workerSoulGroups.map((group) => {
                  const collapsed = collapsedWorkerSoulIds.has(group.id)
                  const groupItemsId = `worker-soul-group-${group.id}`
                  return (
                    <StudioCollapsibleGroup
                      key={group.id}
                      collapsed={collapsed}
                      controlsId={groupItemsId}
                      description={group.domain}
                      drawerProps={{ 'role': 'group', 'aria-label': group.name }}
                      title={`${group.name} (${group.workers.length})`}
                      toggleAriaLabel={`${group.name} (${group.workers.length}) ${group.domain}`}
                      onToggle={() => toggleWorkerSoulGroup(group.id)}
                    >
                      {group.workers.map((worker) => {
                        const active = selectedWorker.id === worker.id
                        return (
                          <button
                            key={worker.id}
                            type="button"
                            className={`worker-list-item ${active ? 'active' : ''}`}
                            aria-selected={active}
                            role="option"
                            onClick={() => {
                              setSelectedWorkerId(worker.id)
                              setSelectedWorkspaceId(null)
                              const workerTemplates = data.templates.filter(template => template.soulId === worker.soulId)
                              const next = worker.soulId === 'aiworker-hr'
                                ? findHrProfileDraftTemplate(workerTemplates) ?? workerTemplates[0]
                                : workerTemplates[0]
                              if (next)
                                setSelectedTemplateId(next.id)
                              navigateWorkerRoute({ kind: 'worker', workerId: worker.id })
                            }}
                          >
                            <span className="worker-list-item-main">
                              <strong>{worker.name}</strong>
                            </span>
                            <span className={`status-dot ${worker.status === 'active' ? 'active' : ''}`} aria-hidden="true" />
                          </button>
                        )
                      })}
                    </StudioCollapsibleGroup>
                  )
                })}
              </div>
            </div>
          </section>

          <HostSidebarFooter runtimeVersion={data.info.runtimeVersion} onOpenSettings={() => openSettings('execution')} />
        </>
      )}
      main={(
        <>
          {showSessionSurface && selectedWorkspace && selectedSession && selectedSessionProgress
            ? (
                <WorkerSessionChat
                  key={selectedSession.id}
                  copy={copy}
                  detailDrawerOpen={!detailDrawerCollapsed}
                  engineReadiness={engineReadiness}
                  events={displayedSessionEvents}
                  locale={activeLocale}
                  session={selectedSession}
                  template={selectedSessionTemplate}
                  turnInput={turnInput}
                  turnSubmitting={turnSubmitting}
                  turns={displayedSessionTurns}
                  workspace={selectedWorkspace}
                  onBackToWorkspace={() => navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorkspace.workerId, workspaceId: selectedWorkspace.id })}
                  onOpenSettings={() => openSettings('execution')}
                  onRefresh={() => void refresh()}
                  onSubmitTurn={submitTurn}
                  onToggleDetailDrawer={() => setDetailDrawerCollapsed(current => !current)}
                  onTurnInputChange={setSessionTurnInput}
                  progress={selectedSessionProgress}
                />
              )
            : null}

          {!showSessionSurface && showSpecializedWorkbench && soulWorkbenchContext
            ? (
                <SoulWorkbenchRenderer context={soulWorkbenchContext} />
              )
            : null}

          {!showSessionSurface && !showSpecializedWorkbench && isWorkspaceContextRoute && selectedWorkspace
            ? (
                <>
                  <header className="entry-header workspace-header">
                    <div>
                      <span className="kicker">{copy.workspace.currentWorkspace}</span>
                      <h1>{selectedWorkspace.name}</h1>
                    </div>
                    <div className="entry-header-right">
                      <IconButton aria-label={copy.accessibility.refreshWorkspace} onClick={() => void refresh()}>
                        <RefreshCw aria-hidden="true" size={16} />
                      </IconButton>
                      <IconButton aria-label={copy.accessibility.openSettings} onClick={() => openSettings()}>
                        <Settings aria-hidden="true" size={16} />
                      </IconButton>
                    </div>
                  </header>

                  <div className="entry-tab-content workspace-content workspace-compose-content">
                    <WorkspaceSessionComposer
                      copy={copy}
                      engineReadiness={engineReadiness}
                      locale={activeLocale}
                      selectedTemplate={selectedTemplate}
                      submitting={submitting}
                      templates={templates}
                      value={workspaceContext}
                      workspace={selectedWorkspace}
                      onContextChange={setWorkspaceContext}
                      onSubmit={submitSession}
                      onTemplateChange={setSelectedTemplateId}
                    />
                  </div>
                </>
              )
            : null}

          {!showSessionSurface && !showSpecializedWorkbench && !(isWorkspaceContextRoute && selectedWorkspace)
            ? (
                <>
                  <header className="entry-header workspace-header">
                    <div>
                      <span className="kicker">{copy.workspace.currentWorker}</span>
                      <h1>{copy.workspace.workspaceTitle(selectedWorker.name)}</h1>
                    </div>
                    <div className="entry-header-right">
                      <IconButton aria-label={copy.accessibility.refreshWorkspace} onClick={() => void refresh()}>
                        <RefreshCw aria-hidden="true" size={16} />
                      </IconButton>
                      <IconButton aria-label={copy.accessibility.openSettings} onClick={() => openSettings()}>
                        <Settings aria-hidden="true" size={16} />
                      </IconButton>
                      <button className="avatar-btn" type="button" aria-label={copy.accessibility.workspace}>
                        <span aria-hidden="true" className="avatar-btn-initials">{workerInitials(selectedWorker.name)}</span>
                      </button>
                    </div>
                  </header>

                  <div className="entry-tab-content workspace-content">
                    <section className="worker-overview-panel">
                      <WorkerIdentityBlock
                        compact
                        copy={copy}
                        locale={activeLocale}
                        soul={selectedSoul}
                        soulCopy={selectedSoulCopy}
                        worker={selectedWorker}
                      />
                      <div className="worker-capability-summary">
                        <StudioSectionHeader className="rail-section-head" title={`${copy.create.capabilityTemplate} (${templates.length})`} />
                        <div className="worker-capability-chips">
                          {templates.map(template => (
                            <span key={template.id}>{displayTemplate(template, activeLocale).name}</span>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section className="workspace-list-section">
                      <div className="tab-panel-toolbar">
                        <div className="toolbar-left">
                          <strong>{`${copy.workspace.workspaceList} (${filteredProjects.length})`}</strong>
                          <IconButton
                            aria-label={copy.workspace.createWorkspace}
                            title={copy.workspace.createWorkspace}
                            onClick={() => setCreateWorkspaceOpen(true)}
                          >
                            <Plus aria-hidden="true" size={16} />
                          </IconButton>
                          {workbenchPrimaryAction
                            ? renderWorkbenchActionButton(workbenchPrimaryAction)
                            : null}
                          {secondaryWorkbenchActions.map(action => renderWorkbenchActionButton(action, action.role === 'settings' ? 'settings' : 'plus'))}
                        </div>

                        <div className="toolbar-right">
                          {workbenchSearch
                            ? renderWorkbenchSearchInput()
                            : (
                                <label className="toolbar-search">
                                  <span className="search-icon" aria-hidden="true">
                                    <Search size={13} />
                                  </span>
                                  <input
                                    aria-label={copy.accessibility.searchProjects}
                                    placeholder={copy.projects.searchPlaceholder}
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                  />
                                </label>
                              )}
                        </div>
                      </div>
                      {workbenchStatus}
                      {workbenchSearchResults}

                      <div className="design-grid workspace-grid workspace-list">
                        {filteredProjects.length > 0
                          ? filteredProjects.map(item => (
                              <WorkspaceCard
                                key={item.id}
                                active={selectedWorkspace?.id === item.id}
                                artifact={artifactForWorkspace(item, data.artifacts, allSessions)}
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
                                className="empty-design-state"
                                icon={<FileText size={20} />}
                                title={copy.projects.empty.title}
                                detail={copy.projects.empty.detail(selectedSoulCopy.name)}
                                action={(
                                  <button type="button" className="ghost icon-btn" onClick={() => setCreateWorkspaceOpen(true)}>
                                    <Plus aria-hidden="true" size={13} />
                                    <span>{copy.workspace.createWorkspace}</span>
                                  </button>
                                )}
                              />
                            )}
                      </div>
                    </section>
                  </div>
                </>
              )
            : null}
        </>
      )}
    />
  )
}

function profileMarkdownForPromotion(content: string, preparedProfileMarkdown?: string): string | undefined {
  if (preparedProfileMarkdown?.trim())
    return preparedProfileMarkdown.trim()

  const trimmed = content.trim()
  if (!trimmed)
    return undefined

  const prepared = prepareProfileMarkdownForPromotion({ artifactMarkdown: trimmed })
  return prepared.ok ? prepared.profileMarkdown : undefined
}

function findHrProfileDraftTemplate(templates: LocalWorkspaceData['templates'][number][]): LocalWorkspaceData['templates'][number] | null {
  return templates.find(template =>
    template.outputKind === 'profile-update-proposal'
    || template.id === 'profile-update-proposal'
    || template.id.endsWith('.profile-update-proposal'),
  ) ?? null
}

async function persistSessionMaterials(workspaceId: string, materials: SoulSessionMaterialInput[], copy: SessionMaterialCopy): Promise<SoulSessionMaterialDescriptor[]> {
  const batch = new Date().toISOString().replace(/[:.]/g, '-')
  const usedNames = new Set<string>()
  const descriptors: SoulSessionMaterialDescriptor[] = []

  for (const material of materials) {
    const safeName = uniqueMaterialFileName(sanitizeMaterialFileName(material.name), usedNames)
    const path = material.encoding === 'utf8'
      ? `evidence/uploads/${batch}/${safeName}`
      : `evidence/uploads/${batch}/${safeName}.base64.txt`
    const content = material.encoding === 'utf8'
      ? material.content
      : renderBase64MaterialFile(material, copy)
    await writeFile(workspaceId, path, content)
    descriptors.push({
      encoding: material.encoding,
      mimeType: material.mimeType,
      name: material.name,
      path,
      size: material.size,
    })
  }

  return descriptors
}

function buildSessionContextWithMaterials(context: string, materials: SoulSessionMaterialDescriptor[], copy: SessionMaterialCopy): string {
  const trimmed = context.trim()
  if (materials.length === 0)
    return trimmed

  const materialLines = materials.map(material =>
    `- ${material.name} (${material.mimeType || 'application/octet-stream'}, ${formatBytes(material.size)}): ${material.path}`,
  )
  return [
    trimmed,
    copy.heading,
    ...materialLines,
    '',
    copy.instruction,
  ].filter(Boolean).join('\n')
}

function sanitizeMaterialFileName(name: string): string {
  const base = name.trim().replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, '-')
  return base || 'candidate-material.txt'
}

function uniqueMaterialFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }

  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  let index = 2
  while (used.has(`${stem}-${index}${extension}`))
    index += 1
  const next = `${stem}-${index}${extension}`
  used.add(next)
  return next
}

function renderBase64MaterialFile(material: SoulSessionMaterialInput, copy: SessionMaterialCopy): string {
  return [
    `# ${copy.binaryTitle ?? 'Uploaded Source Material'}`,
    '',
    `- Original filename: ${material.name}`,
    `- MIME type: ${material.mimeType || 'application/octet-stream'}`,
    `- Size: ${formatBytes(material.size)}`,
    '- Encoding: base64',
    '',
    '```base64',
    material.content,
    '```',
    '',
  ].join('\n')
}

function formatBytes(size: number): string {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
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
    <header className="host-topbar" aria-label="Host actions">
      <div className="host-topbar-left">
        <IconButton
          aria-label={sidebarLabel}
          aria-pressed={!sidebarCollapsed}
          title={sidebarLabel}
          onClick={onToggleSidebar}
        >
          <PanelLeft aria-hidden="true" size={15} />
        </IconButton>
        <nav className="host-locator" aria-label="Current Soul worker">
          {locatorItems.map(item => (
            <span key={item.key} className="host-locator-segment">
              {item.showSeparator ? <span className="host-locator-separator" aria-hidden="true">/</span> : null}
              <span>{item.segment}</span>
            </span>
          ))}
        </nav>
      </div>
      <div className="host-topbar-actions" aria-label="Reserved Host panels">
        <IconButton
          aria-label="Open workspace terminal"
          title="Workspace terminal"
          disabled
        >
          <PanelBottom aria-hidden="true" size={15} />
        </IconButton>
        <IconButton
          aria-label="Open right panel"
          title="Right panel"
          disabled
        >
          <PanelRight aria-hidden="true" size={15} />
        </IconButton>
      </div>
    </header>
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
    <section className="host-sidebar-actions" aria-label="Host navigation">
      <button type="button" className="host-sidebar-action" onClick={onCreateWorker}>
        <Plus aria-hidden="true" size={15} />
        <span>New Soul worker</span>
      </button>
      <button type="button" className="host-sidebar-action" disabled>
        <Search aria-hidden="true" size={15} />
        <span>Search</span>
      </button>
      <button type="button" className="host-sidebar-action" onClick={onOpenSoulApps}>
        <span className="host-sidebar-action-icon" aria-hidden="true">
          <ChevronRight size={15} />
        </span>
        <span>Soul Apps</span>
      </button>
    </section>
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
    <footer className="host-sidebar-footer">
      <button type="button" className="host-settings-row" onClick={onOpenSettings}>
        <span className="host-settings-label">
          <Settings aria-hidden="true" size={14} />
          <span>Settings</span>
        </span>
        <span className="host-version">{version}</span>
      </button>
    </footer>
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
        className="empty-design-state"
        icon={<FileText size={20} />}
        title={copy.workspace.noSoulApps}
        detail={copy.workspace.noSoulAppsDetail}
        action={(
          <button type="button" className="ghost icon-btn" onClick={onCreateWorker}>
            <Plus aria-hidden="true" size={13} />
            <span>{copy.workspace.createWorker}</span>
          </button>
        )}
      />
    )
  }

  return (
    <section className="first-run-panel" aria-label={copy.workspace.firstRunTitle}>
      <div className="first-run-intro">
        <p>{copy.workspace.firstRunDetail}</p>
      </div>
      <div className="first-run-app-grid">
        {apps.map((app) => {
          const soul = soulForApp(app, souls)
          const soulCopy = soul ? displaySoul(soul, locale) : null
          const domain = soulCopy?.domain ?? app.projectedSoul?.domain ?? app.appId
          const description = soulCopy?.description ?? app.manifest.description
          return (
            <button
              key={app.appId}
              type="button"
              className="first-run-app-card"
              aria-label={copy.workspace.startSoulApp(app.manifest.name)}
              onClick={() => onStartApp(app)}
            >
              <span className="first-run-app-card-main">
                <strong>{app.manifest.name}</strong>
                <span>{domain}</span>
              </span>
              <span className="first-run-app-card-detail">{description}</span>
              <span className="first-run-app-card-foot">
                <span>{`${formatStatus(app.status, locale)} · ${app.version}`}</span>
                <span className="first-run-app-action">
                  <span>{copy.workspace.startSoulApp(app.manifest.name)}</span>
                  <ChevronRight aria-hidden="true" size={14} />
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
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
