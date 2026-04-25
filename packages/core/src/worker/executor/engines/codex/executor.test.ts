import type { AgentEvent } from '@aiworker/shared'
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

describe('CodexExecutor — smoke over stub app-server', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'aiworker-codex-'))
  })

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true })
  })

  function makeExecutor() {
    return new CodexExecutor({
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
