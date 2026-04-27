import type { ChannelType } from '@zonease/aiworker-shared'

/**
 * Cron 调度记录的对外只读视图。返回给 management / gateway / CLI。
 * `lastRunAt` / `nextRunAt` 都是 ISO 8601 字符串；`nextRunAt` 为 null 表示
 * 当前 `enabled=false`（disabled 不参与 tick 扫描）。
 */
export interface CronJobRecord {
  id: string
  expression: string
  prompt: string
  channel: ChannelType
  chatId: string
  accountId: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CronJobInput {
  expression: string
  prompt: string
  channel: ChannelType
  chatId: string
  /** 不填则默认 `sys:cron`；与 web binding.id 形成命名空间隔离。 */
  accountId?: string
  /** 不填则默认 true。 */
  enabled?: boolean
}

export interface CronJobPatch {
  expression?: string
  prompt?: string
  channel?: ChannelType
  chatId?: string
  accountId?: string
  enabled?: boolean
}
