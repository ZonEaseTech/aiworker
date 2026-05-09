import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { WorkerContext } from '../../context'

import { BrainCaseService, BrainInboxService } from '@zonease/aiworker-core'
import consola from 'consola'

import { buildRuntime, loadWorkerContext } from '../../context'

export interface ReviewListOptions {
  limit?: number
}

export interface ReviewShowOptions {
  showSensitive?: boolean
}

export interface ReviewRerunOptions {
  prompt?: string
}

export interface ReviewPromoteOptions {
  scopeId?: string
  soulId?: string
}

async function withWorkerContext<T>(fn: (ctx: WorkerContext) => Promise<T>): Promise<T> {
  const ctx = await loadWorkerContext({ silent: true })
  return await fn(ctx)
}

async function withRuntime<T>(fn: (ctx: WorkerContext, runtime: WorkerRuntime) => Promise<T>): Promise<T> {
  const ctx = await loadWorkerContext({ silent: true })
  const runtime = buildRuntime(ctx)
  try {
    return await fn(ctx, runtime)
  }
  finally {
    runtime.dispose()
  }
}

export async function runReviewList(options: ReviewListOptions = {}): Promise<number> {
  try {
    return await withWorkerContext(async (ctx) => {
      const reviews = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).listCases({ limit: options.limit })
      console.log(JSON.stringify({ workerId: ctx.workerId, reviews }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker review list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runReviewShow(taskId: string, options: ReviewShowOptions = {}): Promise<number> {
  if (taskId === undefined || taskId.trim().length === 0) {
    consola.error('[aiworker review show] task id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const review = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).getCaseFile(taskId, { redactSensitive: options.showSensitive !== true })
      if (review === null) {
        consola.error(`[aiworker review show] review not found: ${taskId}`)
        return 1
      }
      console.log(JSON.stringify({ workerId: ctx.workerId, review }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker review show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runReviewRerun(taskId: string, options: ReviewRerunOptions = {}): Promise<number> {
  if (taskId === undefined || taskId.trim().length === 0) {
    consola.error('[aiworker review rerun] task id is required')
    return 2
  }
  try {
    return await withRuntime(async (ctx, runtime) => {
      const run = await runtime.orchestrator.rerunTask(taskId, {
        ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
      })
      const review = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).getCaseFile(run.id)
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        run,
        ...(review === null ? {} : { review }),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker review rerun] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runReviewPromoteLessons(taskId: string, options: ReviewPromoteOptions = {}): Promise<number> {
  if (taskId === undefined || taskId.trim().length === 0) {
    consola.error('[aiworker review promote] task id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const promotion = new BrainInboxService().proposeFromTask(taskId, {
        ...(options.scopeId === undefined ? {} : { scopeId: options.scopeId }),
        ...(options.soulId === undefined ? {} : { soulId: options.soulId }),
      })
      const review = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).getCaseFile(taskId)
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        promotion,
        ...(review === null ? {} : { review }),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker review promote] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
