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
  runWorkerMigrations,
  updateSessionEngineBinding,
  upsertSessionEntry,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

mock.module('../../context', () => ({
  buildRuntime: () => {
    throw new Error('sessions tests must not build a worker runtime')
  },
  loadWorkerContext: async () => ({
    workerId: 'w_sessions_test',
    token: 'tok',
    configVersion: 1,
    hydrated: {
      brains: [],
      brainWriteTarget: '',
      brainRetrieval: 'first-match',
      executor: { engine: 'codex', variant: 'default' },
      channels: [],
      evolution: { enabled: false, observationRetentionDays: 7 },
    },
  }),
}))

describe('aiworker sessions commands', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-cli-sessions-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T, output: string }> {
    const captured: string[] = []
    const original = console.log
    console.log = ((...args: unknown[]) => {
      captured.push(args.map(arg => String(arg)).join(' '))
    }) as typeof console.log
    return fn()
      .then(result => ({ result, output: captured.join('\n') }))
      .finally(() => {
        console.log = original
      })
  }

  it('prints session status using redacted DTOs', async () => {
    getWorkerDb().insert(conversations).values({
      id: 'conv-cli',
      channel: 'web',
      chatId: 'chat-cli',
      status: 'open',
    }).run()
    upsertSessionEntry({
      sessionKey: 'gw:conv:cli',
      currentConversationId: 'conv-cli',
      channel: 'web',
      chatId: 'chat-cli',
    })
    updateSessionEngineBinding('gw:conv:cli', 'codex', {
      threadId: 'raw-thread-value',
      localPath: '/tmp/local-provider-state',
    })

    const { runSessionsList, runSessionsShow } = await import('./sessions')
    const { result, output } = await captureConsole(() => runSessionsList({ limit: 10 }))
    const body = JSON.parse(output) as { sessions: Array<{ sessionKey: string, engineBindings: { configured: { fields: string[] } } }> }

    expect(result).toBe(0)
    expect(body.sessions[0]?.sessionKey).toBe('gw:conv:cli')
    expect(body.sessions[0]?.engineBindings.configured.fields).toEqual(['localPath', 'threadId'])
    expect(output).not.toContain('raw-thread-value')
    expect(output).not.toContain('/tmp/local-provider-state')

    const shown = await captureConsole(() => runSessionsShow('gw:conv:cli'))
    const showBody = JSON.parse(shown.output) as { session: { sessionKey: string } }
    expect(shown.result).toBe(0)
    expect(showBody.session.sessionKey).toBe('gw:conv:cli')
    expect(shown.output).not.toContain('raw-thread-value')
  })

  it('maintenance defaults to dry-run and leaves worker.db unchanged', async () => {
    getWorkerDb().insert(conversations).values({
      id: 'conv-closed-cli',
      channel: 'web',
      chatId: 'chat-old',
      status: 'closed',
      closedAt: '2020-01-02T00:00:00.000Z',
    }).run()
    getWorkerDb().insert(messages).values({
      conversationId: 'conv-closed-cli',
      role: 'user',
      content: 'old',
    }).run()

    const { runSessionsMaintenance } = await import('./sessions')
    const { result, output } = await captureConsole(() => runSessionsMaintenance({ olderThanDays: 1, limit: 10 }))
    const body = JSON.parse(output) as { mode: string, planned: { conversations: number, messages: number } }

    expect(result).toBe(0)
    expect(body.mode).toBe('dry-run')
    expect(body.planned).toMatchObject({ conversations: 1, messages: 1 })
    expect(getWorkerDb().select().from(conversations).all()).toHaveLength(1)
    expect(getWorkerDb().select().from(messages).all()).toHaveLength(1)
  })
})
