import type { ChannelType } from '@aiworker/shared'

import consola from 'consola'

import { loadWorkerContext } from '../context'

const VALID_CHANNELS: ChannelType[] = ['web', 'line', 'telegram', 'lark', 'whatsapp']

function parseChannel(value: string): ChannelType {
  if (!(VALID_CHANNELS as string[]).includes(value))
    throw new Error(`无效 channel "${value}"，可选值：${VALID_CHANNELS.join(', ')}`)
  return value as ChannelType
}

/**
 * aiw schedule 系列命令直接调用 in-process CronService（短命进程：boot →
 * 调用 → 退出），不经 HTTP；与 `aiw config-show` / `aiw config-set` 一致的
 * 模式：复用 worker bootstrap，但不绑 server，避免运维端起两个 server。
 */
async function withCron<T>(fn: (cron: import('@aiworker/api/lib').CronService) => Promise<T>): Promise<T> {
  await loadWorkerContext({ silent: true })
  const { CronService } = await import('@aiworker/api/lib')
  // CronService 不依赖 orchestrator——CRUD 都不会触发 ingest。这里给一个抛错的
  // stub，确保万一谁调了 tick() 也能 fail-fast 而不是默默吞掉。
  const cron = new CronService({
    workerId: 'aiw-cli',
    getOrchestrator: () => ({
      ingest: async () => {
        throw new Error('aiw schedule CLI 不应触发 cron tick；请检查实现')
      },
    }),
  })
  try {
    return await fn(cron)
  }
  finally {
    cron.stop()
  }
}

export async function runScheduleList(): Promise<number> {
  try {
    const jobs = await withCron(async cron => cron.listJobs())
    console.log(JSON.stringify({ jobs }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiw schedule list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface ScheduleAddOptions {
  expression: string
  prompt: string
  channel: string
  chatId: string
  accountId?: string
  enabled?: boolean
}

export async function runScheduleAdd(opts: ScheduleAddOptions): Promise<number> {
  try {
    const channel = parseChannel(opts.channel)
    const job = await withCron(async cron => cron.addJob({
      expression: opts.expression,
      prompt: opts.prompt,
      channel,
      chatId: opts.chatId,
      ...(opts.accountId === undefined ? {} : { accountId: opts.accountId }),
      ...(opts.enabled === undefined ? {} : { enabled: opts.enabled }),
    }))
    console.log(JSON.stringify({ job }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiw schedule add] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runScheduleRemove(jobId: string): Promise<number> {
  try {
    const result = await withCron(async cron => cron.removeJob(jobId))
    console.log(JSON.stringify(result, null, 2))
    return result.removed ? 0 : 1
  }
  catch (err) {
    consola.error(`[aiw schedule remove] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
