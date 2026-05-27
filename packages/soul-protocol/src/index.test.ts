import { describe, expect, test } from 'bun:test'
import { localSessionSchema, localWorkerConfigValueInputSchema, localWorkerConfigValueSchema, soulProtocolPackage } from './index'

describe('soul-protocol package boundary', () => {
  test('declares descriptor-only v1 sections', () => {
    expect(soulProtocolPackage.descriptor).toBe('dist/soul.descriptor.json')
    expect(soulProtocolPackage.sections).toContain('workbench')
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

  test('keeps local session protocol lifecycle-only without Host-owned context', () => {
    const parsed = localSessionSchema.parse({
      capabilityId: 'default',
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
  })
})
