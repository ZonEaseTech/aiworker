import type { WorkerRoute } from '../../app/router/worker-route'
import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'

import { displayCapability, normalizeLocale } from '../../features/i18n'
import { latest, sessionForWorkspace } from '../../features/local-workspace/model'

export interface WorkerStudioLocatorInput {
  data: LocalWorkspaceData | null
  newWorkerSoulId?: string | null
  query?: string | null
  route: WorkerRoute
  selectedWorkerId?: string | null
  selectedWorkspaceId?: string | null
}

export interface WorkerStudioLocatorState {
  allSessions: LocalWorkspaceData['sessions']
  filteredWorkspaces: LocalWorkspaceData['workspaces']
  isWorkspaceContextRoute: boolean
  selectableWorkers: LocalWorkspaceData['workers']
  selectedSession: LocalWorkspaceData['sessions'][number] | null
  selectedSoul: LocalWorkspaceData['souls'][number] | null
  selectedSoulApp: LocalWorkspaceData['apps'][number] | null
  selectedWorker: LocalWorkspaceData['workers'][number] | null
  selectedWorkspace: LocalWorkspaceData['workspaces'][number] | null
  soulSessions: LocalWorkspaceData['sessions']
  soulWorkspaces: LocalWorkspaceData['workspaces']
  capabilities: LocalWorkspaceData['capabilities']
}

export function deriveWorkerStudioLocatorState({
  data,
  newWorkerSoulId = null,
  query = '',
  route,
  selectedWorkerId = null,
  selectedWorkspaceId = null,
}: WorkerStudioLocatorInput): WorkerStudioLocatorState {
  const allSessions = data?.sessions ?? []
  const activeLocale = normalizeLocale(data?.settings.language ?? 'en')
  const routedWorkspace = route.kind === 'workspace' || route.kind === 'session'
    ? data?.workspaces.find(workspace => workspace.id === route.workspaceId) ?? null
    : null
  const routedWorker = route.kind === 'worker'
    ? data?.workers.find(worker => worker.id === route.workerId) ?? null
    : routedWorkspace ? data?.workers.find(worker => worker.id === routedWorkspace.workerId) ?? null : null
  const selectableWorkers = data ? deriveSelectableWorkers(data) : []
  const routedSelectableWorker = routedWorker && selectableWorkers.some(worker => worker.id === routedWorker.id)
    ? routedWorker
    : null
  const selectedWorker = routedSelectableWorker
    ?? (selectedWorkerId ? selectableWorkers.find(worker => worker.id === selectedWorkerId) ?? null : null)
    ?? selectableWorkers[0]
    ?? null
  const selectedSoul = selectedWorker
    ? data?.souls.find(soul => soul.id === selectedWorker.appId) ?? null
    : data?.souls.find(soul => soul.id === newWorkerSoulId && soul.status === 'available')
      ?? data?.souls.find(soul => soul.status === 'available')
      ?? null
  const selectedSoulApp = selectedWorker && data
    ? data.apps.find(app => app.appId === selectedWorker.appId || app.projectedSoul?.id === selectedWorker.appId) ?? null
    : null
  const capabilities = data?.capabilities.filter(capability => capability.appId === selectedWorker?.appId) ?? []
  const soulWorkspaces = data?.workspaces.filter(item => item.workerId === selectedWorker?.id) ?? []
  const soulSessions = deriveSoulSessions(allSessions, soulWorkspaces)
  const filteredWorkspaces = deriveFilteredWorkspaces({
    allSessions,
    data,
    locale: activeLocale,
    query,
    soulWorkspaces,
  })
  const routeWorkspaceId = route.kind === 'workspace' || route.kind === 'session' ? route.workspaceId : null
  const routeWorkspace = routeWorkspaceId ? soulWorkspaces.find(item => item.id === routeWorkspaceId) ?? null : null
  const manuallySelectedWorkspace = selectedWorkspaceId && soulWorkspaces.some(item => item.id === selectedWorkspaceId)
    ? soulWorkspaces.find(item => item.id === selectedWorkspaceId) ?? null
    : null
  const explicitSelectedWorkspace = routeWorkspace ?? manuallySelectedWorkspace
  const selectedWorkspace = explicitSelectedWorkspace ?? latest(soulWorkspaces)
  const routeSession = route.kind === 'session'
    ? allSessions.find(session => session.id === route.sessionId && session.workspaceId === route.workspaceId) ?? null
    : null
  const selectedSession = routeSession
    ?? (route.kind === 'workspace' ? null : selectedWorkspace ? sessionForWorkspace(selectedWorkspace, allSessions) : latest(soulSessions))
  const isWorkspaceContextRoute = (route.kind === 'workspace' || route.kind === 'session') && Boolean(selectedWorkspace)

  return {
    allSessions,
    filteredWorkspaces,
    isWorkspaceContextRoute,
    selectableWorkers,
    selectedSession,
    selectedSoul,
    selectedSoulApp,
    selectedWorker,
    selectedWorkspace,
    soulSessions,
    soulWorkspaces,
    capabilities,
  }
}

function deriveSelectableWorkers(data: LocalWorkspaceData): LocalWorkspaceData['workers'] {
  const availableSoulIds = new Set(data.souls.filter(soul => soul.status === 'available').map(soul => soul.id))
  const capabilityAppIds = new Set(data.capabilities.map(capability => capability.appId))
  return data.workers.filter(worker => availableSoulIds.has(worker.appId) && capabilityAppIds.has(worker.appId))
}

function deriveSoulSessions(
  allSessions: LocalWorkspaceData['sessions'],
  soulWorkspaces: LocalWorkspaceData['workspaces'],
): LocalWorkspaceData['sessions'] {
  const workspaceIds = new Set(soulWorkspaces.map(item => item.id))
  return allSessions.filter(session => workspaceIds.has(session.workspaceId))
}

function deriveFilteredWorkspaces({
  allSessions,
  data,
  locale,
  query,
  soulWorkspaces,
}: {
  allSessions: LocalWorkspaceData['sessions']
  data: LocalWorkspaceData | null
  locale: Parameters<typeof displayCapability>[1]
  query: string | null
  soulWorkspaces: LocalWorkspaceData['workspaces']
}): LocalWorkspaceData['workspaces'] {
  const needle = (query ?? '').trim().toLowerCase()
  return soulWorkspaces.filter((item) => {
    const latestSession = sessionForWorkspace(item, allSessions)
    const capability = data?.capabilities.find(candidate => candidate.id === latestSession?.capabilityId)
    const capabilityCopy = capability ? displayCapability(capability, locale) : null
    return !needle
      || item.name.toLowerCase().includes(needle)
      || capability?.name.toLowerCase().includes(needle)
      || capabilityCopy?.name.toLowerCase().includes(needle)
  })
}
