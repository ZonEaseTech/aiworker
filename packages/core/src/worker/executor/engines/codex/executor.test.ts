import type { AgentEvent } from '@zonease/aiworker-shared'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { CodexExecutor } from './executor'

// The test file lives five segments deep under apps/api/; climb back up to
// reach apps/api/test-fixtures/cli/codex-stub.mjs.
const STUB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'test-fixtures', 'cli', 'codex-stub.mjs')

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of iter)
    out.push(e)
  return out
}

async function readTrace(file: string): Promise<Array<Record<string, unknown>>> {
  const text = await fs.readFile(file, 'utf8')
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('CodexExecutor — smoke over stub app-server', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'aiworker-codex-'))
  })

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true })
  })

  function makeExecutor(stubProtocol: 'legacy' | 'current' = 'legacy', traceFile?: string, stubOptions: { failResume?: boolean, transientReconnect?: boolean } = {}) {
    return new CodexExecutor({
      timeoutMs: 10_000,
      resolveBinary: async () => STUB_PATH,
      spawn: (_cmd, args, opts) =>
        spawn('node', [STUB_PATH, ...args], {
          cwd: opts.cwd,
          env: {
            ...opts.env,
            CODEX_STUB_PROTOCOL: stubProtocol,
            ...(traceFile ? { CODEX_STUB_TRACE_FILE: traceFile } : {}),
            ...(stubOptions.failResume ? { CODEX_STUB_FAIL_RESUME: '1' } : {}),
            ...(stubOptions.transientReconnect ? { CODEX_STUB_TRANSIENT_RECONNECT: '1' } : {}),
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
    })
  }

  it('drives a thread_start → newTurn turn and emits normalized AgentEvents', async () => {
    const executor = makeExecutor()
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'edit the note' }],
      workspacePath: workspace,
    }))

    // thinking_delta from codex/event/thinking
    expect(events.some(e => e.type === 'thinking_delta')).toBe(true)

    // assistant_message_delta events from the assistant_message notifications
    expect(events.filter(e => e.type === 'assistant_message_delta').length).toBeGreaterThan(0)

    // at least one tool_use (the stub emits read + apply_patch)
    const toolUses = events.filter(e => e.type === 'tool_use')
    expect(toolUses.length).toBeGreaterThan(0)
    const readUse = toolUses.find(e => e.type === 'tool_use' && e.name === 'read')
    expect(readUse).toBeDefined()

    // paired tool_results
    const results = events.filter(e => e.type === 'tool_result')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(e => e.type === 'tool_result' && e.id === 'call_read')).toBe(true)

    // Terminal finish:stop
    const last = events.at(-1)!
    expect(last.type).toBe('finish')
    if (last.type === 'finish')
      expect(last.reason).toBe('stop')
  }, 15_000)

  it('falls back to thread/start → turn/start and emits current-protocol events', async () => {
    const executor = makeExecutor('current')
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'reply ok' }],
      workspacePath: workspace,
    }))

    expect(events).toContainEqual({ type: 'thinking_delta', delta: 'Planning the edit...' })
    expect(events).toContainEqual({ type: 'assistant_message_delta', delta: 'OK' })
    expect(events).toContainEqual({
      type: 'token_usage',
      usage: { inputTokens: 12, outputTokens: 9 },
    })
    expect(events.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  }, 15_000)

  it('emits a current-protocol native thread binding after starting a thread', async () => {
    const traceFile = path.join(workspace, 'codex-current-trace.jsonl')
    const executor = makeExecutor('current', traceFile)
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'reply ok' }],
      workspacePath: workspace,
    }))

    const trace = await readTrace(traceFile)
    const initialize = trace.find(msg => msg.method === 'initialize')
    expect((initialize?.params as { capabilities?: { experimentalApi?: boolean } } | undefined)?.capabilities?.experimentalApi).toBe(true)
    expect(events).toContainEqual({
      type: 'engine_binding',
      engine: 'codex',
      binding: {
        protocol: 'current',
        threadId: 'thr_stub',
        path: '/tmp/codex-thread.jsonl',
      },
    })
  }, 15_000)

  it('continues a current-protocol turn after a transient reconnect notification', async () => {
    const executor = makeExecutor('current', undefined, { transientReconnect: true })
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'reply ok' }],
      workspacePath: workspace,
    }))

    expect(events.some(e => e.type === 'error')).toBe(false)
    expect(events).toContainEqual({ type: 'assistant_message_delta', delta: 'OK' })
    expect(events.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  }, 15_000)

  it('resumes a current-protocol native thread when a binding is supplied', async () => {
    const traceFile = path.join(workspace, 'codex-resume-trace.jsonl')
    const executor = makeExecutor('current', traceFile)
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'continue native thread' }],
      workspacePath: workspace,
      engineBinding: {
        protocol: 'current',
        threadId: 'thr_existing',
        path: '/tmp/codex-thread.jsonl',
      },
    }))

    const trace = await readTrace(traceFile)
    expect(trace.some(msg => msg.method === 'thread/resume')).toBe(true)
    expect(trace.some(msg => msg.method === 'thread/start')).toBe(false)
    const turnStart = trace.find(msg => msg.method === 'turn/start')
    expect((turnStart?.params as { threadId?: string } | undefined)?.threadId).toBe('thr_existing')
    const prompt = (turnStart?.params as { input?: Array<{ text?: string }> } | undefined)?.input?.[0]?.text
    expect(prompt).toBe('continue native thread')
    expect(events).toContainEqual({
      type: 'engine_binding',
      engine: 'codex',
      binding: {
        protocol: 'current',
        threadId: 'thr_existing',
        path: '/tmp/codex-thread.jsonl',
      },
    })
  }, 15_000)

  it('clears a stale current-protocol binding and starts a fresh thread', async () => {
    const traceFile = path.join(workspace, 'codex-stale-trace.jsonl')
    const executor = makeExecutor('current', traceFile, { failResume: true })
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'recover from stale native thread' }],
      workspacePath: workspace,
      engineBinding: {
        protocol: 'current',
        threadId: 'thr_missing',
      },
    }))

    const trace = await readTrace(traceFile)
    expect(trace.some(msg => msg.method === 'thread/resume')).toBe(true)
    expect(trace.some(msg => msg.method === 'thread/start')).toBe(true)
    expect(events).toContainEqual({ type: 'engine_binding', engine: 'codex', binding: null })
    expect(events).toContainEqual({
      type: 'engine_binding',
      engine: 'codex',
      binding: {
        protocol: 'current',
        threadId: 'thr_stub',
        path: '/tmp/codex-thread.jsonl',
      },
    })
    expect(events.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  }, 15_000)

  it('sends the worker history window to legacy newTurn', async () => {
    const traceFile = path.join(workspace, 'codex-trace.jsonl')
    const executor = makeExecutor('legacy', traceFile)
    await collect(executor.run({
      messages: [
        { role: 'system', content: 'system rules' },
        { role: 'user', content: 'Remember MEMKEY-774-CERULEAN.' },
        { role: 'assistant', content: 'STORED' },
        { role: 'user', content: 'What did I ask you to remember?' },
      ],
      workspacePath: workspace,
    }))

    const trace = await readTrace(traceFile)
    const newTurn = trace.find(msg => msg.method === 'newTurn')
    const params = newTurn?.params as { prompt?: string } | undefined
    expect(params?.prompt).toContain('<System>\nsystem rules\n</System>')
    expect(params?.prompt).toContain('<User>\nRemember MEMKEY-774-CERULEAN.\n</User>')
    expect(params?.prompt).toContain('<Assistant>\nSTORED\n</Assistant>')
    expect(params?.prompt).toContain('<User>\nWhat did I ask you to remember?\n</User>')
  }, 15_000)

  it('sends the worker history window to current turn/start', async () => {
    const traceFile = path.join(workspace, 'codex-trace.jsonl')
    const executor = makeExecutor('current', traceFile)
    await collect(executor.run({
      messages: [
        { role: 'system', content: 'system rules' },
        { role: 'user', content: 'Remember MEMKEY-774-CERULEAN.' },
        { role: 'assistant', content: 'STORED' },
        { role: 'user', content: 'What did I ask you to remember?' },
      ],
      workspacePath: workspace,
    }))

    const trace = await readTrace(traceFile)
    const turnStart = trace.find(msg => msg.method === 'turn/start')
    const params = turnStart?.params as { input?: Array<{ text?: string }> } | undefined
    const prompt = params?.input?.[0]?.text
    expect(prompt).toContain('<System>\nsystem rules\n</System>')
    expect(prompt).toContain('<User>\nRemember MEMKEY-774-CERULEAN.\n</User>')
    expect(prompt).toContain('<Assistant>\nSTORED\n</Assistant>')
    expect(prompt).toContain('<User>\nWhat did I ask you to remember?\n</User>')
  }, 15_000)

  it('emits error + finish:error when no user message is present', async () => {
    const executor = makeExecutor()
    const events = await collect(executor.run({
      messages: [{ role: 'system', content: 'sys only' }],
      workspacePath: workspace,
    }))
    expect(events[0]?.type).toBe('error')
    const last = events.at(-1)!
    expect(last.type).toBe('finish')
    if (last.type === 'finish')
      expect(last.reason).toBe('error')
  })

  it('health probe reports healthy without shelling out', async () => {
    const executor = makeExecutor()
    const status = await executor.health()
    expect(status.status).toBe('healthy')
    expect(status.name).toBe('codex')
  })

  it('listTools returns empty (codex owns its tool set)', async () => {
    const executor = makeExecutor()
    const tools = await executor.listTools()
    expect(tools).toEqual([])
  })
})
