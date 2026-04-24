import type { RegisteredWorker, RegisteredWorkerLivenessState } from '@aiworker/shared'
import type { FleetDatabase } from '@aiworker/storage-sqlite/fleet'

import { auditEvents, registeredWorkers } from '@aiworker/storage-sqlite/fleet'
import consola from 'consola'

import { eq } from 'drizzle-orm'
import {
  WorkerClient,
  WorkerClientAuthError,
  WorkerClientInvalidResponseError,
  WorkerClientNetworkError,
} from './client'
import { decryptTokenFor } from './service'

/**
 * Factory the poller uses to construct a `WorkerClient` per tick. Tests swap
 * this for an in-memory stub; production defaults to a real fetch-backed
 * client.
 */
export type WorkerClientFactory = (
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
) => Pick<WorkerClient, 'info'>

export interface PollResult {
  id: string
  state: RegisteredWorkerLivenessState
  configVersion?: number
}

export interface WorkerPollerOptions {
  db: FleetDatabase
  masterKeyHex: string
  /** How often to fire `pollOnce()` (ms). `<= 0` disables the loop entirely. */
  intervalMs: number
  /** Random jitter added to each tick to avoid thundering-herd. */
  jitterMs: number
  buildClient?: WorkerClientFactory
  now?: () => Date
  /** Parallelism across workers inside a single pollOnce() pass. */
  concurrency?: number
}

const DEFAULT_CONCURRENCY = 8

/**
 * Periodically iterates `registered_workers`, calls each worker's `/info`
 * endpoint, and updates `lastSeenAt / lastSeenState / lastConfigVersion`.
 * Emits an audit row only when a worker's liveness state changes, so polling
 * doesn't flood the event log.
 *
 * The loop is a plain `setInterval` with a bounded random jitter on each
 * tick. `stop()` clears the timer *and* waits for any in-flight `pollOnce()`
 * to finish so tests (and graceful shutdown in modes/dashboard.ts) never
 * leave a promise hanging.
 */
export class WorkerPoller {
  private readonly db: FleetDatabase
  private readonly masterKeyHex: string
  private readonly intervalMs: number
  private readonly jitterMs: number
  private readonly buildClient: WorkerClientFactory
  private readonly now: () => Date
  private readonly concurrency: number

  private timer: ReturnType<typeof setInterval> | null = null
  private readonly pendingJitters: Set<ReturnType<typeof setTimeout>> = new Set()
  private inflight: Promise<PollResult[]> | null = null
  private stopped = false

  constructor(options: WorkerPollerOptions) {
    this.db = options.db
    this.masterKeyHex = options.masterKeyHex
    this.intervalMs = options.intervalMs
    this.jitterMs = Math.max(0, options.jitterMs)
    this.buildClient = options.buildClient ?? defaultBuildClient
    this.now = options.now ?? (() => new Date())
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  }

  /**
   * Start the periodic loop. No-op (with a log line) when `intervalMs <= 0`,
   * per the `MANAGER_POLL_INTERVAL_MS=0` kill-switch documented in
   * config/dashboard.ts.
   */
  start(): void {
    if (this.timer)
      return
    if (this.stopped)
      throw new Error('[registry/poll] cannot start a poller that has been stopped')
    if (this.intervalMs <= 0) {
      consola.info('[registry/poll] disabled (MANAGER_POLL_INTERVAL_MS=0)')
      return
    }
    this.timer = setInterval(() => this.scheduleTick(), this.intervalMs)
    consola.info(`[registry/poll] started (intervalMs=${this.intervalMs}, jitterMs=${this.jitterMs})`)
  }

  /**
   * Stop the loop: clear the interval, cancel any pending jittered ticks,
   * and await the currently running `pollOnce()` if one is in flight.
   */
  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    for (const handle of this.pendingJitters)
      clearTimeout(handle)
    this.pendingJitters.clear()
    if (this.inflight) {
      try {
        await this.inflight
      }
      catch {
        // pollOnce logs its own errors; stop() must never reject.
      }
    }
  }

  private scheduleTick(): void {
    if (this.stopped)
      return
    const delay = this.jitterMs > 0 ? Math.floor(Math.random() * this.jitterMs) : 0
    const handle = setTimeout(() => {
      this.pendingJitters.delete(handle)
      this.runTick()
    }, delay)
    this.pendingJitters.add(handle)
  }

  private runTick(): void {
    if (this.stopped)
      return
    if (this.inflight) {
      // Previous pass still running — drop this tick so we never pile up.
      // At `intervalMs=30s` a fleet that can't keep up is an observability
      // concern; surface it as a debug line for operators.
      consola.debug('[registry/poll] skipping tick; previous pollOnce still in flight')
      return
    }
    this.pollOnce().catch((err) => {
      consola.error('[registry/poll] pollOnce failed', err)
    })
  }

  /**
   * Single poll pass over every registered worker. Runs up to `concurrency`
   * `/info` calls in parallel; each call has a timeout of `intervalMs/2` so a
   * stuck worker can never block the next tick.
   *
   * Returns one `PollResult` per registered worker so tests can assert
   * post-pass state without reading the DB. State transitions (as compared to
   * the previously persisted `lastSeenState`) are mirrored into `audit_events`.
   *
   * The in-flight promise is exposed on `this.inflight` so `stop()` — whether
   * triggered by graceful shutdown or a test — can wait for the pass to drain
   * before returning.
   */
  async pollOnce(): Promise<PollResult[]> {
    const promise = this.doPollOnce()
    this.inflight = promise
    try {
      return await promise
    }
    finally {
      if (this.inflight === promise)
        this.inflight = null
    }
  }

  private async doPollOnce(): Promise<PollResult[]> {
    const rawRows = this.db.select().from(registeredWorkers).all()
    if (rawRows.length === 0)
      return []

    // Drizzle types nullable columns as `string | null`; the rest of the
    // codebase (see service.ts#getById) normalises those to `undefined` so
    // they match `RegisteredWorker`.
    const rows: RegisteredWorker[] = rawRows.map(r => ({
      ...r,
      lastSeenAt: r.lastSeenAt ?? undefined,
      lastSeenState: r.lastSeenState ?? undefined,
      lastConfigVersion: r.lastConfigVersion ?? undefined,
    }))

    const timeoutMs = this.intervalMs > 0 ? Math.max(1_000, Math.floor(this.intervalMs / 2)) : 5_000
    const results: PollResult[] = Array.from({ length: rows.length })
    const tasks = rows.map((row, index) => async () => {
      results[index] = await this.pollWorker(row, timeoutMs)
    })
    await runWithConcurrency(tasks, this.concurrency)
    return results
  }

  private async pollWorker(row: RegisteredWorker, timeoutMs: number): Promise<PollResult> {
    const nowIso = this.now().toISOString()
    let state: RegisteredWorkerLivenessState
    let configVersion: number | undefined

    try {
      const token = decryptTokenFor(row, this.masterKeyHex)
      const client = this.buildClient(row.baseUrl, token, timeoutMs)
      const info = await client.info()
      if (info.workerId !== row.id) {
        // Should not happen: the worker at this baseUrl returned a different
        // id than the one we registered. Usually means the worker container
        // was re-bootstrapped (new worker.db) and the row now points at a
        // stranger. Operator has to decide between re-register or restore.
        consola.warn(`[registry/poll] workerId mismatch for ${row.id}: worker reports ${info.workerId}`)
        state = 'config-version-mismatch'
      }
      else {
        state = 'online'
        configVersion = info.configVersion
      }
    }
    catch (err) {
      if (err instanceof WorkerClientAuthError) {
        state = 'auth-failed'
      }
      else if (err instanceof WorkerClientNetworkError || err instanceof WorkerClientInvalidResponseError) {
        state = 'offline'
      }
      else {
        consola.error(`[registry/poll] unexpected error polling ${row.id}`, err)
        state = 'offline'
      }
    }

    this.persistResult(row, nowIso, state, configVersion)
    return configVersion !== undefined
      ? { id: row.id, state, configVersion }
      : { id: row.id, state }
  }

  private persistResult(
    row: RegisteredWorker,
    nowIso: string,
    state: RegisteredWorkerLivenessState,
    configVersion: number | undefined,
  ): void {
    const update: {
      lastSeenAt: string
      lastSeenState: RegisteredWorkerLivenessState
      lastConfigVersion?: number
    } = {
      lastSeenAt: nowIso,
      lastSeenState: state,
    }
    if (configVersion !== undefined)
      update.lastConfigVersion = configVersion

    this.db.update(registeredWorkers)
      .set(update)
      .where(eq(registeredWorkers.id, row.id))
      .run()

    if (row.lastSeenState !== state) {
      this.db.insert(auditEvents).values({
        actor: 'dashboard',
        action: 'worker.state-changed',
        workerId: row.id,
        detail: {
          from: row.lastSeenState ?? null,
          to: state,
          ...(configVersion !== undefined ? { configVersion } : {}),
        },
      }).run()
    }
  }
}

function defaultBuildClient(baseUrl: string, apiToken: string, timeoutMs: number): Pick<WorkerClient, 'info'> {
  return new WorkerClient({ baseUrl, apiToken, timeoutMs })
}

/**
 * Minimal concurrency limiter: drains `tasks` with at most `limit` running at
 * once. Each task is responsible for its own error handling — a rejection
 * here aborts the whole pass, which is why `pollWorker` never throws.
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> {
  if (tasks.length === 0)
    return
  const effective = Math.max(1, Math.min(limit, tasks.length))
  let cursor = 0
  const workers = Array.from({ length: effective }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++
      await tasks[index]!()
    }
  })
  await Promise.all(workers)
}
