import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { WorkerContext } from '../../context'

import { BrainCaseService, BrainInboxService } from '@zonease/aiworker-core'
import consola from 'consola'

import { buildRuntime, loadWorkerContext } from '../../context'

export interface CaseListOptions {
  limit?: number
}

export interface CaseShowOptions {
  showSensitive?: boolean
}

export interface CaseRerunOptions {
  prompt?: string
}

export interface LessonsProposeOptions {
  scopeId?: string
  soulId?: string
}

export type ReviewPromoteOptions = LessonsProposeOptions

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

export async function runCaseList(options: CaseListOptions = {}): Promise<number> {
  try {
    return await withWorkerContext(async (ctx) => {
      const cases = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).listCases({ limit: options.limit })
      console.log(JSON.stringify({ workerId: ctx.workerId, cases }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker case list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runReviewList(options: CaseListOptions = {}): Promise<number> {
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

export async function runCaseShow(taskId: string, options: CaseShowOptions = {}): Promise<number> {
  if (taskId === undefined || taskId.trim().length === 0) {
    consola.error('[aiworker case show] task id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const file = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).getCaseFile(taskId, { redactSensitive: options.showSensitive !== true })
      if (file === null) {
        consola.error(`[aiworker case show] case not found: ${taskId}`)
        return 1
      }
      console.log(JSON.stringify({ workerId: ctx.workerId, case: file }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker case show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runReviewShow(taskId: string, options: CaseShowOptions = {}): Promise<number> {
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

export async function runCaseRerun(taskId: string, options: CaseRerunOptions = {}): Promise<number> {
  if (taskId === undefined || taskId.trim().length === 0) {
    consola.error('[aiworker case rerun] task id is required')
    return 2
  }
  try {
    return await withRuntime(async (ctx, runtime) => {
      const task = await runtime.orchestrator.rerunTask(taskId, {
        ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
      })
      const file = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).getCaseFile(task.id)
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        task,
        ...(file === null ? {} : { case: file }),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker case rerun] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runReviewRerun(taskId: string, options: CaseRerunOptions = {}): Promise<number> {
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

export async function runLessonsPropose(taskId: string, options: LessonsProposeOptions = {}): Promise<number> {
  if (taskId === undefined || taskId.trim().length === 0) {
    consola.error('[aiworker lessons propose] task id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const result = new BrainInboxService().proposeFromTask(taskId, {
        ...(options.scopeId === undefined ? {} : { scopeId: options.scopeId }),
        ...(options.soulId === undefined ? {} : { soulId: options.soulId }),
      })
      const file = new BrainCaseService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).getCaseFile(taskId)
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        ...result,
        ...(file === null ? {} : { case: file }),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker lessons propose] failed: ${err instanceof Error ? err.message : String(err)}`)
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
