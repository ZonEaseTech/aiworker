import { describe, expect, test } from 'bun:test'

import { parseOfficialFreeformDescriptorJson } from './official-freeform-descriptor'

describe('official Freeform descriptor parser', () => {
  test('rejects descriptor v1 packages that keep the Freeform app id but drift from the canonical Freeform identity', () => {
    expect(() =>
      parseOfficialFreeformDescriptorJson(fixtureDescriptorText({
        name: 'Not AIWorker Freeform',
        soulId: 'not-freeform',
      })),
    ).toThrow('expected official Freeform identity')
  })

  test('rejects descriptor v1 packages that drift from the canonical Freeform workbench', () => {
    expect(() =>
      parseOfficialFreeformDescriptorJson(fixtureDescriptorText({
        workbench: {
          entry: 'dist/web/workbench/index.html',
          mode: 'custom',
          router: { mode: 'search' },
          type: 'micro-app',
        },
      })),
    ).toThrow('expected official Freeform SDK common workbench')
  })

  test('rejects descriptor v1 packages that drop canonical Freeform native MCP targets', () => {
    expect(() =>
      parseOfficialFreeformDescriptorJson(fixtureDescriptorText({
        engine: {
          mcp: {
            targets: {
              codex: {
                file: 'dist/engine-assets/mcp/codex/config.toml',
              },
            },
          },
          skills: {
            source: 'dist/engine-assets/skills',
          },
          workspaceAssets: {
            source: 'dist/engine-assets/workspace',
          },
        },
      })),
    ).toThrow('expected official Freeform native MCP targets')
  })
})

function fixtureDescriptorText(options: {
  engine?: unknown
  name?: string
  soulId?: string
  workbench?: unknown
} = {}): string {
  return `${JSON.stringify({
    protocol: 'soul/v1',
    identity: {
      appId: 'aiworker-freeform',
      name: options.name ?? 'AIWorker Freeform',
      soulId: options.soulId ?? 'freeform',
      version: '0.1.0',
    },
    compatibility: {
      engines: ['codex'],
      host: '>=1.0.0',
      sdk: '>=1.0.0',
    },
    configuration: {},
    workbench: options.workbench ?? {
      entry: 'dist/web/workbench/index.html',
      mode: 'sdk-common',
      router: {
        mode: 'search',
      },
      type: 'micro-app',
    },
    api: null,
    engine: options.engine ?? {
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
      skills: {
        source: 'dist/engine-assets/skills',
      },
      workspaceAssets: {
        source: 'dist/engine-assets/workspace',
      },
    },
    health: {
      ready: true,
      type: 'static',
    },
    extensions: {},
    external: {},
  })}\n`
}
