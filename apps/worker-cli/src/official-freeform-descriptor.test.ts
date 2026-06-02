import { describe, expect, test } from 'bun:test'

import { parseOfficialFreeformDescriptorJson } from './official-freeform-descriptor'

describe('official Freeform descriptor parser', () => {
  test('rejects descriptor v1 packages that keep the Freeform id but drift from the canonical Freeform identity', () => {
    expect(() =>
      parseOfficialFreeformDescriptorJson(fixtureDescriptorText({
        name: 'Not AIWorker Freeform',
      })),
    ).toThrow('expected official Freeform identity')
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
} = {}): string {
  return `${JSON.stringify({
    protocol: 'soul/v1',
    identity: {
      id: 'aiworker-freeform',
      name: options.name ?? 'AIWorker Freeform',
    },
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
  })}\n`
}
