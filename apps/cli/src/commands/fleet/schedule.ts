import type { ChannelType } from '@zonease/aiworker-shared'

import consola from 'consola'

import { errorToExitCode, printJson, withSession } from './common'

const VALID_CHANNELS: ChannelType[] = ['web', 'line', 'telegram', 'lark', 'whatsapp']

function parseChannel(value: string): ChannelType {
  if (!(VALID_CHANNELS as string[]).includes(value))
    throw new Error(`无效 channel "${value}"，可选值：${VALID_CHANNELS.join(', ')}`)
  return value as ChannelType
}

/** `aiworker fleet schedule list <workerId>` — 列出某 worker 上所有 cron 任务。 */
export async function runScheduleList(workerId: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('cron.list', { workerId })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`fleet schedule list 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

export interface ScheduleAddOptions {
  workerId: string
  expression: string
  prompt: string
  channel: string
  chatId: string
  accountId?: string
  enabled?: boolean
}

/** `aiworker fleet schedule add <workerId> --expression ... --prompt ... --channel ... --chat-id ...` */
export async function runScheduleAdd(opts: ScheduleAddOptions): Promise<number> {
  try {
    const channel = parseChannel(opts.channel)
    const job: {
      expression: string
      prompt: string
      channel: ChannelType
      chatId: string
      accountId?: string
      enabled?: boolean
    } = {
      expression: opts.expression,
      prompt: opts.prompt,
      channel,
      chatId: opts.chatId,
    }
    if (opts.accountId !== undefined)
      job.accountId = opts.accountId
    if (opts.enabled !== undefined)
      job.enabled = opts.enabled

    const res = await withSession(async ({ client }) => {
      return await client.request('cron.add', { workerId: opts.workerId, job })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`fleet schedule add 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

/** `aiworker fleet schedule remove <workerId> <jobId>` */
export async function runScheduleRemove(workerId: string, jobId: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('cron.remove', { workerId, jobId })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`fleet schedule remove 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
