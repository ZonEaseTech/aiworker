import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalFile,
  LocalLesson,
  LocalReview,
  LocalSession,
  LocalSessionEvent,
  LocalSettingsConfig,
  LocalTurn,
  LocalWorker,
  LocalWorkspace,
  VerticalSoul,
} from '@zonease/aiworker-shared'
import type { LocalHostedSoulApp, LocalInfoResponse, LocalSoulAppActionResponse, LocalSoulAppSearchResponse, LocalWorkspaceData } from './types'

import { localJson } from '../../../shared/api/local-client'

export async function loadLocalWorkspaceData(): Promise<LocalWorkspaceData> {
  const [info, apps, workers, souls, templates, workspaces, sessions, turns, files, artifacts, reviews, lessons, events, settings] = await Promise.all([
    localJson<LocalInfoResponse>('/api/local/info'),
    localJson<{ apps: LocalHostedSoulApp[] }>('/api/local/apps'),
    localJson<{ workers: LocalWorker[] }>('/api/local/workers'),
    localJson<{ souls: VerticalSoul[] }>('/api/local/souls'),
    localJson<{ templates: CapabilityTemplate[] }>('/api/local/templates'),
    localJson<{ workspaces: LocalWorkspace[] }>('/api/local/workspaces'),
    localJson<{ sessions: LocalSession[] }>('/api/local/sessions'),
    localJson<{ turns: LocalTurn[] }>('/api/local/turns'),
    localJson<{ files: LocalFile[] }>('/api/local/files'),
    localJson<{ artifacts: LocalArtifact[] }>('/api/local/artifacts'),
    localJson<{ reviews: LocalReview[] }>('/api/local/reviews'),
    localJson<{ lessons: LocalLesson[] }>('/api/local/lessons'),
    localJson<{ events: LocalSessionEvent[] }>('/api/local/events'),
    localJson<{ settings: LocalSettingsConfig }>('/api/local/settings'),
  ])
  return {
    info,
    apps: apps.apps,
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

export async function resolveMountedSurface<T>(appId: string, surfaceId: string): Promise<T> {
  return localJson<T>(`/api/local/apps/${appId}/surfaces/${surfaceId}`)
}

export async function invokeSoulAppAction(appId: string, actionId: string, input?: unknown): Promise<LocalSoulAppActionResponse> {
  return localJson<LocalSoulAppActionResponse>(`/api/local/apps/${appId}/actions/${actionId}`, {
    body: JSON.stringify({ input }),
    method: 'POST',
  })
}

export async function searchSoulApp(appId: string, providerId: string, query: string, limit?: number): Promise<LocalSoulAppSearchResponse> {
  const params = new URLSearchParams({
    providerId,
    query,
  })
  if (limit !== undefined)
    params.set('limit', String(limit))
  return localJson<LocalSoulAppSearchResponse>(`/api/local/apps/${appId}/search?${params.toString()}`)
}
