import type { WorkerConfig } from '@zonease/aiworker-shared'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  closeWorkerDb,
  conversations,
  getWorkerDb,
  initWorkerDb,
  messages,
  recordSessionCompaction,
  runWorkerMigrations,
  touchSessionEntry,
  updateSessionEngineBinding,
  upsertSessionEntry,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  getSessionStatus,
  listSessionStatuses,
  planClosedTranscriptMaintenance,
  runClosedTranscriptMaintenance,
} from './status'

const CONFIG = {
  brains: [],
  brainWriteTarget: '',
  brainRetrieval: 'first-match',
  executor: {
    engine: 'codex',
    variant: 'default',
  },
  channels: [],
  evolution: { enabled: false, observationRetentionDays: 7 },
} satisfies WorkerConfig

describe('session status DTOs and maintenance (PLAN-028 S5)', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-session-status-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function seedConversation(input: {
    id: string
    chatId?: string
    status?: 'closed' | 'open'
    closedAt?: string
  }): void {
    getWorkerDb().insert(conversations).values({
      id: input.id,
      channel: 'web',
      chatId: input.chatId ?? 'chat-1',
      status: input.status ?? 'open',
      startedAt: '2026-04-28T12:00:00.000Z',
      lastActiveAt: '2026-04-28T12:10:00.000Z',
      closedAt: input.closedAt ?? null,
    }).run()
  }

  it('returns bounded safe status DTOs without raw engine binding values', () => {
    seedConversation({ id: 'conv-active' })
    upsertSessionEntry({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-active',
      channel: 'web',
      chatId: 'chat-1',
      accountId: 'acct-1',
      at: '2026-04-28T12:01:00.000Z',
    })
    touchSessionEntry('gw:conv:alpha', {
      at: '2026-04-28T12:02:00.000Z',
      contextTokens: 321,
      totalTokens: 654,
      totalTokensFresh: 111,
    })
    recordSessionCompaction('gw:conv:alpha', {
      at: '2026-04-28T12:03:00.000Z',
      memoryFlushAt: '2026-04-28T12:02:30.000Z',
    })
    updateSessionEngineBinding('gw:conv:alpha', 'codex', {
      threadId: 'thread-secret-value',
      localPath: '/tmp/provider-local-path',
    })

    const status = getSessionStatus('gw:conv:alpha', CONFIG)
    expect(status?.sessionKey).toBe('gw:conv:alpha')
    expect(status?.sessionId).toBe('conv-active')
    expect(status?.route).toEqual({
      channel: 'web',
      chatId: 'chat-1',
      threadId: null,
      accountId: 'acct-1',
    })
    expect(status?.context).toEqual({
      contextTokens: 321,
      totalTokens: 654,
      totalTokensFresh: 111,
      compactionCount: 1,
    })
    expect(status?.memoryFlush.status).toBe('current')
    expect(status?.engineBindings.configured).toEqual({
      engine: 'codex',
      present: true,
      valueType: 'object',
      fieldCount: 2,
      fields: ['localPath', 'threadId'],
      redacted: true,
    })
    expect(JSON.stringify(status)).not.toContain('thread-secret-value')
    expect(JSON.stringify(status)).not.toContain('/tmp/provider-local-path')

    const page = listSessionStatuses({ config: CONFIG, limit: 1 })
    expect(page.sessions).toHaveLength(1)
    expect(page.page).toEqual({ limit: 1, offset: 0, hasMore: false })
  })

  it('dry-runs closed transcript maintenance without mutating worker.db', () => {
    seedConversation({ id: 'conv-current', status: 'open' })
    seedConversation({ id: 'conv-closed-old', status: 'closed', closedAt: '2026-04-01T00:00:00.000Z' })
    seedConversation({ id: 'conv-closed-current', status: 'closed', closedAt: '2026-04-01T00:00:00.000Z' })
    upsertSessionEntry({
      sessionKey: 'gw:conv:active',
      currentConversationId: 'conv-current',
      channel: 'web',
      chatId: 'chat-1',
    })
    upsertSessionEntry({
      sessionKey: 'gw:conv:closed-current',
      currentConversationId: 'conv-closed-current',
      channel: 'web',
      chatId: 'chat-2',
    })
    getWorkerDb().insert(messages).values([
      { conversationId: 'conv-closed-old', role: 'user', content: 'one' },
      { conversationId: 'conv-closed-old', role: 'assistant', content: 'two' },
      { conversationId: 'conv-closed-current', role: 'user', content: 'keep' },
    ]).run()

    const beforeConversations = getWorkerDb().select().from(conversations).all().length
    const beforeMessages = getWorkerDb().select().from(messages).all().length
    const result = planClosedTranscriptMaintenance({
      now: '2026-04-28T00:00:00.000Z',
      olderThanDays: 7,
      limit: 10,
    })

    expect(result.mode).toBe('dry-run')
    expect(result.planned.conversations).toBe(1)
    expect(result.planned.messages).toBe(2)
    expect(result.planned.transcripts.map(t => t.conversationId)).toEqual(['conv-closed-old'])
    expect(getWorkerDb().select().from(conversations).all()).toHaveLength(beforeConversations)
    expect(getWorkerDb().select().from(messages).all()).toHaveLength(beforeMessages)
  })

  it('apply mode deletes only the planned closed transcripts', () => {
    seedConversation({ id: 'conv-closed-old', status: 'closed', closedAt: '2026-04-01T00:00:00.000Z' })
    seedConversation({ id: 'conv-closed-new', status: 'closed', closedAt: '2026-04-27T00:00:00.000Z' })
    getWorkerDb().insert(messages).values([
      { conversationId: 'conv-closed-old', role: 'user', content: 'delete me' },
      { conversationId: 'conv-closed-new', role: 'user', content: 'keep me' },
    ]).run()

    const result = runClosedTranscriptMaintenance({
      apply: true,
      now: '2026-04-28T00:00:00.000Z',
      olderThanDays: 7,
      limit: 10,
    })

    expect(result.mode).toBe('apply')
    expect(result.applied).toEqual({ conversationsDeleted: 1, messagesDeleted: 1 })
    expect(getWorkerDb().select().from(conversations).all().map(row => row.id)).toEqual(['conv-closed-new'])
    expect(getWorkerDb().select().from(messages).all().map(row => row.content)).toEqual(['keep me'])
  })
})
