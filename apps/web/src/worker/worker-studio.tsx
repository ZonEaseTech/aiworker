import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalEngineStatus,
  LocalLesson,
  LocalLessonStatus,
  LocalReview,
  LocalSession,
  LocalSessionEvent,
  LocalSettingsConfig,
  LocalTurn,
  LocalWorker,
  LocalWorkspace,
  VerticalSoul,
} from '@zonease/aiworker-shared'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import type { LocalWorkspaceData } from './api'
import type { ArtifactPreviewState, EngineReadiness } from './session-detail'

import {
  ArrowLeft,
  Check,
  ChevronDown,
  FileText,
  Languages,
  Link,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useReducer, useState, useSyncExternalStore } from 'react'
import { continueSessionTurnStream, createReview, createSessionTurnStream, createWorker, createWorkspace, loadLocalWorkspaceData, readFile, rescanEngines, saveSettings, testEngine, updateLesson } from './api'
import {
  displaySoul,
  displayTemplate,
  formatRelativeTime,
  formatStatus,
  languageLabel,
  messagesFor,
  normalizeLocale,
  supportedLocales,
} from './i18n'
import { navigateWorkerRoute, parseWorkerRoute, useWorkerRoute } from './router'
import { WorkerSessionChat } from './session-chat'
import { SessionDetail } from './session-detail'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed'
type SettingsSection = 'execution' | 'soul-packs' | 'connectors' | 'mcp' | 'external-mcp' | 'language' | 'appearance' | 'about'
type ResolvedTheme = 'light' | 'dark'
type WorkerMessages = ReturnType<typeof messagesFor>
const themeMediaQuery = '(prefers-color-scheme: dark)'
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

const settingsSections: Array<{
  icon: typeof SlidersHorizontal
  id: SettingsSection
}> = [
  { id: 'execution', icon: SlidersHorizontal },
  { id: 'soul-packs', icon: Sparkles },
  { id: 'connectors', icon: Link },
  { id: 'mcp', icon: ShieldCheck },
  { id: 'external-mcp', icon: Terminal },
  { id: 'language', icon: Languages },
  { id: 'appearance', icon: Sun },
  { id: 'about', icon: Settings },
]

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

  const routeWorkspaceId = route.kind === 'workspace' || route.kind === 'session' ? route.workspaceId : null
  const routeWorkspace = routeWorkspaceId ? soulWorkspaces.find(item => item.id === routeWorkspaceId) ?? null : null
  const selectedWorkspace = routeWorkspace
    ?? (selectedWorkspaceId && soulWorkspaces.some(item => item.id === selectedWorkspaceId)
      ? soulWorkspaces.find(item => item.id === selectedWorkspaceId) ?? null
      : latest(soulWorkspaces))
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
      <main className="entry-shell" data-appearance={appearance} data-theme={resolvedTheme} data-testid="worker-studio-shell">
        <div className="entry workspace-entry workspace-home-route">
          <aside className="entry-side soul-sidebar" aria-label={copy.workspace.currentWorker}>
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
            <section className="newproj soul-catalog-panel soul-rail-panel">
              <div className="newproj-body">
                <div className="section-head compact with-action">
                  <div>
                    <h3>{copy.workspace.createWorker}</h3>
                    <p className="hint">{createSoulCopy?.description ?? copy.workspace.createWorkerHint}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-only"
                    aria-label={copy.workspace.createWorker}
                    title={copy.workspace.createWorker}
                    onClick={() => setCreateWorkerOpen(true)}
                  >
                    <Plus aria-hidden="true" size={15} />
                  </button>
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
          </aside>
          <section className="entry-main workspace-column" aria-label={copy.accessibility.soulProjectsAndArtifacts}>
            <header className="entry-header workspace-header">
              <div>
                <span className="kicker">{copy.workspace.currentWorker}</span>
                <h1>{copy.workspace.noWorker}</h1>
              </div>
            </header>
            <div className="entry-tab-content workspace-content">
              <section className="empty-design-state">
                <FileText aria-hidden="true" size={20} />
                <strong>{copy.workspace.noWorker}</strong>
                <span>{copy.workspace.createWorkerHint}</span>
                <button type="button" className="ghost icon-btn" onClick={() => setCreateWorkerOpen(true)}>
                  <Plus aria-hidden="true" size={13} />
                  <span>{copy.workspace.createWorker}</span>
                </button>
              </section>
            </div>
          </section>
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
        </div>
      </main>
    )
  }

  if (!selectedSoul || !selectedTemplate || !selectedSoulCopy || !selectedTemplateCopy)
    return null

  const isWorkspaceContextRoute = (route.kind === 'workspace' || route.kind === 'session') && Boolean(selectedWorkspace)
  const showWorkspaceContextSurface = isWorkspaceContextRoute && Boolean(selectedWorkspace)
  const showSessionSurface = route.kind === 'session' && Boolean(selectedWorkspace && selectedSession)

  return (
    <main className="entry-shell" data-appearance={appearance} data-theme={resolvedTheme} data-testid="worker-studio-shell">
      <div className={`entry workspace-entry ${showWorkspaceContextSurface ? `${showSessionSurface ? 'workspace-session-route has-artifact-rail' : 'workspace-context-route'}` : 'workspace-home-route'}${showSessionSurface && detailDrawerCollapsed ? ' detail-drawer-collapsed' : ''}`}>
        <aside
          className="entry-side soul-sidebar"
          aria-label={isWorkspaceContextRoute ? copy.workspace.workspaceNavigation : copy.accessibility.soulProjectCreator}
        >
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

          <section className={`readiness-card ${engineReadiness.ready ? 'ready' : 'blocked'}`}>
            <div>
              <strong>{copy.workspace.executionReady}</strong>
              <span>{engineReadiness.label}</span>
            </div>
            <button type="button" className="ghost icon-btn" onClick={() => openSettings('execution')}>
              <Settings aria-hidden="true" size={13} />
              <span>{copy.workspace.configure}</span>
            </button>
          </section>

          {isWorkspaceContextRoute && selectedWorkspace
            ? (
                <>
                  <section className="workspace-rail-card workspace-context-card">
                    <button
                      type="button"
                      className="rail-back-button"
                      onClick={() => navigateWorkerRoute({ kind: 'worker', workerId: selectedWorker.id })}
                    >
                      <ArrowLeft aria-hidden="true" size={13} />
                      <span>{copy.workspace.backToWorkerHome}</span>
                    </button>
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
                      : null}
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
                      <span className="count-pill">{workspaceSessions.length}</span>
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
                      <button
                        type="button"
                        className="rail-mini-action"
                        aria-label={copy.workspace.createWorkspace}
                        title={copy.workspace.createWorkspace}
                        onClick={() => setCreateWorkspaceOpen(true)}
                      >
                        <Plus aria-hidden="true" size={12} />
                        <span>{copy.workspace.newWorkspace}</span>
                      </button>
                    </div>
                    <div className="rail-workspace-list">
                      {soulWorkspaces.map(workspace => (
                        <button
                          key={workspace.id}
                          type="button"
                          className={`rail-workspace-item ${selectedWorkspace.id === workspace.id ? 'active' : ''}`}
                          onClick={() => navigateWorkerRoute({ kind: 'workspace', workerId: workspace.workerId, workspaceId: workspace.id })}
                        >
                          <strong>{workspace.name}</strong>
                          <small>{formatStatus(workspace.status, activeLocale)}</small>
                        </button>
                      ))}
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
                        <button
                          type="button"
                          className="icon-only"
                          aria-label={copy.workspace.createWorker}
                          title={copy.workspace.createWorker}
                          onClick={() => setCreateWorkerOpen(true)}
                        >
                          <Plus aria-hidden="true" size={15} />
                        </button>
                      </div>
                      <div className="worker-list-rail soul-rail" role="listbox" aria-label={copy.workspace.currentWorker}>
                        {data.workers.map((worker) => {
                          const soul = data.souls.find(item => item.id === worker.soulId)
                          const soulCopy = soul ? displaySoul(soul, activeLocale) : null
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
                                <small>{soulCopy?.name ?? worker.soulId}</small>
                                <span>{formatStatus(worker.status, activeLocale)}</span>
                              </span>
                            </button>
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
        </aside>

        <section className="entry-main workspace-column" aria-label={copy.accessibility.soulProjectsAndArtifacts}>
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
                      <button className="settings-trigger" type="button" aria-label={copy.accessibility.refreshWorkspace} onClick={() => void refresh()}>
                        <RefreshCw aria-hidden="true" size={16} />
                      </button>
                      <button className="settings-trigger" type="button" aria-label={copy.accessibility.openSettings} onClick={() => openSettings()}>
                        <Settings aria-hidden="true" size={16} />
                      </button>
                    </div>
                  </header>

                  <div className="entry-tab-content workspace-content">
                    <section className="newproj workspace-create-card" data-testid="new-session-panel">
                      <form className="newproj-body" onSubmit={submitSession}>
                        <div className="section-head compact">
                          <div>
                            <h3>{copy.workspace.createSession}</h3>
                            <p className="hint">{copy.workspace.createSessionHint(selectedTemplateCopy.name)}</p>
                          </div>
                        </div>

                        <StudioSelect
                          ariaLabel={copy.create.capabilityTemplate}
                          label={copy.create.capabilityTemplate}
                          options={templates.map((template) => {
                            const templateCopy = displayTemplate(template, activeLocale)
                            return {
                              description: template.outputKind,
                              label: templateCopy.name,
                              value: template.id,
                            }
                          })}
                          value={selectedTemplate.id}
                          onChange={setSelectedTemplateId}
                        />

                        <textarea
                          id="project-context"
                          className="newproj-context"
                          aria-label={copy.create.businessContext}
                          placeholder={selectedTemplateCopy.inputHints.join(' · ')}
                          value={workspaceContext}
                          onChange={event => setWorkspaceContext(event.target.value)}
                        />

                        {!engineReadiness.ready
                          ? (
                              <div className="inline-warning" role="status">
                                <ShieldCheck aria-hidden="true" size={14} />
                                <span>{engineReadiness.detail}</span>
                              </div>
                            )
                          : null}

                        <button className="primary newproj-create" data-testid="create-session" type="submit" disabled={!workspaceContext.trim() || submitting || !engineReadiness.ready}>
                          <Plus aria-hidden="true" size={13} />
                          <span>{submitting ? copy.create.creatingSession : copy.workspace.createSession}</span>
                        </button>
                      </form>
                    </section>

                    <section className="empty-design-state workspace-route-empty" aria-live="polite">
                      <FileText aria-hidden="true" size={20} />
                      <strong>{workspaceSessions.length > 0 ? copy.workspace.workspaceSessions : copy.workspace.noWorkspaceSessions}</strong>
                      <span>{copy.workspace.selectedCapability}</span>
                      <span>{selectedTemplateCopy.name}</span>
                    </section>
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
                      <button className="settings-trigger" type="button" aria-label={copy.accessibility.refreshWorkspace} onClick={() => void refresh()}>
                        <RefreshCw aria-hidden="true" size={16} />
                      </button>
                      <button className="settings-trigger" type="button" aria-label={copy.accessibility.openSettings} onClick={() => openSettings()}>
                        <Settings aria-hidden="true" size={16} />
                      </button>
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
                          <strong>{copy.create.capabilityTemplate}</strong>
                          <span className="count-pill">{templates.length}</span>
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
                          <strong>{copy.workspace.workspaceList}</strong>
                          <span className="count-pill">{filteredProjects.length}</span>
                          <button
                            type="button"
                            className="icon-only"
                            aria-label={copy.workspace.createWorkspace}
                            title={copy.workspace.createWorkspace}
                            onClick={() => setCreateWorkspaceOpen(true)}
                          >
                            <Plus aria-hidden="true" size={15} />
                          </button>
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

                      <div className="design-grid design-grid-list workspace-list">
                        {filteredProjects.length > 0
                          ? filteredProjects.map(item => (
                              <ProjectCard
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
        </section>

        {showSessionSurface
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
      </div>
    </main>
  )
}

function CreateWorkerDialog({
  availableSouls,
  copy,
  locale,
  onClose,
  onNameChange,
  onSoulChange,
  onSubmit,
  open,
  selectedSoulId,
  workerName,
}: {
  availableSouls: VerticalSoul[]
  copy: WorkerMessages
  locale: ReturnType<typeof normalizeLocale>
  onClose: () => void
  onNameChange: (value: string) => void
  onSoulChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  open: boolean
  selectedSoulId: string
  workerName: string
}) {
  return (
    <CreationDialog
      description={copy.workspace.createWorkerHint}
      open={open}
      title={copy.workspace.createWorker}
      titleId="create-worker-dialog-title"
      closeLabel={copy.accessibility.closeDialog}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={onSubmit}>
        <div className="settings-field">
          <span>{copy.create.soul}</span>
          <StudioSelect
            ariaLabel={copy.create.soul}
            label={copy.create.soul}
            options={availableSouls.map((soul) => {
              const soulCopy = displaySoul(soul, locale)
              return {
                description: soulCopy.domain,
                label: soulCopy.name,
                value: soul.id,
              }
            })}
            value={selectedSoulId}
            onChange={onSoulChange}
          />
        </div>
        <label className="settings-field">
          <span>{copy.workspace.workerName}</span>
          <input
            className="newproj-name"
            aria-label={copy.workspace.workerName}
            placeholder={copy.workspace.workerName}
            value={workerName}
            onChange={event => onNameChange(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</button>
          <button className="primary" type="submit" disabled={!workerName.trim() || availableSouls.length === 0}>
            <Plus aria-hidden="true" size={13} />
            <span>{copy.workspace.createWorker}</span>
          </button>
        </div>
      </form>
    </CreationDialog>
  )
}

function CreateWorkspaceDialog({
  copy,
  onClose,
  onSubmit,
  onTitleChange,
  open,
  placeholder,
  workerLabel,
  submitting,
  workspaceTitle,
}: {
  copy: WorkerMessages
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTitleChange: (value: string) => void
  open: boolean
  placeholder: string
  workerLabel: string
  submitting: boolean
  workspaceTitle: string
}) {
  return (
    <CreationDialog
      description={copy.workspace.createWorkspaceHint}
      open={open}
      title={copy.workspace.createWorkspace}
      titleId="create-workspace-dialog-title"
      closeLabel={copy.accessibility.closeDialog}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={onSubmit}>
        <label className="settings-field">
          <span>{copy.workspace.currentWorker}</span>
          <input readOnly value={workerLabel} />
        </label>
        <label className="settings-field">
          <span>{copy.create.projectName}</span>
          <input
            className="newproj-name"
            aria-label={copy.create.projectName}
            data-testid="new-project-name"
            placeholder={placeholder}
            value={workspaceTitle}
            onChange={event => onTitleChange(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</button>
          <button className="primary" data-testid="create-project" type="submit" disabled={!workspaceTitle.trim() || submitting}>
            <Plus aria-hidden="true" size={13} />
            <span>{copy.workspace.createWorkspace}</span>
          </button>
        </div>
      </form>
    </CreationDialog>
  )
}

function CreationDialog({
  children,
  closeLabel,
  description,
  onClose,
  open,
  title,
  titleId,
}: {
  children: ReactNode
  closeLabel: string
  description: string
  onClose: () => void
  open: boolean
  title: string
  titleId: string
}) {
  if (!open)
    return null

  return (
    <div
      className="modal-backdrop creation-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget)
          onClose()
      }}
    >
      <dialog className="modal creation-dialog" open aria-modal="true" aria-labelledby={titleId} onCancel={onClose}>
        <button type="button" className="settings-close creation-dialog-close" onClick={onClose} aria-label={closeLabel}>
          <X size={16} strokeWidth={2} />
        </button>
        <header className="modal-head creation-dialog-head">
          <span className="kicker">{title}</span>
          <h2 id={titleId}>{title}</h2>
          <p className="subtitle">{description}</p>
        </header>
        <div className="creation-dialog-body">
          {children}
        </div>
      </dialog>
    </div>
  )
}

function StudioSelect({
  ariaLabel,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel: string
  label: string
  onChange: (value: string) => void
  options: Array<{ description?: string, label: string, value: string }>
  value: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selected = options[selectedIndex]

  const choose = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
  }

  const chooseByOffset = (offset: number) => {
    if (options.length === 0)
      return
    const nextIndex = (selectedIndex + offset + options.length) % options.length
    const next = options[nextIndex]
    if (!next)
      return
    onChange(next.value)
    setOpen(true)
  }

  return (
    <div
      className={`studio-select ${open ? 'open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false)
      }}
    >
      <button
        type="button"
        id={`${id}-trigger`}
        className="studio-select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={`${id}-listbox`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(current => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            chooseByOffset(1)
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            chooseByOffset(-1)
            return
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(current => !current)
          }
        }}
      >
        <span id={`${id}-label`} className="sr-only">{label}</span>
        <span className="studio-select-copy">
          <strong>{selected?.label ?? ''}</strong>
          {selected?.description ? <small>{selected.description}</small> : null}
        </span>
        <ChevronDown aria-hidden="true" className="studio-select-chevron" size={16} />
      </button>
      {open
        ? (
            <div id={`${id}-listbox`} className="studio-select-list" role="listbox" aria-label={label}>
              {options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`studio-select-option ${option.value === value ? 'active' : ''}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => choose(option.value)}
                >
                  <span className="studio-select-copy">
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {option.value === value ? <Check aria-hidden="true" size={14} /> : null}
                </button>
              ))}
            </div>
          )
        : null}
    </div>
  )
}

function WorkerIdentityBlock({
  compact = false,
  copy,
  locale,
  soul,
  soulCopy,
  worker,
}: {
  compact?: boolean
  copy: WorkerMessages
  locale: ReturnType<typeof normalizeLocale>
  soul: VerticalSoul
  soulCopy: ReturnType<typeof displaySoul>
  worker: LocalWorker | null
}) {
  return (
    <div className={`worker-identity ${compact ? 'compact' : ''}`}>
      <div className="worker-identity-head">
        <span className="kicker">{copy.workspace.currentWorker}</span>
        <strong>{worker?.name ?? copy.workspace.noWorker}</strong>
      </div>
      <div className="worker-identity-grid">
        <span>{copy.workspace.workerId}</span>
        <strong>{worker?.id ?? '-'}</strong>
        <span>{copy.workspace.workerStatus}</span>
        <strong>{worker ? formatStatus(worker.status, locale) : copy.workspace.noWorker}</strong>
        <span>{copy.workspace.workerEngine}</span>
        <strong>{worker?.defaultEngineId ?? '-'}</strong>
        <span>{copy.workspace.workerSoul}</span>
        <strong>{`${soulCopy.name} / ${soul.id}`}</strong>
      </div>
    </div>
  )
}

function SettingsDialog({
  initial,
  initialSection,
  onClose,
  onSaved,
  runtimeVersion,
  souls,
  templates,
}: {
  initial: LocalSettingsConfig
  initialSection: SettingsSection
  onClose: () => void
  onSaved: (settings: LocalSettingsConfig) => void
  runtimeVersion: string
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
}) {
  const [settings, setSettings] = useState(initial)
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [autosave, setAutosave] = useState<AutosaveState>('idle')
  const [engineTest, setEngineTest] = useState<string | null>(null)
  const activeLocale = normalizeLocale(settings.language)
  const copy = messagesFor(activeLocale)
  const settingsCopy = copy.settings

  useEffect(() => {
    if (autosave !== 'saved')
      return undefined
    const timeout = window.setTimeout(() => {
      setAutosave(current => current === 'saved' ? 'idle' : current)
    }, 1600)
    return () => window.clearTimeout(timeout)
  }, [autosave])

  async function persist(patch: Partial<LocalSettingsConfig>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    setAutosave('saving')
    try {
      const result = await saveSettings(patch)
      setSettings(result.settings)
      onSaved(result.settings)
      setAutosave('saved')
    }
    catch {
      setAutosave('failed')
    }
  }

  async function handleRescan() {
    setAutosave('saving')
    try {
      const result = await rescanEngines()
      setSettings(result.settings)
      onSaved(result.settings)
      setAutosave('saved')
    }
    catch {
      setAutosave('failed')
    }
  }

  async function handleTest(engineId: string) {
    setEngineTest(settingsCopy.engine.testing)
    try {
      const result = await testEngine(engineId)
      setEngineTest(result.result.message)
    }
    catch (error) {
      setEngineTest(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-settings" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" onClick={event => event.stopPropagation()}>
        <div className="settings-chrome" aria-hidden={false}>
          {autosave !== 'idle'
            ? (
                <div className={`settings-autosave ${autosaveClass(autosave)}`} role="status" aria-live="polite">
                  {autosave === 'saving' ? <RefreshCw size={12} className="spin" /> : <Check size={12} />}
                  <span>{autosaveCopy(autosave, settingsCopy)}</span>
                </div>
              )
            : null}
          <button type="button" className="settings-close" onClick={onClose} aria-label={copy.accessibility.closeSettings} title={copy.accessibility.closeSettings}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <header className="modal-head">
          <span className="kicker">{settingsCopy.dialog.kicker}</span>
          <h2 id="settings-dialog-title">{settingsCopy.dialog.title}</h2>
          <p className="subtitle">{settingsCopy.dialog.subtitle}</p>
        </header>

        <div className="modal-body">
          <aside className="settings-sidebar" aria-label={settingsCopy.dialog.title}>
            {settingsSections.map((item) => {
              const Icon = item.icon
              const navCopy = settingsNavCopy(settingsCopy.nav, item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item${section === item.id ? ' active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{navCopy.title}</strong>
                    <small>{navCopy.detail}</small>
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="settings-content">
            {section === 'execution'
              ? (
                  <ExecutionSettings
                    copy={copy}
                    engineTest={engineTest}
                    onRescan={() => void handleRescan()}
                    onTest={engineId => void handleTest(engineId)}
                    settings={settings}
                    update={persist}
                  />
                )
              : null}
            {section === 'soul-packs' ? <SoulPackSettings copy={copy} locale={activeLocale} souls={souls} templates={templates} /> : null}
            {section === 'connectors' ? <ConnectorsSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'mcp' ? <LocalMcpSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'external-mcp' ? <ExternalMcpSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'language' ? <LanguageSettings copy={copy} locale={activeLocale} update={persist} /> : null}
            {section === 'appearance' ? <AppearanceSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'about'
              ? (
                  <div className="settings-section">
                    <div className="section-head">
                      <div>
                        <h3>{settingsCopy.about.title}</h3>
                        <p className="hint">{settingsCopy.about.hint}</p>
                      </div>
                    </div>
                    <dl className="about-grid">
                      <div>
                        <dt>{settingsCopy.about.version}</dt>
                        <dd>{runtimeVersion}</dd>
                      </div>
                      <div>
                        <dt>{settingsCopy.about.executionMode}</dt>
                        <dd>{settings.executionMode}</dd>
                      </div>
                      <div>
                        <dt>{settingsCopy.about.selectedEngine}</dt>
                        <dd>{settings.engineId}</dd>
                      </div>
                      <div>
                        <dt>{settingsCopy.about.updated}</dt>
                        <dd>{formatRelativeTime(settings.updatedAt, activeLocale)}</dd>
                      </div>
                    </dl>
                  </div>
                )
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function ExecutionSettings({
  copy,
  engineTest,
  onRescan,
  onTest,
  settings,
  update,
}: {
  copy: ReturnType<typeof messagesFor>
  engineTest: string | null
  onRescan: () => void
  onTest: (engineId: string) => void
  settings: LocalSettingsConfig
  update: (patch: Partial<LocalSettingsConfig>) => Promise<void>
}) {
  const installedCount = settings.engines.filter(engine => engine.installed).length
  const settingsCopy = copy.settings
  return (
    <>
      <div className="seg-control" role="tablist" aria-label={settingsCopy.nav.execution} style={{ '--seg-cols': 2 } as CSSProperties}>
        <button type="button" role="tab" aria-selected={settings.executionMode === 'local-cli'} className={`seg-btn ${settings.executionMode === 'local-cli' ? 'active' : ''}`} onClick={() => void update({ executionMode: 'local-cli' })}>
          <span className="seg-title">Local CLI</span>
          <span className="seg-meta">{settingsCopy.engine.availableCount(installedCount)}</span>
        </button>
        <button type="button" role="tab" aria-selected={settings.executionMode === 'byok'} className={`seg-btn ${settings.executionMode === 'byok' ? 'active' : ''}`} onClick={() => void update({ executionMode: 'byok' })}>
          <span className="seg-title">BYOK</span>
          <span className="seg-meta">{settings.byok.provider}</span>
        </button>
      </div>

      {settings.executionMode === 'local-cli'
        ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>{settingsCopy.engine.title}</h3>
                  <p className="hint">{settingsCopy.engine.hint}</p>
                </div>
                <div className="section-head-actions">
                  <button type="button" className="ghost icon-btn settings-test-btn" onClick={() => onTest(settings.engineId)}>
                    <span>{settingsCopy.engine.test}</span>
                  </button>
                  <button type="button" className="ghost icon-btn settings-rescan-btn" onClick={onRescan}>
                    <RefreshCw size={13} />
                    <span>{settingsCopy.engine.rescan}</span>
                  </button>
                </div>
              </div>

              <div className="agent-grid">
                {settings.engines.map(engine => (
                  <EngineCard
                    key={engine.id}
                    active={settings.engineId === engine.id}
                    copy={copy}
                    engine={engine}
                    onSelect={() => void update({ engineId: engine.id })}
                  />
                ))}
              </div>
              {engineTest ? <p className="settings-note" role="status">{engineTest}</p> : null}
            </section>
          )
        : (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>{settingsCopy.byok.title}</h3>
                  <p className="hint">{settingsCopy.byok.hint}</p>
                </div>
              </div>
              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>{settingsCopy.byok.provider}</span>
                  <input value={settings.byok.provider} onChange={event => void update({ byok: { ...settings.byok, provider: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>{settingsCopy.byok.baseUrl}</span>
                  <input value={settings.byok.baseUrl} onChange={event => void update({ byok: { ...settings.byok, baseUrl: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>{settingsCopy.byok.model}</span>
                  <input value={settings.byok.model} onChange={event => void update({ byok: { ...settings.byok, model: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>{settingsCopy.byok.apiKeyRef}</span>
                  <input value={settings.byok.apiKeyRef} onChange={event => void update({ byok: { ...settings.byok, apiKeyRef: event.target.value } })} placeholder="env:OPENAI_API_KEY" />
                </label>
              </div>
            </section>
          )}
    </>
  )
}

function EngineCard({ active, copy, engine, onSelect }: { active: boolean, copy: ReturnType<typeof messagesFor>, engine: LocalEngineStatus, onSelect: () => void }) {
  return (
    <button type="button" className={`agent-card${active ? ' active' : ''}${engine.installed ? '' : ' disabled'}`} disabled={!engine.installed} aria-pressed={active} onClick={onSelect}>
      <span className={`agent-icon ${engine.installed ? 'agent-icon-dark' : 'agent-icon-gray'}`} aria-hidden="true">
        {engine.installed ? <Sparkles size={24} /> : <span />}
      </span>
      <span className="agent-card-body">
        <span className="agent-card-name">{engine.name}</span>
        <span className="agent-card-meta">
          {engine.installed
            ? <span>{engine.version ?? engine.path ?? engine.command}</span>
            : <span className="muted">{copy.common.notInstalled}</span>}
        </span>
      </span>
      {engine.installed ? <span className={`status-dot${active ? ' active' : ''}`} aria-hidden="true" /> : null}
    </button>
  )
}

function SoulPackSettings({ copy, locale, souls, templates }: { copy: ReturnType<typeof messagesFor>, locale: ReturnType<typeof normalizeLocale>, souls: VerticalSoul[], templates: CapabilityTemplate[] }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.soulPacks.title}</h3>
          <p className="hint">{settingsCopy.soulPacks.hint}</p>
        </div>
      </div>
      <div className="settings-card-list">
        {souls.map((soul) => {
          const soulCopy = displaySoul(soul, locale)
          return (
            <article key={soul.id} className={`settings-card-row ${soul.status === 'available' ? '' : 'disabled'}`}>
              <strong>
                {soulCopy.name}
                {' '}
                {copy.create.soul}
              </strong>
              <span>{soulCopy.description}</span>
              <small>
                {templates.filter(template => template.soulId === soul.id).length}
                {' '}
                {copy.common.templates}
                {' · '}
                {soul.status === 'available' ? copy.common.available : copy.common.comingSoon}
              </small>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function ConnectorsSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.connectors.title}</h3>
          <p className="hint">{settingsCopy.connectors.hint}</p>
        </div>
      </div>
      <div className="connector-list">
        {settings.connectors.map(connector => (
          <label key={connector.id} className="switch-row">
            <span>
              <strong>{connector.name}</strong>
              <small>{connector.status === 'configured' ? settingsCopy.connectors.configured : settingsCopy.connectors.notConfigured}</small>
            </span>
            <input
              checked={connector.enabled}
              type="checkbox"
              onChange={event => void update({
                connectors: settings.connectors.map(item => item.id === connector.id
                  ? { ...item, enabled: event.target.checked, status: event.target.checked ? 'configured' : 'not_configured' }
                  : item),
              })}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function LocalMcpSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.localMcp.title}</h3>
          <p className="hint">{settingsCopy.localMcp.hint}</p>
        </div>
      </div>
      <label className="switch-row">
        <span>
          <strong>{settingsCopy.localMcp.toggle}</strong>
          <small>{settings.localMcpServer.url}</small>
        </span>
        <input checked={settings.localMcpServer.enabled} type="checkbox" onChange={event => void update({ localMcpServer: { ...settings.localMcpServer, enabled: event.target.checked } })} />
      </label>
    </div>
  )
}

function ExternalMcpSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.externalMcp.title}</h3>
          <p className="hint">{settingsCopy.externalMcp.hint}</p>
        </div>
      </div>
      <div className="connector-list">
        {settings.externalMcpServers.map(server => (
          <label key={server.id} className="settings-field">
            <span>{server.name}</span>
            <input
              value={server.command}
              onChange={event => void update({
                externalMcpServers: settings.externalMcpServers.map(item => item.id === server.id ? { ...item, command: event.target.value } : item),
              })}
              placeholder={settingsCopy.externalMcp.placeholder}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function LanguageSettings({ copy, locale, update }: { copy: ReturnType<typeof messagesFor>, locale: ReturnType<typeof normalizeLocale>, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.language.title}</h3>
          <p className="hint">{settingsCopy.language.hint}</p>
        </div>
      </div>
      <div className="seg-control" role="group" aria-label={settingsCopy.language.title} style={{ '--seg-cols': 4 } as CSSProperties}>
        {supportedLocales.map(language => (
          <button key={language} type="button" className={`seg-btn ${locale === language ? 'active' : ''}`} onClick={() => void update({ language })}>
            <span className="seg-title">{languageLabel(language, locale)}</span>
            <span className="seg-meta">{copy.common.interface}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AppearanceSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.appearance.title}</h3>
          <p className="hint">{settingsCopy.appearance.hint}</p>
        </div>
      </div>
      <div className="seg-control" role="group" aria-label={settingsCopy.appearance.title} style={{ '--seg-cols': 3 } as CSSProperties}>
        <AppearanceButton active={settings.appearance === 'system'} icon={<Settings size={14} />} label={settingsCopy.appearance.system} meta={copy.common.workspace} onClick={() => void update({ appearance: 'system' })} />
        <AppearanceButton active={settings.appearance === 'light'} icon={<Sun size={14} />} label={settingsCopy.appearance.light} meta={copy.common.workspace} onClick={() => void update({ appearance: 'light' })} />
        <AppearanceButton active={settings.appearance === 'dark'} icon={<Moon size={14} />} label={settingsCopy.appearance.dark} meta={copy.common.workspace} onClick={() => void update({ appearance: 'dark' })} />
      </div>
    </div>
  )
}

function AppearanceButton({ active, icon, label, meta, onClick }: { active: boolean, icon: ReactNode, label: string, meta: string, onClick: () => void }) {
  return (
    <button type="button" className={`seg-btn ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="seg-title seg-title-inline">
        {icon}
        {label}
      </span>
      <span className="seg-meta">{meta}</span>
    </button>
  )
}

function ProjectCard({
  active,
  artifact,
  item,
  locale,
  onSelect,
  session,
  template,
  turn,
}: {
  active: boolean
  artifact: LocalArtifact | null
  item: LocalWorkspace
  locale: ReturnType<typeof normalizeLocale>
  onSelect: () => void
  session: LocalSession | null
  template?: CapabilityTemplate
  turn: LocalTurn | null
}) {
  const copy = messagesFor(locale)
  const templateCopy = template ? displayTemplate(template, locale) : null
  const artifactLabel = artifact ? templateCopy?.outputKind ?? artifact.kind : copy.artifact.pending
  return (
    <button type="button" className={`design-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="design-card-thumb" aria-hidden="true">
        <FileText size={22} />
      </div>
      <div className="design-card-meta-block">
        <div className="design-card-name" title={item.name}>{item.name}</div>
        <div className="design-card-meta">
          <span className="ds">{templateCopy?.name ?? session?.capabilityTemplateId ?? copy.common.workspace}</span>
          {` · ${artifactLabel} · `}
          <span className="design-card-status design-card-status-succeeded">{formatStatus(turn?.status ?? session?.status ?? item.status, locale)}</span>
          {` · ${formatRelativeTime(item.updatedAt, locale)}`}
        </div>
      </div>
    </button>
  )
}

function resolveEngineReadiness(settings: LocalSettingsConfig | null, copy: WorkerMessages): EngineReadiness {
  if (!settings)
    return { detail: copy.workspace.engineLoading, label: copy.workspace.engineLoading, ready: false }
  if (settings.executionMode === 'byok') {
    const configured = settings.byok.provider.trim().length > 0 && settings.byok.model.trim().length > 0 && settings.byok.apiKeyRef.trim().length > 0
    return {
      detail: configured ? copy.workspace.byokReady(settings.byok.provider, settings.byok.model) : copy.workspace.byokNeedsKey,
      label: `${settings.byok.provider} · ${settings.byok.model}`,
      ready: configured,
    }
  }
  const engine = settings.engines.find(item => item.id === settings.engineId)
  if (!engine) {
    return {
      detail: copy.workspace.engineMissing(settings.engineId),
      label: settings.engineId,
      ready: false,
    }
  }
  return {
    detail: engine.installed ? copy.workspace.engineReadyDetail(engine.name) : copy.workspace.engineNotInstalled(engine.name),
    label: `${engine.name}${engine.installed ? '' : ` · ${copy.common.notInstalled}`}`,
    ready: engine.installed,
  }
}

function turnsForSession(session: LocalSession, turns: LocalTurn[]): LocalTurn[] {
  return turns.filter(turn => turn.sessionId === session.id).sort((a, b) => a.seq - b.seq)
}

function upsertTurn(turns: LocalTurn[], nextTurn: LocalTurn): LocalTurn[] {
  const byId = new Map(turns.map(turn => [turn.id, turn]))
  byId.set(nextTurn.id, nextTurn)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

function upsertSession(sessions: LocalSession[], nextSession: LocalSession): LocalSession[] {
  const byId = new Map(sessions.map(session => [session.id, session]))
  byId.set(nextSession.id, nextSession)
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function eventsForSession(session: LocalSession, events: LocalSessionEvent[]): LocalSessionEvent[] {
  return events.filter(event => event.sessionId === session.id).sort((a, b) => a.seq - b.seq)
}

function artifactsForWorkspace(workspace: LocalWorkspace, artifacts: LocalArtifact[]): LocalArtifact[] {
  return artifacts.filter(artifact => artifact.workspaceId === workspace.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function reviewsForWorkspace(workspace: LocalWorkspace, reviews: LocalReview[]): LocalReview[] {
  return reviews.filter(review => review.workspaceId === workspace.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function lessonsForWorkspace(workspace: LocalWorkspace, lessons: LocalLesson[]): LocalLesson[] {
  return lessons.filter(lesson => lesson.workspaceId === workspace.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function buildProjectPrompt(soul: VerticalSoul, template: CapabilityTemplate, context: string): string {
  return [
    `Soul: ${soul.name}`,
    `Domain system: ${soul.domain}`,
    `Capability template: ${template.name}`,
    `Output kind: ${template.outputKind}`,
    '',
    'Business context:',
    context.trim(),
    '',
    'Input hints:',
    ...template.inputHints.map(item => `- ${item}`),
    '',
    'Review rubric:',
    ...template.reviewRubric.map(item => `- ${item}`),
  ].join('\n')
}

function artifactForWorkspace(item: LocalWorkspace, artifacts: LocalArtifact[], sessions: LocalSession[]): LocalArtifact | null {
  const session = sessionForWorkspace(item, sessions)
  return session ? artifactForSession(session, artifacts) : null
}

function artifactForSession(session: LocalSession, artifacts: LocalArtifact[]): LocalArtifact | null {
  return artifacts.find(artifact => artifact.sessionId === session.id) ?? null
}

function reviewForSession(session: LocalSession, reviews: LocalReview[]): LocalReview | null {
  return reviews.find(review => review.sessionId === session.id) ?? null
}

function sessionForWorkspace(item: LocalWorkspace | null, sessions: LocalSession[]): LocalSession | null {
  if (!item)
    return null
  return sessions.filter(session => session.workspaceId === item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function turnForSession(item: LocalSession | null, turns: LocalTurn[]): LocalTurn | null {
  if (!item)
    return null
  return turns.filter(turn => turn.sessionId === item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function latest<T extends { updatedAt: string }>(items: T[]): T | null {
  return items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeSystemTheme, readSystemTheme, () => 'light')
}

function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => {}
  const media = window.matchMedia(themeMediaQuery)
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }
  media.addListener(onChange)
  return () => media.removeListener(onChange)
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return 'light'
  return window.matchMedia(themeMediaQuery).matches ? 'dark' : 'light'
}

function resolveTheme(appearance: LocalSettingsConfig['appearance'], systemTheme: ResolvedTheme): ResolvedTheme {
  return appearance === 'system' ? systemTheme : appearance
}

function settingsNavCopy(nav: WorkerMessages['settings']['nav'], section: SettingsSection): { detail: string, title: string } {
  if (section === 'execution')
    return { title: nav.execution, detail: nav.executionDetail }
  if (section === 'soul-packs')
    return { title: nav.soulPacks, detail: nav.soulPacksDetail }
  if (section === 'connectors')
    return { title: nav.connectors, detail: nav.connectorsDetail }
  if (section === 'mcp')
    return { title: nav.localMcp, detail: nav.localMcpDetail }
  if (section === 'external-mcp')
    return { title: nav.externalMcp, detail: nav.externalMcpDetail }
  if (section === 'language')
    return { title: nav.language, detail: nav.languageDetail }
  if (section === 'appearance')
    return { title: nav.appearance, detail: nav.appearanceDetail }
  return { title: nav.about, detail: nav.aboutDetail }
}

function autosaveCopy(state: AutosaveState, settingsCopy: WorkerMessages['settings']): string {
  if (state === 'saving')
    return settingsCopy.autosave.saving
  if (state === 'failed')
    return settingsCopy.autosave.failed
  return settingsCopy.autosave.saved
}

function autosaveClass(state: AutosaveState): string {
  if (state === 'saving')
    return 'is-saving'
  if (state === 'failed')
    return 'is-failed'
  return 'is-saved'
}

function projectNamePlaceholder(soulId: string, copy: WorkerMessages): string {
  if (soulId === 'hr')
    return copy.create.projectPlaceholders.hr
  if (soulId === 'pm')
    return copy.create.projectPlaceholders.pm
  if (soulId === 'qa')
    return copy.create.projectPlaceholders.qa
  if (soulId === 'devops')
    return copy.create.projectPlaceholders.devops
  return copy.create.projectPlaceholders.default
}

function selectedEngineLabel(settings: LocalSettingsConfig, copy: WorkerMessages): string {
  if (settings.executionMode === 'byok')
    return `${settings.byok.provider} · ${settings.byok.model}`
  const engine = settings.engines.find(item => item.id === settings.engineId)
  return engine ? `${engine.name}${engine.installed ? '' : ` · ${copy.common.notInstalled}`}` : settings.engineId
}
