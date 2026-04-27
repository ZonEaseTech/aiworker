import type { Envelope } from '@zonease/aiworker-shared'

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  closeWorkerDb,
  cronJobs,
  getWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
} from '@zonease/aiworker-storage-sqlite/worker'

import { beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'

import { CronService } from './service'

interface CapturedIngest {
  envelopes: Envelope[]
  ingest: (envelope: Envelope) => Promise<void>
}

function makeOrchestrator(): CapturedIngest {
  const envelopes: Envelope[] = []
  return {
    envelopes,
    ingest: async (envelope: Envelope) => {
      envelopes.push(envelope)
    },
  }
}

function newCronService(workerId = 'worker-test') {
  const orchestrator = makeOrchestrator()
  const service = new CronService({
    workerId,
    getOrchestrator: () => orchestrator,
  })
  return { service, orchestrator }
}

describe('CronService', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-cron-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  it('addJob 校验合法 expression 并默认填 sys:cron / enabled=true', async () => {
    const { service } = newCronService()
    const job = await service.addJob({
      expression: '*/5 * * * *',
      prompt: 'every 5 minutes',
      channel: 'web',
      chatId: 'cron-chat-1',
    })
    expect(job.id).toBeTruthy()
    expect(job.accountId).toBe('sys:cron')
    expect(job.enabled).toBe(true)
    expect(job.lastRunAt).toBeNull()
    expect(job.nextRunAt).not.toBeNull()
  })

  it('addJob 非法 expression 直接抛错且不写入 DB', async () => {
    const { service } = newCronService()
    await expect(service.addJob({
      expression: 'this is not a cron',
      prompt: 'should fail',
      channel: 'web',
      chatId: 'cron-chat-2',
    })).rejects.toBeDefined()
    const all = await service.listJobs()
    expect(all).toHaveLength(0)
  })

  it('tick 把到期 job 合成 envelope 并算下一次 nextRunAt', async () => {
    const { service, orchestrator } = newCronService('worker-tick')
    const job = await service.addJob({
      expression: '* * * * *',
      prompt: 'tick prompt',
      channel: 'web',
      chatId: 'cron-chat-3',
    })

    // 把 nextRunAt 手动设到很远以前，模拟到期场景。
    const past = new Date('2020-01-01T00:00:00.000Z').toISOString()
    getWorkerDb().update(cronJobs).set({ nextRunAt: past }).where(eq(cronJobs.id, job.id)).run()

    const fireAt = new Date('2026-04-25T12:00:00.000Z')
    await service.tick(fireAt)

    expect(orchestrator.envelopes).toHaveLength(1)
    const env = orchestrator.envelopes[0]!
    expect(env.workerId).toBe('worker-tick')
    expect(env.channel).toBe('web')
    expect(env.chatId).toBe('cron-chat-3')
    expect(env.accountId).toBe('sys:cron')
    expect(env.text).toBe('tick prompt')
    expect((env.raw as { source: string }).source).toBe('cron')
    expect((env.raw as { jobId: string }).jobId).toBe(job.id)
    expect(env.receivedAt).toBe(fireAt.toISOString())

    const persisted = await service.getJob(job.id)
    expect(persisted?.lastRunAt).toBe(fireAt.toISOString())
    // nextRunAt 必须严格晚于 fireAt（cron-parser next() 永远向前找）。
    expect(persisted?.nextRunAt).not.toBeNull()
    expect(new Date(persisted!.nextRunAt!).getTime()).toBeGreaterThan(fireAt.getTime())
  })

  it('disabled 的 job 不会被 tick fire', async () => {
    const { service, orchestrator } = newCronService()
    const job = await service.addJob({
      expression: '* * * * *',
      prompt: 'should not fire',
      channel: 'web',
      chatId: 'cron-chat-4',
      enabled: false,
    })
    expect(job.nextRunAt).toBeNull()

    // 即使强行把 nextRunAt 改到过去，enabled=false 依然不会被 tick 选中。
    const past = new Date('2020-01-01T00:00:00.000Z').toISOString()
    getWorkerDb().update(cronJobs).set({ nextRunAt: past }).where(eq(cronJobs.id, job.id)).run()

    await service.tick(new Date('2026-04-25T12:00:00.000Z'))
    expect(orchestrator.envelopes).toHaveLength(0)
  })

  it('stop() 停掉 setInterval；再调 stop 幂等', async () => {
    const { service } = newCronService()
    service.start(50_000)
    service.stop()
    // 重复 stop 不抛错。
    service.stop()
    // 重新 start 应当能再起来（handle 已被清空）。
    service.start(50_000)
    service.stop()
  })

  it('updateJob 改 expression 时重算 nextRunAt；空 accountId 抛错', async () => {
    const { service } = newCronService()
    const job = await service.addJob({
      expression: '*/10 * * * *',
      prompt: 'p',
      channel: 'web',
      chatId: 'cron-chat-5',
    })
    const before = job.nextRunAt
    const updated = await service.updateJob(job.id, { expression: '0 0 * * *' })
    expect(updated?.expression).toBe('0 0 * * *')
    expect(updated?.nextRunAt).not.toBe(before)

    await expect(service.updateJob(job.id, { accountId: '' })).rejects.toBeDefined()
  })

  it('removeJob 删除存在的 job 并返回 removed=true；不存在返回 false', async () => {
    const { service } = newCronService()
    const job = await service.addJob({
      expression: '*/15 * * * *',
      prompt: 'rm me',
      channel: 'web',
      chatId: 'cron-chat-6',
    })
    expect((await service.removeJob(job.id)).removed).toBe(true)
    expect((await service.removeJob(job.id)).removed).toBe(false)
    expect(await service.listJobs()).toHaveLength(0)
  })
})
