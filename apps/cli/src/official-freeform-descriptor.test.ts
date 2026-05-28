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

  test('rejects descriptor v1 packages that keep the Freeform app id but drop the default Freeform capability', () => {
    expect(() =>
      parseOfficialFreeformDescriptorJson(fixtureDescriptorText({
        capabilities: [],
      })),
    ).toThrow('expected official Freeform default capability')
  })
})

function fixtureDescriptorText(options: {
  capabilities?: unknown[]
  name?: string
  soulId?: string
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
    capabilities: options.capabilities ?? [
      {
        id: 'default',
        name: 'Freeform Session',
        prompt: {
          ref: 'dist/product/capabilities/default/prompt.md',
          type: 'packaged-file',
        },
      },
    ],
    configuration: {},
    workbench: {
      entry: 'dist/web/workbench/index.html',
      mode: 'sdk-common',
      router: {
        mode: 'search',
      },
      type: 'micro-app',
    },
    api: null,
    engine: {
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
