import type {
  AgentEvent,
  AgentRunInput,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@zonease/aiworker-shared'
import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { ApprovalPolicy } from './protocol'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { normalizeLine, parseLine, splitNdjson } from './normalize'
import { autoApprovePolicy, ControlProtocolPeer } from './protocol'

/** Default CLI version used when neither env nor config pins one. */
export const DEFAULT_CLAUDE_CLI_VERSION = '2.1.112'

/** Hard cap on one turn; exceeding it emits an error + kills the child. */
const DEFAULT_TIMEOUT_MS = 120_000

export interface ClaudeCodeExecutorOptions {
  /** Optional model id forwarded as `--model <value>`. */
  model?: string
  /** `@anthropic-ai/claude-code` version for the `npx` fallback. */
  cliVersion?: string
  /** Extra args appended after the required flags. */
  extraArgs?: string[]
  /** Env merged into the spawned process env. */
  env?: Record<string, string>
  /** Per-turn hard timeout in ms; defaults to 120_000. */
  timeoutMs?: number
  /** Approval policy; defaults to auto-approve. */
  policy?: ApprovalPolicy
  /**
   * Fallback workspace used when `AgentRunInput.workspacePath` is absent
   * (e.g. one-shot health probe). Normal orchestrator traffic always sets
   * `workspacePath` so this is mostly a safety net.
   */
  fallbackWorkspacePath?: string
  /**
   * Test hook — overrides the spawn behaviour with a custom factory. Used by
   * unit tests to inject a stub CLI without shelling out.
   */
  spawn?: (cmd: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }) => ChildProcessWithoutNullStreams
  /**
   * Test hook — overrides the PATH resolution for the `claude` binary so
   * tests can force either the direct branch or the `npx` fallback.
   */
  resolveClaudeBinary?: () => Promise<string | null>
}

/**
 * Claude Code executor. Spawns the `claude` CLI with stream-json on both
 * sides, turns every incoming user message into exactly one CLI invocation,
 * and emits engine-agnostic AgentEvents. Workspace lifecycle is owned by the
 * orchestrator (see `workspace.ts`); this executor assumes `workspacePath`
 * already exists and is isolated per-conversation.
 */
export class ClaudeCodeExecutor implements ExecutorProvider {
  readonly name = 'claude-code'

  private readonly options: ClaudeCodeExecutorOptions

  constructor(options: ClaudeCodeExecutorOptions) {
    this.options = options
  }

  async health(): Promise<ServiceStatus> {
    const lastChecked = new Date().toISOString()
    // Treat the presence of a workspace dir as "probe-worthy" — deeper health
    // (`claude --version`) is intentionally skipped to avoid license prompts
    // or 2-second PATH probes on every `/info` request.
    return { name: this.name, status: 'healthy', lastChecked }
  }

  async listTools(): Promise<ExecutorTool[]> {
    // Claude Code owns its own tool set; orchestrator must not inject
    // `toolDefinitions` for this executor (checked upstream).
    return []
  }

  run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    return this.runIterable(input)
  }

  private async* runIterable(input: AgentRunInput): AsyncGenerator<AgentEvent> {
    const latestUser = lastUserMessage(input.messages)
    if (!latestUser) {
      yield { type: 'error', error: 'Claude Code executor requires a user message' }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const workspacePath = input.workspacePath ?? this.options.fallbackWorkspacePath
    if (!workspacePath) {
      yield { type: 'error', error: 'Claude Code executor requires a workspace path' }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const spawnFn = this.options.spawn ?? (spawn as unknown as NonNullable<ClaudeCodeExecutorOptions['spawn']>)

    let resolvedCmd: string
    let resolvedArgs: string[]
    try {
      ({ cmd: resolvedCmd, args: resolvedArgs } = await this.resolveCommand(input.model))
    }
    catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const child = spawnFn(resolvedCmd, resolvedArgs, {
      cwd: workspacePath,
      env: { ...process.env, ...(this.options.env ?? {}) },
    })

    const peer = new ControlProtocolPeer({
      policy: this.options.policy ?? autoApprovePolicy,
      writeLine: (line) => {
        try {
          child.stdin.write(line)
        }
        catch {
          // stdin may have already closed; ignore so callers aren't forced to
          // deal with EPIPE on a best-effort write.
        }
      },
    })

    peer.sendUserMessage(latestUser)

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timeoutHandle = setTimeout(() => safeKill(child, 'SIGKILL'), timeoutMs)

    let stdoutBuffer = ''
    let childError: string | null = null
    let sawFinish = false
    // `once(child, 'exit')` rejects on 'error'; wrap it so we never throw on
    // an early spawn failure and always resolve to either a numeric code or
    // `null` for unknown exit.
    const exitPromise: Promise<number | null> = once(child, 'exit')
      .then(args => (args as [number | null])[0] ?? null)
      .catch((err: unknown) => {
        childError = err instanceof Error ? err.message : String(err)
        return null
      })
    child.on('error', (err: Error) => {
      childError = err.message
    })

    const abortHandler = () => safeKill(child, 'SIGTERM')
    input.signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
        const { lines, remainder } = splitNdjson(stdoutBuffer, chunk.toString('utf8'))
        stdoutBuffer = remainder
        for (const raw of lines) {
          const parsed = parseLine(raw)
          if (!parsed)
            continue
          if (parsed.type === 'control_request') {
            const extra = await peer.handleLine(parsed)
            for (const event of extra)
              yield event
            continue
          }
          for (const event of normalizeLine(parsed)) {
            yield event
            if (event.type === 'finish')
              sawFinish = true
          }
          if (sawFinish)
            break
        }
        if (sawFinish)
          break
      }
    }
    catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
    }
    finally {
      clearTimeout(timeoutHandle)
      input.signal?.removeEventListener('abort', abortHandler)
      safeEndStdin(child)
    }

    const exitCode = await exitPromise

    if (!sawFinish) {
      if (childError) {
        yield { type: 'error', error: childError }
      }
      else if (exitCode !== 0 && exitCode !== null) {
        yield { type: 'error', error: `Claude Code exited with code ${exitCode}` }
      }
      yield { type: 'finish', reason: exitCode === 0 ? 'stop' : 'error' }
    }
  }

  private async resolveCommand(runModel: string | undefined): Promise<{ cmd: string, args: string[] }> {
    const baseArgs = buildBaseArgs(runModel ?? this.options.model, this.options.extraArgs)

    const resolver = this.options.resolveClaudeBinary ?? resolveClaudeOnPath
    const direct = await resolver()
    if (direct)
      return { cmd: direct, args: baseArgs }

    const version = this.options.cliVersion?.trim() || DEFAULT_CLAUDE_CLI_VERSION
    return {
      cmd: 'npx',
      args: ['-y', `@anthropic-ai/claude-code@${version}`, ...baseArgs],
    }
  }
}

export function buildBaseArgs(model: string | undefined, extra: string[] | undefined): string[] {
  const args = [
    '-p',
    '--verbose',
    '--output-format=stream-json',
    '--input-format=stream-json',
    '--include-partial-messages',
    '--replay-user-messages',
    '--dangerously-skip-permissions',
  ]
  if (model && model.length > 0)
    args.push('--model', model)
  if (extra && extra.length > 0)
    args.push(...extra)
  return args
}

/**
 * Walk `PATH` looking for a `claude` binary. Returns the absolute path or
 * `null` if not found. The implementation is synchronous on purpose —
 * `PATH` is tiny and we don't want async surprises during cold start.
 */
async function resolveClaudeOnPath(): Promise<string | null> {
  const pathEnv = process.env.PATH ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : ['']
  for (const dir of pathEnv.split(sep)) {
    if (!dir)
      continue
    for (const ext of exts) {
      const candidate = path.join(dir, `claude${ext.toLowerCase()}`)
      try {
        const st = await fs.stat(candidate)
        if (st.isFile())
          return candidate
      }
      catch {
        // keep walking
      }
    }
  }
  return null
}

function safeKill(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  try {
    child.kill(signal)
  }
  catch {
    // already exited — nothing to do
  }
}

function safeEndStdin(child: ChildProcessWithoutNullStreams): void {
  try {
    child.stdin.end()
  }
  catch {
    // already closed
  }
}

function lastUserMessage(messages: AgentRunInput['messages']): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.length > 0)
      return m.content
  }
  return null
}
