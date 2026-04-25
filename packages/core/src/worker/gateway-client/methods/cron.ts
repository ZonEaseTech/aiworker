import type { ChannelType } from '@aiworker/shared'
import type { CronJobInput, CronJobPatch, CronJobRecord } from '../../cron/types'
import type { NodeHandlers } from '../dispatcher'

/**
 * CronService 子集——给 gateway-client handler 用。
 * 保留对 `apps/api/src/worker/cron/service.ts::CronService` 的方法签名宽限：
 * 只要实例上有这五个方法，就可以挂上 gateway。
 */
export interface CronServiceLike {
  listJobs: () => Promise<CronJobRecord[]>
  addJob: (input: CronJobInput) => Promise<CronJobRecord>
  removeJob: (id: string) => Promise<{ removed: boolean }>
  updateJob: (id: string, patch: CronJobPatch) => Promise<CronJobRecord | null>
}

/**
 * 构造 cron 相关的 NodeHandlers。getCron 必须懒取（typically `() => state.runtime.cron`），
 * 与 dispatcher 自身 `getRuntime` 的 hot-reload 友好语义一致。
 */
export function buildCronHandlers(getCron: () => CronServiceLike): Pick<NodeHandlers, 'cronList' | 'cronAdd' | 'cronRemove' | 'cronUpdate'> {
  return {
    cronList: async () => {
      const jobs = await getCron().listJobs()
      return { jobs }
    },
    cronAdd: async (input: { job: { expression: string, prompt: string, channel: ChannelType, chatId: string, accountId?: string, enabled?: boolean } }) => {
      const job = await getCron().addJob(input.job)
      return { job }
    },
    cronRemove: async (input: { jobId: string }) => {
      return await getCron().removeJob(input.jobId)
    },
    cronUpdate: async (input: { jobId: string, patch: { expression?: string, prompt?: string, channel?: ChannelType, chatId?: string, accountId?: string, enabled?: boolean } }) => {
      const job = await getCron().updateJob(input.jobId, input.patch)
      if (!job)
        throw new CronJobNotFoundError(input.jobId)
      return { job }
    },
  }
}

/**
 * cron.update 找不到 jobId 时抛出，dispatcher 把它转成 ok=false 响应。
 * 单独抽出来方便 dispatcher 用 `instanceof` 识别——比正则匹配 message 更稳。
 */
export class CronJobNotFoundError extends Error {
  constructor(public readonly jobId: string) {
    super(`cron job ${jobId} 不存在`)
    this.name = 'CronJobNotFoundError'
  }
}
