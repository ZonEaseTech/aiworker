import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'

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

  async function handleCreateSession(targetWorkspaceId: string, input: string) {
    if (!workerId)
      return
    const template = templates[0]
    if (!template)
      return
    const result = await fetchJson<SessionTurnResult>(`${routePrefix}/api/sessions?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(targetWorkspaceId)}`, {
      body: JSON.stringify({
        capabilityTemplateId: template.id,
        input,
        title: input.slice(0, 80) || template.name || template.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    if (result.session) {
      setSelectedSessionId(result.session.id)
      setSessions(current => [
        result.session!,
        ...current.filter(session => session.id !== result.session!.id),
      ])
      void refresh(result.session.id).catch(() => {})
    }
    if (result.turn)
      setTurns(current => [...current, result.turn!])
    if (result.events)
      setEvents(current => [...current, ...result.events!])
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

  async function handleSubmitTurn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workerId || !selectedSessionId || !turnInput.trim())
      return
    setTurnSubmitting(true)
    try {
      const result = await fetchJson<SessionTurnResult>(`${routePrefix}/api/sessions/${encodeURIComponent(selectedSessionId)}/turns?workerId=${encodeURIComponent(workerId)}`, {
        body: JSON.stringify({ input: turnInput.trim() }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      setTurnInput('')
      if (result.turn)
        setTurns(current => [...current, result.turn!])
      if (result.events)
        setEvents(current => [...current, ...result.events!])
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

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(<UniversalWorkbenchMountedClient />)
  window.microApp?.dispatch?.({ type: 'ready', source: 'universal-workbench-client' })
}
