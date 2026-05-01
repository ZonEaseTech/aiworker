import { describe, expect, it } from 'bun:test'
import {
  capabilityPacksManifestSchema,
  mcpDescriptorSchema,
  policyManifestSchema,
  skillMetadataSchema,
  toolsetsManifestSchema,
} from './capabilities'

describe('capability manifest schemas', () => {
  it('accepts the canonical project capability manifests', () => {
    expect(policyManifestSchema.safeParse({
      outOfScope: { strategy: 'handoff' },
      risk: { highRiskRequiresApproval: true, policy: 'ask before risky writes' },
      schemaVersion: 1,
      soul: { label: 'Developer', preset: 'developer', source: 'flag' },
      status: 'draft',
      toolPolicy: {
        default: 'ask',
        rules: [
          { action: 'auto', pattern: 'read.*' },
          { action: 'ask', pattern: 'write.*' },
        ],
      },
    }).success).toBe(true)

    expect(toolsetsManifestSchema.safeParse({
      defaultToolsets: ['filesystem-read', 'test'],
      schemaVersion: 1,
      soul: 'developer',
      status: 'draft',
    }).success).toBe(true)

    expect(capabilityPacksManifestSchema.safeParse({
      packs: [
        {
          id: 'code',
          status: 'draft',
          validation: { issues: [], status: 'pending' },
        },
      ],
      schemaVersion: 1,
      soul: 'developer',
      status: 'draft',
    }).success).toBe(true)
  })

  it('keeps legacy pack validation strings readable during migration', () => {
    const parsed = capabilityPacksManifestSchema.safeParse({
      packs: [
        { id: 'code', status: 'draft', validation: 'pending' },
      ],
      schemaVersion: 1,
      soul: 'developer',
      status: 'draft',
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts declared-only and launchable MCP descriptors', () => {
    expect(mcpDescriptorSchema.safeParse({
      servers: {
        docs: {
          description: 'Documentation MCP',
          tools: [
            { description: 'Search docs', name: 'docs.search' },
          ],
        },
        context7: {
          args: ['-y', '@upstash/context7-mcp'],
          command: 'npx',
          transport: 'stdio',
        },
      },
    }).success).toBe(true)
  })

  it('rejects invalid ids and incomplete skill metadata', () => {
    expect(toolsetsManifestSchema.safeParse({
      defaultToolsets: ['Filesystem Read'],
      schemaVersion: 1,
      status: 'draft',
    }).success).toBe(false)

    expect(skillMetadataSchema.safeParse({
      name: 'release-check',
    }).success).toBe(false)
  })
})
