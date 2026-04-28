import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  closeWorkerDb,
  conversations,
  getSessionEntry,
  getWorkerDb,
  initWorkerDb,
  recordSessionCompaction,
  rotateSessionConversation,
  runWorkerMigrations,
  sessionEntries,
  touchSessionEntry,
  updateSessionEngineBinding,
  upsertSessionEntry,
} from './index'

describe('worker session store primitives (PLAN-028 S1-A)', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-session-store-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function seedConversation(id: string, chatId = 'chat-1'): void {
    getWorkerDb().insert(conversations).values({
      id,
      channel: 'web',
      chatId,
      status: 'open',
      startedAt: '2026-04-28T12:00:00.000Z',
      lastActiveAt: '2026-04-28T12:00:00.000Z',
    }).run()
  }

  it('upserts a session entry keyed by sessionKey', () => {
    seedConversation('conv-1')

    const first = upsertSessionEntry({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-1',
      channel: 'web',
      chatId: 'chat-1',
      accountId: 'acct-1',
      at: '2026-04-28T12:01:00.000Z',
    })

    expect(first.sessionKey).toBe('gw:conv:alpha')
    expect(first.currentConversationId).toBe('conv-1')
    expect(first.contextTokens).toBe(0)
    expect(first.compactionCount).toBe(0)
    expect(first.engineBindings).toEqual({})

    seedConversation('conv-2', 'chat-2')
    const second = upsertSessionEntry({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-2',
      channel: 'web',
      chatId: 'chat-2',
      threadId: 'thread-1',
      at: '2026-04-28T12:02:00.000Z',
    })

    expect(second.currentConversationId).toBe('conv-2')
    expect(second.chatId).toBe('chat-2')
    expect(second.threadId).toBe('thread-1')
    expect(getWorkerDb().select().from(sessionEntries).all()).toHaveLength(1)
  })

  it('touches counters without changing the current conversation', () => {
    seedConversation('conv-1')
    upsertSessionEntry({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-1',
      channel: 'web',
      chatId: 'chat-1',
      at: '2026-04-28T12:01:00.000Z',
    })

    const touched = touchSessionEntry('gw:conv:alpha', {
      at: '2026-04-28T12:03:00.000Z',
      contextTokens: 123,
      totalTokens: 456,
      totalTokensFresh: 78,
    })

    expect(touched?.currentConversationId).toBe('conv-1')
    expect(touched?.lastInteractionAt).toBe('2026-04-28T12:03:00.000Z')
    expect(touched?.contextTokens).toBe(123)
    expect(touched?.totalTokens).toBe(456)
    expect(touched?.totalTokensFresh).toBe(78)
  })

  it('rotates the current conversation and clears volatile context state', () => {
    seedConversation('conv-1')
    seedConversation('conv-2')
    upsertSessionEntry({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-1',
      channel: 'web',
      chatId: 'chat-1',
      at: '2026-04-28T12:01:00.000Z',
      engineBindings: { codex: { threadId: 'old-thread' } },
    })
    touchSessionEntry('gw:conv:alpha', {
      contextTokens: 999,
      totalTokens: 1000,
      totalTokensFresh: 1000,
    })

    const rotated = rotateSessionConversation({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-2',
      resetReason: 'manual',
      at: '2026-04-28T12:04:00.000Z',
    })

    expect(rotated?.currentConversationId).toBe('conv-2')
    expect(rotated?.resetReason).toBe('manual')
    expect(rotated?.resetAt).toBe('2026-04-28T12:04:00.000Z')
    expect(rotated?.contextTokens).toBe(0)
    expect(rotated?.totalTokens).toBe(0)
    expect(rotated?.totalTokensFresh).toBe(0)
    expect(rotated?.engineBindings).toEqual({})
  })

  it('updates and removes one engine binding without rewriting the session', () => {
    seedConversation('conv-1')
    upsertSessionEntry({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-1',
      channel: 'web',
      chatId: 'chat-1',
      at: '2026-04-28T12:01:00.000Z',
    })

    const withCodex = updateSessionEngineBinding(
      'gw:conv:alpha',
      'codex',
      { threadId: 'thread-1' },
      '2026-04-28T12:02:00.000Z',
    )
    expect(withCodex?.engineBindings).toEqual({ codex: { threadId: 'thread-1' } })

    const withClaude = updateSessionEngineBinding(
      'gw:conv:alpha',
      'claude-code',
      { sessionId: 's-1' },
      '2026-04-28T12:03:00.000Z',
    )
    expect(withClaude?.engineBindings).toEqual({
      'codex': { threadId: 'thread-1' },
      'claude-code': { sessionId: 's-1' },
    })

    const removed = updateSessionEngineBinding(
      'gw:conv:alpha',
      'codex',
      null,
      '2026-04-28T12:04:00.000Z',
    )
    expect(removed?.engineBindings).toEqual({ 'claude-code': { sessionId: 's-1' } })
    expect(getSessionEntry('missing')).toBeNull()
    expect(updateSessionEngineBinding('missing', 'codex', { threadId: 'x' })).toBeNull()
  })

  it('records compaction checkpoints and optional memory flush state', () => {
    seedConversation('conv-1')
    upsertSessionEntry({
      sessionKey: 'gw:conv:alpha',
      currentConversationId: 'conv-1',
      channel: 'web',
      chatId: 'chat-1',
      at: '2026-04-28T12:01:00.000Z',
    })

    const first = recordSessionCompaction('gw:conv:alpha', {
      at: '2026-04-28T12:05:00.000Z',
    })
    expect(first?.compactionCount).toBe(1)
    expect(first?.memoryFlushAt).toBeNull()
    expect(first?.memoryFlushCompactionCount).toBe(0)

    const second = recordSessionCompaction('gw:conv:alpha', {
      at: '2026-04-28T12:06:00.000Z',
      memoryFlushAt: '2026-04-28T12:05:30.000Z',
    })
    expect(second?.compactionCount).toBe(2)
    expect(second?.memoryFlushAt).toBe('2026-04-28T12:05:30.000Z')
    expect(second?.memoryFlushCompactionCount).toBe(2)
    expect(recordSessionCompaction('missing')).toBeNull()
  })
})
