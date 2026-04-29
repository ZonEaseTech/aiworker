import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

export interface ManagedProcess {
  readonly pid: number
  readonly exited: Promise<number>
}

export interface IntegrationCleanupOptions {
  timeoutMs?: number
  killGraceMs?: number
}

export class IntegrationTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`integration helper timed out after ${timeoutMs}ms`)
    this.name = 'IntegrationTimeoutError'
  }
}

export class IntegrationCleanup {
  readonly signal: AbortSignal

  private readonly controller: AbortController
  private readonly killGraceMs: number
  private readonly processes = new Set<ManagedProcess>()
  private readonly tempDirs: string[] = []
  private cleanupStarted = false

  constructor(options: IntegrationCleanupOptions = {}) {
    this.controller = new AbortController()
    this.signal = this.controller.signal
    this.killGraceMs = options.killGraceMs ?? 3_000
  }

  async makeTempDir(prefix: string): Promise<string> {
    this.assertAcceptingResources()
    const dir = await mkdtemp(path.join(tmpdir(), prefix))
    this.tempDirs.push(dir)
    return dir
  }

  trackProcess<T extends ManagedProcess>(proc: T): T {
    if (this.cleanupStarted || this.signal.aborted) {
      void terminateProcess(proc, this.killGraceMs).catch(() => undefined)
      throw new Error('integration cleanup is no longer accepting new processes')
    }
    this.processes.add(proc)
    void proc.exited.finally(() => this.processes.delete(proc)).catch(() => undefined)
    return proc
  }

  abort(reason?: string): void {
    if (!this.signal.aborted)
      this.controller.abort(reason)
  }

  async cleanup(): Promise<void> {
    this.cleanupStarted = true
    const errors: Error[] = []
    const processes = Array.from(this.processes)
    this.processes.clear()

    await Promise.all(processes.map(async (proc) => {
      try {
        await terminateProcess(proc, this.killGraceMs)
      }
      catch (err) {
        errors.push(toError(err))
      }
    }))

    for (const dir of this.tempDirs.splice(0).reverse()) {
      try {
        await rm(dir, { recursive: true, force: true })
      }
      catch (err) {
        errors.push(toError(err))
      }
    }

    if (errors.length > 0)
      throw new AggregateError(errors, 'integration cleanup failed')
  }

  private assertAcceptingResources(): void {
    if (this.cleanupStarted || this.signal.aborted)
      throw new Error('integration cleanup is no longer accepting new temp directories')
  }
}

export async function withIntegrationCleanup<T>(
  options: IntegrationCleanupOptions,
  run: (cleanup: IntegrationCleanup) => Promise<T>,
): Promise<T>
export async function withIntegrationCleanup<T>(
  run: (cleanup: IntegrationCleanup) => Promise<T>,
): Promise<T>
export async function withIntegrationCleanup<T>(
  optionsOrRun: IntegrationCleanupOptions | ((cleanup: IntegrationCleanup) => Promise<T>),
  maybeRun?: (cleanup: IntegrationCleanup) => Promise<T>,
): Promise<T> {
  const options = typeof optionsOrRun === 'function' ? {} : optionsOrRun
  const run = typeof optionsOrRun === 'function' ? optionsOrRun : maybeRun
  if (!run)
    throw new Error('withIntegrationCleanup requires a callback')

  const cleanup = new IntegrationCleanup(options)
  const timeoutMs = options.timeoutMs ?? 4_000
  let timer: ReturnType<typeof setTimeout> | undefined
  let primaryError: unknown
  let result: T | undefined
  let hasResult = false

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      cleanup.abort(`timeout after ${timeoutMs}ms`)
      reject(new IntegrationTimeoutError(timeoutMs))
    }, timeoutMs)
  })

  try {
    result = await Promise.race([run(cleanup), timeout])
    hasResult = true
  }
  catch (err) {
    primaryError = err
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }

  try {
    await cleanup.cleanup()
  }
  catch (cleanupError) {
    if (primaryError !== undefined)
      throw new AggregateError([toError(primaryError), toError(cleanupError)], 'integration run and cleanup failed')
    throw cleanupError
  }

  if (primaryError !== undefined)
    throw primaryError
  if (hasResult)
    return result as T
  throw new Error('integration callback completed without result')
}

async function terminateProcess(proc: ManagedProcess, graceMs: number): Promise<void> {
  if (await hasExited(proc))
    return

  sendSignal(proc.pid, 'SIGTERM')
  if (await waitForExit(proc, graceMs))
    return

  sendSignal(proc.pid, 'SIGKILL')
  if (!await waitForExit(proc, 1_000))
    throw new Error(`process ${proc.pid} did not exit after SIGKILL`)
}

async function hasExited(proc: ManagedProcess): Promise<boolean> {
  return Promise.race([
    proc.exited.then(() => true, () => true),
    sleep(0).then(() => false),
  ])
}

async function waitForExit(proc: ManagedProcess, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      proc.exited.then(() => true, () => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}

function sendSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal)
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ESRCH')
      throw err
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}
