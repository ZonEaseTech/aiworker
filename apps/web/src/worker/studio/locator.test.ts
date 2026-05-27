import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'

import { describe, expect, it } from 'vitest'

import { deriveWorkerStudioLocatorState } from './locator'

const now = '2026-05-23T00:00:00.000Z'

describe('deriveWorkerStudioLocatorState', () => {
  it('selectable workers only include available Souls with at least one capability', () => {
    const data = createData({
      souls: [
        soul({ id: 'aiworker-hr', status: 'available' }),
        soul({ id: 'aiworker-qa', status: 'coming_soon' }),
        soul({ id: 'aiworker-empty', status: 'available' }),
      ],
      capabilities: [
        capability({ id: 'aiworker-hr.profile', soulId: 'aiworker-hr' }),
        capability({ id: 'aiworker-qa.release', soulId: 'aiworker-qa' }),
      ],
      workers: [
        worker({ id: 'hr-worker', soulId: 'aiworker-hr' }),
        worker({ id: 'qa-worker', soulId: 'aiworker-qa' }),
        worker({ id: 'empty-worker', soulId: 'aiworker-empty' }),
      ],
    })

    const state = deriveWorkerStudioLocatorState({ data, route: { kind: 'home' } })

    expect(state.selectableWorkers.map(item => item.id)).toEqual(['hr-worker'])
    expect(state.selectedWorker?.id).toBe('hr-worker')
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
        soul({ id: 'aiworker-hr', status: 'available' }),
        soul({ id: 'aiworker-qa', status: 'available' }),
      ],
      capabilities: [
        capability({ id: 'aiworker-hr.profile', soulId: 'aiworker-hr' }),
        capability({ id: 'aiworker-qa.release', soulId: 'aiworker-qa' }),
      ],
      workers: [
        worker({ id: 'hr-worker', soulId: 'aiworker-hr' }),
        worker({ id: 'qa-worker', soulId: 'aiworker-qa' }),
      ],
      workspaces: [
        workspace({ id: 'hr-workspace', name: 'Hiring Workspace', workerId: 'hr-worker' }),
        workspace({ id: 'qa-workspace', name: 'Release Workspace', workerId: 'qa-worker' }),
      ],
      sessions: [
        session({
          capabilityId: 'aiworker-qa.release',
          id: 'qa-session',
          workerId: 'qa-worker',
          workspaceId: 'qa-workspace',
        }),
      ],
    })

    const workspaceState = deriveWorkerStudioLocatorState({
      data,
      route: { kind: 'workspace', workerId: 'qa-worker', workspaceId: 'qa-workspace' },
    })
    expect(workspaceState.isWorkspaceContextRoute).toBe(true)
    expect(workspaceState.selectedWorker?.id).toBe('qa-worker')
    expect(workspaceState.selectedWorkspace?.id).toBe('qa-workspace')
    expect(workspaceState.selectedSession).toBeNull()

    const sessionState = deriveWorkerStudioLocatorState({
      data,
      route: {
        kind: 'session',
        sessionId: 'qa-session',
        workerId: 'qa-worker',
        workspaceId: 'qa-workspace',
      },
    })
    expect(sessionState.isWorkspaceContextRoute).toBe(true)
    expect(sessionState.selectedWorker?.id).toBe('qa-worker')
    expect(sessionState.selectedWorkspace?.id).toBe('qa-workspace')
    expect(sessionState.selectedSession?.id).toBe('qa-session')
  })

  it('filters workspaces by workspace name and capability display without reading app-owned session content', () => {
    const data = createData({
      settings: { language: 'en' } as LocalWorkspaceData['settings'],
      souls: [soul({ id: 'aiworker-hr', status: 'available' })],
      capabilities: [
        capability({ id: 'aiworker-hr.profile', name: 'Profile Capability', soulId: 'aiworker-hr' }),
        capability({ id: 'aiworker-hr.screen', name: 'Screening Capability', soulId: 'aiworker-hr' }),
      ],
      workers: [worker({ id: 'hr-worker', soulId: 'aiworker-hr' })],
      workspaces: [
        workspace({ id: 'quiet-workspace', name: 'Quiet Workspace', workerId: 'hr-worker' }),
        workspace({ id: 'named-workspace', name: 'Hiring Pipeline', workerId: 'hr-worker' }),
        workspace({ id: 'capability-workspace', name: 'Operations Board', workerId: 'hr-worker' }),
      ],
      sessions: [
        session({
          capabilityId: 'aiworker-hr.profile',
          context: 'confidential compensation review',
          id: 'quiet-session',
          title: 'confidential compensation review',
          workerId: 'hr-worker',
          workspaceId: 'quiet-workspace',
        }),
        session({
          capabilityId: 'aiworker-hr.screen',
          id: 'capability-session',
          workerId: 'hr-worker',
          workspaceId: 'capability-workspace',
        }),
      ],
    })

    expect(workspaceIds(data, 'hiring')).toEqual(['named-workspace'])
    expect(workspaceIds(data, 'screening capability')).toEqual(['capability-workspace'])
    expect(workspaceIds(data, 'confidential compensation')).toEqual([])
  })
})

function workspaceIds(data: LocalWorkspaceData, query: string): string[] {
  return deriveWorkerStudioLocatorState({
    data,
    query,
    route: { kind: 'worker', workerId: 'hr-worker' },
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
    id: 'aiworker-hr',
    name: 'AIWorker HR',
    status: 'available',
    ...overrides,
  }
}

function capability(overrides: Partial<LocalWorkspaceData['capabilities'][number]> = {}): LocalWorkspaceData['capabilities'][number] {
  return {
    description: 'Capability for tests',
    id: 'aiworker-hr.profile',
    inputHints: [],
    name: 'Profile Capability',
    outputKind: 'profile',
    promptRef: './product/workflows/profile/prompt.md',
    soulId: 'aiworker-hr',
    ...overrides,
  }
}

function worker(overrides: Partial<LocalWorkspaceData['workers'][number]> = {}): LocalWorkspaceData['workers'][number] {
  return {
    createdAt: now,
    defaultEngineId: 'codex',
    id: 'hr-worker',
    metadataJson: {},
    name: 'HR Worker',
    soulId: 'aiworker-hr',
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
    workerId: 'hr-worker',
    ...overrides,
  }
}

function session(overrides: Partial<LocalWorkspaceData['sessions'][number]> = {}): LocalWorkspaceData['sessions'][number] {
  return {
    capabilityId: 'aiworker-hr.profile',
    context: '',
    createdAt: now,
    endedAt: null,
    id: 'session-1',
    metadataJson: {},
    startedAt: now,
    status: 'active',
    title: 'Session',
    updatedAt: now,
    workerId: 'hr-worker',
    workspaceId: 'workspace-1',
    ...overrides,
  }
}
