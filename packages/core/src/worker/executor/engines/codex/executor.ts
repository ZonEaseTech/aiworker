import type {
  AgentEvent,
  AgentRunInput,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@zonease/aiworker-shared'
import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { JsonRpcNotification, JsonRpcRequest } from '../acp/types'
import type {
  CodexNewTurnResult,
  CodexThreadStartParams,
  CodexThreadStartResult,
} from './types'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { normalizeCodexNotification } from './normalize'
import { JsonRpcPeer, splitNdjson } from './protocol'

/** Pinned Codex CLI version for the `npx` fallback. */
export const DEFAULT_CODEX_CLI_VERSION = '0.121.0'
/** Hard cap for one Codex turn. Overridable via options. */
const DEFAULT_TIMEOUT_MS = 120_000
/** Protocol version advertised on `initialize`. */
const DEFAULT_PROTOCOL_VERSION = 1

export type CodexSpawnLike = (
  cmd: string,
  args: string[],
  options: { cwd: string, env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams

export interface CodexExecutorOptions {
  /** Forwarded as `thread_start.model` — maps onto `profile.modelId`. */
  model?: string
  /** Pin `@openai/codex` version for the `npx -y` fallback. */
  cliVersion?: string
  /** Extra argv appended after `app-server` (reserved for sandbox / reasoning tunnels). */
  extraArgs?: string[]
  /** Env vars merged into the spawned process env. */
  env?: Record<string, string>
  /** Per-turn hard timeout in ms (default 120_000). */
  timeoutMs?: number
  /**
   * Fallback workspace used when `AgentRunInput.workspacePath` is absent
   * (health probe / one-shot). Normal orchestrator traffic always passes a
   * workspace path, so this is a safety net.
   */
  fallbackWorkspacePath?: string
  /** Test hook — override spawn entirely (stub CLI). */
  spawn?: CodexSpawnLike
  /** Test hook — override PATH resolution for the `codex` binary. */
  resolveBinary?: () => Promise<string | null>
}

/**
 * Codex executor. Owns one `codex app-server` subprocess per turn, drives the
 * `initialize → thread_start → newTurn` JSON-RPC lifecycle, and normalises
 * every `codex/event/*` notification into an `AgentEvent` the orchestrator can
 * consume directly.
 *
 * Multi-turn `thread_fork` resume is explicitly out of scope (tracked P3) —
 * every run starts a fresh thread.
 */
export class CodexExecutor implements ExecutorProvider {
  readonly name = 'codex'

  constructor(private readonly options: CodexExecutorOptions) {}

  async health(): Promise<ServiceStatus> {
    // Same philosophy as claude-code: don't shell out on every /info probe.
    return { name: this.name, status: 'healthy', lastChecked: new Date().toISOString() }
  }

  async listTools(): Promise<ExecutorTool[]> {
    // Codex owns its own toolset; orchestrator must not inject tool definitions.
    return []
  }

  run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    return this.runIterable(input)
  }

  private async* runIterable(input: AgentRunInput): AsyncGenerator<AgentEvent> {
    const latestUser = lastUserMessage(input.messages)
    if (!latestUser) {
      yield { type: 'error', error: 'Codex executor requires a user message' }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const workspacePath = input.workspacePath ?? this.options.fallbackWorkspacePath ?? process.cwd()

    let resolved: { cmd: string, args: string[] }
    try {
      resolved = await this.resolveCommand()
    }
    catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const spawnFn = this.options.spawn ?? (spawn as unknown as CodexSpawnLike)
    const child = spawnFn(resolved.cmd, resolved.args, {
      cwd: workspacePath,
      env: { ...process.env, ...(this.options.env ?? {}) },
    })

    const queue = new AgentEventQueue()
    const peer = new JsonRpcPeer({
      writeLine: (line) => {
        try {
          child.stdin.write(line)
        }
        catch {
          // stdin may have closed; ignore EPIPE on best-effort writes.
        }
      },
      onNotification: n => this.handleNotification(n, queue),
      onRequest: req => this.handleInboundRequest(req),
      onError: err => queue.push({ type: 'error', error: err.message }),
      requestTimeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    })

    let stdoutBuffer = ''
    const stdoutHandler = (chunk: Buffer) => {
      const { lines, remainder } = splitNdjson(stdoutBuffer, chunk.toString('utf8'))
      stdoutBuffer = remainder
      for (const line of lines)
        peer.handleLine(line)
    }
    ;(child.stdout as NodeJS.ReadableStream).on('data', stdoutHandler)

    let childError: string | null = null
    child.on('error', (err: Error) => {
      childError = err.message
    })
    const exitPromise: Promise<number | null> = once(child, 'exit')
      .then(args => (args as [number | null])[0] ?? null)
      .catch((err: unknown) => {
        childError = err instanceof Error ? err.message : String(err)
        return null
      })
    void exitPromise.then((code) => {
      if (code === 0)
        return
      const msg = childError ?? (code === null ? 'codex child exited unexpectedly' : `codex child exited with code ${code}`)
      queue.close({ kind: 'error', message: msg })
      peer.dispose(msg)
    })

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timeoutHandle = setTimeout(() => safeKill(child, 'SIGKILL'), timeoutMs)

    let cancelled = false
    const abortHandler = () => {
      cancelled = true
      safeKill(child, 'SIGTERM')
    }
    input.signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      await peer.request('initialize', {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        clientInfo: { name: 'aiworker', version: '0.2.0' },
      })

      const threadStartParams: CodexThreadStartParams = {
        approval_policy: 'never',
      }
      const model = input.model ?? this.options.model
      if (model && model.length > 0)
        threadStartParams.model = model
      const thread = await peer.request<CodexThreadStartResult>('thread_start', threadStartParams)
      if (!thread?.threadId) {
        yield { type: 'error', error: 'Codex thread_start returned no threadId' }
        yield { type: 'finish', reason: 'error' }
        return
      }

      const turnPromise = peer.request<CodexNewTurnResult>('newTurn', {
        threadId: thread.threadId,
        prompt: latestUser,
      })

      turnPromise.then(
        () => queue.close({ kind: 'finish' }),
        err => queue.close({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      )

      let sawFinish = false
      for await (const event of queue.iter()) {
        yield event
        if (event.type === 'finish')
          sawFinish = true
      }

      const terminal = queue.terminal
      if (terminal?.kind === 'error') {
        yield { type: 'error', error: terminal.message }
        yield { type: 'finish', reason: cancelled ? 'cancelled' : 'error' }
      }
      else if (!sawFinish) {
        // Normal close with no `codex/event/stop` — synthesize a terminator so
        // the generator contract holds (every run ends with a finish event).
        yield { type: 'finish', reason: cancelled ? 'cancelled' : 'stop' }
      }
    }
    catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
      yield { type: 'finish', reason: cancelled ? 'cancelled' : 'error' }
    }
    finally {
      clearTimeout(timeoutHandle)
      input.signal?.removeEventListener('abort', abortHandler)
      peer.dispose('run ended')
      ;(child.stdout as NodeJS.ReadableStream).off('data', stdoutHandler)
      safeEndStdin(child)
      await exitPromise.catch(() => null)
    }
  }

  private handleNotification(notification: JsonRpcNotification, queue: AgentEventQueue): void {
    for (const event of normalizeCodexNotification(notification))
      queue.push(event)
  }

  private async handleInboundRequest(req: JsonRpcRequest): Promise<unknown> {
    // FEAT-016 runs with `approval_policy: 'never'`, so the CLI shouldn't
    // dispatch approval requests. Defensive fallback keeps the turn moving
    // if the CLI asks anyway.
    if (req.method === 'codex/request_permission' || req.method === 'session/request_permission')
      return { outcome: { outcome: 'selected', optionId: 'allow' } }
    throw new Error(`unsupported codex client method: ${req.method}`)
  }

  private async resolveCommand(): Promise<{ cmd: string, args: string[] }> {
    const argv = ['app-server', ...(this.options.extraArgs ?? [])]
    const resolver = this.options.resolveBinary ?? resolveCodexOnPath
    const direct = await resolver()
    if (direct)
      return { cmd: direct, args: argv }

    const version = this.options.cliVersion?.trim()
      || process.env.CODEX_CLI_VERSION?.trim()
      || DEFAULT_CODEX_CLI_VERSION
    return {
      cmd: 'npx',
      args: ['-y', `@openai/codex@${version}`, ...argv],
    }
  }
}

/**
 * Single-producer / single-consumer queue mirroring the ACP harness pattern —
 * notifications push normalized events; the generator drains until either
 * the turn promise resolves or the child exits.
 */
class AgentEventQueue {
  private readonly buffer: AgentEvent[] = []
  private resolver: ((result: IteratorResult<AgentEvent>) => void) | null = null
  private closed = false
  terminal: { kind: 'finish' } | { kind: 'error', message: string } | null = null

  push(event: AgentEvent): void {
    if (this.closed)
      return
    if (this.resolver) {
      const r = this.resolver
      this.resolver = null
      r({ value: event, done: false })
      return
    }
    this.buffer.push(event)
  }

  close(terminal?: { kind: 'finish' } | { kind: 'error', message: string }): void {
    if (this.closed)
      return
    this.closed = true
    if (terminal)
      this.terminal = terminal
    if (this.resolver) {
      const r = this.resolver
      this.resolver = null
      r({ value: undefined, done: true })
    }
  }

  async* iter(): AsyncGenerator<AgentEvent> {
    while (true) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift()!
        continue
      }
      if (this.closed)
        return
      const result = await new Promise<IteratorResult<AgentEvent>>((resolve) => {
        this.resolver = resolve
      })
      if (result.done)
        return
      yield result.value
    }
  }
}

async function resolveCodexOnPath(): Promise<string | null> {
  const pathEnv = process.env.PATH ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : ['']
  for (const dir of pathEnv.split(sep)) {
    if (!dir)
      continue
    for (const ext of exts) {
      const candidate = path.join(dir, `codex${ext.toLowerCase()}`)
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
