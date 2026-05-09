import type {
  AgentEvent,
  AgentRunInput,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@zonease/aiworker-shared'
import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { buildSafeChildEnv } from '../../safe-env'
import { extractRunMessages, renderHistoryAsUserPreamble } from '../common/run-input'
import { extractSessionId, normalizeCursorLine, parseCursorLine, splitNdjson } from './normalize'

const CURSOR_ENGINE = 'cursor'

export type CursorSpawnLike = (
  cmd: string,
  args: string[],
  options: { cwd: string, env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams

export interface CursorExecutorOptions {
  /** Forwarded as `--model <value>`. `auto` lets the CLI pick. */
  model?: string
  /** Extra argv appended after the required flags. */
  extraArgs?: string[]
  /** Env vars merged into the spawned process env. */
  env?: Record<string, string>
  /** Optional per-turn watchdog in ms. Omitted means AIWorker will not kill Cursor for duration. */
  timeoutMs?: number
  /**
   * Resume an earlier Cursor session. FEAT-016 wires the option but doesn't
   * persist the session id in orchestrator state — every run starts fresh.
   */
  resumeSessionId?: string
  /**
   * Fallback workspace when `AgentRunInput.workspacePath` is absent. Normal
   * orchestrator traffic always passes a workspace path, so this is a safety
   * net for health / one-shot probes.
   */
  fallbackWorkspacePath?: string
  /** Test hook — override spawn entirely. */
  spawn?: CursorSpawnLike
  /** Test hook — override PATH resolution for the `cursor-agent` binary. */
  resolveBinary?: () => Promise<string | null>
}

/**
 * Cursor Agent executor. Spawns `cursor-agent -p --output-format=stream-json`
 * once per turn, pipes the latest user message via stdin, and normalises the
 * ndjson output into `AgentEvent`s the orchestrator consumes directly.
 *
 * Cursor has no stable npm package, so the `npx` fallback path is omitted —
 * PATH search failure surfaces an explicit error event and finishes the run.
 */
export class CursorExecutor implements ExecutorProvider {
  readonly name = 'cursor'
  private lastSessionId = ''

  constructor(private readonly options: CursorExecutorOptions) {}

  async health(): Promise<ServiceStatus> {
    // Same as claude-code / codex: do not shell out on every /info probe.
    return { name: this.name, status: 'healthy', lastChecked: new Date().toISOString() }
  }

  async listTools(): Promise<ExecutorTool[]> {
    // Cursor owns its toolset; orchestrator must not inject tool definitions.
    return []
  }

  /** Session id captured from the most recent run, used for `--resume` follow-ups. */
  getLastSessionId(): string {
    return this.lastSessionId
  }

  run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    return this.runIterable(input)
  }

  private async* runIterable(input: AgentRunInput): AsyncGenerator<AgentEvent> {
    const { systemText, history, latestUser } = extractRunMessages(input.messages)
    if (latestUser === null) {
      yield { type: 'error', error: 'Cursor executor requires a user message' }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const workspacePath = input.workspacePath ?? this.options.fallbackWorkspacePath ?? process.cwd()
    const inputResumeSessionId = readSessionIdBinding(input.engineBinding)
    if (input.engineBinding !== undefined && inputResumeSessionId === undefined)
      yield { type: 'engine_binding', engine: CURSOR_ENGINE, binding: null }

    let resolved: { cmd: string, args: string[] }
    try {
      resolved = await this.resolveCommand(input.model, inputResumeSessionId)
    }
    catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const spawnFn = this.options.spawn ?? (spawn as unknown as CursorSpawnLike)
    const child = spawnFn(resolved.cmd, resolved.args, {
      cwd: workspacePath,
      env: buildSafeChildEnv(this.options.env),
    })

    // FEAT-054 / BUG-056: cursor-agent has no system-prompt flag in -p mode,
    // so the freshly-composed Project Brain (system text) and recent
    // conversation preamble are folded into the stdin prompt every turn.
    const promptText = composeCursorPrompt({ systemText, history, latestUser })

    // Pipe the prompt through stdin then close it — Cursor's -p mode expects
    // the prompt on stdin and exits the turn when stdin drains.
    try {
      child.stdin.write(promptText)
      child.stdin.end()
    }
    catch {
      // stdin might have already closed (spawn failure); child error handler
      // below will surface the real cause.
    }

    const timeoutMs = explicitTimeoutMs(this.options.timeoutMs)
    const timeoutHandle = timeoutMs === undefined
      ? null
      : setTimeout(() => safeKill(child, 'SIGKILL'), timeoutMs)

    let stdoutBuffer = ''
    let childError: string | null = null
    let reportedSessionId = ''
    let sawFinish = false
    const exitPromise: Promise<number | null> = once(child, 'exit')
      .then(args => (args as [number | null])[0] ?? null)
      .catch((err: unknown) => {
        childError = err instanceof Error ? err.message : String(err)
        return null
      })
    child.on('error', (err: Error) => {
      childError = err.message
    })

    let cancelled = false
    const abortHandler = () => {
      cancelled = true
      safeKill(child, 'SIGTERM')
    }
    input.signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
        const { lines, remainder } = splitNdjson(stdoutBuffer, chunk.toString('utf8'))
        stdoutBuffer = remainder
        for (const raw of lines) {
          const parsed = parseCursorLine(raw)
          if (!parsed)
            continue
          const sid = extractSessionId(parsed)
          if (sid) {
            this.lastSessionId = sid
            if (sid !== reportedSessionId) {
              reportedSessionId = sid
              yield { type: 'engine_binding', engine: CURSOR_ENGINE, binding: { sessionId: sid } }
            }
          }
          for (const event of normalizeCursorLine(parsed)) {
            if (event.type === 'error' && inputResumeSessionId !== undefined)
              yield { type: 'engine_binding', engine: CURSOR_ENGINE, binding: null }
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
      if (timeoutHandle)
        clearTimeout(timeoutHandle)
      input.signal?.removeEventListener('abort', abortHandler)
      safeEndStdin(child)
    }

    const exitCode = await exitPromise

    if (!sawFinish) {
      if (inputResumeSessionId !== undefined)
        yield { type: 'engine_binding', engine: CURSOR_ENGINE, binding: null }
      if (childError) {
        yield { type: 'error', error: childError }
      }
      else if (exitCode !== 0 && exitCode !== null) {
        yield { type: 'error', error: `cursor-agent exited with code ${exitCode}` }
      }
      yield { type: 'finish', reason: cancelled ? 'cancelled' : exitCode === 0 ? 'stop' : 'error' }
    }
  }

  private async resolveCommand(runModel: string | undefined, resumeSessionId: string | undefined): Promise<{ cmd: string, args: string[] }> {
    const resolver = this.options.resolveBinary ?? resolveCursorOnPath
    const direct = await resolver()
    if (!direct) {
      // Cursor has no stable npm package — fail explicitly instead of guessing
      // an `npx` fallback.
      throw new Error('cursor-agent binary not found on PATH (install https://cursor.com/cli)')
    }
    const model = runModel ?? this.options.model
    const sessionId = resumeSessionId ?? this.options.resumeSessionId
    const args = buildArgs({
      model,
      ...(sessionId === undefined ? {} : { resumeSessionId: sessionId }),
      ...(this.options.extraArgs === undefined ? {} : { extraArgs: this.options.extraArgs }),
    })
    return { cmd: direct, args }
  }
}

function explicitTimeoutMs(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

export function buildArgs(opts: { model?: string, resumeSessionId?: string, extraArgs?: string[] }): string[] {
  const args = ['-p', '--output-format=stream-json']
  if (opts.model && opts.model.length > 0)
    args.push('--model', opts.model)
  if (opts.resumeSessionId && opts.resumeSessionId.length > 0)
    args.push('--resume', opts.resumeSessionId)
  if (opts.extraArgs && opts.extraArgs.length > 0)
    args.push(...opts.extraArgs)
  return args
}

async function resolveCursorOnPath(): Promise<string | null> {
  const pathEnv = process.env.PATH ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : ['']
  for (const dir of pathEnv.split(sep)) {
    if (!dir)
      continue
    for (const ext of exts) {
      const candidate = path.join(dir, `cursor-agent${ext.toLowerCase()}`)
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
    // already exited
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

/**
 * Compose the single stdin prompt for Cursor's `-p` mode by stitching
 * together the orchestrator-composed Project Brain (system text), the prior
 * conversation preamble, and the user's new turn. Public for unit tests.
 */
export function composeCursorPrompt(input: {
  systemText: string
  history: ReturnType<typeof extractRunMessages>['history']
  latestUser: string
}): string {
  const sections: string[] = []
  if (input.systemText.length > 0)
    sections.push(`[SYSTEM]\n${input.systemText}`)
  const historyPreamble = renderHistoryAsUserPreamble(input.history)
  if (historyPreamble.length > 0)
    sections.push(historyPreamble)
  sections.push(`New message:\n${input.latestUser}`)
  return sections.join('\n\n')
}

function readSessionIdBinding(binding: AgentRunInput['engineBinding']): string | undefined {
  if (!binding || typeof binding.sessionId !== 'string' || binding.sessionId.length === 0)
    return undefined
  return binding.sessionId
}
