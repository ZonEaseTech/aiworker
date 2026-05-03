import { describe, expect, it } from 'bun:test'

import {
  executorCapabilityManifestSchema,
  executorMcpServerDescriptorSchema,
} from './executor-capabilities'

describe('executor capability manifest schemas', () => {
  it('accepts project-scope MCP descriptors for supported engines', () => {
    const parsed = executorCapabilityManifestSchema.safeParse({
      engines: {
        'codex': {
          mcp: {
            context7: {
              scope: 'project',
              transport: 'streamable-http',
              url: 'https://mcp.example.com/mcp',
            },
          },
        },
        'claude-code': {
          mcp: {
            filesystem: {
              args: ['--root', '.'],
              command: 'npx',
              scope: 'project',
              transport: 'stdio',
            },
          },
        },
      },
      schemaVersion: 1,
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects unsupported engines and non-project scopes', () => {
    expect(executorCapabilityManifestSchema.safeParse({
      engines: {
        http: { mcp: {} },
      },
      schemaVersion: 1,
    }).success).toBe(false)

    expect(executorMcpServerDescriptorSchema.safeParse({
      scope: 'user',
      transport: 'stdio',
    }).success).toBe(false)
  })

  it('allows secret refs in env and headers', () => {
    const parsed = executorMcpServerDescriptorSchema.safeParse({
      headers: {
        Authorization: { secretRef: 'executor.context7.authorization' },
      },
      scope: 'project',
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts engine-native skill, plugin, and policy lifecycle descriptors', () => {
    const parsed = executorCapabilityManifestSchema.safeParse({
      engines: {
        codex: {
          plugins: {
            review: {
              scope: 'project',
              source: { type: 'registry', ref: 'codex-review' },
              status: 'declared',
              validation: { status: 'pending' },
            },
          },
          policies: {
            sandbox: {
              source: { type: 'manual' },
              status: 'draft',
            },
          },
          skills: {
            repoContext: {
              disabled: true,
              source: { type: 'path', ref: './.codex/skills/repo-context' },
            },
          },
        },
      },
      schemaVersion: 1,
    })

    expect(parsed.success).toBe(true)
  })
})
