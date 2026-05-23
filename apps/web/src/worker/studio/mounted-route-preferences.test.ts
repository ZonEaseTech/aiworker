import { describe, expect, it } from 'vitest'

import {
  activeMountedRoutePreferenceKey,
  persistActiveMountedRoutePreferences,
  readActiveMountedRoutePreferences,
  resolveActiveMountedRoute,
  updateWorkerMountedRoutePreference,
} from './mounted-route-preferences'

describe('mounted route preferences', () => {
  it('persists active mounted route preferences by worker id', () => {
    const storage = createMemoryStorage()

    persistActiveMountedRoutePreferences({
      'worker-hr-primary': 'hr-profile-review',
      'worker-hr-backup': 'hr-profile-summary',
    }, storage)

    expect(JSON.parse(storage.getItem(activeMountedRoutePreferenceKey) ?? '{}')).toEqual({
      'worker-hr-primary': 'hr-profile-review',
      'worker-hr-backup': 'hr-profile-summary',
    })
  })

  it('ignores malformed stored preferences', () => {
    const storage = createMemoryStorage()

    storage.setItem(activeMountedRoutePreferenceKey, '[')
    expect(readActiveMountedRoutePreferences(storage)).toEqual({})

    storage.setItem(activeMountedRoutePreferenceKey, JSON.stringify(['hr-profile-review']))
    expect(readActiveMountedRoutePreferences(storage)).toEqual({})

    storage.setItem(activeMountedRoutePreferenceKey, JSON.stringify({
      'worker-hr-primary': 'hr-profile-review',
      'worker-hr-backup': 42,
      'worker-hr-null': null,
    }))
    expect(readActiveMountedRoutePreferences(storage)).toEqual({
      'worker-hr-primary': 'hr-profile-review',
    })
  })

  it('resolves the active mounted route by worker id and falls back to the first declared route', () => {
    const routes = [
      { id: 'hr-profile-summary', label: 'Summary' },
      { id: 'hr-profile-review', label: 'Review' },
    ] as const

    expect(resolveActiveMountedRoute({
      preferences: { 'worker-hr-primary': 'hr-profile-review' },
      routes,
      workerId: 'worker-hr-primary',
    })).toBe(routes[1])

    expect(resolveActiveMountedRoute({
      preferences: { 'worker-hr-primary': 'missing-route' },
      routes,
      workerId: 'worker-hr-primary',
    })).toBe(routes[0])

    expect(resolveActiveMountedRoute({
      preferences: {},
      routes: [],
      workerId: 'worker-hr-primary',
    })).toBeNull()
  })

  it('updates only one worker mounted route preference for workers in the same Soul App', () => {
    const current = {
      'worker-hr-primary': 'hr-profile-summary',
      'worker-hr-backup': 'hr-profile-review',
    }

    expect(updateWorkerMountedRoutePreference({
      current,
      routeId: 'hr-profile-review',
      workerId: 'worker-hr-primary',
    })).toEqual({
      'worker-hr-primary': 'hr-profile-review',
      'worker-hr-backup': 'hr-profile-review',
    })

    expect(current).toEqual({
      'worker-hr-primary': 'hr-profile-summary',
      'worker-hr-backup': 'hr-profile-review',
    })
  })
})

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}
