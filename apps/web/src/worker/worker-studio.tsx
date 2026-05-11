import type { WorkerStudioLayoutVariant } from '@zonease/aiworker-component'
import type {
  LocalLesson,
  LocalLessonStatus,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { LocalWorkspaceData } from '../features/local-workspace/api'
import type { SettingsSection } from '../features/settings'
import type { ArtifactPreviewState } from './session-detail'

import { IconButton, StudioMainFrame, WorkerStudioLayout } from '@zonease/aiworker-component'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Languages,
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
  formatRelativeTime,
  formatStatus,
  languageLabel,
  messagesFor,
  normalizeLocale,
} from '../features/i18n'
import { continueSessionTurnStream, createReview, createSessionTurnStream, createWorker, createWorkspace, loadLocalWorkspaceData, readFile, updateLesson } from '../features/local-workspace/api'
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
import { selectedEngineLabel } from '../features/settings/model'
import { resolveTheme, useSystemTheme } from '../features/theme/system-theme'
import { WorkerSessionChat } from './session-chat'
import { SessionDetail } from './session-detail'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

type WorkerMessages = ReturnType<typeof messagesFor>
const initialArtifactPreviewState: ArtifactPreviewState = {
  artifactId: null,
  content: '',
  error: null,
  loading: false,
}

type ArtifactPreviewAction
  = | { type: 'idle' }
    | { artifactId: string, type: 'loading' }
    | { artifactId: string, content: string, type: 'loaded' }
    | { artifactId: string, error: string, type: 'failed' }

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

export function WorkerStudio() {
  const route = useWorkerRoute()
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerSoulId, setNewWorkerSoulId] = useState('hr')
  const [selectedTemplateId, setSelectedTemplateId] = useState('candidate-screen')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [workspaceTitle, setWorkspaceTitle] = useState('')
  const [workspaceContext, setWorkspaceContext] = useState('')
  const [query, setQuery] = useState('')
  const [createWorkerOpen, setCreateWorkerOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [collapsedWorkerSoulIds, setCollapsedWorkerSoulIds] = useState<Set<string>>(() => new Set())
  const [detailDrawerCollapsed, setDetailDrawerCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution')
  const [submitting, setSubmitting] = useState(false)
  const [turnDraft, setTurnDraft] = useState<{ sessionId: null | string, value: string }>({ sessionId: null, value: '' })
  const [turnSubmitting, setTurnSubmitting] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [lessonBusyId, setLessonBusyId] = useState<string | null>(null)
  const [streamEvents, setStreamEvents] = useState<LocalSessionEvent[]>([])
  const [streamSessions, setStreamSessions] = useState<LocalSession[]>([])
  const [streamTurns, setStreamTurns] = useState<LocalTurn[]>([])
  const [pendingTurn, setPendingTurn] = useState<LocalTurn | null>(null)
  const [artifactPreview, dispatchArtifactPreview] = useReducer(artifactPreviewReducer, initialArtifactPreviewState)

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
  const selectedWorker = routedWorker ?? (selectedWorkerId ? data?.workers.find(worker => worker.id === selectedWorkerId) ?? null : null) ?? data?.workers[0] ?? null
  const selectedSoul = selectedWorker
    ? data?.souls.find(soul => soul.id === selectedWorker.soulId && soul.status === 'available') ?? null
    : data?.souls.find(soul => soul.id === newWorkerSoulId && soul.status === 'available') ?? data?.souls.find(soul => soul.status === 'available') ?? null
  const templates = useMemo(
    () => data?.templates.filter(template => template.soulId === selectedWorker?.soulId) ?? [],
    [data?.templates, selectedWorker?.soulId],
  )
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) ?? templates[0] ?? null
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

    for (const worker of data.workers) {
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
  }, [activeLocale, data])

  const routeWorkspaceId = route.kind === 'workspace' || route.kind === 'session' ? route.workspaceId : null
  const routeWorkspace = routeWorkspaceId ? soulWorkspaces.find(item => item.id === routeWorkspaceId) ?? null : null
  const selectedWorkspace = routeWorkspace
    ?? (selectedWorkspaceId && soulWorkspaces.some(item => item.id === selectedWorkspaceId)
      ? soulWorkspaces.find(item => item.id === selectedWorkspaceId) ?? null
      : latest(soulWorkspaces))
  const otherWorkspaces = useMemo(
    () => selectedWorkspace ? soulWorkspaces.filter(item => item.id !== selectedWorkspace.id) : soulWorkspaces,
    [selectedWorkspace, soulWorkspaces],
  )
  const workspaceSessions = useMemo(
    () => selectedWorkspace ? allSessions.filter(session => session.workspaceId === selectedWorkspace.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [],
    [allSessions, selectedWorkspace],
  )
  const routeSession = route.kind === 'session'
    ? allSessions.find(session => session.id === route.sessionId && session.workspaceId === route.workspaceId) ?? null
    : null
  const selectedSession = routeSession ?? (route.kind === 'workspace' ? null : selectedWorkspace ? sessionForWorkspace(selectedWorkspace, allSessions) : latest(soulSessions))
  const selectedTurn = selectedSession ? turnForSession(selectedSession, data?.turns ?? []) : null
  const selectedArtifact = selectedSession ? artifactForSession(selectedSession, data?.artifacts ?? []) : latest(soulArtifacts)
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
  const selectedWorkspaceArtifacts = selectedWorkspace ? artifactsForWorkspace(selectedWorkspace, data?.artifacts ?? []) : []
  const selectedWorkspaceLessons = selectedWorkspace ? lessonsForWorkspace(selectedWorkspace, data?.lessons ?? []) : []
  const selectedWorkspaceReviews = selectedWorkspace ? reviewsForWorkspace(selectedWorkspace, data?.reviews ?? []) : []
  const selectedSoulCopy = selectedSoul ? displaySoul(selectedSoul, activeLocale) : null
  const selectedTemplateCopy = selectedTemplate ? displayTemplate(selectedTemplate, activeLocale) : null
  const selectedSessionTemplate = selectedSession ? data?.templates.find(template => template.id === selectedSession.capabilityTemplateId) ?? null : null
  const selectedArtifactCopy = selectedSessionTemplate ? displayTemplate(selectedSessionTemplate, activeLocale) : null
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

  function openSettings(section: SettingsSection = 'execution') {
    setSettingsInitialSection(section)
    setSettingsOpen(true)
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

  async function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSoul || !selectedWorker || !selectedWorkspace || !selectedTemplate || !workspaceContext.trim() || !engineReadiness.ready)
      return
    setSubmitting(true)
    try {
      const body = buildProjectPrompt(selectedSoul, selectedTemplate, workspaceContext)
      let sessionRouteShown = false
      const startedWorkerId = selectedWorker.id
      const startedWorkspaceId = selectedWorkspace.id
      const maybeNavigateToStartedSession = (sessionId: string) => {
        if (sessionRouteShown)
          return
        const currentRoute = parseWorkerRoute(window.location.pathname)
        if (currentRoute.kind !== 'workspace' || currentRoute.workerId !== startedWorkerId || currentRoute.workspaceId !== startedWorkspaceId)
          return
        sessionRouteShown = true
        navigateWorkerRoute({ kind: 'session', sessionId, workerId: startedWorkerId, workspaceId: startedWorkspaceId })
      }
      const sessionResult = await createSessionTurnStream(selectedWorkspace.id, {
        capabilityTemplateId: selectedTemplate.id,
        context: workspaceContext,
        input: body,
        metadata: {
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
    const createSoulCopy = selectedSoul ? displaySoul(selectedSoul, activeLocale) : null
    return (
      <WorkerStudioLayout
        appearance={appearance}
        mainLabel={copy.accessibility.soulProjectsAndArtifacts}
        resolvedTheme={resolvedTheme}
        sidebarLabel={copy.workspace.currentWorker}
        variant="home"
        sidebar={(
          <>
            <StudioBrand copy={copy} />
            <section className="newproj soul-catalog-panel soul-rail-panel">
              <div className="newproj-body">
                <div className="section-head compact with-action">
                  <div>
                    <h3>{copy.workspace.createWorker}</h3>
                    <p className="hint">{createSoulCopy?.description ?? copy.workspace.createWorkerHint}</p>
                  </div>
                  <IconButton
                    aria-label={copy.workspace.createWorker}
                    title={copy.workspace.createWorker}
                    onClick={() => setCreateWorkerOpen(true)}
                  >
                    <Plus aria-hidden="true" size={16} />
                  </IconButton>
                </div>
                <div className="soul-list" role="listbox" aria-label={copy.accessibility.soulCatalog}>
                  {availableSouls.map((soul) => {
                    const soulCopy = displaySoul(soul, activeLocale)
                    return (
                      <button
                        key={soul.id}
                        type="button"
                        className={`soul-list-item ${newWorkerSoulId === soul.id ? 'active' : ''}`}
                        aria-selected={newWorkerSoulId === soul.id}
                        role="option"
                        onClick={() => setNewWorkerSoulId(soul.id)}
                      >
                        <span className="soul-list-item-main">
                          <strong>{soulCopy.name}</strong>
                          <small>{soulCopy.domain}</small>
                        </span>
                        <span className="soul-list-item-meta">
                          <span>{copy.common.available}</span>
                          {newWorkerSoulId === soul.id ? <Check aria-hidden="true" size={14} /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          </>
        )}
        main={(
          <StudioMainFrame kicker={copy.workspace.currentWorker} title={copy.workspace.noWorker}>
            <section className="empty-design-state">
              <FileText aria-hidden="true" size={20} />
              <strong>{copy.workspace.noWorker}</strong>
              <span>{copy.workspace.createWorkerHint}</span>
              <button type="button" className="ghost icon-btn" onClick={() => setCreateWorkerOpen(true)}>
                <Plus aria-hidden="true" size={13} />
                <span>{copy.workspace.createWorker}</span>
              </button>
            </section>
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

  return (
    <WorkerStudioLayout
      appearance={appearance}
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
              onCollapsedChange={setDetailDrawerCollapsed}
              onOpenSettings={openSettings}
              onRefresh={() => void refresh()}
              onReview={() => void submitReview()}
              onSubmitTurn={submitTurn}
              onTurnInputChange={setSessionTurnInput}
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
                  runtimeVersion={data.info.runtimeVersion}
                  souls={data.souls}
                  templates={data.templates}
                  onClose={() => setSettingsOpen(false)}
                  onSaved={(settings) => {
                    setState(current => current.data
                      ? { ...current, data: { ...current.data, settings }, loading: false }
                      : current)
                  }}
                />
              )
            : null}
        </>
      )}
      mainLabel={copy.accessibility.soulProjectsAndArtifacts}
      resolvedTheme={resolvedTheme}
      sidebarLabel={isWorkspaceContextRoute ? copy.workspace.workspaceNavigation : copy.accessibility.soulProjectCreator}
      variant={layoutVariant}
      sidebar={(
        <>
          <StudioBrand copy={copy} />

          {isWorkspaceContextRoute && selectedWorkspace
            ? (
                <>
                  <section className="workspace-rail-card workspace-context-card">
                    {showSessionSurface
                      ? (
                          <button
                            type="button"
                            className="rail-back-button"
                            onClick={() => navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorker.id, workspaceId: selectedWorkspace.id })}
                          >
                            <ArrowLeft aria-hidden="true" size={13} />
                            <span>{copy.workspace.backToWorkspace}</span>
                          </button>
                        )
                      : (
                          <button
                            type="button"
                            className="rail-back-button"
                            onClick={() => navigateWorkerRoute({ kind: 'worker', workerId: selectedWorker.id })}
                          >
                            <ArrowLeft aria-hidden="true" size={13} />
                            <span>{copy.workspace.backToWorker}</span>
                          </button>
                        )}
                    <div className="rail-context-main">
                      <span className="kicker">{copy.workspace.workspaceNavigation}</span>
                      <h3>{selectedWorkspace.name}</h3>
                      <p>{`${selectedSoulCopy.name} / ${selectedSoulCopy.domain}`}</p>
                    </div>
                    <WorkerIdentityBlock
                      compact
                      copy={copy}
                      locale={activeLocale}
                      soul={selectedSoul}
                      soulCopy={selectedSoulCopy}
                      worker={selectedWorker}
                    />
                    <div className="rail-meta-grid">
                      <span>{copy.workspace.currentWorkspace}</span>
                      <strong>{selectedWorkspace.name}</strong>
                      <span>{copy.workspace.selectedCapability}</span>
                      <strong>{selectedArtifactCopy?.name ?? selectedTemplateCopy.name}</strong>
                      <span>{copy.workspace.currentSession}</span>
                      <strong>{selectedSession ? formatStatus(selectedSession.status, activeLocale) : copy.artifact.noSession}</strong>
                    </div>
                  </section>

                  <section className="workspace-rail-card">
                    <div className="rail-section-head">
                      <strong>{copy.workspace.workspaceSessions}</strong>
                      <IconButton
                        aria-label={copy.workspace.newSession}
                        title={copy.workspace.newSession}
                        onClick={() => navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorkspace.workerId, workspaceId: selectedWorkspace.id })}
                      >
                        <Plus aria-hidden="true" size={16} />
                      </IconButton>
                    </div>
                    <div className="rail-session-list">
                      {workspaceSessions.length > 0
                        ? workspaceSessions.map(session => (
                            <button
                              key={session.id}
                              type="button"
                              className={`rail-session-item ${selectedSession?.id === session.id ? 'active' : ''}`}
                              onClick={() => navigateWorkerRoute({ kind: 'session', sessionId: session.id, workerId: session.workerId, workspaceId: session.workspaceId })}
                            >
                              <strong>{session.title}</strong>
                              <span>
                                {displayTemplate(data.templates.find(template => template.id === session.capabilityTemplateId) ?? selectedTemplate, activeLocale).name}
                                {' · '}
                                {formatStatus(session.status, activeLocale)}
                              </span>
                              <small>{copy.workspace.updated(formatRelativeTime(session.updatedAt, activeLocale))}</small>
                            </button>
                          ))
                        : <div className="rail-empty">{copy.workspace.noWorkspaceSessions}</div>}
                    </div>
                  </section>

                  <section className="workspace-rail-card">
                    <div className="rail-section-head">
                      <strong>{copy.workspace.otherWorkspaces}</strong>
                      <IconButton
                        aria-label={copy.workspace.createWorkspace}
                        title={copy.workspace.createWorkspace}
                        onClick={() => setCreateWorkspaceOpen(true)}
                      >
                        <Plus aria-hidden="true" size={16} />
                      </IconButton>
                    </div>
                    <div className="rail-workspace-list">
                      {otherWorkspaces.length > 0
                        ? otherWorkspaces.map(workspace => (
                            <button
                              key={workspace.id}
                              type="button"
                              className="rail-workspace-item"
                              onClick={() => navigateWorkerRoute({ kind: 'workspace', workerId: workspace.workerId, workspaceId: workspace.id })}
                            >
                              <strong>{workspace.name}</strong>
                              <small>{formatStatus(workspace.status, activeLocale)}</small>
                            </button>
                          ))
                        : <div className="rail-empty">{copy.workspace.noOtherWorkspaces}</div>}
                    </div>
                  </section>
                </>
              )
            : (
                <>
                  <section className="newproj worker-list-panel soul-catalog-panel soul-rail-panel">
                    <div className="newproj-body">
                      <div className="section-head compact with-action">
                        <div>
                          <h3>{copy.workspace.workerList}</h3>
                          <p className="hint">{copy.workspace.workerListHint}</p>
                        </div>
                        <IconButton
                          aria-label={copy.workspace.createWorker}
                          title={copy.workspace.createWorker}
                          onClick={() => setCreateWorkerOpen(true)}
                        >
                          <Plus aria-hidden="true" size={16} />
                        </IconButton>
                      </div>
                      <div className="worker-list-rail soul-rail" role="listbox" aria-label={copy.workspace.currentWorker}>
                        {workerSoulGroups.map((group) => {
                          const collapsed = collapsedWorkerSoulIds.has(group.id)
                          const groupItemsId = `worker-soul-group-${group.id}`
                          return (
                            <div key={group.id} className="worker-soul-group">
                              <button
                                type="button"
                                className="worker-soul-group-toggle"
                                aria-label={`${group.name} (${group.workers.length}) ${group.domain}`}
                                aria-controls={groupItemsId}
                                aria-expanded={!collapsed}
                                onClick={() => toggleWorkerSoulGroup(group.id)}
                              >
                                <span className="worker-soul-group-title">
                                  <strong>{`${group.name} (${group.workers.length})`}</strong>
                                  <small>{group.domain}</small>
                                </span>
                                {collapsed
                                  ? <ChevronRight aria-hidden="true" size={14} />
                                  : <ChevronDown aria-hidden="true" size={14} />}
                              </button>

                              {!collapsed
                                ? (
                                    <div id={groupItemsId} className="worker-soul-group-items" role="group" aria-label={group.name}>
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
                                              const next = data.templates.find(template => template.soulId === worker.soulId)
                                              if (next)
                                                setSelectedTemplateId(next.id)
                                              navigateWorkerRoute({ kind: 'worker', workerId: worker.id })
                                            }}
                                          >
                                            <span className="worker-list-item-main">
                                              <strong>{worker.name}</strong>
                                              <span className={`status-dot ${worker.status === 'active' ? 'active' : ''}`} aria-hidden="true" />
                                            </span>
                                            <span className="worker-list-item-meta">
                                              <small>{group.name}</small>
                                              <span>{formatStatus(worker.status, activeLocale)}</span>
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )
                                : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                </>
              )}

          <div className="entry-side-foot">
            <button type="button" className="foot-pill" onClick={() => openSettings('execution')}>
              <Settings aria-hidden="true" size={12} />
              <span>{data.settings.executionMode === 'local-cli' ? 'Local CLI' : 'BYOK'}</span>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
              <span>{selectedEngineLabel(data.settings, copy)}</span>
            </button>
            <button type="button" className="foot-pill" aria-label={copy.accessibility.languageSwitcher} onClick={() => openSettings('language')}>
              <Languages aria-hidden="true" size={12} />
              <span>{languageLabel(activeLocale, activeLocale)}</span>
              <ChevronDown aria-hidden="true" size={12} />
            </button>
          </div>
        </>
      )}
      main={(
        <>
          {showSessionSurface && selectedWorkspace && selectedSession
            ? (
                <WorkerSessionChat
                  key={selectedSession.id}
                  copy={copy}
                  engineReadiness={engineReadiness}
                  events={displayedSessionEvents}
                  locale={activeLocale}
                  session={selectedSession}
                  template={selectedSessionTemplate}
                  turnInput={turnInput}
                  turnSubmitting={turnSubmitting}
                  turns={displayedSessionTurns}
                  workspace={selectedWorkspace}
                  onBackToWorkspace={() => navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorker.id, workspaceId: selectedWorkspace.id })}
                  onOpenSettings={() => openSettings('execution')}
                  onRefresh={() => void refresh()}
                  onSubmitTurn={submitTurn}
                  onTurnInputChange={setSessionTurnInput}
                />
              )
            : null}

          {!showSessionSurface && isWorkspaceContextRoute && selectedWorkspace
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
                      engineLabel={selectedEngineLabel(data.settings, copy)}
                      engineReadiness={engineReadiness}
                      locale={activeLocale}
                      selectedTemplate={selectedTemplate}
                      submitting={submitting}
                      templates={templates}
                      value={workspaceContext}
                      workspace={selectedWorkspace}
                      onContextChange={setWorkspaceContext}
                      onOpenSettings={() => openSettings('execution')}
                      onSubmit={submitSession}
                      onTemplateChange={setSelectedTemplateId}
                    />
                  </div>
                </>
              )
            : null}

          {!showSessionSurface && !(isWorkspaceContextRoute && selectedWorkspace)
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
                        <span aria-hidden="true" className="avatar-btn-initials">{selectedWorker.name}</span>
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
                        <div className="rail-section-head">
                          <strong>{`${copy.create.capabilityTemplate} (${templates.length})`}</strong>
                        </div>
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
                        </div>

                        <div className="toolbar-right">
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
                        </div>
                      </div>

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
                              <div className="empty-design-state">
                                <FileText aria-hidden="true" size={20} />
                                <strong>{copy.projects.empty.title}</strong>
                                <span>{copy.projects.empty.detail(selectedSoulCopy.name)}</span>
                                <button type="button" className="ghost icon-btn" onClick={() => setCreateWorkspaceOpen(true)}>
                                  <Plus aria-hidden="true" size={13} />
                                  <span>{copy.workspace.createWorkspace}</span>
                                </button>
                              </div>
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

function StudioBrand({ copy }: { copy: WorkerMessages }) {
  return (
    <div className="entry-brand">
      <span className="entry-brand-mark" aria-hidden="true">AI</span>
      <div className="entry-brand-text">
        <div className="entry-brand-title-row">
          <span className="entry-brand-title">{copy.app.brand}</span>
          <span className="entry-brand-pill">{copy.app.workspacePill}</span>
        </div>
        <div className="entry-brand-subtitle">{copy.app.subtitle}</div>
      </div>
    </div>
  )
}
