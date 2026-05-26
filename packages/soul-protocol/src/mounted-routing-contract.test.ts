import { describe, expect, test } from 'bun:test'
import { parseSoulDescriptorV1 } from './index'

const baseDescriptor = {
  protocol: 'soul/v1',
  identity: {
    appId: 'aiworker-freeform',
    soulId: 'freeform',
    name: 'AIWorker Freeform',
    version: '0.1.0',
  },
  compatibility: {},
  capabilities: [],
  configuration: {},
  workbench: {
    type: 'micro-app',
    entry: 'dist/web/workbench/index.html',
  },
  api: null,
  engine: {},
  health: {},
  extensions: {},
  external: {},
} as const

describe('mounted routing contract', () => {
  test('defaults production micro-app workbench routing to search', () => {
    const descriptor = parseSoulDescriptorV1(baseDescriptor)

    expect(descriptor.workbench.router.mode).toBe('search')
  })

  test('accepts explicit search router mode', () => {
    const descriptor = parseSoulDescriptorV1({
      ...baseDescriptor,
      workbench: {
        ...baseDescriptor.workbench,
        router: {
          mode: 'search',
        },
      },
    })

    expect(descriptor.workbench.router.mode).toBe('search')
  })

  test('rejects mounted workbench router modes outside the v1 contract', () => {
    for (const mode of ['pure', 'native', 'native-scope']) {
      expect(() =>
        parseSoulDescriptorV1({
          ...baseDescriptor,
          workbench: {
            ...baseDescriptor.workbench,
            router: {
              mode,
            },
          },
        }),
      ).toThrow()
    }
  })
})
