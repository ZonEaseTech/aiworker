import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type {
  UniversalWorkbenchCreateSessionDraft,
  UniversalWorkbenchSubmitTurnDraft,
} from './UniversalWorkbenchApp'

import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { UniversalWorkbenchApp } from './UniversalWorkbenchApp'

interface MountedHostData {
  appId?: string | null
  routePrefix?: string | null
  sessionId?: string | null
  theme?: string | null
  workerId?: string | null
  workspaceId?: string | null
}

interface CapabilityTemplate {
  id: string
  name?: string
}

interface SessionTurnResult {
  events?: LocalSessionEvent[]
  session?: LocalSession
  turn?: LocalTurn
}

type SessionTurnStreamFrame =
  | { data: LocalSession, event: 'session' }
  | { data: LocalTurn, event: 'turn' }
  | { data: LocalSessionEvent, event: 'session_event' }
  | { data: SessionTurnResult, event: 'result' }
  | { data: { message?: string }, event: 'error' }
  | { data: unknown, event: string }

const MATERIAL_ONLY_DRAFT_INPUT = 'Use the attached source materials.'

export function resolveUniversalWorkbenchDraftInput(
  draft: Pick<UniversalWorkbenchCreateSessionDraft | UniversalWorkbenchSubmitTurnDraft, 'input' | 'materials'>,
): string {
  const input = draft.input.trim()
  if (input)
    return input
  // Material-only drafts still need neutral text so the native engine bridge can start a turn.
  return (draft.materials?.length ?? 0) > 0 ? MATERIAL_ONLY_DRAFT_INPUT : ''
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
  const [templates, setTemplates] = useState<CapabilityTemplate[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(hostData.sessionId ?? null)
  const [turnInput, setTurnInput] = useState('')
  const [turnSubmitting, setTurnSubmitting] = useState(false)

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
      fetchJson<{ templates: CapabilityTemplate[] }>(`${routePrefix}/api/templates?workerId=${encodeURIComponent(workerId)}`).catch(() => ({ templates: [] })),
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
    if (!selectedSessionId || !workerId)
      return
    void loadSessionDetail(routePrefix, workerId, selectedSessionId, setTurns, setEvents).catch(() => {})
  }, [routePrefix, selectedSessionId, workerId])

  async function handleCreateSession(targetWorkspaceId: string, draft: UniversalWorkbenchCreateSessionDraft) {
    if (!workerId)
      return
    const template = templates.find(t => t.id === draft.selectedTemplateId) ?? templates[0]
    if (!template)
      return
    const input = resolveUniversalWorkbenchDraftInput(draft)
    if (!input)
      return
    const response = await fetch(`${routePrefix}/api/sessions/stream?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(targetWorkspaceId)}`, {
      body: JSON.stringify({
        capabilityTemplateId: template.id,
        input,
        metadata: {
          materials: draft.materials ?? [],
          mentions: draft.mentions ?? [],
        },
        title: input.slice(0, 80) || template.name || template.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    if (!response.ok)
      throw new Error(`Universal workbench API ${response.status}: ${routePrefix}/api/sessions/stream`)
    void consumeSessionTurnStream(response, (frame) => {
      applySessionTurnStreamFrame(frame, {
        onEvents: nextEvents => setEvents(current => [...current, ...nextEvents]),
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
      setEvents(current => [...current, streamErrorEvent(error)])
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
          onEvents: nextEvents => setEvents(current => [...current, ...nextEvents]),
          onSession: session => setSessions(current => upsertSession(current, session)),
          onTurn: turn => setTurns(current => upsertTurn(current, turn)),
        })
      }).catch((error) => {
        setEvents(current => [...current, streamErrorEvent(error)])
      })
    }
    finally {
      setTurnSubmitting(false)
    }
  }

  return (
    <UniversalWorkbenchApp
      engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
      events={events}
      selectedSessionId={selectedSessionId}
      sessions={sessions}
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

function streamErrorEvent(error: unknown): LocalSessionEvent {
  const message = isRecord(error) && typeof error.message === 'string'
    ? error.message
    : error instanceof Error ? error.message : String(error)
  return {
    createdAt: new Date().toISOString(),
    id: Date.now(),
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
