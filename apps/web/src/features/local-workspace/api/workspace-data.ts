import type {
  LocalSession,
  LocalSettingsConfig,
  LocalTurn,
  LocalWorker,
  LocalWorkspace,
} from '@zonease/aiworker-soul-protocol'
import type { CapabilityTemplate, VerticalSoul } from '../types.compat'
import type { LocalHostedSoulApp, LocalInfoResponse, LocalSoulAppLifecycleResponse, LocalWorkspaceData } from './types'

import { localJson } from '../../../shared/api/local-client'

export async function loadLocalWorkspaceData(): Promise<LocalWorkspaceData> {
  const [info, apps, workers, souls, templates, workspaces, sessions, turns, settings] = await Promise.all([
    localJson<LocalInfoResponse>('/api/local/info'),
    localJson<{ apps: LocalHostedSoulApp[] }>('/api/local/apps'),
    localJson<{ workers: LocalWorker[] }>('/api/local/workers'),
    localJson<{ souls: VerticalSoul[] }>('/api/local/souls'),
    localJson<{ templates: CapabilityTemplate[] }>('/api/local/templates'),
    localJson<{ workspaces: LocalWorkspace[] }>('/api/local/workspaces'),
    localJson<{ sessions: LocalSession[] }>('/api/local/sessions'),
    localJson<{ turns: LocalTurn[] }>('/api/local/turns'),
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
    settings: settings.settings,
  }
}

export interface ResolveMountedWorkbenchOptions {
  sessionId?: string | null
  theme?: string
  workerId?: string | null
  workspaceId?: string | null
}

export async function resolveMountedWorkbench<T>(options: ResolveMountedWorkbenchOptions = {}): Promise<T> {
  const params = new URLSearchParams()
  if (options.workerId)
    params.set('workerId', options.workerId)
  if (options.workspaceId)
    params.set('workspaceId', options.workspaceId)
  if (options.sessionId)
    params.set('sessionId', options.sessionId)
  if (options.theme)
    params.set('theme', options.theme)
  const query = params.toString()
  return localJson<T>(`/api/mount/workbench${query ? `?${query}` : ''}`)
}

export async function enableSoulApp(appId: string): Promise<LocalSoulAppLifecycleResponse> {
  return localJson<LocalSoulAppLifecycleResponse>(`/api/local/apps/${appId}/enable`, {
    method: 'POST',
  })
}

export async function disableSoulApp(appId: string): Promise<LocalSoulAppLifecycleResponse> {
  return localJson<LocalSoulAppLifecycleResponse>(`/api/local/apps/${appId}/disable`, {
    method: 'POST',
  })
}
