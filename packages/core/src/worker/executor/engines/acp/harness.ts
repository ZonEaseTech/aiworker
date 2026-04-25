import type {
  AgentEvent,
  AgentRunInput,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@aiworker/shared'
import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AcpAgentDefinition, AvailabilityInfo } from './agents/types'
import type {
  AcpInitializeResult,
  AcpNewSessionResult,
  AcpPromptResult,
  AcpSessionUpdateParams,
  JsonRpcNotification,
  JsonRpcRequest,
} from './types'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { mapStopReason, normalizeSessionUpdate } from './normalize'
import { JsonRpcPeer, splitNdjson } from './protocol'

/** Hard cap for one ACP turn. Overridable by executor options. */
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_PROTOCOL_VERSION = 1
/** Auth-probe cache lifetime (10 min). Keyed by agent id. */
const AVAILABILITY_CACHE_TTL_MS = 10 * 60 * 1000

/** Supplied by tests to bypass PATH search and npx lookup. */
export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string, env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams

export interface AcpExecutorOptions {
  /** Declarative adapter (see `agents/*.ts`). */
  agent: AcpAgentDefinition
  /** Optional model override forwarded to the agent. */
  model?: string
  /** Pinned CLI version; overrides env and the agent's baked-in default. */
  cliVersion?: string
  /** Extra args appended after the agent's ACP flags. */
  extraArgs?: string[]
  /** Env vars merged into the spawned process env. */
  env?: Record<string, string>
  /** Per-turn hard timeout in ms (default 120_000). */
  timeoutMs?: number
  /** Auto-approve mode — FEAT-013 default is `true`. */
  autoApprove?: boolean
  /**
   * Fallback workspace used when `AgentRunInput.workspacePath` is absent
   * (e.g. one-shot health probes). Normal orchestrator traffic always
   * sets a workspace, so this is a safety net.
   */
  fallbackWorkspacePath?: string
  /** Test hook — override spawn entirely (used by stub CLI tests). */
  spawn?: SpawnLike
  /** Test hook — override PATH resolution for the agent's command. */
  resolveBinary?: (commandName: string) => Promise<string | null>
  /** Test hook — override auth probe invocation. */
  authProbe?: () => Promise<AvailabilityInfo>
}

/** Resolve the CLI version honoring config → env → baked-in default. */
export function resolveCliVersion(agent: AcpAgentDefinition, configVersion: string | undefined): string {
  const fromConfig = configVersion?.trim()
  if (fromConfig && fromConfig.length > 0)
    return fromConfig
  const fromEnv = process.env[agent.versionEnvVar]?.trim()
  if (fromEnv && fromEnv.length > 0)
    return fromEnv
  return agent.defaultVersion
}

/**
 * ACP executor. Owns one agentic CLI subprocess per turn, drives the ACP
 * session lifecycle, and maps every `session/update` notification into
 * `AgentEvent`s that the orchestrator can consume directly.
 */
export class AcpExecutor implements ExecutorProvider {
  readonly name: string
  private cachedAvailability: { expiresAt: number, info: AvailabilityInfo } | null = null

  constructor(private readonly options: AcpExecutorOptions) {
    this.name = `acp:${options.agent.id}`
  }

  async health(): Promise<ServiceStatus> {
    const lastChecked = new Date().toISOString()
    // Cheap liveness: same philosophy as the claude-code executor — we do
    // not shell out on every /info request (license prompts, PATH cost).
    return { name: this.name, status: 'healthy', lastChecked }
  }

  async listTools(): Promise<ExecutorTool[]> {
    // The agent owns its own tool set; orchestrator must not inject tool
    // definitions for ACP executors. Matches claude-code's contract.
    return []
  }

  run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    return this.runIterable(input)
  }

  /**
   * Probe whether the agent binary / login state looks usable. Cached for
   * 10 minutes to avoid filesystem hits on every dashboard refresh.
   */
  async getAvailability(force = false): Promise<AvailabilityInfo> {
    if (!force && this.cachedAvailability && this.cachedAvailability.expiresAt > Date.now())
      return this.cachedAvailability.info
    const probe = this.options.authProbe ?? this.options.agent.authProbe
    const info = probe
      ? await probe().catch((err): AvailabilityInfo => ({
          status: 'NotFound',
          checkedAt: new Date().toISOString(),
          detail: err instanceof Error ? err.message : String(err),
        }))
      : { status: 'NotFound' as const, checkedAt: new Date().toISOString(), detail: 'no probe configured' }
    this.cachedAvailability = { expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS, info }
    return info
  }

  private async* runIterable(input: AgentRunInput): AsyncGenerator<AgentEvent> {
    const latestUser = lastUserMessage(input.messages)
    if (!latestUser) {
      yield { type: 'error', error: `${this.name} executor requires a user message` }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const workspacePath = input.workspacePath ?? this.options.fallbackWorkspacePath ?? process.cwd()

    let resolved: { cmd: string, args: string[] }
    try {
      resolved = await this.resolveCommand(input.model)
    }
    catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const spawnFn = this.options.spawn ?? (spawn as unknown as SpawnLike)
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
          // stdin may have already closed; EPIPE on best-effort write is fine.
        }
      },
      onNotification: n => this.handleNotification(n, queue),
      onRequest: req => this.handleInboundRequest(req),
      onError: (err) => {
        queue.push({ type: 'error', error: err.message })
      },
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
    // If the child exits before the turn resolves, don't wait for the RPC
    // request timeout — close the queue and reject pending peer requests so
    // the generator terminates promptly with an error.
    void exitPromise.then((code) => {
      if (code === 0)
        return
      const msg = childError ?? (code === null ? 'acp child exited unexpectedly' : `acp child exited with code ${code}`)
      queue.close({ kind: 'error', message: msg })
      peer.dispose(msg)
    })

    const timeoutHandle = setTimeout(() => safeKill(child, 'SIGKILL'), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    let sessionId = ''
    let cancelled = false
    const abortHandler = () => {
      cancelled = true
      if (sessionId)
        peer.notify('session/cancel', { sessionId })
      // Give the agent a beat to return stopReason='cancelled' before SIGTERM.
      setTimeout(() => safeKill(child, 'SIGTERM'), 200)
    }
    input.signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      await peer.request<AcpInitializeResult>('initialize', {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: 'aiworker', version: '0.2.0' },
      })
      const newSession = await peer.request<AcpNewSessionResult>('session/new', {
        cwd: workspacePath,
        mcpServers: [],
      })
      sessionId = newSession.sessionId
      if (!sessionId) {
        yield { type: 'error', error: 'ACP session/new returned no sessionId' }
        yield { type: 'finish', reason: 'error' }
        return
      }

      const promptPromise = peer.request<AcpPromptResult>('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: latestUser }],
      })

      // Close the queue as soon as the prompt request resolves / rejects so
      // the generator below stops awaiting further notifications.
      promptPromise.then(
        result => queue.close({ kind: 'finish', stopReason: result.stopReason }),
        err => queue.close({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      )

      for await (const event of queue.iter())
        yield event

      const terminal = queue.terminal
      if (terminal?.kind === 'finish') {
        yield { type: 'finish', reason: mapStopReason(terminal.stopReason) }
      }
      else if (terminal?.kind === 'error') {
        yield { type: 'error', error: terminal.message }
        yield { type: 'finish', reason: cancelled ? 'cancelled' : 'error' }
      }
      else {
        // Queue closed without a terminal — treat as error to keep the
        // generator contract (always finish with a `finish` event).
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
      // Drain the exit so stray child errors don't leak as unhandled rejections;
      // a `childError` here implies the try/catch above already surfaced it.
      await exitPromise.catch(() => null)
    }
  }

  private handleNotification(notification: JsonRpcNotification, queue: AgentEventQueue): void {
    if (notification.method !== 'session/update')
      return
    const params = notification.params as AcpSessionUpdateParams | undefined
    if (!params || !params.update)
      return
    for (const event of normalizeSessionUpdate(params.update))
      queue.push(event)
  }

  private async handleInboundRequest(req: JsonRpcRequest): Promise<unknown> {
    // FEAT-013 runs agents in yolo mode so the CLI shouldn't dispatch
    // permission requests. We still handle them defensively so a stray
    // request doesn't deadlock the turn: auto-approve in autoApprove mode,
    // deny otherwise.
    if (req.method === 'session/request_permission') {
      const autoApprove = this.options.autoApprove ?? true
      if (!autoApprove)
        return { outcome: { outcome: 'cancelled' } }
      const params = (req.params ?? {}) as {
        options?: Array<{ optionId?: string, kind?: string, name?: string }>
      }
      const options = Array.isArray(params.options) ? params.options : []
      const chosen = options.find(o => o.kind === 'allow_always')
        ?? options.find(o => o.kind === 'allow_once')
        ?? options.find(o => o.kind === 'allow')
        ?? options[0]
      return {
        outcome: {
          outcome: 'selected',
          optionId: chosen?.optionId ?? 'allow',
        },
      }
    }
    // Unknown agent → client methods: let the peer return method-not-found
    // by throwing; JsonRpcPeer catches and wires the error envelope.
    throw new Error(`unsupported acp client method: ${req.method}`)
  }

  private async resolveCommand(runModel: string | undefined): Promise<{ cmd: string, args: string[] }> {
    const agent = this.options.agent
    const yolo = this.options.autoApprove ?? true
    const argv = agent.buildArgs({
      yolo,
      ...(runModel ?? this.options.model ? { model: runModel ?? this.options.model } : {}),
      ...(this.options.extraArgs === undefined ? {} : { extraArgs: this.options.extraArgs }),
    })

    const resolver = this.options.resolveBinary ?? resolveOnPath
    const direct = await resolver(agent.commandName)
    if (direct)
      return { cmd: direct, args: argv }

    const version = resolveCliVersion(agent, this.options.cliVersion)
    return {
      cmd: 'npx',
      args: ['-y', `${agent.npxPackage}@${version}`, ...argv],
    }
  }
}

/**
 * Asynchronous single-producer / single-consumer event queue. The harness
 * pushes normalized events from JSON-RPC notifications, and the generator
 * drains them until `close()` is called when `session/prompt` resolves.
 */
class AgentEventQueue {
  private readonly buffer: AgentEvent[] = []
  private resolver: ((result: IteratorResult<AgentEvent>) => void) | null = null
  private closed = false
  terminal: { kind: 'finish', stopReason: string } | { kind: 'error', message: string } | null = null

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

  close(terminal?: { kind: 'finish', stopReason: string } | { kind: 'error', message: string }): void {
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

async function resolveOnPath(commandName: string): Promise<string | null> {
  const pathEnv = process.env.PATH ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : ['']
  for (const dir of pathEnv.split(sep)) {
    if (!dir)
      continue
    for (const ext of exts) {
      const candidate = path.join(dir, `${commandName}${ext.toLowerCase()}`)
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
