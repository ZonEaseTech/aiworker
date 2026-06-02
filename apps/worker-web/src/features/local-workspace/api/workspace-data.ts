import type {
  LocalSession,
  LocalSettingsConfig,
  LocalWorker,
  LocalWorkspace,
} from '@zonease/aiworker-soul-descriptor'
import type { VerticalSoul } from '../model-types'
import type { LocalHostedSoulApp, LocalInfoResponse, LocalSoulAppLifecycleResponse, LocalWorkspaceData } from './types'

import { localJson } from '../../../shared/api/local-client'

export async function loadLocalWorkspaceData(): Promise<LocalWorkspaceData> {
  const [info, apps, workers, workspaces, sessions, settings] = await Promise.all([
    localJson<LocalInfoResponse>('/api/info'),
    localJson<{ apps: LocalHostedSoulApp[] }>('/api/app-installation/apps'),
    localJson<{ workers: LocalWorker[] }>('/api/workers'),
    localJson<{ workspaces: LocalWorkspace[] }>('/api/workspace-locators'),
    localJson<{ sessions: LocalSession[] }>('/api/sessions'),
    localJson<{ settings: LocalSettingsConfig }>('/api/settings'),
  ])
  return {
    info,
    apps: apps.apps,
    workers: workers.workers,
    souls: deriveSoulsFromApps(apps.apps),
    workspaces: workspaces.workspaces,
    sessions: sessions.sessions,
    settings: settings.settings,
  }
}

function deriveSoulsFromApps(apps: readonly LocalHostedSoulApp[]): VerticalSoul[] {
  return apps.map(app => ({ ...app.projectedSoul }))
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
