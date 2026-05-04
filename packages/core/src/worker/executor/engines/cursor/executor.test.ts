import type { AgentEvent } from '@zonease/aiworker-shared'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { buildArgs, composeCursorPrompt, CursorExecutor } from './executor'

const STUB_PATH = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'test-fixtures',
  'cli',
  'cursor-stub.sh',
)

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const e of iter)
    events.push(e)
  return events
}

describe('CursorExecutor (stub CLI)', () => {
  let workspace: string

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aiworker-cursor-'))
  })

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true })
  })

  it('translates stub stream-json into AgentEvents and captures session_id', async () => {
    const executor = new CursorExecutor({
      resolveBinary: async () => STUB_PATH,
      // Override spawn so we skip arg validation and just invoke the script.
      // The stub ignores stdin args and emits a fixed transcript.
      spawn: (_cmd, _args, opts): ChildProcessWithoutNullStreams => {
        return spawn(STUB_PATH, [], { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams
      },
    })

    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'edit the note' }],
      workspacePath: workspace,
    }))

    // at least one assistant_message_delta
    expect(events.some(e => e.type === 'assistant_message_delta')).toBe(true)

    // at least one tool_use with a paired tool_result
    const reads = events.filter(e => e.type === 'tool_use' && e.name === 'read_file')
    expect(reads).toHaveLength(1)
    const results = events.filter(e => e.type === 'tool_result')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(e => e.type === 'tool_result' && e.id === 'call_read')).toBe(true)

    // Terminal finish:stop
    const last = events.at(-1)!
    expect(last.type).toBe('finish')
    if (last.type === 'finish')
      expect(last.reason).toBe('stop')

    // Session id captured for follow-up --resume.
    expect(executor.getLastSessionId()).toBe('sess_stub')
    expect(events).toContainEqual({
      type: 'engine_binding',
      engine: 'cursor',
      binding: { sessionId: 'sess_stub' },
    })
  })

  it('passes a stored native session id through --resume', async () => {
    let capturedArgs: string[] = []
    const executor = new CursorExecutor({
      resolveBinary: async () => STUB_PATH,
      spawn: (_cmd, args, opts): ChildProcessWithoutNullStreams => {
        capturedArgs = args
        return spawn(STUB_PATH, [], { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams
      },
    })

    await collect(executor.run({
      messages: [{ role: 'user', content: 'edit the note' }],
      workspacePath: workspace,
      engineBinding: { sessionId: 'sess_existing' },
    }))

    expect(capturedArgs).toContain('--resume')
    expect(capturedArgs).toContain('sess_existing')
  })

  it('emits error + finish when no user message is present', async () => {
    const executor = new CursorExecutor({ resolveBinary: async () => STUB_PATH })
    const events = await collect(executor.run({
      messages: [{ role: 'system', content: 'hi' }],
      workspacePath: workspace,
    }))
    expect(events[0]?.type).toBe('error')
    expect(events.some(e => e.type === 'finish')).toBe(true)
  })

  it('reports error when cursor-agent is not on PATH (no npx fallback)', async () => {
    const executor = new CursorExecutor({ resolveBinary: async () => null })
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'hi' }],
      workspacePath: workspace,
    }))
    expect(events[0]?.type).toBe('error')
    if (events[0]?.type === 'error')
      expect(events[0].error).toContain('cursor-agent')
  })

  it('health probe reports healthy without shelling out', async () => {
    const executor = new CursorExecutor({ resolveBinary: async () => STUB_PATH })
    const status = await executor.health()
    expect(status.status).toBe('healthy')
    expect(status.name).toBe('cursor')
  })
})

describe('buildArgs', () => {
  it('always includes -p + stream-json output format', () => {
    const args = buildArgs({})
    expect(args).toContain('-p')
    expect(args).toContain('--output-format=stream-json')
  })

  it('appends --model when provided', () => {
    const args = buildArgs({ model: 'gpt-5' })
    expect(args).toContain('--model')
    expect(args).toContain('gpt-5')
  })

  it('appends --resume for follow-up turns', () => {
    const args = buildArgs({ resumeSessionId: 'sess_1' })
    expect(args).toContain('--resume')
    expect(args).toContain('sess_1')
  })

  it('appends extraArgs verbatim after the required flags', () => {
    const args = buildArgs({ extraArgs: ['--foo', 'bar'] })
    expect(args.at(-2)).toBe('--foo')
    expect(args.at(-1)).toBe('bar')
  })
})

describe('composeCursorPrompt', () => {
  it('folds system, history preamble, and the latest user turn into stdin', () => {
    const text = composeCursorPrompt({
      systemText: 'You are designer-soul.',
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
      ],
      latestUser: 'second',
    })
    expect(text).toContain('[SYSTEM]')
    expect(text).toContain('You are designer-soul.')
    expect(text).toContain('Recent conversation:')
    expect(text).toContain('- user: first')
    expect(text).toContain('- assistant: reply')
    expect(text).toContain('New message:\nsecond')
  })

  it('omits empty system / empty history sections', () => {
    const text = composeCursorPrompt({
      systemText: '',
      history: [],
      latestUser: 'hello',
    })
    expect(text).not.toContain('[SYSTEM]')
    expect(text).not.toContain('Recent conversation:')
    expect(text).toContain('New message:\nhello')
  })
})
