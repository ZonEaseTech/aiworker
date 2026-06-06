import type { SessionRow } from '@zonease/aiworker-storage-sqlite/worker'

import { describe, expect, it } from 'bun:test'

import {
  applyAutoEngineTitle,
  applyAutoTruncatedTitle,
  applyUserTitle,
  readSessionTitleSource,
  stripSessionTitleSourceMetadata,
} from './session-title-policy'

function session(input: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'session-1',
    workerId: 'worker-1',
    workspaceId: 'workspace-1',
    title: 'New session 1',
    status: 'active',
    metadataJson: {},
    startedAt: '2026-06-06T00:00:00.000Z',
    endedAt: null,
    createdAt: '2026-06-06T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
    ...input,
  }
}

describe('session title policy', () => {
  it('reads unknown title sources as auto-default', () => {
    expect(readSessionTitleSource(session())).toBe('auto-default')
    expect(readSessionTitleSource(session({ metadataJson: { titleSource: 'legacy' } }))).toBe('auto-default')
  })

  it('applies an auto-truncated title only to an auto-default session', () => {
    expect(applyAutoTruncatedTitle(session(), 'Check MC')).toEqual({
      title: 'Check MC',
      metadataJson: { titleSource: 'auto-truncated' },
    })
    expect(applyAutoTruncatedTitle(session({ metadataJson: { titleSource: 'auto-engine' } }), 'Check MC')).toBeNull()
    expect(applyAutoTruncatedTitle(session({ metadataJson: { titleSource: 'user' } }), 'Check MC')).toBeNull()
  })

  it('applies an engine title to automatic titles but never to user titles', () => {
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'auto-truncated' } }), 'Build failure')).toEqual({
      title: 'Build failure',
      metadataJson: { titleSource: 'auto-engine' },
    })
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'auto-truncated' }, title: 'Build failure' }), 'Build failure')).toEqual({
      title: 'Build failure',
      metadataJson: { titleSource: 'auto-engine' },
    })
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'auto-engine' } }), 'Better title')).toEqual({
      title: 'Better title',
      metadataJson: { titleSource: 'auto-engine' },
    })
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'auto-engine' }, title: 'Better title' }), 'Better title')).toBeNull()
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'user' }, title: 'Manual' }), 'Robot')).toBeNull()
  })

  it('marks changed user titles as user-owned without locking unchanged titles', () => {
    expect(applyUserTitle(session({ title: 'New session 1' }), 'Manual title')).toEqual({
      title: 'Manual title',
      metadataJson: { titleSource: 'user' },
    })
    expect(applyUserTitle(session({ title: 'New session 1' }), 'New session 1')).toBeNull()
  })

  it('preserves unrelated metadata when changing title source', () => {
    expect(applyUserTitle(session({ metadataJson: { engineId: 'codex' } }), 'Manual title')).toEqual({
      title: 'Manual title',
      metadataJson: { engineId: 'codex', titleSource: 'user' },
    })
  })

  it('strips top-level titleSource without mutating other metadata', () => {
    const metadata = {
      custom: 'x',
      engineCommand: 'codex',
      engineId: 'codex',
      executionMode: 'local-cli',
      nested: { titleSource: 'leave-me-alone' },
      titleSource: 'user',
    }

    expect(stripSessionTitleSourceMetadata(metadata)).toEqual({
      custom: 'x',
      engineCommand: 'codex',
      engineId: 'codex',
      executionMode: 'local-cli',
      nested: { titleSource: 'leave-me-alone' },
    })
    expect(metadata.titleSource).toBe('user')
  })
})
