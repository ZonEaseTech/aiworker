import type {
  CreateProfileUpdateDraftSessionInput,
  HrPeopleWorkbenchApi,
  HrPeopleWorkbenchApiOptions,
  HrWorkbenchData,
  HrWorkbenchFetch,
  LocalFile,
  LocalSession,
  LocalWorkspace,
  ProfileUpdateDraftSessionPayload,
} from './types'

import { buildAttachedMaterialsMetadata, buildReadableSessionContext } from './attachments'
import { HR_WORKBENCH_DEFAULT_APP_ID, HR_WORKBENCH_DEFAULT_ROUTE_PREFIX } from './host-data'

export function createHrPeopleWorkbenchApi(options: HrPeopleWorkbenchApiOptions = {}): HrPeopleWorkbenchApi {
  const appId = options.appId?.trim() || HR_WORKBENCH_DEFAULT_APP_ID
  const routePrefix = normalizeRoutePrefix(options.routePrefix ?? routePrefixForApp(appId))
  const localPrefix = localPrefixFromRoutePrefix(routePrefix)
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)

  return {
    async createProfileUpdateDraftSession(workerId, workspaceId, payload) {
      const path = workerId
        ? `${localPrefix}/workers/${encodeURIComponent(workerId)}/workspaces/${encodeURIComponent(workspaceId)}/sessions`
        : `${localPrefix}/workspaces/${encodeURIComponent(workspaceId)}/sessions`
      return localJson<{ session: LocalSession }>(fetcher, path, {
        body: JSON.stringify(payload),
        method: 'POST',
      })
    },
    async loadWorkbenchData(scope = {}) {
      const [workspacesBody, sessionsBody] = await Promise.all([
        localJson<{ workspaces: LocalWorkspace[] }>(fetcher, `${localPrefix}/workspaces`),
        localJson<{ sessions: LocalSession[] }>(fetcher, `${localPrefix}/sessions`),
      ])
      const filtered = filterWorkbenchData({
        artifacts: [],
        profileReadmes: {},
        sessions: sessionsBody.sessions,
        workspaces: workspacesBody.workspaces,
      }, scope)
      const profileEntries = await Promise.all(filtered.workspaces.map(async (workspace) => {
        try {
          return [workspace.id, await localText(fetcher, `${localPrefix}/workspaces/${encodeURIComponent(workspace.id)}/files/raw/README.md`)] as const
        }
        catch {
          return null
        }
      }))
      return {
        ...filtered,
        profileReadmes: Object.fromEntries(profileEntries.filter((entry): entry is readonly [string, string] => entry !== null)),
      }
    },
    async writeProfileReadme(workspaceId, input) {
      const profileMarkdown = input.profileMarkdown?.trim()
      if (!profileMarkdown)
        throw new Error('HR profile README update requires profileMarkdown.')
      const profilePath = 'README.md'
      await localJson<{ file: LocalFile }>(fetcher, `${localPrefix}/workspaces/${encodeURIComponent(workspaceId)}/files/raw/${profilePath}`, {
        body: profileMarkdown.endsWith('\n') ? profileMarkdown : `${profileMarkdown}\n`,
        method: 'PUT',
      })
      return { profileReadme: { artifactId: input.artifactId, profilePath, source: 'hr-app' } }
    },
    async readWorkspaceFile(workspaceId, path) {
      return localText(fetcher, `${localPrefix}/workspaces/${encodeURIComponent(workspaceId)}/files/raw/${encodeMaterialPath(path)}`)
    },
    async readWorkspaceProfile(workspaceId) {
      return localText(fetcher, `${localPrefix}/workspaces/${encodeURIComponent(workspaceId)}/files/raw/README.md`)
    },
    async writeCandidateMaterial(workspaceId, material) {
      return localJson<{ file: LocalFile }>(fetcher, `${localPrefix}/workspaces/${encodeURIComponent(workspaceId)}/files/raw/${encodeMaterialPath(material.path)}`, {
        body: material.content,
        method: 'PUT',
      })
    },
  }
}

export function createProfileUpdateDraftSessionPayload(input: CreateProfileUpdateDraftSessionInput): ProfileUpdateDraftSessionPayload {
  const draftType = input.draftType || 'profile-update-draft'
  const context = buildReadableSessionContext({
    attachedMaterials: input.attachedMaterials,
    profileName: input.profileName,
    userInput: input.userInput,
  })
  const materialMetadata = buildAttachedMaterialsMetadata(input.attachedMaterials)
  return {
    capabilityTemplateId: namespacedCapabilityTemplateId(input.appId ?? HR_WORKBENCH_DEFAULT_APP_ID, draftType),
    context,
    input: context,
    metadata: {
      ...materialMetadata,
      profileName: input.profileName,
      draftType,
      source: 'hr-profile-composer',
    },
    title: `${input.profileName} 候选人档案草案`,
  }
}

export function namespacedCapabilityTemplateId(appId: string, capabilityId: string): string {
  return capabilityId.includes('.') ? capabilityId : `${appId}.${capabilityId}`
}

export function localPrefixFromRoutePrefix(routePrefix: string): string {
  const normalized = normalizeRoutePrefix(routePrefix)
  const appSegment = normalized.match(/^(.*)\/apps\/[^/]+$/)
  if (appSegment?.[1])
    return appSegment[1]
  if (normalized.endsWith('/api/local'))
    return normalized
  return '/api/local'
}

function filterWorkbenchData(data: HrWorkbenchData, scope: { workerId?: string | null, workspaceId?: string | null }): HrWorkbenchData {
  const workspaceId = scope.workspaceId?.trim()
  const workerId = scope.workerId?.trim()
  const workspaces = data.workspaces.filter((workspace) => {
    if (workspaceId)
      return workspace.id === workspaceId
    if (workerId)
      return workspace.workerId === workerId
    return true
  })
  const workspaceIds = new Set(workspaces.map(workspace => workspace.id))
  return {
    artifacts: data.artifacts.filter(artifact => workspaceIds.has(artifact.workspaceId)),
    profileReadmes: Object.fromEntries(
      Object.entries(data.profileReadmes).filter(([workspaceId]) => workspaceIds.has(workspaceId)),
    ),
    sessions: data.sessions.filter(session => workspaceIds.has(session.workspaceId)),
    workspaces,
  }
}

function routePrefixForApp(appId: string): string {
  return appId === HR_WORKBENCH_DEFAULT_APP_ID
    ? HR_WORKBENCH_DEFAULT_ROUTE_PREFIX
    : `/api/local/apps/${appId}`
}

function normalizeRoutePrefix(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed || HR_WORKBENCH_DEFAULT_ROUTE_PREFIX
}

function encodeMaterialPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function localJson<T>(fetcher: HrWorkbenchFetch, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('content-type') && init.method !== 'PUT')
    headers.set('content-type', 'application/json')
  const res = await fetcher(path, {
    ...init,
    headers,
  })
  if (!res.ok)
    throw new Error(`HR local API ${res.status}: ${path}`)
  return await res.json() as T
}

async function localText(fetcher: HrWorkbenchFetch, path: string, init?: RequestInit): Promise<string> {
  const res = await fetcher(path, init)
  if (!res.ok)
    throw new Error(`HR local API ${res.status}: ${path}`)
  return await res.text()
}
