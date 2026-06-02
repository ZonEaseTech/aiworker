import { describe, expect, test } from 'bun:test'
import {
  parseSoulDescriptorV1,
  SOUL_DESCRIPTOR_OUTPUT_PATH,
  SOUL_DESCRIPTOR_V1_PROTOCOL,
  soulProtocolPackage,
} from './index'

const baseDescriptor = {
  protocol: 'soul/v1',
  identity: {
    appId: 'aiworker-freeform',
    soulId: 'freeform',
    name: 'AIWorker Freeform',
    version: '0.1.0',
  },
  compatibility: {
    sdk: '>=1.0.0',
    host: '>=1.0.0',
    engines: ['codex'],
  },
  configuration: {},
  workbench: {
    type: 'micro-app',
    entry: 'dist/web/workbench/index.html',
  },
  engine: {},
  health: {
    type: 'static',
    ready: true,
  },
  extensions: {},
  external: {},
} as const

describe('descriptor v1 schema', () => {
  test('requires the soul/v1 protocol and descriptor output path', () => {
    const descriptor = parseSoulDescriptorV1(baseDescriptor)

    expect(SOUL_DESCRIPTOR_V1_PROTOCOL).toBe('soul/v1')
    expect(SOUL_DESCRIPTOR_OUTPUT_PATH).toBe('dist/soul.descriptor.json')
    expect(soulProtocolPackage.descriptor).toBe('dist/soul.descriptor.json')
    expect(descriptor.protocol).toBe('soul/v1')
  })

  test('allows only descriptor v1 contract top-level fields', () => {
    const descriptor = parseSoulDescriptorV1(baseDescriptor)

    expect(Object.keys(descriptor).sort()).toEqual([
      'compatibility',
      'configuration',
      'engine',
      'extensions',
      'external',
      'health',
      'identity',
      'protocol',
      'workbench',
    ])
  })

  test('rejects old manifest and runtime-governance fields', () => {
    for (const field of [
      'exports',
      'metadata',
      'storage',
      'permissions',
      'memory',
      'lesson',
      'governance',
    ]) {
      expect(() =>
        parseSoulDescriptorV1({
          ...baseDescriptor,
          [field]: {},
        }),
      ).toThrow()
    }
  })

  test('rejects source hooks hidden inside descriptor fields', () => {
    for (const workbenchEntry of [
      './host-adapter/mounted/host-mounted.ts',
      'dist/../host-adapter/workbench.html',
    ]) {
      expect(() =>
        parseSoulDescriptorV1({
          ...baseDescriptor,
          workbench: {
            type: 'micro-app',
            mode: 'custom',
            entry: workbenchEntry,
          },
        }),
      ).toThrow()
    }
  })

  test('rejects an app-owned API section: a Soul is a descriptor-only template', () => {
    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        api: {
          type: 'local-service',
          entry: 'dist/api/index.js',
          mount: '/api/apps/aiworker-freeform',
        },
      }),
    ).toThrow()

    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        api: null,
      }),
    ).toThrow()
  })

  test('rejects old governance concepts in host-interpreted sections', () => {
    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        configuration: {
          governance: {},
        },
      }),
    ).toThrow()

    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        engine: {
          memory: {},
        },
      }),
    ).toThrow()
  })

  test('keeps extensions and external as opaque descriptor payloads without secrets', () => {
    const descriptor = parseSoulDescriptorV1({
      ...baseDescriptor,
      extensions: {
        'demo.example/review': {
          rubricRef: 'opaque-ref',
        },
      },
      external: {
        businessWorkflow: {
          candidateId: 'candidate-123',
        },
      },
    })

    expect(descriptor.extensions).toEqual({
      'demo.example/review': {
        rubricRef: 'opaque-ref',
      },
    })
    expect(descriptor.external).toEqual({
      businessWorkflow: {
        candidateId: 'candidate-123',
      },
    })

    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        external: {
          token: 'literal-secret',
        },
      }),
    ).toThrow()

    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        extensions: {
          'demo.example/review': {
            memory: {},
          },
        },
      }),
    ).toThrow()
  })

  test('rejects unsafe engine projection references and inline native MCP content', () => {
    for (const source of ['./host-adapter/engine-assets', 'dist/engine-assets/../host-adapter']) {
      expect(() =>
        parseSoulDescriptorV1({
          ...baseDescriptor,
          engine: {
            workspaceAssets: {
              source,
            },
          },
        }),
      ).toThrow()
    }

    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        engine: {
          mcp: {
            targets: {
              codex: {
                file: 'dist/engine-assets/mcp/../host-adapter/config.toml',
              },
            },
          },
        },
      }),
    ).toThrow()

    expect(() =>
      parseSoulDescriptorV1({
        ...baseDescriptor,
        engine: {
          mcp: {
            targets: {
              codex: {
                content: '[mcp_servers.inline]',
                token: 'literal-secret',
              },
            },
          },
        },
      }),
    ).toThrow()
  })

  test('accepts the built mounted workbench entry', () => {
    const descriptor = parseSoulDescriptorV1(baseDescriptor)

    expect(descriptor.workbench.entry).toBe('dist/web/workbench/index.html')
    expect(descriptor).not.toHaveProperty('api')
  })

  test('accepts built engine projection references', () => {
    const descriptor = parseSoulDescriptorV1({
      ...baseDescriptor,
      engine: {
        workspaceAssets: {
          source: 'dist/engine-assets/workspace',
        },
        skills: {
          source: 'dist/engine-assets/skills',
        },
        mcp: {
          targets: {
            'claude-code': {
              file: 'dist/engine-assets/mcp/claude-code/.mcp.json',
            },
            'codex': {
              file: 'dist/engine-assets/mcp/codex/config.toml',
            },
          },
        },
      },
    })

    expect(descriptor.engine).toEqual({
      workspaceAssets: {
        source: 'dist/engine-assets/workspace',
      },
      skills: {
        source: 'dist/engine-assets/skills',
      },
      mcp: {
        targets: {
          'claude-code': {
            file: 'dist/engine-assets/mcp/claude-code/.mcp.json',
          },
          'codex': {
            file: 'dist/engine-assets/mcp/codex/config.toml',
          },
        },
      },
    })
  })
})
