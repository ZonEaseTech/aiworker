import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalFile,
  LocalLesson,
  LocalLessonStatus,
  LocalReview,
  LocalReviewVerdict,
  LocalSession,
  LocalSessionEvent,
  LocalSettingsConfig,
  LocalTurn,
  LocalWorker,
  LocalWorkspace,
  VerticalSoul,
} from '@zonease/aiworker-shared'

export interface LocalInfoResponse {
  runtimeVersion: string
  startedAt: string
  workers: LocalWorker[]
}

export interface LocalWorkspaceData {
  info: LocalInfoResponse
  workers: LocalWorker[]
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
  workspaces: LocalWorkspace[]
  sessions: LocalSession[]
  turns: LocalTurn[]
  files: LocalFile[]
  artifacts: LocalArtifact[]
  reviews: LocalReview[]
  lessons: LocalLesson[]
  events: LocalSessionEvent[]
  settings: LocalSettingsConfig
}

async function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok)
    throw new Error(`Local API ${res.status}: ${path}`)
  return await res.json() as T
}

export async function loadLocalWorkspaceData(): Promise<LocalWorkspaceData> {
  const [info, workers, souls, templates, workspaces, sessions, turns, files, artifacts, reviews, lessons, events, settings] = await Promise.all([
    localFetch<LocalInfoResponse>('/api/local/info'),
    localFetch<{ workers: LocalWorker[] }>('/api/local/workers'),
    localFetch<{ souls: VerticalSoul[] }>('/api/local/souls'),
    localFetch<{ templates: CapabilityTemplate[] }>('/api/local/templates'),
    localFetch<{ workspaces: LocalWorkspace[] }>('/api/local/workspaces'),
    localFetch<{ sessions: LocalSession[] }>('/api/local/sessions'),
    localFetch<{ turns: LocalTurn[] }>('/api/local/turns'),
    localFetch<{ files: LocalFile[] }>('/api/local/files'),
    localFetch<{ artifacts: LocalArtifact[] }>('/api/local/artifacts'),
    localFetch<{ reviews: LocalReview[] }>('/api/local/reviews'),
    localFetch<{ lessons: LocalLesson[] }>('/api/local/lessons'),
    localFetch<{ events: LocalSessionEvent[] }>('/api/local/events'),
    localFetch<{ settings: LocalSettingsConfig }>('/api/local/settings'),
  ])
  return {
    info,
    workers: workers.workers,
    souls: souls.souls,
    templates: templates.templates,
    workspaces: workspaces.workspaces,
    sessions: sessions.sessions,
    turns: turns.turns,
    files: files.files,
    artifacts: artifacts.artifacts,
    reviews: reviews.reviews,
    lessons: lessons.lessons,
    events: events.events,
    settings: settings.settings,
  }
}

export function createWorkspace(workerId: string, input: {
  metadata?: Record<string, unknown>
  name: string
  sourcePointers?: Record<string, unknown>[]
  type?: string
}): Promise<{ workspace: LocalWorkspace }> {
  return localFetch(`/api/local/workers/${workerId}/workspaces`, { method: 'POST', body: JSON.stringify(input) })
}

export function createSessionTurn(workspaceId: string, input: {
  capabilityTemplateId: string
  context?: string
  input: string
  metadata?: Record<string, unknown>
  title: string
}): Promise<{
  session: LocalSession
  turn: LocalTurn
  files: LocalFile[]
  artifacts: LocalArtifact[]
  review: LocalReview | null
  lessons: LocalLesson[]
  events: LocalSessionEvent[]
}> {
  return localFetch(`/api/local/workspaces/${workspaceId}/sessions`, { method: 'POST', body: JSON.stringify(input) })
}

export function continueSessionTurn(sessionId: string, input: {
  input: string
  metadata?: Record<string, unknown>
}): Promise<{
  session: LocalSession
  turn: LocalTurn
  files: LocalFile[]
  artifacts: LocalArtifact[]
  review: LocalReview | null
  lessons: LocalLesson[]
  events: LocalSessionEvent[]
}> {
  return localFetch(`/api/local/sessions/${sessionId}/turns`, { method: 'POST', body: JSON.stringify(input) })
}

export async function continueSessionTurnStream(
  sessionId: string,
  input: {
    input: string
    metadata?: Record<string, unknown>
  },
  handlers: {
    onEvent?: (event: LocalSessionEvent) => void
    onTurn?: (turn: LocalTurn) => void
  } = {},
): Promise<{
  session: LocalSession
  turn: LocalTurn
  files: LocalFile[]
  artifacts: LocalArtifact[]
  review: LocalReview | null
  lessons: LocalLesson[]
  events: LocalSessionEvent[]
}> {
  const res = await fetch(`/api/local/sessions/${sessionId}/turns/stream`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!res.ok)
    throw new Error(`Local API ${res.status}: /api/local/sessions/${sessionId}/turns/stream`)
  if (!res.body)
    return continueSessionTurn(sessionId, input)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: Awaited<ReturnType<typeof continueSessionTurn>> | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n\n')
    while (index !== -1) {
      const frame = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const parsed = parseSseFrame(frame)
      if (parsed?.event === 'turn') {
        handlers.onTurn?.(parsed.data as LocalTurn)
      }
      else if (parsed?.event === 'session_event') {
        handlers.onEvent?.(parsed.data as LocalSessionEvent)
      }
      else if (parsed?.event === 'result') {
        result = parsed.data as Awaited<ReturnType<typeof continueSessionTurn>>
      }
      else if (parsed?.event === 'error') {
        const data = parsed.data as { message?: string }
        throw new Error(data.message ?? 'Session stream failed.')
      }
      index = buffer.indexOf('\n\n')
    }
  }

  if (!result)
    throw new Error('Session stream completed without a result.')
  return result
}

export function createReview(input: {
  artifactId?: string | null
  findingsJson?: Record<string, unknown>[]
  risksJson?: Record<string, unknown>[]
  sessionId?: string | null
  turnId?: string | null
  verdict?: LocalReviewVerdict
  workspaceId: string
}): Promise<{ review: LocalReview }> {
  return localFetch('/api/local/reviews', { method: 'POST', body: JSON.stringify(input) })
}

export function updateLesson(lessonId: string, status: LocalLessonStatus): Promise<{ lesson: LocalLesson }> {
  return localFetch(`/api/local/lessons/${lessonId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}

export function saveSettings(input: Partial<LocalSettingsConfig>): Promise<{ settings: LocalSettingsConfig }> {
  return localFetch('/api/local/settings', { method: 'PATCH', body: JSON.stringify(input) })
}

export function rescanEngines(): Promise<{ engines: LocalSettingsConfig['engines'], settings: LocalSettingsConfig }> {
  return localFetch('/api/local/settings/engines/rescan', { method: 'POST', body: JSON.stringify({}) })
}

export function testEngine(engineId: string): Promise<{ result: { engineId: string, message: string, status: 'fail' | 'pass' } }> {
  return localFetch('/api/local/settings/engines/test', { method: 'POST', body: JSON.stringify({ engineId }) })
}

export async function readFile(workspaceId: string, path: string): Promise<string> {
  const res = await fetch(`/api/local/workspaces/${workspaceId}/files/raw/${path}`)
  if (!res.ok)
    throw new Error(`Local file ${res.status}: ${path}`)
  return await res.text()
}

function parseSseFrame(frame: string): { data: unknown, event: string } | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':'))
      continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    }
    else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0)
    return null
  return { data: JSON.parse(dataLines.join('\n')), event }
}
