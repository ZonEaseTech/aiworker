import { describe, expect, test } from 'bun:test'
import { localSessionSchema, localWorkerConfigKindSchema, localWorkerConfigTargetSchema, localWorkerConfigUpdatedBySchema, localWorkerConfigValueInputSchema, localWorkerConfigValueSchema, soulProtocolPackage } from './index'

const CANONICAL_WORKER_CONFIG_KINDS = [
  'engine-selection',
  'projection-overlay',
  'skill-overlay',
  'mcp-overlay',
  'entry-file-overlay',
  'workbench-preference',
  'sdk-extension',
] as const

const CANONICAL_WORKER_CONFIG_TARGETS = [
  'codex',
  'claude-code',
  'all',
  'none',
] as const

const CANONICAL_WORKER_CONFIG_UPDATED_BY = [
  'cli',
  'web',
  'app-owned-api',
] as const

describe('soul-descriptor package boundary', () => {
  test('declares descriptor-only v1 sections', () => {
    expect(soulProtocolPackage.descriptor).toBe('dist/soul.descriptor.json')
    expect(soulProtocolPackage.sections).not.toContain('workbench')
    expect(soulProtocolPackage.sections).not.toContain('exports')
  })

  test('exports the SDK-standard worker config envelope contract', () => {
    const input = localWorkerConfigValueInputSchema.parse({
      enabled: true,
      kind: 'engine-selection',
      target: 'codex',
    })

    expect(input).toEqual({
      checksum: null,
      enabled: true,
      kind: 'engine-selection',
      options: {},
      sourceRef: null,
      target: 'codex',
    })
    expect(localWorkerConfigValueSchema.parse({
      ...input,
      updatedAt: '2026-05-27T00:00:00.000Z',
      updatedBy: 'web',
    })).toMatchObject({
      kind: 'engine-selection',
      updatedBy: 'web',
    })
    expect(() => localWorkerConfigValueSchema.parse({
      ...input,
      candidateId: 'domain-record',
      updatedAt: '2026-05-27T00:00:00.000Z',
      updatedBy: 'web',
    })).toThrow()
    expect(() => localWorkerConfigValueInputSchema.parse({
      enabled: true,
      kind: 'mcp-overlay',
      target: 'codex',
      updatedBy: 'ben',
    })).toThrow()
  })

  test('守住 worker config envelope kind/target/updatedBy 与 docs/protocol.md 列表完全一致', () => {
    expect(localWorkerConfigKindSchema.options).toEqual([...CANONICAL_WORKER_CONFIG_KINDS])
    expect(localWorkerConfigTargetSchema.options).toEqual([...CANONICAL_WORKER_CONFIG_TARGETS])
    expect(localWorkerConfigUpdatedBySchema.options).toEqual([...CANONICAL_WORKER_CONFIG_UPDATED_BY])

    for (const kind of CANONICAL_WORKER_CONFIG_KINDS)
      expect(localWorkerConfigKindSchema.parse(kind)).toBe(kind)
    for (const target of CANONICAL_WORKER_CONFIG_TARGETS)
      expect(localWorkerConfigTargetSchema.parse(target)).toBe(target)
    for (const updatedBy of CANONICAL_WORKER_CONFIG_UPDATED_BY)
      expect(localWorkerConfigUpdatedBySchema.parse(updatedBy)).toBe(updatedBy)

    expect(() => localWorkerConfigKindSchema.parse('memory-overlay')).toThrow()
    expect(() => localWorkerConfigTargetSchema.parse('claude-haiku')).toThrow()
    expect(() => localWorkerConfigUpdatedBySchema.parse('admin-console')).toThrow()
  })

  test('每个 envelope kind/target/updatedBy 组合都能 input → stored round-trip', () => {
    for (const kind of CANONICAL_WORKER_CONFIG_KINDS) {
      for (const target of CANONICAL_WORKER_CONFIG_TARGETS) {
        for (const updatedBy of CANONICAL_WORKER_CONFIG_UPDATED_BY) {
          const input = localWorkerConfigValueInputSchema.parse({
            enabled: true,
            kind,
            target,
            updatedBy,
          })
          expect(input).toMatchObject({ enabled: true, kind, options: {}, target, updatedBy })

          const stored = localWorkerConfigValueSchema.parse({
            ...input,
            updatedAt: '2026-05-28T00:00:00.000Z',
            updatedBy,
          })
          expect(stored).toMatchObject({ enabled: true, kind, target, updatedAt: '2026-05-28T00:00:00.000Z', updatedBy })
        }
      }
    }
  })

  test('keeps local session protocol lifecycle-only without Host-owned context', () => {
    const parsed = localSessionSchema.parse({
      createdAt: '2026-05-27T00:00:00.000Z',
      endedAt: null,
      id: 'session-1',
      metadataJson: {},
      startedAt: '2026-05-27T00:00:00.000Z',
      status: 'active',
      title: 'Freeform session',
      updatedAt: '2026-05-27T00:00:00.000Z',
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })

    expect(parsed).not.toHaveProperty('context')
    expect(parsed).not.toHaveProperty('capabilityId')
  })
})
