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
import type { ClaudeStdoutLine } from './types'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { buildSafeChildEnv } from '../../safe-env'
import { normalizeLine, parseLine, splitNdjson } from './normalize'
import { autoApprovePolicy, ControlProtocolPeer } from './protocol'

/** Default CLI version used when neither env nor config pins one. */
export const DEFAULT_CLAUDE_CLI_VERSION = '2.1.112'

/** Hard cap on one turn; exceeding it emits an error + kills the child. */
const DEFAULT_TIMEOUT_MS = 120_000
const CLAUDE_CODE_ENGINE = 'claude-code'

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
    const resumeSessionId = readSessionIdBinding(input.engineBinding)
    if (input.engineBinding !== undefined && resumeSessionId === undefined)
      yield { type: 'engine_binding', engine: CLAUDE_CODE_ENGINE, binding: null }

    let resolvedCmd: string
    let resolvedArgs: string[]
    try {
      ({ cmd: resolvedCmd, args: resolvedArgs } = await this.resolveCommand(input.model, resumeSessionId))
    }
    catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const child = spawnFn(resolvedCmd, resolvedArgs, {
      cwd: workspacePath,
      env: buildSafeChildEnv(this.options.env),
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
    let reportedSessionId = ''
    let sawFinish = false
    const textReplayState: StreamingTextReplayState = { streamedAssistantText: '' }
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
          const sessionId = readClaudeSessionId(parsed)
          if (sessionId && sessionId !== reportedSessionId) {
            reportedSessionId = sessionId
            yield { type: 'engine_binding', engine: CLAUDE_CODE_ENGINE, binding: { sessionId } }
          }
          if (parsed.type === 'control_request') {
            const extra = await peer.handleLine(parsed)
            for (const event of extra)
              yield event
            continue
          }
          const events = filterReplayedFinalText(parsed, normalizeLine(parsed), textReplayState)
          for (const event of events) {
            if (event.type === 'error' && resumeSessionId !== undefined)
              yield { type: 'engine_binding', engine: CLAUDE_CODE_ENGINE, binding: null }
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
      if (resumeSessionId !== undefined)
        yield { type: 'engine_binding', engine: CLAUDE_CODE_ENGINE, binding: null }
      if (childError) {
        yield { type: 'error', error: childError }
      }
      else if (exitCode !== 0 && exitCode !== null) {
        yield { type: 'error', error: `Claude Code exited with code ${exitCode}` }
      }
      yield { type: 'finish', reason: exitCode === 0 ? 'stop' : 'error' }
    }
  }

  private async resolveCommand(runModel: string | undefined, resumeSessionId: string | undefined): Promise<{ cmd: string, args: string[] }> {
    const baseArgs = buildBaseArgs(runModel ?? this.options.model, this.options.extraArgs, resumeSessionId)

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

export function buildBaseArgs(model: string | undefined, extra: string[] | undefined, resumeSessionId?: string): string[] {
  const args = [
    '-p',
    '--verbose',
    '--output-format=stream-json',
    '--input-format=stream-json',
    '--include-partial-messages',
    '--replay-user-messages',
    '--dangerously-skip-permissions',
  ]
  if (resumeSessionId && resumeSessionId.length > 0)
    args.push('--resume', resumeSessionId)
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

function readSessionIdBinding(binding: AgentRunInput['engineBinding']): string | undefined {
  if (!binding || typeof binding.sessionId !== 'string' || binding.sessionId.length === 0)
    return undefined
  return binding.sessionId
}

function readClaudeSessionId(line: unknown): string {
  if (!line || typeof line !== 'object' || Array.isArray(line))
    return ''
  const raw = (line as { session_id?: unknown }).session_id
  return typeof raw === 'string' && raw.length > 0 ? raw : ''
}

interface StreamingTextReplayState {
  streamedAssistantText: string
}

function filterReplayedFinalText(
  line: ClaudeStdoutLine,
  events: AgentEvent[],
  state: StreamingTextReplayState,
): AgentEvent[] {
  const streamDelta = readStreamTextDelta(line)
  if (streamDelta.length > 0) {
    state.streamedAssistantText += streamDelta
    return events
  }

  if (line.type !== 'assistant' || state.streamedAssistantText.length === 0)
    return events

  const streamedText = state.streamedAssistantText
  state.streamedAssistantText = ''

  const assistantText = events
    .filter(event => event.type === 'assistant_message_delta')
    .map(event => event.delta)
    .join('')

  if (assistantText.length === 0 || !assistantText.startsWith(streamedText))
    return events

  return removeStreamedTextPrefix(events, streamedText)
}

function readStreamTextDelta(line: ClaudeStdoutLine): string {
  if (line.type !== 'stream_event')
    return ''
  const event = (line as { event?: { delta?: { type?: unknown, text?: unknown } } }).event
  const delta = event?.delta
  if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0)
    return delta.text
  return ''
}

function removeStreamedTextPrefix(events: AgentEvent[], prefix: string): AgentEvent[] {
  let remainingPrefix = prefix
  const out: AgentEvent[] = []

  for (const event of events) {
    if (event.type !== 'assistant_message_delta' || remainingPrefix.length === 0) {
      out.push(event)
      continue
    }

    if (remainingPrefix.startsWith(event.delta)) {
      remainingPrefix = remainingPrefix.slice(event.delta.length)
      continue
    }

    if (event.delta.startsWith(remainingPrefix)) {
      const delta = event.delta.slice(remainingPrefix.length)
      remainingPrefix = ''
      if (delta.length > 0)
        out.push({ ...event, delta })
      continue
    }

    out.push(event)
  }

  return out
}
