import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'
import type { WorkerRoute } from '../../app/router/worker-route'

import { displayTemplate, normalizeLocale } from '../../features/i18n'
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
  templates: LocalWorkspaceData['templates']
}

const defaultNewWorkerSoulId = 'aiworker-hr'

export function deriveWorkerStudioLocatorState({
  data,
  newWorkerSoulId = defaultNewWorkerSoulId,
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
    ? data?.souls.find(soul => soul.id === selectedWorker.soulId) ?? null
    : data?.souls.find(soul => soul.id === newWorkerSoulId && soul.status === 'available')
      ?? data?.souls.find(soul => soul.status === 'available')
      ?? null
  const selectedSoulApp = selectedWorker && data
    ? data.apps.find(app => app.appId === selectedWorker.soulId || app.projectedSoul?.id === selectedWorker.soulId) ?? null
    : null
  const templates = data?.templates.filter(template => template.soulId === selectedWorker?.soulId) ?? []
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
    templates,
  }
}

function deriveSelectableWorkers(data: LocalWorkspaceData): LocalWorkspaceData['workers'] {
  const availableSoulIds = new Set(data.souls.filter(soul => soul.status === 'available').map(soul => soul.id))
  const templatedSoulIds = new Set(data.templates.map(template => template.soulId))
  return data.workers.filter(worker => availableSoulIds.has(worker.soulId) && templatedSoulIds.has(worker.soulId))
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
  locale: Parameters<typeof displayTemplate>[1]
  query: string | null
  soulWorkspaces: LocalWorkspaceData['workspaces']
}): LocalWorkspaceData['workspaces'] {
  const needle = (query ?? '').trim().toLowerCase()
  return soulWorkspaces.filter((item) => {
    const latestSession = sessionForWorkspace(item, allSessions)
    const template = data?.templates.find(candidate => candidate.id === latestSession?.capabilityTemplateId)
    const templateCopy = template ? displayTemplate(template, locale) : null
    return !needle
      || item.name.toLowerCase().includes(needle)
      || template?.name.toLowerCase().includes(needle)
      || templateCopy?.name.toLowerCase().includes(needle)
  })
}
