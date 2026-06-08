import type { LocalSession } from '@zonease/aiworker-soul-descriptor'
import { describe, expect, it } from 'vitest'
import { en } from '../i18n/locales'
import { projectNamePlaceholder, upsertSession } from './model'

describe('projectNamePlaceholder 不再按 soul id 分支', () => {
  it('任意 soul id 都返回 default 占位', () => {
    const def = en.create.projectPlaceholders.default
    expect(projectNamePlaceholder('custom-soul-alpha', en)).toBe(def)
    expect(projectNamePlaceholder('custom-soul-beta', en)).toBe(def)
    expect(projectNamePlaceholder('whatever-soul', en)).toBe(def)
  })
})

describe('upsertSession', () => {
  const baseSession = {
    createdAt: '2026-06-01T00:00:00.000Z',
    endedAt: null,
    id: 'session-1',
    metadataJson: {},
    startedAt: '2026-06-01T00:00:00.000Z',
    status: 'active',
    title: 'New session 1',
    updatedAt: '2026-06-01T00:00:00.000Z',
    workerId: 'worker-1',
    workspaceId: 'workspace-1',
  } satisfies LocalSession

  it('keeps a newer session title when an older detail snapshot arrives later', () => {
    const renamed = {
      ...baseSession,
      metadataJson: { titleSource: 'auto-truncated' },
      title: 'Check MC',
      updatedAt: '2026-06-01T00:00:02.000Z',
    } satisfies LocalSession
    const stale = {
      ...baseSession,
      title: 'New session 1',
      updatedAt: '2026-06-01T00:00:01.000Z',
    } satisfies LocalSession

    const result = upsertSession([renamed], stale)

    expect(result[0]?.title).toBe('Check MC')
    expect(result[0]?.metadataJson.titleSource).toBe('auto-truncated')
  })
})
