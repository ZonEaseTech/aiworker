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
      'worker-demo-primary': 'route-review',
      'worker-demo-backup': 'route-summary',
    }, storage)

    expect(JSON.parse(storage.getItem(activeMountedRoutePreferenceKey) ?? '{}')).toEqual({
      'worker-demo-primary': 'route-review',
      'worker-demo-backup': 'route-summary',
    })
  })

  it('ignores malformed stored preferences', () => {
    const storage = createMemoryStorage()

    storage.setItem(activeMountedRoutePreferenceKey, '[')
    expect(readActiveMountedRoutePreferences(storage)).toEqual({})

    storage.setItem(activeMountedRoutePreferenceKey, JSON.stringify(['route-review']))
    expect(readActiveMountedRoutePreferences(storage)).toEqual({})

    storage.setItem(activeMountedRoutePreferenceKey, JSON.stringify({
      'worker-demo-primary': 'route-review',
      'worker-demo-backup': 42,
      'worker-demo-null': null,
    }))
    expect(readActiveMountedRoutePreferences(storage)).toEqual({
      'worker-demo-primary': 'route-review',
    })
  })

  it('resolves the active mounted route by worker id and falls back to the first declared route', () => {
    const routes = [
      { id: 'route-summary', label: 'Summary' },
      { id: 'route-review', label: 'Review' },
    ] as const

    expect(resolveActiveMountedRoute({
      preferences: { 'worker-demo-primary': 'route-review' },
      routes,
      workerId: 'worker-demo-primary',
    })).toBe(routes[1])

    expect(resolveActiveMountedRoute({
      preferences: { 'worker-demo-primary': 'missing-route' },
      routes,
      workerId: 'worker-demo-primary',
    })).toBe(routes[0])

    expect(resolveActiveMountedRoute({
      preferences: {},
      routes: [],
      workerId: 'worker-demo-primary',
    })).toBeNull()
  })

  it('updates only one worker mounted route preference for workers in the same Soul App', () => {
    const current = {
      'worker-demo-primary': 'route-summary',
      'worker-demo-backup': 'route-review',
    }

    expect(updateWorkerMountedRoutePreference({
      current,
      routeId: 'route-review',
      workerId: 'worker-demo-primary',
    })).toEqual({
      'worker-demo-primary': 'route-review',
      'worker-demo-backup': 'route-review',
    })

    expect(current).toEqual({
      'worker-demo-primary': 'route-summary',
      'worker-demo-backup': 'route-review',
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
