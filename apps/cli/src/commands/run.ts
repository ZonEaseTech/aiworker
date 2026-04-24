import type { Envelope } from '@aiworker/shared'

import consola from 'consola'

import { buildRuntime, loadWorkerContext } from '../context'

export interface RunOptions {
  /** User message text to feed into the orchestrator. */
  message?: string
  /** Optional chat identifier; defaults to a single synthetic CLI chat. */
  chatId?: string
  /** Skip actually running — just boot, print diagnostics, exit. */
  dryRun?: boolean
  /** Hard ceiling on wait time for terminal events; exits with non-zero on timeout. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 120_000

/**
 * `aiw run` — load the worker runtime, synthesise a single `web` envelope
 * from the user-provided message, stream every event to stdout, and exit
 * once the orchestrator reaches a terminal state (task succeeded / failed /
 * cancelled). No HTTP endpoint is bound at any point.
 *
 * This is the phase-1 success demo for PLAN-011: the conversation loop must
 * be able to run in-process without any transport layer.
 */
export async function runRun(options: RunOptions = {}): Promise<number> {
  const message = options.message ?? ''
  if (!message) {
    consola.error('[aiw run] --message is required (non-empty)')
    return 2
  }

  const ctx = await loadWorkerContext()
  const runtime = buildRuntime(ctx)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  consola.info(`[aiw run] worker ${ctx.workerId} (config v${ctx.configVersion}) — engine=${ctx.hydrated.executor.engine}/${ctx.hydrated.executor.variant}`)

  if (options.dryRun) {
    consola.success('[aiw run] --dry-run: runtime constructed, no envelope ingested')
    runtime.dispose()
    return 0
  }

  const chatId = options.chatId ?? 'cli:stdin'
  const envelope: Envelope = {
    workerId: ctx.workerId,
    channel: 'web',
    chatId,
    text: message,
    receivedAt: new Date().toISOString(),
    raw: { source: 'aiw-cli' },
  }

  const terminalPromise = new Promise<number>((resolve) => {
    let unsubscribe: (() => void) | null = null
    const timer = setTimeout(() => {
      consola.error(`[aiw run] timed out after ${timeoutMs}ms without reaching a terminal state`)
      unsubscribe?.()
      resolve(124)
    }, timeoutMs)

    unsubscribe = runtime.bus.on((event) => {
      console.log(JSON.stringify({ type: event.type, at: event.at, payload: event.payload }))
      if (
        event.type === 'orchestrator.task.succeeded'
        || event.type === 'orchestrator.task.failed'
        || event.type === 'orchestrator.task.cancelled'
      ) {
        clearTimeout(timer)
        unsubscribe?.()
        resolve(event.type === 'orchestrator.task.succeeded' ? 0 : 1)
      }
    })
  })

  try {
    await runtime.orchestrator.ingest(envelope)
  }
  catch (err) {
    consola.error(`[aiw run] ingest failed: ${String(err)}`)
    runtime.dispose()
    return 1
  }

  const code = await terminalPromise
  runtime.dispose()
  return code
}
