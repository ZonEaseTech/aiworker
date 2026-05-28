import type { LocalExecutorEvent } from './executor'

import { mkdtempSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import { createExternalEngineExecutor, DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS } from './executor'

describe('createExternalEngineExecutor', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const item of roots)
      await rm(item, { force: true, recursive: true })
    roots = []
  })

  function makeRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'aiworker-executor-'))
    roots.push(root)
    return root
  }

  async function makeScript(body: string): Promise<string> {
    const dir = makeRoot()
    const file = path.join(dir, 'engine.sh')
    await writeFile(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, 'utf8')
    await chmod(file, 0o755)
    return file
  }

  function baseInput(command: string, workspaceRoot: string, events: LocalExecutorEvent[] = []) {
    return {
      engineCommand: command,
      engineId: 'codex',
      invocationId: 'invocation-1',
      invocationRoot: path.join(workspaceRoot, '.aiworker', 'sessions', 'session-1', 'invocations', '0001'),
      onEvent: (event: LocalExecutorEvent) => events.push(event),
      prompt: 'Prepare a business answer.',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      workspaceRoot,
      metadata: {
        capabilityName: 'Candidate Screen',
        outputKind: 'candidate-screen',
      },
    }
  }

  it('parses Codex JSONL into structured session events', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' '{"type":"thread.started","thread_id":"codex-thread-1"}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s\\n' '{"type":"item.started","item":{"type":"command_execution","id":"tool-1","command":"printf hi"}}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"command_execution","id":"tool-1","command":"printf hi","aggregated_output":"hi","exit_code":0}}'
printf '%s\\n' '{"type":"item.started","item":{"id":"file-1","type":"file_change","changes":[{"path":"some-file.md","kind":"add"}],"status":"in_progress"}}'
printf '%s\\n' '{"type":"item.completed","item":{"id":"file-1","type":"file_change","changes":[{"path":"some-file.md","kind":"add"}],"status":"completed"}}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}'
printf '%s\\n' '{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":5}}'
`)
    const events: LocalExecutorEvent[] = []

    const result = await createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events))

    expect(result.summary).toBe('Done.')
    expect(result.externalSessionRef).toBe(JSON.stringify({ id: 'codex-thread-1', target: 'codex' }))
    expect(events.map(event => event.kind)).toContain('tool_use')
    expect(events.map(event => event.kind)).toContain('tool_result')
    expect(events.map(event => event.kind)).toContain('usage')
    expect(events.some(event => event.kind === 'status' && event.label === 'file_change')).toBe(true)
    expect(events.some(event => event.kind === 'raw')).toBe(false)
    expect(events.some(event => event.kind === 'log' && event.stream === 'stderr')).toBe(false)
  })

  it('allows text-only successful turns without inventing an artifact', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' '{"type":"thread.started"}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"Plain answer."}}'
`)
    const events: LocalExecutorEvent[] = []

    const result = await createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events))

    expect(result.summary).toBe('Plain answer.')
    expect(events.some(event => event.kind === 'text' && event.text === 'Plain answer.')).toBe(true)
  })

  it('can isolate Codex CLI from user plugins and config for debug runs', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' "$@" > args.txt
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"Plain answer."}}'
`)
    const originalDisablePlugins = process.env.AIWORKER_CODEX_DISABLE_PLUGINS
    const originalIgnoreConfig = process.env.AIWORKER_CODEX_IGNORE_USER_CONFIG
    process.env.AIWORKER_CODEX_DISABLE_PLUGINS = '1'
    process.env.AIWORKER_CODEX_IGNORE_USER_CONFIG = '1'

    try {
      await createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot))
    }
    finally {
      if (originalDisablePlugins === undefined)
        delete process.env.AIWORKER_CODEX_DISABLE_PLUGINS
      else
        process.env.AIWORKER_CODEX_DISABLE_PLUGINS = originalDisablePlugins
      if (originalIgnoreConfig === undefined)
        delete process.env.AIWORKER_CODEX_IGNORE_USER_CONFIG
      else
        process.env.AIWORKER_CODEX_IGNORE_USER_CONFIG = originalIgnoreConfig
    }

    await expect(readFile(path.join(workspaceRoot, 'args.txt'), 'utf8')).resolves.toContain('--disable\nplugins')
    await expect(readFile(path.join(workspaceRoot, 'args.txt'), 'utf8')).resolves.toContain('--ignore-user-config')
  })

  it('surfaces stderr only when the engine process fails', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'fatal engine error\\n' >&2
exit 9
`)
    const events: LocalExecutorEvent[] = []

    await expect(createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events))).rejects.toThrow('exited with code 9')
    expect(events.some(event => event.kind === 'log' && event.stream === 'stderr' && event.chunk.includes('fatal engine error'))).toBe(true)
  })

  it('redacts persisted native engine stdout and stderr logs', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'answer token=sk-test-secret\\n'
printf 'authorization = "literal-secret-value"\\n' >&2
`)
    const input = {
      ...baseInput(command, workspaceRoot),
      engineId: 'qwen',
    }

    await createExternalEngineExecutor().invoke(input)

    const stdout = await readFile(path.join(input.invocationRoot, 'stdout.log'), 'utf8')
    const stderr = await readFile(path.join(input.invocationRoot, 'stderr.log'), 'utf8')
    expect(stdout).not.toContain('sk-test-secret')
    expect(stderr).not.toContain('literal-secret-value')
    expect(`${stdout}\n${stderr}`).toContain('[REDACTED]')
  })

  it('terminates local CLI engines after the configured hard timeout', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
exec perl -e '$SIG{TERM}=sub{}; select undef,undef,undef,0.01 while 1'
`)

    await expect(
      createExternalEngineExecutor({ timeoutMs: 250 }).invoke(baseInput(command, workspaceRoot)),
    ).rejects.toThrow('Process exceeded 250ms and was terminated.')

    await expect(
      readFile(path.join(workspaceRoot, '.aiworker', 'sessions', 'session-1', 'invocations', '0001', 'stderr.log'), 'utf8'),
    ).resolves.toContain('Process exceeded 250ms and was terminated.')
    expect(DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS).toBe(300_000)
  })
})
