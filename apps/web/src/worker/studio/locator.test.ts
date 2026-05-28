import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'

import { describe, expect, it } from 'vitest'

import { deriveWorkerStudioLocatorState } from './locator'

const now = '2026-05-23T00:00:00.000Z'

describe('deriveWorkerStudioLocatorState', () => {
  it('selectable workers only include available Souls with at least one capability', () => {
    const data = createData({
      souls: [
        soul({ id: 'aiworker-demo-primary', status: 'available' }),
        soul({ id: 'aiworker-demo-secondary', status: 'coming_soon' }),
        soul({ id: 'aiworker-empty', status: 'available' }),
      ],
      capabilities: [
        capability({ id: 'aiworker-demo-primary.context', soulId: 'aiworker-demo-primary' }),
        capability({ id: 'aiworker-demo-secondary.release', soulId: 'aiworker-demo-secondary' }),
      ],
      workers: [
        worker({ id: 'primary-worker', soulId: 'aiworker-demo-primary' }),
        worker({ id: 'secondary-worker', soulId: 'aiworker-demo-secondary' }),
        worker({ id: 'empty-worker', soulId: 'aiworker-empty' }),
      ],
    })

    const state = deriveWorkerStudioLocatorState({ data, route: { kind: 'home' } })

    expect(state.selectableWorkers.map(item => item.id)).toEqual(['primary-worker'])
    expect(state.selectedWorker?.id).toBe('primary-worker')
  })

  it('defaults the new-worker Soul selection to the first available Soul when no preference is supplied', () => {
    const data = createData({
      souls: [
        soul({ id: 'soul-a', status: 'available' }),
        soul({ id: 'soul-b', status: 'available' }),
      ],
      workers: [],
    })

    const state = deriveWorkerStudioLocatorState({
      data,
      newWorkerSoulId: null,
      route: { kind: 'home' },
    })

    expect(state.selectedSoul?.id).toBe('soul-a')
  })

  it('uses workspace and session routes as opaque locators for worker, workspace, and session selection', () => {
    const data = createData({
      souls: [
        soul({ id: 'aiworker-demo-primary', status: 'available' }),
        soul({ id: 'aiworker-demo-secondary', status: 'available' }),
      ],
      capabilities: [
        capability({ id: 'aiworker-demo-primary.context', soulId: 'aiworker-demo-primary' }),
        capability({ id: 'aiworker-demo-secondary.release', soulId: 'aiworker-demo-secondary' }),
      ],
      workers: [
        worker({ id: 'primary-worker', soulId: 'aiworker-demo-primary' }),
        worker({ id: 'secondary-worker', soulId: 'aiworker-demo-secondary' }),
      ],
      workspaces: [
        workspace({ id: 'primary-workspace', name: 'Primary Workspace', workerId: 'primary-worker' }),
        workspace({ id: 'secondary-workspace', name: 'Secondary Workspace', workerId: 'secondary-worker' }),
      ],
      sessions: [
        session({
          capabilityId: 'aiworker-demo-secondary.release',
          id: 'secondary-session',
          workerId: 'secondary-worker',
          workspaceId: 'secondary-workspace',
        }),
      ],
    })

    const workspaceState = deriveWorkerStudioLocatorState({
      data,
      route: { kind: 'workspace', workerId: 'secondary-worker', workspaceId: 'secondary-workspace' },
    })
    expect(workspaceState.isWorkspaceContextRoute).toBe(true)
    expect(workspaceState.selectedWorker?.id).toBe('secondary-worker')
    expect(workspaceState.selectedWorkspace?.id).toBe('secondary-workspace')
    expect(workspaceState.selectedSession).toBeNull()

    const sessionState = deriveWorkerStudioLocatorState({
      data,
      route: {
        kind: 'session',
        sessionId: 'secondary-session',
        workerId: 'secondary-worker',
        workspaceId: 'secondary-workspace',
      },
    })
    expect(sessionState.isWorkspaceContextRoute).toBe(true)
    expect(sessionState.selectedWorker?.id).toBe('secondary-worker')
    expect(sessionState.selectedWorkspace?.id).toBe('secondary-workspace')
    expect(sessionState.selectedSession?.id).toBe('secondary-session')
  })

  it('filters workspaces by workspace name and capability display without reading app-owned session content', () => {
    const data = createData({
      settings: { language: 'en' } as LocalWorkspaceData['settings'],
      souls: [soul({ id: 'aiworker-demo-primary', status: 'available' })],
      capabilities: [
        capability({ id: 'aiworker-demo-primary.context', name: 'Context Capability', soulId: 'aiworker-demo-primary' }),
        capability({ id: 'aiworker-demo-primary.summary', name: 'Summary Capability', soulId: 'aiworker-demo-primary' }),
      ],
      workers: [worker({ id: 'primary-worker', soulId: 'aiworker-demo-primary' })],
      workspaces: [
        workspace({ id: 'quiet-workspace', name: 'Quiet Workspace', workerId: 'primary-worker' }),
        workspace({ id: 'named-workspace', name: 'Primary Pipeline', workerId: 'primary-worker' }),
        workspace({ id: 'capability-workspace', name: 'Operations Board', workerId: 'primary-worker' }),
      ],
      sessions: [
        session({
          capabilityId: 'aiworker-demo-primary.context',
          id: 'quiet-session',
          title: 'private source note',
          workerId: 'primary-worker',
          workspaceId: 'quiet-workspace',
        }),
        session({
          capabilityId: 'aiworker-demo-primary.summary',
          id: 'capability-session',
          workerId: 'primary-worker',
          workspaceId: 'capability-workspace',
        }),
      ],
    })

    expect(workspaceIds(data, 'pipeline')).toEqual(['named-workspace'])
    expect(workspaceIds(data, 'summary capability')).toEqual(['capability-workspace'])
    expect(workspaceIds(data, 'private source')).toEqual([])
  })
})

function workspaceIds(data: LocalWorkspaceData, query: string): string[] {
  return deriveWorkerStudioLocatorState({
    data,
    query,
    route: { kind: 'worker', workerId: 'primary-worker' },
  }).filteredWorkspaces.map(item => item.id)
}

function createData(overrides: Partial<LocalWorkspaceData> = {}): LocalWorkspaceData {
  return {
    apps: [],
    info: {
      runtimeVersion: 'test',
      startedAt: now,
      workers: overrides.workers ?? [],
    },
    sessions: [],
    settings: { language: 'en' } as LocalWorkspaceData['settings'],
    souls: [],
    capabilities: [],
    workers: [],
    workspaces: [],
    ...overrides,
  }
}

function soul(overrides: Partial<LocalWorkspaceData['souls'][number]> = {}): LocalWorkspaceData['souls'][number] {
  return {
    defaultCapabilities: [],
    description: 'Soul for tests',
    id: 'aiworker-demo-primary',
    name: 'Demo Primary',
    status: 'available',
    ...overrides,
  }
}

function capability(overrides: Partial<LocalWorkspaceData['capabilities'][number]> = {}): LocalWorkspaceData['capabilities'][number] {
  return {
    description: 'Capability for tests',
    id: 'aiworker-demo-primary.context',
    inputHints: [],
    name: 'Context Capability',
    outputKind: 'context',
    promptRef: './product/workflows/context/prompt.md',
    soulId: 'aiworker-demo-primary',
    ...overrides,
  }
}

function worker(overrides: Partial<LocalWorkspaceData['workers'][number]> = {}): LocalWorkspaceData['workers'][number] {
  return {
    createdAt: now,
    defaultEngineId: 'codex',
    id: 'primary-worker',
    metadataJson: {},
    name: 'Primary Worker',
    soulId: 'aiworker-demo-primary',
    status: 'active',
    updatedAt: now,
    ...overrides,
  }
}

function workspace(overrides: Partial<LocalWorkspaceData['workspaces'][number]> = {}): LocalWorkspaceData['workspaces'][number] {
  return {
    createdAt: now,
    id: 'workspace-1',
    metadataJson: {},
    name: 'Workspace',
    rootPath: '/tmp/workspace',
    sourcePointersJson: [],
    status: 'active',
    type: 'workspace',
    updatedAt: now,
    workerId: 'primary-worker',
    ...overrides,
  }
}

function session(overrides: Partial<LocalWorkspaceData['sessions'][number]> = {}): LocalWorkspaceData['sessions'][number] {
  return {
    capabilityId: 'aiworker-demo-primary.context',
    createdAt: now,
    endedAt: null,
    id: 'session-1',
    metadataJson: {},
    startedAt: now,
    status: 'active',
    title: 'Session',
    updatedAt: now,
    workerId: 'primary-worker',
    workspaceId: 'workspace-1',
    ...overrides,
  }
}
