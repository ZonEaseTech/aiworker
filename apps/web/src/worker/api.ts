import type {
  LocalArtifact,
  LocalBrief,
  LocalFile,
  LocalLesson,
  LocalReview,
  LocalRun,
  LocalRunEvent,
  LocalWorkspace,
} from '@zonease/aiworker-shared'

export interface LocalInfoResponse {
  workerId: string
  runtimeVersion: string
  startedAt: string
  workspace: LocalWorkspace
}

export interface LocalWorkspaceData {
  info: LocalInfoResponse
  briefs: LocalBrief[]
  runs: LocalRun[]
  files: LocalFile[]
  artifacts: LocalArtifact[]
  reviews: LocalReview[]
  lessons: LocalLesson[]
  events: LocalRunEvent[]
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
  const [info, briefs, runs, files, artifacts, reviews, lessons, events] = await Promise.all([
    localFetch<LocalInfoResponse>('/api/local/info'),
    localFetch<{ briefs: LocalBrief[] }>('/api/local/briefs'),
    localFetch<{ runs: LocalRun[] }>('/api/local/runs'),
    localFetch<{ files: LocalFile[] }>('/api/local/files'),
    localFetch<{ artifacts: LocalArtifact[] }>('/api/local/artifacts'),
    localFetch<{ reviews: LocalReview[] }>('/api/local/reviews'),
    localFetch<{ lessons: LocalLesson[] }>('/api/local/lessons'),
    localFetch<{ events: LocalRunEvent[] }>('/api/local/events'),
  ])
  return {
    info,
    briefs: briefs.briefs,
    runs: runs.runs,
    files: files.files,
    artifacts: artifacts.artifacts,
    reviews: reviews.reviews,
    lessons: lessons.lessons,
    events: events.events,
  }
}

export function createBrief(input: { title: string, body: string }): Promise<{ brief: LocalBrief }> {
  return localFetch('/api/local/briefs', { method: 'POST', body: JSON.stringify(input) })
}

export function startRun(input: { briefId?: string, prompt?: string }): Promise<{
  run: LocalRun
  events: LocalRunEvent[]
  files: LocalFile[]
  artifacts: LocalArtifact[]
  review: LocalReview | null
  lessons: LocalLesson[]
}> {
  return localFetch('/api/local/runs', { method: 'POST', body: JSON.stringify(input) })
}

export async function readFile(path: string): Promise<string> {
  const res = await fetch(`/api/local/files/raw/${path}`)
  if (!res.ok)
    throw new Error(`Local file ${res.status}: ${path}`)
  return await res.text()
}
