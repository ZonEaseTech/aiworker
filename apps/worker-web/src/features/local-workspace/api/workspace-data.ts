import type {
  LocalSession,
  LocalSettingsConfig,
  LocalWorker,
  LocalWorkspace,
} from '@zonease/aiworker-soul-descriptor'
import type { VerticalSoul, WorkspaceCapability } from '../model-types'
import type { LocalHostedSoulApp, LocalInfoResponse, LocalSoulAppLifecycleResponse, LocalWorkspaceData } from './types'

import { localJson } from '../../../shared/api/local-client'

export async function loadLocalWorkspaceData(): Promise<LocalWorkspaceData> {
  const [info, apps, workers, capabilities, workspaces, sessions, settings] = await Promise.all([
    localJson<LocalInfoResponse>('/api/info'),
    localJson<{ apps: LocalHostedSoulApp[] }>('/api/app-installation/apps'),
    localJson<{ workers: LocalWorker[] }>('/api/workers'),
    localJson<{ capabilities: WorkspaceCapability[] }>('/api/capabilities'),
    localJson<{ workspaces: LocalWorkspace[] }>('/api/workspace-locators'),
    localJson<{ sessions: LocalSession[] }>('/api/sessions'),
    localJson<{ settings: LocalSettingsConfig }>('/api/settings'),
  ])
  return {
    info,
    apps: apps.apps,
    capabilities: capabilities.capabilities,
    workers: workers.workers,
    souls: deriveSoulsFromApps(apps.apps),
    workspaces: workspaces.workspaces,
    sessions: sessions.sessions,
    settings: settings.settings,
  }
}

function deriveSoulsFromApps(apps: readonly LocalHostedSoulApp[]): VerticalSoul[] {
  return apps.map(app => ({
    ...app.projectedSoul,
    defaultCapabilities: [...app.projectedSoul.defaultCapabilities],
  }))
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
  return localJson<LocalSoulAppLifecycleResponse>(`/api/app-installation/apps/${appId}/enable`, {
    method: 'POST',
  })
}

export async function archiveSoulApp(appId: string): Promise<LocalSoulAppLifecycleResponse> {
  return localJson<LocalSoulAppLifecycleResponse>(`/api/app-installation/apps/${appId}/archive`, {
    method: 'POST',
  })
}
