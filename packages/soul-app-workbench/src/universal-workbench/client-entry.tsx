import type {
  LocalSession,
  LocalSessionEvent,
  LocalSettingsConfig,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { EngineReadiness } from './timeline/engine-readiness'
import type {
  UniversalWorkbenchCapabilityTemplate,
  UniversalWorkbenchCreateSessionDraft,
  UniversalWorkbenchSubmitTurnDraft,
} from './UniversalWorkbenchApp'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveEngineReadiness } from './timeline/engine-readiness'
import { UniversalWorkbenchApp } from './UniversalWorkbenchApp'

interface MountedHostData {
  appId?: string | null
  routePrefix?: string | null
  sessionId?: string | null
  theme?: string | null
  workerId?: string | null
  workspaceId?: string | null
}

interface SessionTurnResult {
  events?: LocalSessionEvent[]
  session?: LocalSession
  turn?: LocalTurn
}

interface UniversalWorkbenchCreateSessionPayload {
  capabilityTemplateId: string
  input: string
  metadata: {
    materials: UniversalWorkbenchCreateSessionDraft['materials']
    mentions: UniversalWorkbenchCreateSessionDraft['mentions']
  }
  title: string
}

type SessionTurnStreamFrame
  = | { data: LocalSession, event: 'session' }
    | { data: LocalTurn, event: 'turn' }
    | { data: LocalSessionEvent, event: 'session_event' }
    | { data: SessionTurnResult, event: 'result' }
    | { data: { message?: string }, event: 'error' }
    | { data: unknown, event: string }

const MATERIAL_ONLY_DRAFT_INPUT = 'Use the attached source materials.'
const MOUNTED_ENGINE_READINESS_UNAVAILABLE: EngineReadiness = {
  detail: 'Unable to load local execution settings.',
  label: 'Execution settings unavailable',
  ready: false,
}
const SESSION_EVENT_POLL_INTERVAL_MS = 1000
const UNIVERSAL_WORKBENCH_ENGINE_COPY = {
  common: { notInstalled: 'Not installed' },
  workspace: {
    byokNeedsKey: 'Configure a BYOK provider, model, and API key reference in Settings before starting a session turn.',
    byokReady: (provider: string, model: string) => `${provider} · ${model} is ready for session turns.`,
    engineLoading: 'Checking execution settings...',
    engineMissing: (engineId: string) => `${engineId} is not known in local settings.`,
    engineNotInstalled: (engineName: string) => `${engineName} is selected but not installed on PATH.`,
    engineReadyDetail: (engineName: string) => `${engineName} is ready for session turns.`,
  },
}

export function resolveUniversalWorkbenchDraftInput(
  draft: Pick<UniversalWorkbenchCreateSessionDraft | UniversalWorkbenchSubmitTurnDraft, 'input' | 'materials'>,
): string {
  const input = draft.input.trim()
  if (input)
    return input
  // Material-only drafts still need neutral text so the native engine bridge can start a turn.
  return (draft.materials?.length ?? 0) > 0 ? MATERIAL_ONLY_DRAFT_INPUT : ''
}

export function buildUniversalWorkbenchCreateSessionPayload(
  draft: UniversalWorkbenchCreateSessionDraft,
  templates: readonly UniversalWorkbenchCapabilityTemplate[],
): UniversalWorkbenchCreateSessionPayload | null {
  const template = templates.find(t => t.id === draft.selectedTemplateId)
  if (!template)
    return null

  const input = resolveUniversalWorkbenchDraftInput(draft)
  if (!input)
    return null

  return {
    capabilityTemplateId: template.id,
    input,
    metadata: {
      materials: draft.materials ?? [],
      mentions: draft.mentions ?? [],
    },
    title: input.slice(0, 80) || template.name || template.id,
  }
}

export function resolveUniversalWorkbenchEngineReadiness(settings: LocalSettingsConfig | null): EngineReadiness {
  return resolveEngineReadiness(settings, UNIVERSAL_WORKBENCH_ENGINE_COPY)
}

export async function loadMountedEngineReadiness(): Promise<EngineReadiness> {
  try {
    const result = await fetchJson<{ settings: LocalSettingsConfig }>('/api/local/settings')
    return resolveUniversalWorkbenchEngineReadiness(result.settings)
  }
  catch {
    return MOUNTED_ENGINE_READINESS_UNAVAILABLE
  }
}

declare global {
  interface Window {
    __AIWORKER_MICRO_APP_HOST_DATA__?: MountedHostData
    microApp?: {
      addDataListener?: (listener: (data: MountedHostData) => void, autoTrigger?: boolean) => void
      dispatch?: (event: Record<string, unknown>) => void
      getData?: () => MountedHostData
    }
  }
}

function UniversalWorkbenchMountedClient() {
  const [hostData, setHostData] = useState<MountedHostData>(() => readInitialHostData())
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([])
  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [turns, setTurns] = useState<LocalTurn[]>([])
  const [events, setEvents] = useState<LocalSessionEvent[]>([])
  const [engineReadiness, setEngineReadiness] = useState(() => resolveUniversalWorkbenchEngineReadiness(null))
  const [templates, setTemplates] = useState<UniversalWorkbenchCapabilityTemplate[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(hostData.sessionId ?? null)
  const [turnInput, setTurnInput] = useState('')
  const [turnSubmitting, setTurnSubmitting] = useState(false)
  const eventsRef = useRef<LocalSessionEvent[]>([])

  useEffect(() => {
    eventsRef.current = events
  }, [events])

  const routePrefix = hostData.routePrefix ?? `/api/local/apps/${hostData.appId ?? ''}`
  const workerId = hostData.workerId ?? null
  const workspaceId = hostData.workspaceId ?? null

  const selectedWorkspace = useMemo(() => {
    if (workspaceId)
      return workspaces.find(workspace => workspace.id === workspaceId) ?? workspaces[0] ?? null
    return workspaces[0] ?? null
  }, [workspaceId, workspaces])

  const refresh = useCallback(async (preferredSessionId?: string | null) => {
    if (!workerId)
      return
    const [workspaceResult, templateResult] = await Promise.all([
      fetchJson<{ workspaces: LocalWorkspace[] }>(`${routePrefix}/api/workspaces?workerId=${encodeURIComponent(workerId)}`),
      fetchJson<{ templates: UniversalWorkbenchCapabilityTemplate[] }>(`${routePrefix}/api/templates?workerId=${encodeURIComponent(workerId)}`).catch(() => ({ templates: [] })),
    ])
    const nextWorkspaces = workspaceResult.workspaces
    setWorkspaces(nextWorkspaces)
    setTemplates(templateResult.templates)
    const sessionGroups = await Promise.all(nextWorkspaces.map(workspace =>
      fetchJson<{ sessions: LocalSession[] }>(`${routePrefix}/api/sessions?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(workspace.id)}`)
        .then(result => result.sessions)
        .catch(() => []),
    ))
    const nextSessions = sessionGroups.flat()
    setSessions(nextSessions)
    const nextSelectedSessionId = preferredSessionId ?? selectedSessionId ?? hostData.sessionId ?? nextSessions[0]?.id ?? null
    if (nextSelectedSessionId)
      await loadSessionDetail(routePrefix, workerId, nextSelectedSessionId, setTurns, setEvents)
  }, [hostData.sessionId, routePrefix, selectedSessionId, workerId])

  useEffect(() => {
    window.microApp?.addDataListener?.((data) => {
      setHostData(current => ({ ...current, ...data }))
    }, true)
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    void loadMountedEngineReadiness().then((nextReadiness) => {
      if (!cancelled)
        setEngineReadiness(nextReadiness)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedSessionId || !workerId)
      return
    let cancelled = false
    void loadSessionDetail(
      routePrefix,
      workerId,
      selectedSessionId,
      nextTurns => !cancelled && setTurns(nextTurns),
      nextEvents => !cancelled && setEvents(nextEvents),
    ).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [routePrefix, selectedSessionId, workerId])

  useEffect(() => {
    if (!selectedSessionId || !workerId)
      return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        // Derive the replay cursor from the live event list, scoped to this session and to real
        // (positive) backend ids, so synthetic stream-error events never advance it.
        const after = latestSessionEventId(eventsRef.current, selectedSessionId)
        const nextEvents = await loadSessionEvents(routePrefix, workerId, selectedSessionId, after)
        if (!cancelled && nextEvents.length > 0)
          appendSessionEvents(nextEvents)
        // Keep turns in sync so polled events whose turn was created out-of-band still render.
        const nextTurns = await loadSessionTurns(routePrefix, workerId, selectedSessionId)
        if (!cancelled)
          setTurns(current => mergeTurns(current, nextTurns))
      }
      catch {
        // Best-effort replay keeps the mounted workbench live without taking over Host error policy.
      }
      if (!cancelled)
        timer = setTimeout(poll, SESSION_EVENT_POLL_INTERVAL_MS)
    }

    timer = setTimeout(poll, SESSION_EVENT_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (timer)
        clearTimeout(timer)
    }
  }, [routePrefix, selectedSessionId, workerId])

  async function handleCreateSession(targetWorkspaceId: string, draft: UniversalWorkbenchCreateSessionDraft) {
    if (!workerId)
      return
    const payload = buildUniversalWorkbenchCreateSessionPayload(draft, templates)
    if (!payload)
      return
    const response = await fetch(`${routePrefix}/api/sessions/stream?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(targetWorkspaceId)}`, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    if (!response.ok)
      throw new Error(`Universal workbench API ${response.status}: ${routePrefix}/api/sessions/stream`)
    void consumeSessionTurnStream(response, (frame) => {
      applySessionTurnStreamFrame(frame, {
        onEvents: appendSessionEvents,
        onSession: (session) => {
          setSelectedSessionId(session.id)
          setSessions(current => [
            session,
            ...current.filter(item => item.id !== session.id),
          ])
          void refresh(session.id).catch(() => {})
        },
        onTurn: turn => setTurns(current => upsertTurn(current, turn)),
      })
    }).catch((error) => {
      appendSessionEvents([streamErrorEvent(error)])
    })
  }

  async function handleCreateWorkspace() {
    if (!workerId)
      return
    const result = await fetchJson<{ workspace: LocalWorkspace }>(`${routePrefix}/api/workspaces?workerId=${encodeURIComponent(workerId)}`, {
      body: JSON.stringify({ name: 'New workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    setWorkspaces(current => [...current, result.workspace])
  }

  async function handleSubmitTurn(draft: UniversalWorkbenchSubmitTurnDraft) {
    const input = resolveUniversalWorkbenchDraftInput(draft)
    if (!workerId || !selectedSessionId || !input)
      return
    setTurnSubmitting(true)
    try {
      const response = await fetch(`${routePrefix}/api/sessions/${encodeURIComponent(selectedSessionId)}/turns/stream?workerId=${encodeURIComponent(workerId)}`, {
        body: JSON.stringify({
          input,
          metadata: {
            materials: draft.materials ?? [],
            mentions: draft.mentions ?? [],
          },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok)
        throw new Error(`Universal workbench API ${response.status}: ${routePrefix}/api/sessions/${selectedSessionId}/turns/stream`)
      setTurnInput('')
      void consumeSessionTurnStream(response, (frame) => {
        applySessionTurnStreamFrame(frame, {
          onEvents: appendSessionEvents,
          onSession: session => setSessions(current => upsertSession(current, session)),
          onTurn: turn => setTurns(current => upsertTurn(current, turn)),
        })
      }).catch((error) => {
        appendSessionEvents([streamErrorEvent(error)])
      })
    }
    finally {
      setTurnSubmitting(false)
    }
  }

  return (
    <UniversalWorkbenchApp
      engineReadiness={engineReadiness}
      events={events}
      selectedSessionId={selectedSessionId}
      sessions={sessions}
      templates={templates}
      turnInput={turnInput}
      turnSubmitting={turnSubmitting}
      turns={turns}
      workspace={selectedWorkspace}
      workspaces={workspaces}
      onBackToWorkspace={() => setSelectedSessionId(null)}
      onCreateSession={handleCreateSession}
      onCreateWorkspace={handleCreateWorkspace}
      onRefresh={() => void refresh()}
      onSelectSession={setSelectedSessionId}
      onSubmitTurn={handleSubmitTurn}
      onTurnInputChange={setTurnInput}
    />
  )

  function appendSessionEvents(nextEvents: LocalSessionEvent[]): void {
    setEvents(current => mergeSessionEvents(current, nextEvents))
  }
}

async function consumeSessionTurnStream(response: Response, onFrame: (frame: SessionTurnStreamFrame) => void): Promise<void> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    applySessionTurnResult(await response.json() as SessionTurnResult, onFrame)
    return
  }

  const body = response.body
  if (!body) {
    onFrame({ data: { message: 'Universal workbench stream response was empty.' }, event: 'error' })
    return
  }

  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\n\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames)
      dispatchSessionTurnStreamFrame(frame, onFrame)
  }
  buffer += decoder.decode()
  if (buffer.trim())
    dispatchSessionTurnStreamFrame(buffer, onFrame)
}

function dispatchSessionTurnStreamFrame(rawFrame: string, onFrame: (frame: SessionTurnStreamFrame) => void): void {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of rawFrame.split(/\r?\n/)) {
    if (!line || line.startsWith(':'))
      continue
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:'))
      dataLines.push(line.slice('data:'.length).trimStart())
  }
  if (dataLines.length === 0)
    return
  const rawData = dataLines.join('\n')
  try {
    const data = JSON.parse(rawData) as unknown
    onFrame({ data, event } as SessionTurnStreamFrame)
  }
  catch {
    onFrame({ data: { message: rawData }, event: 'error' })
  }
}

function applySessionTurnResult(result: SessionTurnResult, onFrame: (frame: SessionTurnStreamFrame) => void): void {
  if (result.session)
    onFrame({ data: result.session, event: 'session' })
  if (result.turn)
    onFrame({ data: result.turn, event: 'turn' })
  for (const event of result.events ?? [])
    onFrame({ data: event, event: 'session_event' })
}

function applySessionTurnStreamFrame(
  frame: SessionTurnStreamFrame,
  handlers: {
    onEvents: (events: LocalSessionEvent[]) => void
    onSession: (session: LocalSession) => void
    onTurn: (turn: LocalTurn) => void
  },
): void {
  if (frame.event === 'session' && isRecord(frame.data)) {
    handlers.onSession(frame.data as LocalSession)
    return
  }
  if (frame.event === 'turn' && isRecord(frame.data)) {
    handlers.onTurn(frame.data as LocalTurn)
    return
  }
  if (frame.event === 'session_event' && isRecord(frame.data)) {
    handlers.onEvents([frame.data as LocalSessionEvent])
    return
  }
  if (frame.event === 'result' && isRecord(frame.data)) {
    applySessionTurnResult(frame.data as SessionTurnResult, (resultFrame) => {
      applySessionTurnStreamFrame(resultFrame, handlers)
    })
    return
  }
  if (frame.event === 'error')
    handlers.onEvents([streamErrorEvent(frame.data)])
}

function upsertSession(sessions: LocalSession[], session: LocalSession): LocalSession[] {
  return [
    session,
    ...sessions.filter(item => item.id !== session.id),
  ]
}

function upsertTurn(turns: LocalTurn[], turn: LocalTurn): LocalTurn[] {
  return [
    ...turns.filter(item => item.id !== turn.id),
    turn,
  ]
}

export function mergeSessionEvents(current: LocalSessionEvent[], nextEvents: LocalSessionEvent[]): LocalSessionEvent[] {
  const seen = new Set(current.map(event => event.id))
  return [
    ...current,
    ...nextEvents.filter((event) => {
      if (seen.has(event.id))
        return false
      seen.add(event.id)
      return true
    }),
  ]
}

export async function loadSessionEvents(
  routePrefix: string,
  workerId: string,
  sessionId: string,
  afterEventId: number,
): Promise<LocalSessionEvent[]> {
  const params = new URLSearchParams({ workerId })
  if (afterEventId > 0)
    params.set('after', String(afterEventId))
  const result = await fetchJson<{ events: LocalSessionEvent[] }>(
    `${routePrefix}/api/sessions/${encodeURIComponent(sessionId)}/events?${params.toString()}`,
  )
  return result.events
}

export async function loadSessionTurns(
  routePrefix: string,
  workerId: string,
  sessionId: string,
): Promise<LocalTurn[]> {
  const result = await fetchJson<{ turns: LocalTurn[] }>(
    `${routePrefix}/api/sessions/${encodeURIComponent(sessionId)}/turns?workerId=${encodeURIComponent(workerId)}`,
  )
  return result.turns
}

function mergeTurns(current: LocalTurn[], incoming: LocalTurn[]): LocalTurn[] {
  let changed = false
  const next = incoming.reduce((acc, turn) => {
    const existing = acc.find(item => item.id === turn.id)
    if (existing && existing.updatedAt === turn.updatedAt && existing.status === turn.status)
      return acc
    changed = true
    return upsertTurn(acc, turn)
  }, current)
  // Preserve the reference when nothing changed so the 1s turns poll does not force a re-render.
  return changed ? next : current
}

function latestSessionEventId(events: LocalSessionEvent[], sessionId: string): number {
  return events.reduce((max, event) => {
    // Ignore synthetic stream events (non-positive ids) and other sessions' events.
    if (event.id <= 0 || event.sessionId !== sessionId)
      return max
    return Math.max(max, event.id)
  }, 0)
}

// Synthetic client-side stream events use unique decreasing negative ids so they never collide
// in dedup and never advance the backend replay cursor.
let lastSyntheticEventId = 0

function streamErrorEvent(error: unknown): LocalSessionEvent {
  const message = isRecord(error) && typeof error.message === 'string'
    ? error.message
    : error instanceof Error ? error.message : String(error)
  lastSyntheticEventId -= 1
  return {
    createdAt: new Date().toISOString(),
    id: lastSyntheticEventId,
    invocationId: null,
    payloadJson: { message, source: 'universal-workbench-stream' },
    seq: 0,
    sessionId: 'universal-workbench-stream',
    turnId: null,
    type: 'error',
  }
}

async function loadSessionDetail(
  routePrefix: string,
  workerId: string,
  sessionId: string,
  setTurns: (turns: LocalTurn[]) => void,
  setEvents: (events: LocalSessionEvent[]) => void,
): Promise<void> {
  const detail = await fetchJson<{ events: LocalSessionEvent[], turns: LocalTurn[] }>(
    `${routePrefix}/api/sessions/${encodeURIComponent(sessionId)}?workerId=${encodeURIComponent(workerId)}`,
  )
  setTurns(detail.turns)
  setEvents(detail.events)
}

function readInitialHostData(): MountedHostData {
  if (window.__AIWORKER_MICRO_APP_HOST_DATA__)
    return window.__AIWORKER_MICRO_APP_HOST_DATA__
  const raw = document.getElementById('aiworker-micro-app-host-data')?.textContent
  if (!raw)
    return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed as MountedHostData : {}
  }
  catch {
    return {}
  }
}

async function fetchJson<T>(url: string, init?: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(url, init)
  const method = init?.method?.toUpperCase() ?? 'GET'
  if (!response.ok) {
    if (method === 'GET' && attempt < 2 && [502, 503, 504].includes(response.status)) {
      await delay(350 * (attempt + 1))
      return fetchJson<T>(url, init, attempt + 1)
    }
    throw new Error(`Universal workbench API ${response.status}: ${url}`)
  }
  return await response.json() as T
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const rootElement = typeof document === 'undefined' ? null : document.getElementById('root')
if (rootElement && typeof window !== 'undefined') {
  createRoot(rootElement).render(<UniversalWorkbenchMountedClient />)
  window.microApp?.dispatch?.({ type: 'ready', source: 'universal-workbench-client' })
}
