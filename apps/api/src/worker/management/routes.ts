import type { WorkerConfig } from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'
import { OpenAPIHono } from '@hono/zod-openapi'
import consola from 'consola'
import { z } from 'zod'

import { workerEnv } from '../../config/worker'
import { getWorkerDb } from '../../db/worker'
import { AppError } from '../../shared'
import { getSecretsVault } from '../secrets'
import {
  ConfigVersionConflictError,
  InvalidConfigError,
  putConfig,
  readConfig,
} from './config'
import { buildInfo } from './info'
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

/**
 * Worker self-management router. Mounted at `/api/worker` in
 * `bootstrapWorkerApp`. Pure factory so tests can inject a synthetic state +
 * reload hook without touching the real DB singleton.
 */
export function buildManagementRoutes(deps: ManagementRoutesDeps) {
  // PLAN-004 2.3: Bearer auth middleware goes here.

  const routes = new OpenAPIHono()

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

  return routes
}
