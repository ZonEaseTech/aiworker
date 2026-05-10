import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalCase,
  LocalFile,
  LocalLesson,
  LocalReview,
  LocalRun,
  LocalRunEvent,
  LocalSettingsConfig,
  LocalWorkspace,
  VerticalSoul,
} from '@zonease/aiworker-shared'

export interface LocalInfoResponse {
  workerId: string
  runtimeVersion: string
  startedAt: string
  workspace: LocalWorkspace
}

export interface LocalWorkspaceData {
  info: LocalInfoResponse
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
  cases: LocalCase[]
  runs: LocalRun[]
  files: LocalFile[]
  artifacts: LocalArtifact[]
  reviews: LocalReview[]
  lessons: LocalLesson[]
  events: LocalRunEvent[]
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
  const [info, souls, templates, cases, runs, files, artifacts, reviews, lessons, events, settings] = await Promise.all([
    localFetch<LocalInfoResponse>('/api/local/info'),
    localFetch<{ souls: VerticalSoul[] }>('/api/local/souls'),
    localFetch<{ templates: CapabilityTemplate[] }>('/api/local/templates'),
    localFetch<{ cases: LocalCase[] }>('/api/local/cases'),
    localFetch<{ runs: LocalRun[] }>('/api/local/runs'),
    localFetch<{ files: LocalFile[] }>('/api/local/files'),
    localFetch<{ artifacts: LocalArtifact[] }>('/api/local/artifacts'),
    localFetch<{ reviews: LocalReview[] }>('/api/local/reviews'),
    localFetch<{ lessons: LocalLesson[] }>('/api/local/lessons'),
    localFetch<{ events: LocalRunEvent[] }>('/api/local/events'),
    localFetch<{ settings: LocalSettingsConfig }>('/api/local/settings'),
  ])
  return {
    info,
    souls: souls.souls,
    templates: templates.templates,
    cases: cases.cases,
    runs: runs.runs,
    files: files.files,
    artifacts: artifacts.artifacts,
    reviews: reviews.reviews,
    lessons: lessons.lessons,
    events: events.events,
    settings: settings.settings,
  }
}

export function createCase(input: {
  body: string
  metadata?: Record<string, unknown>
  selectedSkillId: string
  selectedSoulId: string
  title: string
}): Promise<{ case: LocalCase }> {
  return localFetch('/api/local/cases', { method: 'POST', body: JSON.stringify(input) })
}

export function startRun(input: { caseId?: string, prompt?: string }): Promise<{
  run: LocalRun
  events: LocalRunEvent[]
  files: LocalFile[]
  artifacts: LocalArtifact[]
  review: LocalReview | null
  lessons: LocalLesson[]
}> {
  return localFetch('/api/local/runs', { method: 'POST', body: JSON.stringify(input) })
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

export async function readFile(path: string): Promise<string> {
  const res = await fetch(`/api/local/files/raw/${path}`)
  if (!res.ok)
    throw new Error(`Local file ${res.status}: ${path}`)
  return await res.text()
}
