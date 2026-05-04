import type { AgentEvent } from '@zonease/aiworker-shared'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { buildBaseArgs, ClaudeCodeExecutor } from './executor'

const STUB_PATH = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'test-fixtures',
  'cli',
  'claude-stub.sh',
)

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const e of iter)
    events.push(e)
  return events
}

describe('ClaudeCodeExecutor (stub CLI)', () => {
  let workspace: string

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aiworker-cc-exec-'))
  })

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true })
  })

  it('translates stub stream-json into AgentEvents in order', async () => {
    const executor = new ClaudeCodeExecutor({
      resolveClaudeBinary: async () => STUB_PATH,
      // Override spawn so we skip the stub's arg validation and just invoke
      // the script. The stub ignores args entirely.
      spawn: (_cmd, _args, opts): ChildProcessWithoutNullStreams => {
        return spawn(STUB_PATH, [], { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams
      },
    })

    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'read note' }],
      workspacePath: workspace,
    }))

    // Partial text is append-only; the later full assistant block must not
    // replay the same text as another delta.
    const textDeltas = events
      .filter(e => e.type === 'assistant_message_delta')
      .map(e => e.delta)
    expect(textDeltas).toEqual(['Checking files', 'Done.'])
    // Exactly one tool_use for Read with file_read action
    const toolUses = events.filter(e => e.type === 'tool_use')
    expect(toolUses).toHaveLength(1)
    const use = toolUses[0]!
    if (use.type === 'tool_use') {
      expect(use.name).toBe('Read')
      expect(use.action.kind).toBe('file_read')
    }
    // One tool_result correlating to the tool_use
    const results = events.filter(e => e.type === 'tool_result')
    expect(results).toHaveLength(1)
    const res = results[0]!
    if (res.type === 'tool_result')
      expect(res.id).toBe('toolu_1')
    // finish with reason stop + usage
    const finish = events.find(e => e.type === 'finish')
    expect(finish).toBeDefined()
    if (finish && finish.type === 'finish') {
      expect(finish.reason).toBe('stop')
      expect(finish.usage?.inputTokens).toBe(8)
    }
    expect(events).toContainEqual({
      type: 'engine_binding',
      engine: 'claude-code',
      binding: { sessionId: 'sess_stub' },
    })
  })

  it('passes a stored native session id through --resume', async () => {
    let capturedArgs: string[] = []
    const executor = new ClaudeCodeExecutor({
      resolveClaudeBinary: async () => STUB_PATH,
      spawn: (_cmd, args, opts): ChildProcessWithoutNullStreams => {
        capturedArgs = args
        return spawn(STUB_PATH, [], { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams
      },
    })

    await collect(executor.run({
      messages: [{ role: 'user', content: 'read note' }],
      workspacePath: workspace,
      engineBinding: { sessionId: 'sess_existing' },
    }))

    expect(capturedArgs).toContain('--resume')
    expect(capturedArgs).toContain('sess_existing')
  })

  it('yields error when workspacePath is missing', async () => {
    const executor = new ClaudeCodeExecutor({
      resolveClaudeBinary: async () => STUB_PATH,
    })
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'x' }],
    }))
    expect(events[0]?.type).toBe('error')
    expect(events.some(e => e.type === 'finish')).toBe(true)
  })

  it('yields error when no user message present', async () => {
    const executor = new ClaudeCodeExecutor({
      resolveClaudeBinary: async () => STUB_PATH,
    })
    const events = await collect(executor.run({
      messages: [{ role: 'system', content: 'hi' }],
      workspacePath: workspace,
    }))
    expect(events[0]?.type).toBe('error')
  })

  it('health probe always reports healthy (no upstream call)', async () => {
    const executor = new ClaudeCodeExecutor({
      resolveClaudeBinary: async () => STUB_PATH,
    })
    const status = await executor.health()
    expect(status.status).toBe('healthy')
    expect(status.name).toBe('claude-code')
  })
})

describe('buildBaseArgs', () => {
  it('appends --resume when a native session id is provided', () => {
    const args = buildBaseArgs(undefined, undefined, 'sess_1')
    expect(args).toContain('--resume')
    expect(args).toContain('sess_1')
  })
})
