import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import process from 'node:process'

export interface LocalEngineProcessHandle {
  command: string
  invocationId: string
  leaseId: string
  pgid: number
  pid: number
  startedAt: string
}

export interface LocalEngineInvocationRun {
  finish: () => void
  handle: () => LocalEngineProcessHandle | null
  registerProcessHandle: (handle: unknown) => void
  signal: AbortSignal
}

export interface LocalEngineProcessResult {
  code: number | null
  stderr: string
  stdout: string
}

export interface LocalEngineProcessManagerOptions {
  interruptGraceMs?: number
  now?: () => string
  terminateGraceMs?: number
  timeoutKillGraceMs?: number
}

export interface LocalEngineProcessRunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  invocationId: string
  maxBufferedLogChars: number
  onProcessHandle?: (handle: LocalEngineProcessHandle) => void
  onStderr?: (chunk: string) => void
  onStdout?: (chunk: string) => void
  signal?: AbortSignal
}

interface BoundedTextBuffer {
  text: string
  truncatedChars: number
}

interface ActiveInvocationRun {
  child: ChildProcessWithoutNullStreams | null
  closed: boolean
  controller: AbortController
  finished: boolean
  handle: LocalEngineProcessHandle | null
  interrupted: boolean
  interruptTimer: ReturnType<typeof setTimeout> | null
  killTimer: ReturnType<typeof setTimeout> | null
  standalone: boolean
  terminateTimer: ReturnType<typeof setTimeout> | null
  timedOut: boolean
  timeoutTimer: ReturnType<typeof setTimeout> | null
}

const DEFAULT_INTERRUPT_GRACE_MS = 750
const DEFAULT_TERMINATE_GRACE_MS = 250
const DEFAULT_TIMEOUT_KILL_GRACE_MS = 150

export class LocalEngineProcessManager {
  readonly #active = new Map<string, ActiveInvocationRun>()
  readonly #interruptGraceMs: number
  readonly #now: () => string
  readonly #terminateGraceMs: number
  readonly #timeoutKillGraceMs: number

  constructor(options: LocalEngineProcessManagerOptions = {}) {
    this.#interruptGraceMs = options.interruptGraceMs ?? DEFAULT_INTERRUPT_GRACE_MS
    this.#now = options.now ?? (() => new Date().toISOString())
    this.#terminateGraceMs = options.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS
    this.#timeoutKillGraceMs = options.timeoutKillGraceMs ?? DEFAULT_TIMEOUT_KILL_GRACE_MS
  }

  startInvocation(invocationId: string): LocalEngineInvocationRun {
    const existing = this.#active.get(invocationId)
    if (existing)
      return this.#runHandle(invocationId, existing)
    const run = this.#createRun(false)
    this.#active.set(invocationId, run)
    return this.#runHandle(invocationId, run)
  }

  runProcess(
    command: string,
    args: string[],
    stdin: string,
    timeoutMs: number,
    options: LocalEngineProcessRunOptions,
  ): Promise<LocalEngineProcessResult> {
    const invocationId = options.invocationId
    const existing = this.#active.get(invocationId)
    const run = existing ?? this.#createRun(true)
    if (!existing)
      this.#active.set(invocationId, run)
    if (run.child && !run.closed)
      return Promise.reject(new Error(`Engine invocation already has an active process: ${invocationId}`))

    return new Promise((resolve, reject) => {
      let settled = false
      const child = spawn(command, args, {
        cwd: options.cwd ?? process.cwd(),
        detached: true,
        env: options.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      run.child = child
      run.closed = false
      run.finished = false
      run.handle = child.pid
        ? {
            command,
            invocationId,
            leaseId: randomUUID(),
            pgid: child.pid,
            pid: child.pid,
            startedAt: this.#now(),
          }
        : null

      if (run.handle)
        options.onProcessHandle?.(run.handle)

      const maxBufferedLogChars = options.maxBufferedLogChars
      const stdout = createBoundedTextBuffer()
      const stderr = createBoundedTextBuffer()
      const settle = (fn: () => void): void => {
        if (settled)
          return
        settled = true
        fn()
      }
      const abortListener = () => {
        this.cancelInvocation(invocationId, options.signal?.reason ?? 'aborted')
      }
      if (options.signal && options.signal !== run.controller.signal) {
        if (options.signal.aborted)
          this.cancelInvocation(invocationId, options.signal.reason ?? 'aborted')
        else
          options.signal.addEventListener('abort', abortListener, { once: true })
      }
      if (run.controller.signal.aborted || options.signal?.aborted)
        this.#interruptRun(run)

      run.timeoutTimer = setTimeout(() => {
        run.timedOut = true
        this.#terminateRun(run, this.#timeoutKillGraceMs)
      }, timeoutMs)

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        appendBoundedText(stdout, chunk, maxBufferedLogChars)
        options.onStdout?.(chunk)
      })
      child.stderr.on('data', (chunk) => {
        appendBoundedText(stderr, chunk, maxBufferedLogChars)
        options.onStderr?.(chunk)
      })
      child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EPIPE') {
          this.#clearTimers(run)
          settle(() => reject(error))
        }
      })
      child.on('error', (error) => {
        options.signal?.removeEventListener('abort', abortListener)
        this.#clearTimers(run)
        this.#forgetClosedProcess(invocationId, run)
        settle(() => reject(error))
      })
      child.on('close', (code) => {
        options.signal?.removeEventListener('abort', abortListener)
        this.#clearTimers(run)
        run.closed = true
        if (run.interrupted)
          appendBoundedText(stderr, '\nProcess interrupted by AIWorker Stop.', maxBufferedLogChars)
        else if (run.timedOut)
          appendBoundedText(stderr, `\nProcess exceeded ${timeoutMs}ms and was terminated.`, maxBufferedLogChars)
        this.#forgetClosedProcess(invocationId, run)
        settle(() => resolve({
          code,
          stderr: boundedTextValue(stderr, 'stderr'),
          stdout: boundedTextValue(stdout, 'stdout'),
        }))
      })
      child.stdin.end(stdin)
    })
  }

  async inspect(handle: unknown, guard: { invocationId: string }): Promise<Record<string, unknown>> {
    try {
      const run = this.#requireActiveRunForHandle(handle, guard)
      if (run.child && !run.closed) {
        return {
          invocationId: guard.invocationId,
          processState: 'spawned',
          state: 'spawned',
        }
      }
    }
    catch {}
    return {
      diagnostic: 'Native engine process was lost.',
      invocationId: guard.invocationId,
      processState: 'lost',
      state: 'lost',
    }
  }

  async softInterrupt(handle: unknown, guard: { invocationId: string }): Promise<Record<string, unknown>> {
    const run = this.#requireActiveRunForHandle(handle, guard)
    this.#interruptRun(run)
    return {
      invocationId: guard.invocationId,
      processState: 'spawned',
      state: 'spawned',
    }
  }

  async terminateGroup(handle: unknown, guard: { invocationId: string }): Promise<Record<string, unknown>> {
    const run = this.#requireActiveRunForHandle(handle, guard)
    this.#terminateRun(run, this.#terminateGraceMs)
    return {
      invocationId: guard.invocationId,
      processState: 'killed',
      state: 'killed',
    }
  }

  cancelInvocation(invocationId: string, reason?: unknown): boolean {
    const run = this.#active.get(invocationId)
    if (!run)
      return false
    if (!run.controller.signal.aborted)
      run.controller.abort(reason ?? 'cancelled')
    this.#interruptRun(run)
    return true
  }

  dispose(reason: unknown = 'runtime-dispose'): void {
    for (const invocationId of this.#active.keys())
      this.cancelInvocation(invocationId, reason)
  }

  #createRun(standalone: boolean): ActiveInvocationRun {
    return {
      child: null,
      closed: false,
      controller: new AbortController(),
      finished: false,
      handle: null,
      interrupted: false,
      interruptTimer: null,
      killTimer: null,
      standalone,
      terminateTimer: null,
      timedOut: false,
      timeoutTimer: null,
    }
  }

  #runHandle(invocationId: string, run: ActiveInvocationRun): LocalEngineInvocationRun {
    return {
      finish: () => {
        if (this.#active.get(invocationId) !== run)
          return
        run.finished = true
        if (!run.child || run.closed)
          this.#active.delete(invocationId)
      },
      handle: () => run.handle,
      registerProcessHandle: (handle) => {
        const normalized = readProcessHandle(handle)
        if (!normalized || normalized.invocationId !== invocationId)
          return
        if (!run.handle || run.handle.leaseId === normalized.leaseId)
          run.handle = normalized
      },
      signal: run.controller.signal,
    }
  }

  #interruptRun(run: ActiveInvocationRun): void {
    if (run.interrupted) {
      if (run.child && !run.closed && !run.interruptTimer && !run.terminateTimer && !run.killTimer)
        this.#scheduleInterrupt(run)
      return
    }
    run.interrupted = true
    if (run.timeoutTimer) {
      clearTimeout(run.timeoutTimer)
      run.timeoutTimer = null
    }
    if (!run.child && !run.handle)
      return
    this.#scheduleInterrupt(run)
  }

  #scheduleInterrupt(run: ActiveInvocationRun): void {
    this.#signalRun(run, 'SIGINT')
    run.interruptTimer = setTimeout(() => {
      run.interruptTimer = null
      this.#signalRun(run, 'SIGTERM')
      run.terminateTimer = setTimeout(() => {
        run.terminateTimer = null
        this.#signalRun(run, 'SIGKILL')
      }, this.#terminateGraceMs)
    }, this.#interruptGraceMs)
  }

  #terminateRun(run: ActiveInvocationRun, killGraceMs: number): void {
    if (run.killTimer)
      return
    if (run.interruptTimer) {
      clearTimeout(run.interruptTimer)
      run.interruptTimer = null
    }
    if (run.terminateTimer) {
      clearTimeout(run.terminateTimer)
      run.terminateTimer = null
    }
    if (run.timeoutTimer) {
      clearTimeout(run.timeoutTimer)
      run.timeoutTimer = null
    }
    this.#signalRun(run, 'SIGTERM')
    run.killTimer = setTimeout(() => {
      run.killTimer = null
      this.#signalRun(run, 'SIGKILL')
    }, killGraceMs)
  }

  #signalRun(run: ActiveInvocationRun, signal: NodeJS.Signals): void {
    const handle = run.handle
    if (!handle && !run.child)
      return
    if (handle?.pgid) {
      try {
        process.kill(-handle.pgid, signal)
        return
      }
      catch {
        // Fall through to direct child/pid signaling for runtimes without process groups.
      }
    }
    if (handle?.pid) {
      try {
        process.kill(handle.pid, signal)
        return
      }
      catch {
        // Fall through to the child object when the pid cannot be signaled directly.
      }
    }
    run.child?.kill(signal)
  }

  #requireActiveRunForHandle(handle: unknown, guard: { invocationId: string }): ActiveInvocationRun {
    const normalized = readProcessHandle(handle)
    if (!normalized)
      throw new Error('Process handle is incomplete.')
    if (normalized.invocationId !== guard.invocationId)
      throw new Error('Process handle no longer belongs to the requested invocation.')
    const run = this.#active.get(guard.invocationId)
    const activeHandle = run?.handle
    if (!run || !activeHandle)
      throw new Error('Process lease is not active for the requested invocation.')
    if (activeHandle.leaseId !== normalized.leaseId || activeHandle.pid !== normalized.pid || activeHandle.pgid !== normalized.pgid)
      throw new Error('Process lease no longer matches the active invocation.')
    return run
  }

  #clearTimers(run: ActiveInvocationRun): void {
    if (run.timeoutTimer)
      clearTimeout(run.timeoutTimer)
    if (run.interruptTimer)
      clearTimeout(run.interruptTimer)
    if (run.terminateTimer)
      clearTimeout(run.terminateTimer)
    if (run.killTimer)
      clearTimeout(run.killTimer)
    run.timeoutTimer = null
    run.interruptTimer = null
    run.terminateTimer = null
    run.killTimer = null
  }

  #forgetClosedProcess(invocationId: string, run: ActiveInvocationRun): void {
    run.child = null
    if (run.finished || run.standalone || run.controller.signal.aborted)
      this.#active.delete(invocationId)
  }
}

function readProcessHandle(value: unknown): LocalEngineProcessHandle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const record = value as Record<string, unknown>
  const command = readString(record.command)
  const invocationId = readString(record.invocationId)
  const leaseId = readString(record.leaseId)
  const pgid = readPositiveInteger(record.pgid)
  const pid = readPositiveInteger(record.pid)
  const startedAt = readString(record.startedAt)
  if (!command || !invocationId || !leaseId || !pgid || !pid || !startedAt)
    return null
  return { command, invocationId, leaseId, pgid, pid, startedAt }
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function readPositiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

function createBoundedTextBuffer(): BoundedTextBuffer {
  return { text: '', truncatedChars: 0 }
}

function appendBoundedText(buffer: BoundedTextBuffer, chunk: string, maxChars: number): void {
  if (!chunk)
    return
  if (maxChars <= 0) {
    buffer.truncatedChars += buffer.text.length + chunk.length
    buffer.text = ''
    return
  }
  const next = buffer.text + chunk
  if (next.length <= maxChars) {
    buffer.text = next
    return
  }
  const overflow = next.length - maxChars
  buffer.truncatedChars += overflow
  buffer.text = next.slice(overflow)
}

function boundedTextValue(buffer: BoundedTextBuffer, label: string): string {
  if (buffer.truncatedChars <= 0)
    return buffer.text
  return `[AIWorker truncated ${buffer.truncatedChars} earlier characters from ${label}.]\n${buffer.text}`
}
