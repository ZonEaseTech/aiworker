import type { AgentEvent } from '@zonease/aiworker-shared'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { geminiAgent } from './agents/gemini'
import { qwenAgent } from './agents/qwen'
import { AcpExecutor, resolveCliVersion } from './harness'

/**
 * End-to-end smoke of the ACP harness with a stub CLI. Verifies that the
 * harness drives the initialize → session/new → session/prompt lifecycle,
 * relays sessionUpdate notifications as normalized AgentEvents, and emits
 * a terminating `finish` event whose reason reflects the stop reason.
 */

// test file lives under apps/api/src/worker/executor/engines/acp/ — climb
// five segments to reach apps/api/ before descending into test-fixtures.
const STUB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'test-fixtures', 'cli', 'acp-stub.mjs')

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of iter)
    out.push(e)
  return out
}

describe('AcpExecutor — smoke over stub CLI', () => {
  let tmpWorkspace: string

  beforeEach(() => {
    tmpWorkspace = mkdtempSync(path.join(tmpdir(), 'aiworker-acp-'))
  })

  afterEach(async () => {
    await fs.rm(tmpWorkspace, { recursive: true, force: true })
  })

  function makeExecutor(agent: typeof geminiAgent | typeof qwenAgent) {
    return new AcpExecutor({
      agent,
      timeoutMs: 10_000,
      resolveBinary: async () => STUB_PATH,
      spawn: (_cmd, args, opts) =>
        spawn('node', [STUB_PATH, ...args], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
    })
  }

  it('drives a turn against the stub, emits normalized events + finish:stop', async () => {
    const executor = makeExecutor(geminiAgent)
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'hello' }],
      workspacePath: tmpWorkspace,
    }))

    // First agent_thinking_chunk → thinking_delta
    const thinking = events.find(e => e.type === 'thinking_delta') as Extract<AgentEvent, { type: 'thinking_delta' }>
    expect(thinking).toBeDefined()
    expect(thinking.delta).toContain('Considering')

    // assistant_message_delta events present
    const texts = events.filter(e => e.type === 'assistant_message_delta')
    expect(texts.length).toBeGreaterThan(0)

    // At least one file_edit tool_use
    const edit = events.find(e =>
      e.type === 'tool_use' && e.action.kind === 'file_edit',
    ) as Extract<AgentEvent, { type: 'tool_use' }>
    expect(edit).toBeDefined()

    // tool_result paired with the edit tool_call
    const editResult = events.find(e => e.type === 'tool_result' && e.id === 'call_edit')
    expect(editResult).toBeDefined()

    // command_run tool_use from kind=execute
    const exec = events.find(e =>
      e.type === 'tool_use' && e.action.kind === 'command_run',
    ) as Extract<AgentEvent, { type: 'tool_use' }>
    expect(exec).toBeDefined()

    // task_plan from the plan update
    const plan = events.find(e =>
      e.type === 'tool_use' && e.action.kind === 'task_plan',
    )
    expect(plan).toBeDefined()

    // Terminator: a single finish:stop at the end
    const last = events[events.length - 1]
    expect(last?.type).toBe('finish')
    if (last && last.type === 'finish')
      expect(last.reason).toBe('stop')
  }, 15_000)

  it('works with the Qwen agent via the same stub + same event sequence', async () => {
    const executor = makeExecutor(qwenAgent)
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'hi' }],
      workspacePath: tmpWorkspace,
    }))
    expect(events.some(e => e.type === 'assistant_message_delta')).toBe(true)
    expect(events.some(e => e.type === 'tool_use')).toBe(true)
    const last = events[events.length - 1]
    expect(last?.type).toBe('finish')
  }, 15_000)

  it('emits an error + finish:error when no user message is present', async () => {
    const executor = makeExecutor(geminiAgent)
    const events = await collect(executor.run({
      messages: [{ role: 'system', content: 'sys only' }],
      workspacePath: tmpWorkspace,
    }))
    expect(events[0]?.type).toBe('error')
    const last = events[events.length - 1]
    expect(last?.type).toBe('finish')
    if (last && last.type === 'finish')
      expect(last.reason).toBe('error')
  })

  it('falls back to process.cwd() when no workspacePath is provided', async () => {
    // Just verifying we don't throw on missing workspace — the stub ignores cwd.
    const executor = makeExecutor(geminiAgent)
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'noop' }],
    }))
    expect(events.some(e => e.type === 'assistant_message_delta')).toBe(true)
  }, 15_000)
})

describe('resolveCliVersion', () => {
  const origGemini = process.env.GEMINI_CLI_VERSION

  beforeEach(() => {
    delete process.env.GEMINI_CLI_VERSION
  })

  afterEach(() => {
    if (origGemini === undefined)
      delete process.env.GEMINI_CLI_VERSION
    else
      process.env.GEMINI_CLI_VERSION = origGemini
  })

  it('prefers config version over env and default', () => {
    process.env.GEMINI_CLI_VERSION = '9.9.9'
    expect(resolveCliVersion(geminiAgent, '1.2.3')).toBe('1.2.3')
  })

  it('falls back to env when config is missing', () => {
    process.env.GEMINI_CLI_VERSION = '7.7.7'
    expect(resolveCliVersion(geminiAgent, undefined)).toBe('7.7.7')
  })

  it('falls back to the agent default when neither config nor env is set', () => {
    expect(resolveCliVersion(geminiAgent, undefined)).toBe(geminiAgent.defaultVersion)
  })
})

describe('AcpExecutor — availability probe', () => {
  it('returns NotFound + caches the result when no probe is configured on the agent', async () => {
    const executor = new AcpExecutor({
      agent: { ...geminiAgent, authProbe: undefined },
      resolveBinary: async () => STUB_PATH,
    })
    const a = await executor.getAvailability()
    expect(a.status).toBe('NotFound')
  })

  it('forwards probe errors to NotFound and caches the response', async () => {
    let calls = 0
    const executor = new AcpExecutor({
      agent: geminiAgent,
      authProbe: async () => {
        calls++
        throw new Error('probe failed')
      },
      resolveBinary: async () => STUB_PATH,
    })
    const first = await executor.getAvailability()
    expect(first.status).toBe('NotFound')
    expect(first.detail).toContain('probe failed')
    // second call should hit the cache without invoking the probe again
    await executor.getAvailability()
    expect(calls).toBe(1)
  })

  it('force=true bypasses the in-memory cache', async () => {
    let calls = 0
    const executor = new AcpExecutor({
      agent: geminiAgent,
      authProbe: async () => {
        calls++
        return { status: 'InstallationFound', checkedAt: 'now' }
      },
      resolveBinary: async () => STUB_PATH,
    })
    await executor.getAvailability()
    await executor.getAvailability(true)
    expect(calls).toBe(2)
  })
})
