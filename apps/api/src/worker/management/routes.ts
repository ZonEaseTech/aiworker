import type { WorkerConfig } from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'
import { getWorkerDb } from '@aiworker/storage-sqlite/worker'
import { OpenAPIHono } from '@hono/zod-openapi'
import consola from 'consola'

import { z } from 'zod'
import { workerEnv } from '../../config/worker'
import { AppError } from '../../shared'
import { getAvailabilityProbe } from '../executor/availability'
import { getSecretsVault } from '../secrets'
import { buildBearerAuth } from './bearer-auth'
import { handleBrainTest } from './brain-test'
import { handleChannelTest } from './channel-test'
import {
  ConfigVersionConflictError,
  InvalidConfigError,
  mirrorConfigToYaml,
  putConfig,
  readConfig,
} from './config'
import { handleExecutorTest } from './executor-test'
import { buildInfo } from './info'
import { handleTokenRotate } from './rotate'
import { deleteSecret, listSecrets, putSecret } from './secrets'

export interface ManagementRoutesDeps {
  getState: () => WorkerModeState
  /**
   * Hot-reload callback: rebuilds the runtime around the new stored config +
   * the vault, atomically swaps `state.runtime`, and bumps `state.configVersion`
   * to match the persisted row. Throwing here does NOT fail the PUT — the
   * caller reports `runtimeReload: 'failed'` so the operator can retry.
   */
  reloadRuntime: (nextStoredConfig: WorkerConfig, newVersion: number) => Promise<void>
}

const putSecretBody = z.object({ value: z.string().min(1) })

const executorTestBody = z.object({ probe: z.boolean().optional() }).optional()

const channelTestBody = z.object({
  chatId: z.string().optional(),
  text: z.string().optional(),
}).optional()

/**
 * `/cron` CRUD 共用的 channel 枚举校验——保持与 ChannelType 同步。
 * 与 toolPolicy / channels 各自的入口 schema 一样，写在 routes 层做最小防线。
 */
const cronChannelEnum = z.enum(['web', 'line', 'telegram', 'lark', 'whatsapp'])

const cronAddBody = z.object({
  expression: z.string().min(1),
  prompt: z.string().min(1),
  channel: cronChannelEnum,
  chatId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
})

const cronUpdateBody = z.object({
  expression: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  channel: cronChannelEnum.optional(),
  chatId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
}).refine(p => Object.keys(p).length > 0, { message: '至少提供一个待更新字段' })

/**
 * Worker self-management router. Mounted at `/api/worker` in
 * `bootstrapWorkerApp`. Pure factory so tests can inject a synthetic state +
 * reload hook without touching the real DB singleton.
 */
export function buildManagementRoutes(deps: ManagementRoutesDeps) {
  const routes = new OpenAPIHono()

  routes.use('*', buildBearerAuth({
    getIdentity: () => ({ tokenPlaintext: deps.getState().tokenPlaintext }),
  }))

  routes.get('/info', async (c) => {
    const state = deps.getState()
    const stored = await readConfig(getWorkerDb())
    const info = await buildInfo(state, stored.config, {
      ...(workerEnv.AIWORKER_ADVERTISED_BASE_URL === undefined
        ? {}
        : { advertisedBaseUrl: workerEnv.AIWORKER_ADVERTISED_BASE_URL }),
    })
    return c.json(info)
  })

  routes.get('/config', async (c) => {
    const stored = await readConfig(getWorkerDb())
    return c.json(stored)
  })

  routes.put('/config', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const ifMatch = c.req.header('If-Match')
    const ifMatchVersion = ifMatch === undefined ? undefined : Number.parseInt(ifMatch, 10)
    if (ifMatch !== undefined && Number.isNaN(ifMatchVersion)) {
      return c.json({
        error: { code: 'invalid-if-match', message: 'If-Match must be an integer' },
      }, 400)
    }

    try {
      const stored = await putConfig(getWorkerDb(), getSecretsVault(), raw, {
        ...(ifMatchVersion === undefined ? {} : { ifMatchVersion }),
      })

      await mirrorConfigToYaml(deps.getState().workerId, stored.config, stored.version)

      let runtimeReload: 'ok' | 'failed' = 'ok'
      try {
        await deps.reloadRuntime(stored.config, stored.version)
      }
      catch (err) {
        runtimeReload = 'failed'
        consola.error('[worker mgmt] runtime reload failed', err)
      }

      return c.json({ ...stored, runtimeReload })
    }
    catch (err) {
      if (err instanceof InvalidConfigError) {
        return c.json({
          error: {
            code: 'invalid-config',
            message: err.message,
            details: err.issues,
          },
        }, 400)
      }
      if (err instanceof ConfigVersionConflictError) {
        return c.json({
          error: {
            code: 'version-conflict',
            message: err.message,
            expected: err.expected,
            actual: err.actual,
          },
        }, 409)
      }
      throw err
    }
  })

  routes.get('/secrets', async (c) => {
    const keys = await listSecrets(getSecretsVault())
    return c.json({ keys })
  })

  routes.put('/secrets/:key', async (c) => {
    const key = c.req.param('key')
    const raw = await c.req.json().catch(() => null)
    const parsed = putSecretBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid secret body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      await putSecret(getSecretsVault(), key, parsed.data.value)
      return c.json({ ok: true }, 200)
    }
    catch (err) {
      if (err instanceof AppError) {
        return c.json(err.toJSON(), err.status as 400)
      }
      throw err
    }
  })

  routes.delete('/secrets/:key', async (c) => {
    const key = c.req.param('key')
    try {
      await deleteSecret(getSecretsVault(), key)
      return c.json({ ok: true }, 200)
    }
    catch (err) {
      if (err instanceof AppError) {
        return c.json(err.toJSON(), err.status as 400)
      }
      throw err
    }
  })

  routes.post('/brain/test', async (c) => {
    const state = deps.getState()
    const stored = await readConfig(getWorkerDb())
    const result = await handleBrainTest(state, stored.config)
    return c.json(result)
  })

  routes.post('/executor/test', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = executorTestBody.safeParse(raw ?? {})
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: 'invalid executor test body' },
      }, 400)
    }
    const state = deps.getState()
    const stored = await readConfig(getWorkerDb())
    const result = await handleExecutorTest(state, stored.config, parsed.data ?? {})
    return c.json(result)
  })

  routes.post('/channels/:channel/test', async (c) => {
    const channel = c.req.param('channel')
    const raw = await c.req.json().catch(() => null)
    const parsed = channelTestBody.safeParse(raw ?? {})
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: 'invalid channel test body' },
      }, 400)
    }
    try {
      const state = deps.getState()
      const result = await handleChannelTest(state, channel, parsed.data ?? {})
      return c.json(result)
    }
    catch (err) {
      if (err instanceof AppError) {
        return c.json(err.toJSON(), err.status as 400)
      }
      throw err
    }
  })

  routes.post('/token/rotate', async (c) => {
    const state = deps.getState()
    const result = await handleTokenRotate(getWorkerDb(), getSecretsVault(), state)
    return c.json(result)
  })

  routes.post('/reload', async (c) => {
    const stored = await readConfig(getWorkerDb())
    try {
      await deps.reloadRuntime(stored.config, stored.version)
      return c.json({ ok: true, version: stored.version })
    }
    catch (err) {
      consola.error('[worker mgmt] forced reload failed', err)
      return c.json({
        ok: false,
        version: stored.version,
        error: (err as Error).message ?? String(err),
      }, 500)
    }
  })

  /**
   * FEAT-015: 暴露当前 ProcessManager 的容量快照。`getState().runtime.processes`
   * 是 hot-reload-safe 的闭包查询——ProcessManager 跨 reload 持久化，所以
   * 实际拿到的是 bootstrap 时 new 的同一个实例。
   */
  routes.get('/runtime/processes/capacity', (c) => {
    const snap = deps.getState().runtime.processes.snapshot()
    return c.json(snap)
  })

  /**
   * FEAT-018: 引擎可达性探测。返回每个 EngineKind 的 PATH + auth 文件命中情况，
   * acp 展开为 gemini / qwen 两条记录。`?refresh=1` 绕过 10 分钟 in-memory 缓存，
   * 便于操作员刚登录 CLI 后立即重查。结果不落 worker.db。
   */
  routes.get('/engines', async (c) => {
    const refresh = c.req.query('refresh') === '1'
    const engines = await getAvailabilityProbe().probeAll({ refresh })
    return c.json({ engines })
  })

  // PLAN-014 §F4：cron CRUD。所有 /cron* 路由都通过 `deps.getState().runtime.cron`
  // 取当前 runtime 上的 CronService 实例，遵循 hot-reload 不变量。
  routes.get('/cron', async (c) => {
    const jobs = await deps.getState().runtime.cron.listJobs()
    return c.json({ jobs })
  })

  routes.post('/cron', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = cronAddBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: 'invalid cron job body', details: parsed.error.flatten().fieldErrors },
      }, 400)
    }
    try {
      const job = await deps.getState().runtime.cron.addJob(parsed.data)
      return c.json({ job }, 201)
    }
    catch (err) {
      // cron-parser 错误统一转 400——非法 expression 或空 accountId 都是输入侧问题。
      return c.json({
        error: { code: 'invalid-cron', message: err instanceof Error ? err.message : String(err) },
      }, 400)
    }
  })

  routes.patch('/cron/:id', async (c) => {
    const id = c.req.param('id')
    const raw = await c.req.json().catch(() => null)
    const parsed = cronUpdateBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: 'invalid cron patch body', details: parsed.error.flatten().fieldErrors },
      }, 400)
    }
    try {
      const job = await deps.getState().runtime.cron.updateJob(id, parsed.data)
      if (!job)
        return c.json({ error: { code: 'not-found', message: `cron job ${id} 不存在` } }, 404)
      return c.json({ job })
    }
    catch (err) {
      return c.json({
        error: { code: 'invalid-cron', message: err instanceof Error ? err.message : String(err) },
      }, 400)
    }
  })

  routes.delete('/cron/:id', async (c) => {
    const id = c.req.param('id')
    const result = await deps.getState().runtime.cron.removeJob(id)
    if (!result.removed)
      return c.json({ error: { code: 'not-found', message: `cron job ${id} 不存在` } }, 404)
    return c.json({ ok: true })
  })

  return routes
}
