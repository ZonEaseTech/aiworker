import type { AgentEvent } from '@zonease/aiworker-shared'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { Buffer } from 'node:buffer'
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

  it('forwards system role text through --append-system-prompt and history into the user envelope', async () => {
    let capturedArgs: string[] = []
    let capturedStdin = ''
    const executor = new ClaudeCodeExecutor({
      resolveClaudeBinary: async () => STUB_PATH,
      spawn: (_cmd, args, opts): ChildProcessWithoutNullStreams => {
        capturedArgs = args
        const child = spawn(STUB_PATH, [], { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams
        const origWrite = child.stdin.write.bind(child.stdin) as typeof child.stdin.write
        child.stdin.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
          capturedStdin += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
          return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest)
        }) as typeof child.stdin.write
        return child
      },
    })

    await collect(executor.run({
      messages: [
        { role: 'system', content: 'You are worker dev-soul, voice = direct.' },
        { role: 'user', content: 'first turn' },
        { role: 'assistant', content: 'sure' },
        { role: 'user', content: 'second turn' },
      ],
      workspacePath: workspace,
    }))

    const idx = capturedArgs.indexOf('--append-system-prompt')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(capturedArgs[idx + 1]).toBe('You are worker dev-soul, voice = direct.')
    expect(capturedArgs).not.toContain('--resume')

    expect(capturedStdin).toContain('Recent conversation:')
    expect(capturedStdin).toContain('first turn')
    expect(capturedStdin).toContain('second turn')
    expect(capturedStdin).toContain('New message:')
  })

  it('ignores any inbound engineBinding (stateless per-turn invocation)', async () => {
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

    expect(capturedArgs).not.toContain('--resume')
    expect(capturedArgs).not.toContain('sess_existing')
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
  it('appends --append-system-prompt when system text is provided', () => {
    const args = buildBaseArgs(undefined, undefined, 'persona text')
    const idx = args.indexOf('--append-system-prompt')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('persona text')
  })

  it('omits --append-system-prompt when system text is empty', () => {
    const args = buildBaseArgs(undefined, undefined, '')
    expect(args).not.toContain('--append-system-prompt')
  })

  it('never threads --resume in the stateless adapter path', () => {
    const args = buildBaseArgs('sonnet', undefined, 'sys')
    expect(args).not.toContain('--resume')
  })

  it('does not bypass executor-native permissions by default', () => {
    const args = buildBaseArgs('sonnet', undefined, 'sys')
    expect(args).not.toContain('--dangerously-skip-permissions')
  })

  it('projects explicit no-tools runs into Claude Code CLI flags', () => {
    const args = buildBaseArgs('sonnet', undefined, 'sys', { disableTools: true })
    expect(args).toContain('--tools')
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).toContain('--disable-slash-commands')
    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--no-session-persistence')
  })
})
