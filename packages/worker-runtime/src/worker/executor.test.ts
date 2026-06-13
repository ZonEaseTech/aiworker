import type { LocalExecutorEvent } from './executor'

import { mkdtempSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

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

  it('codex resumes via `exec resume <id>` with a stdin prompt and drops --sandbox/-C', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const argsFile = path.join(makeRoot(), 'argv.txt')
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' "$@" >> ${argsFile}
printf '%s\\n' '{"type":"thread.started","thread_id":"codex-thread-9"}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}'
`)
    await createExternalEngineExecutor().invoke({
      ...baseInput(command, workspaceRoot),
      engineId: 'codex',
      resumeRef: { id: 'codex-thread-prev', target: 'codex' },
    })
    const argv = (await readFile(argsFile, 'utf8')).split('\n').filter(Boolean)
    expect(argv.slice(0, 3)).toEqual(['exec', 'resume', 'codex-thread-prev'])
    expect(argv).toContain('sandbox_mode=workspace-write')
    expect(argv[argv.length - 1]).toBe('-')
    expect(argv).not.toContain('--sandbox')
    expect(argv).not.toContain('-C')
    // Network OFF by default — no opt-in env set.
    expect(argv).not.toContain('sandbox_workspace_write.network_access=true')
  })

  it('codex stays on bare `exec` (fresh session) without a resume ref', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const argsFile = path.join(makeRoot(), 'argv.txt')
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' "$@" >> ${argsFile}
printf '%s\\n' '{"type":"thread.started","thread_id":"codex-thread-9"}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}'
`)
    await createExternalEngineExecutor().invoke({ ...baseInput(command, workspaceRoot), engineId: 'codex' })
    const argv = (await readFile(argsFile, 'utf8')).split('\n').filter(Boolean)
    expect(argv[0]).toBe('exec')
    expect(argv[1]).not.toBe('resume')
    expect(argv).toContain('--sandbox')
    expect(argv).toContain('-C')
    expect(argv[argv.length - 1]).not.toBe('-')
    // Network OFF by default — no opt-in env set.
    expect(argv).not.toContain('sandbox_workspace_write.network_access=true')
  })

  it('codex opens network only when AIWORKER_CODEX_NETWORK_ACCESS=1 (fresh session)', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const argsFile = path.join(makeRoot(), 'argv.txt')
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' "$@" >> ${argsFile}
printf '%s\\n' '{"type":"thread.started","thread_id":"codex-thread-9"}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}'
`)
    const original = process.env.AIWORKER_CODEX_NETWORK_ACCESS
    process.env.AIWORKER_CODEX_NETWORK_ACCESS = '1'
    try {
      await createExternalEngineExecutor().invoke({ ...baseInput(command, workspaceRoot), engineId: 'codex' })
    }
    finally {
      if (original === undefined)
        delete process.env.AIWORKER_CODEX_NETWORK_ACCESS
      else
        process.env.AIWORKER_CODEX_NETWORK_ACCESS = original
    }
    const argv = (await readFile(argsFile, 'utf8')).split('\n').filter(Boolean)
    expect(argv).toContain('sandbox_workspace_write.network_access=true')
  })

  it('codex opens network only when AIWORKER_CODEX_NETWORK_ACCESS=1 (resume session)', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const argsFile = path.join(makeRoot(), 'argv.txt')
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' "$@" >> ${argsFile}
printf '%s\\n' '{"type":"thread.started","thread_id":"codex-thread-9"}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}'
`)
    const original = process.env.AIWORKER_CODEX_NETWORK_ACCESS
    process.env.AIWORKER_CODEX_NETWORK_ACCESS = '1'
    try {
      await createExternalEngineExecutor().invoke({
        ...baseInput(command, workspaceRoot),
        engineId: 'codex',
        resumeRef: { id: 'codex-thread-prev', target: 'codex' },
      })
    }
    finally {
      if (original === undefined)
        delete process.env.AIWORKER_CODEX_NETWORK_ACCESS
      else
        process.env.AIWORKER_CODEX_NETWORK_ACCESS = original
    }
    const argv = (await readFile(argsFile, 'utf8')).split('\n').filter(Boolean)
    expect(argv).toContain('sandbox_workspace_write.network_access=true')
    // Opt-in network arg must not displace the trailing stdin sentinel.
    expect(argv[argv.length - 1]).toBe('-')
  })

  it('claude resumes via --resume <id>', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const argsFile = path.join(makeRoot(), 'argv.txt')
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' "$@" >> ${argsFile}
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"claude-s-1"}'
printf '%s\\n' '{"type":"result","result":"ok"}'
`)
    await createExternalEngineExecutor().invoke({
      ...baseInput(command, workspaceRoot),
      engineId: 'claude-code',
      resumeRef: { id: 'claude-sess-prev', target: 'claude' },
    })
    const argv = (await readFile(argsFile, 'utf8')).split('\n').filter(Boolean)
    expect(argv).toContain('--resume')
    expect(argv).toContain('claude-sess-prev')
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

  it('surfaces actionable login guidance when a codex turn fails unauthenticated', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'Error: Not logged in. Run \\\`codex login\\\` to authenticate.\\n' >&2
exit 1
`)
    const events: LocalExecutorEvent[] = []

    // 可操作引导必须超出「裸 stderr 回显」:断言独有短语 'aiworker config'(绝不出现在
    // 原始 stderr 中),证明走的是 auth-failure 引导路径而非通用失败路径。
    await expect(createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events)))
      .rejects
      .toThrow(/aiworker config/)
    const guidance = events.find(event => event.kind === 'status' && event.label === 'engine-auth-required')
    expect(guidance).toBeDefined()
    expect(guidance && guidance.kind === 'status' ? guidance.detail : '').toContain('codex login')
    expect(guidance && guidance.kind === 'status' ? guidance.detail : '').toContain('aiworker config')
  })

  it('surfaces actionable login guidance when a claude turn fails unauthenticated', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'Invalid API key - no credentials found. Not authenticated.\\n' >&2
exit 1
`)
    const events: LocalExecutorEvent[] = []
    const input = { ...baseInput(command, workspaceRoot, events), engineId: 'claude-code' }

    await expect(createExternalEngineExecutor().invoke(input)).rejects.toThrow(/claude login/)
    expect(events.some(event => event.kind === 'status' && event.label === 'engine-auth-required')).toBe(true)
  })

  it('leaves non-auth engine failures on the generic exit-code path', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'fatal engine error\\n' >&2
exit 9
`)
    const events: LocalExecutorEvent[] = []

    await expect(createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events)))
      .rejects
      .toThrow('exited with code 9')
    // 通用失败不得被当作未登录吞掉:无 auth 引导事件、无 'aiworker config' 文案。
    expect(events.some(event => event.kind === 'status' && event.label === 'engine-auth-required')).toBe(false)
  })

  it('keeps secrets out of unauthenticated-failure guidance', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'Codex auth failed: OPENAI_API_KEY rejected token=sk-should-not-leak. Run \\\`codex login\\\`.\\n' >&2
exit 1
`)
    const events: LocalExecutorEvent[] = []

    const failure = await createExternalEngineExecutor()
      .invoke(baseInput(command, workspaceRoot, events))
      .then(() => null, (error: Error) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure?.message).toContain('aiworker config')
    expect(failure?.message).not.toContain('sk-should-not-leak')
    const guidance = events.find(event => event.kind === 'status' && event.label === 'engine-auth-required')
    expect(guidance && guidance.kind === 'status' ? guidance.detail : '').not.toContain('sk-should-not-leak')
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

  it('caps local CLI stdout, stderr, and summary buffers', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'prefix-'
printf 'A%.0s' {1..160}
printf 'error-' >&2
printf 'B%.0s' {1..160} >&2
`)
    const input = {
      ...baseInput(command, workspaceRoot),
      engineId: 'qwen',
    }

    const result = await createExternalEngineExecutor({
      maxBufferedLogChars: 64,
      maxSummaryChars: 40,
    }).invoke(input)

    const stdout = await readFile(path.join(input.invocationRoot, 'stdout.log'), 'utf8')
    const stderr = await readFile(path.join(input.invocationRoot, 'stderr.log'), 'utf8')
    expect(result.summary).toContain('earlier characters from engine response')
    expect(result.summary.length).toBeLessThan(140)
    expect(stdout).toContain('earlier characters from stdout')
    expect(stdout).toContain('AAAAAAAAAA')
    expect(stdout.length).toBeLessThan(140)
    expect(stderr).toContain('earlier characters from stderr')
    expect(stderr).toContain('BBBBBBBBBB')
    expect(stderr.length).toBeLessThan(140)
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

  it('uses AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS when no explicit timeout is configured', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
sleep 2
printf '%s\\n' '{"type":"item.completed","item":{"type":"assistant_message","text":"done"}}'
`)
    const previous = process.env.AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS

    try {
      process.env.AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS = '250'
      await expect(Promise.race([
        createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout env was ignored')), 1200)),
      ])).rejects.toThrow('Process exceeded 250ms and was terminated.')
    }
    finally {
      if (previous === undefined)
        delete process.env.AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS
      else
        process.env.AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS = previous
    }
  })

  it('injects the credential provider env as the third merge layer for claude-code', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const envFile = path.join(makeRoot(), 'engine-env.txt')
    const command = await makeScript(`
cat >/dev/null
printf 'ANTHROPIC_BASE_URL=%s\\n' "\${ANTHROPIC_BASE_URL:-}" >> ${envFile}
printf 'ANTHROPIC_AUTH_TOKEN=%s\\n' "\${ANTHROPIC_AUTH_TOKEN:-}" >> ${envFile}
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"claude-s-1"}'
printf '%s\\n' '{"type":"result","result":"ok"}'
`)

    await createExternalEngineExecutor({
      credentialProvider: {
        envFor: (engineId): Record<string, string> => engineId === 'claude-code'
          ? { ANTHROPIC_BASE_URL: 'https://gw.example/anthropic', ANTHROPIC_AUTH_TOKEN: 'org-key-anthropic' }
          : {},
      },
    }).invoke({ ...baseInput(command, workspaceRoot), engineId: 'claude-code' })

    const env = await readFile(envFile, 'utf8')
    expect(env).toContain('ANTHROPIC_BASE_URL=https://gw.example/anthropic')
    expect(env).toContain('ANTHROPIC_AUTH_TOKEN=org-key-anthropic')
  })

  // Phase 3 review follow-up: an inherited ANTHROPIC_API_KEY (x-api-key) coexisting with
  // the injected ANTHROPIC_AUTH_TOKEN (Bearer) makes the Claude SDK send both → API 401.
  // The conflicting key must be genuinely absent in the spawned child env.
  it('strips a conflicting inherited ANTHROPIC_API_KEY when injecting the anthropic credential', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const envFile = path.join(makeRoot(), 'engine-env.txt')
    const command = await makeScript(`
cat >/dev/null
printf 'ANTHROPIC_API_KEY=%s\\n' "\${ANTHROPIC_API_KEY:-<unset>}" >> ${envFile}
printf 'ANTHROPIC_AUTH_TOKEN=%s\\n' "\${ANTHROPIC_AUTH_TOKEN:-<unset>}" >> ${envFile}
printf '%s\\n' '{"type":"result","result":"ok"}'
`)

    const previous = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-ant-inherited-conflicting-key'
    try {
      await createExternalEngineExecutor({
        credentialProvider: {
          envFor: (engineId): Record<string, string> => engineId === 'claude-code'
            ? { ANTHROPIC_BASE_URL: 'https://gw.example/anthropic', ANTHROPIC_AUTH_TOKEN: 'gw-bearer-token' }
            : {},
          conflictingEnvKeys: (engineId): string[] => engineId === 'claude-code' ? ['ANTHROPIC_API_KEY'] : [],
        },
      }).invoke({ ...baseInput(command, workspaceRoot), engineId: 'claude-code', engineCommand: command })

      const env = await readFile(envFile, 'utf8')
      // The conflicting inherited key is genuinely absent in the child (env replaces process.env at spawn).
      expect(env).toContain('ANTHROPIC_API_KEY=<unset>')
      expect(env).not.toContain('sk-ant-inherited-conflicting-key')
      expect(env).toContain('ANTHROPIC_AUTH_TOKEN=gw-bearer-token')
    }
    finally {
      if (previous === undefined)
        delete process.env.ANTHROPIC_API_KEY
      else
        process.env.ANTHROPIC_API_KEY = previous
    }
  })

  it('does NOT strip an inherited ANTHROPIC_API_KEY when no credential is injected (no over-strip)', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const envFile = path.join(makeRoot(), 'engine-env.txt')
    const command = await makeScript(`
cat >/dev/null
printf 'ANTHROPIC_API_KEY=%s\\n' "\${ANTHROPIC_API_KEY:-<unset>}" >> ${envFile}
printf '%s\\n' '{"type":"result","result":"ok"}'
`)

    const previous = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-ant-user-own-key'
    try {
      await createExternalEngineExecutor({
        credentialProvider: {
          // No credential injected → envFor {} and conflictingEnvKeys [] → user's own key survives.
          envFor: (): Record<string, string> => ({}),
          conflictingEnvKeys: (): string[] => [],
        },
      }).invoke({ ...baseInput(command, workspaceRoot), engineId: 'claude-code', engineCommand: command })

      const env = await readFile(envFile, 'utf8')
      expect(env).toContain('ANTHROPIC_API_KEY=sk-ant-user-own-key')
    }
    finally {
      if (previous === undefined)
        delete process.env.ANTHROPIC_API_KEY
      else
        process.env.ANTHROPIC_API_KEY = previous
    }
  })

  it('P3-T4: redacts an injected anthropic org key that the engine echoes to stdout.log', async () => {
    // The real worker-side carrier path: a credential injected via credentialProvider
    // (third env layer) is read by the native engine, which may echo it. The executor
    // writes engine stdout to stdout.log AFTER redactEngineLog (shared engine-bridge
    // SECRET_VALUE_RE). The org key v1 actually injects is sk-ant- shaped, which the
    // `sk-` branch redacts. This is the meaningful sentinel: inject → engine echoes →
    // disk → must be [REDACTED], never the raw token.
    const sentinel = 'sk-ant-SENTINEL-org-key-do-not-leak-0123456789'
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'leaking ANTHROPIC_AUTH_TOKEN=%s into output\\n' "\${ANTHROPIC_AUTH_TOKEN:-}"
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"claude-s-1"}'
printf '%s\\n' '{"type":"result","result":"ok"}'
`)

    const input = { ...baseInput(command, workspaceRoot), engineId: 'claude-code', engineCommand: command }
    await createExternalEngineExecutor({
      credentialProvider: {
        envFor: (engineId): Record<string, string> => engineId === 'claude-code'
          ? { ANTHROPIC_BASE_URL: 'https://gw.example/anthropic', ANTHROPIC_AUTH_TOKEN: sentinel }
          : {},
      },
    }).invoke(input)

    const stdoutLog = await readFile(path.join(input.invocationRoot, 'stdout.log'), 'utf8')
    expect(stdoutLog).toContain('[REDACTED]')
    expect(stdoutLog).not.toContain(sentinel)
    expect(stdoutLog).not.toContain('SENTINEL-org-key-do-not-leak')
  })

  it('does not inject credential env for cursor (engineId excluded by provider)', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const envFile = path.join(makeRoot(), 'engine-env.txt')
    const command = await makeScript(`
cat >/dev/null
printf 'ANTHROPIC_AUTH_TOKEN=%s\\n' "\${ANTHROPIC_AUTH_TOKEN:-}" >> ${envFile}
printf '%s\\n' '{"type":"result","result":"ok"}'
`)

    // The provider is the arbiter of which engineId gets injected; a real store returns
    // {} for cursor. Mirror that here so the executor passes through an empty injection.
    // Assert on the injected sentinel only (independent of any host-set ANTHROPIC_*).
    await createExternalEngineExecutor({
      credentialProvider: {
        envFor: (engineId): Record<string, string> => engineId === 'cursor' ? {} : { ANTHROPIC_AUTH_TOKEN: 'org-key-sentinel-anthropic' },
      },
    }).invoke({ ...baseInput(command, workspaceRoot), engineId: 'cursor', engineCommand: command })

    const env = await readFile(envFile, 'utf8')
    expect(env).not.toContain('org-key-sentinel-anthropic')
  })

  it('does not inject credential env when no provider is configured (graceful fallback)', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const envFile = path.join(makeRoot(), 'engine-env.txt')
    const command = await makeScript(`
cat >/dev/null
printf 'OPENAI_API_KEY=%s\\n' "\${OPENAI_API_KEY:-}" >> ${envFile}
printf '%s\\n' '{"type":"thread.started","thread_id":"codex-thread-1"}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}'
`)

    // No credentialProvider → executor must not add any injection layer. Assert the
    // injected sentinel a provider would have added is absent (independent of host env).
    await createExternalEngineExecutor().invoke({ ...baseInput(command, workspaceRoot), engineId: 'codex' })

    const env = await readFile(envFile, 'utf8')
    expect(env).not.toContain('org-key-sentinel-openai')
  })

  it('interrupts local CLI engines when the invocation is aborted', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'started\\n' > started.txt
trap 'printf "engine interrupted\\n" >&2; exit 130' INT TERM
while true; do sleep 1; done
`)
    const controller = new AbortController()
    const input = {
      ...baseInput(command, workspaceRoot),
      signal: controller.signal,
    }
    const invocation = createExternalEngineExecutor({ timeoutMs: 1_000 }).invoke(input)

    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        if ((await readFile(path.join(workspaceRoot, 'started.txt'), 'utf8')).includes('started'))
          break
      }
      catch {}
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    controller.abort('user-stop')

    await expect(invocation).rejects.toThrow('Process interrupted by AIWorker Stop.')
    await expect(
      readFile(path.join(workspaceRoot, '.aiworker', 'sessions', 'session-1', 'invocations', '0001', 'stderr.log'), 'utf8'),
    ).resolves.toContain('Process interrupted by AIWorker Stop.')
  })
})

// P0-T0.1: BYOK 可见文本回归守卫
// executor.ts:394 原先发出硬编码占位符而非 provider 实际内容；以下测试通过 stub fetch 证明
// 修复后可见文本事件等于 provider 返回的字符串，而非 'Generated response with BYOK provider.'。
describe('runByokExecutor — 可见文本守卫', () => {
  const BYOK_TEST_KEY_ENV = 'AIWORKER_TEST_BYOK_KEY'
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    process.env[BYOK_TEST_KEY_ENV] = 'sk-test-fake-key'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env[BYOK_TEST_KEY_ENV]
  })

  function makeByokInput(events: LocalExecutorEvent[] = []) {
    return {
      engineCommand: null as string | null,
      engineId: 'openai-compatible',
      invocationId: 'byok-inv-1',
      invocationRoot: '/tmp/fake-byok-root',
      onEvent: (event: LocalExecutorEvent) => events.push(event),
      prompt: 'What is 2+2?',
      sessionId: 'byok-session-1',
      workspaceId: 'byok-workspace-1',
      workspaceRoot: '/tmp/fake-byok-workspace',
      metadata: {
        executionMode: 'byok',
        byok: {
          apiKeyRef: `env:${BYOK_TEST_KEY_ENV}`,
          baseUrl: 'https://fake-llm.example.com/v1',
          model: 'fake-model-v1',
          provider: 'openai-compatible',
        },
      },
    }
  }

  it('P0-T0.1 RED: 可见文本事件包含 provider 实际内容，不得是占位符', async () => {
    const providerContent = 'The answer is 4. Real AI response, not a placeholder.'
    // cast via unknown: mock() 不含 preconnect 等 fetch 原生方法，双重 cast 绕过类型检查
    globalThis.fetch = mock(async (_url: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: providerContent } }],
      }),
    })) as unknown as typeof fetch

    const events: LocalExecutorEvent[] = []
    const result = await createExternalEngineExecutor().invoke(makeByokInput(events))

    // 只应有一个 text 事件
    const textEvents = events.filter(e => e.kind === 'text')
    expect(textEvents).toHaveLength(1)
    const textEvent = textEvents[0]
    if (!textEvent || textEvent.kind !== 'text')
      throw new Error('Expected a text event')
    // 可见文本必须等于 provider 的真实答案
    expect(textEvent.text).toBe(providerContent)
    // 不能是旧的硬编码占位符
    expect(textEvent.text).not.toBe('Generated response with BYOK provider.')
    // summary 也应等于真实内容
    expect(result.summary).toBe(providerContent)
  })

  it('P0-T0.1: provider 内容不含 API key（secret 不泄露进可见文本）', async () => {
    const fakeKey = 'sk-test-fake-key'
    globalThis.fetch = mock(async (_url: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Safe response without key.' } }],
      }),
    })) as unknown as typeof fetch

    const events: LocalExecutorEvent[] = []
    await createExternalEngineExecutor().invoke(makeByokInput(events))

    const allText = events.filter(e => e.kind === 'text').map(e => e.kind === 'text' ? e.text : '').join(' ')
    expect(allText).not.toContain(fakeKey)
  })
})
