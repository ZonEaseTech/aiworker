import type { GatewayNode, GatewayNodeEnrollOptions } from '@aiworker/core'
import process from 'node:process'

import { bootstrapWorkerApp } from '@aiworker/api/bootstrap'
import {
  applyConfigUpdate,
  buildCronHandlers,
  getSecretsVault,
  handleTokenRotate,
  readConfig,
  startGatewayNode,
  workerEnv,
} from '@aiworker/core'
import { getWorkerDb } from '@aiworker/storage-sqlite/worker'
import consola from 'consola'

export interface ServeOptions {
  port?: number
  /** gateway WS URL；留空则不启动 gateway-client（保持纯 HTTP 兼容形态）。 */
  gateway?: string
  /** gateway 下发的 node bearer token；loopback 场景可留空字符串。 */
  gatewayToken?: string
  /** 显式禁用重连（方便 E2E / smoke）。默认启用。 */
  gatewayReconnect?: boolean
}

/**
 * `aiw serve` — boot the existing worker HTTP surface. Behaviour is
 * bit-for-bit compatible with `AIWORKER_MODE=worker bun src/index.ts`:
 * same bootstrap, same routes, same hot-reload contract. Intended for
 * production parity; use `aiw run` for CLI-only (no HTTP) workflows.
 *
 * PLAN-013 S4：当 `--gateway` 传入时，在 HTTP server 之外再起一条 gateway
 * WS 连接，把 node 模式能力（chat.send / config.get / token.rotate）接入。
 * 两条路径独立，SIGTERM 时都做优雅关闭。
 */
export async function runServe(options: ServeOptions = {}): Promise<void> {
  // gatewayNode 在 bootstrap 之后才能 start（要拿到 state.workerId / reloadRuntime），
  // 但 bootstrap 自己又需要在 reloadRuntime 完成 swap 后回调 gatewayNode 让 subscriber
  // 重新挂到新 bus——chicken-and-egg。先建可变 ref，bootstrap 闭包里读这个 ref，
  // 真正的 GatewayNode 实例 startGatewayNode() 之后再写入。
  let gatewayNode: GatewayNode | null = null
  const { app, port: envPort, state, reloadRuntime } = await bootstrapWorkerApp({
    onRuntimeReloaded: () => gatewayNode?.notifyRuntimeReloaded(),
  })
  const port = options.port ?? envPort

  const server = Bun.serve({ port, fetch: app.fetch })
  consola.success(`[aiw serve] worker ${state.workerId} listening on :${port} (config v${state.configVersion})`)

  // PLAN-018 / FEAT-024 worker self-enrollment：env 三件套触发。
  // 触发表（与 plan 一致）：
  //   --gateway 显式 flag                     → 走老路径（operator-pull 后 token 已下发）
  //   AIWORKER_GATEWAY_URL + AIWORKER_JOIN_TOKEN → 走 enroll 路径（带 enroll 块）
  //   只有 AIWORKER_JOIN_TOKEN 没 URL          → warn 后跳过（既不 enroll 也不开 gateway-client）
  //   只有 AIWORKER_GATEWAY_URL 没 JOIN_TOKEN  → 当前不自动起（与 PLAN-018 §Worker-side 一致）
  // 老 flag 与新 env 同时给时，--gateway 优先（运维显式覆盖）。
  const envGatewayUrl = workerEnv.AIWORKER_GATEWAY_URL
  const envJoinToken = workerEnv.AIWORKER_JOIN_TOKEN
  const envDisplayName = workerEnv.AIWORKER_DISPLAY_NAME
  const flagGatewayUrl = options.gateway && options.gateway.length > 0 ? options.gateway : undefined

  let gatewayUrl: string | undefined
  let enroll: GatewayNodeEnrollOptions | undefined
  if (flagGatewayUrl) {
    gatewayUrl = flagGatewayUrl
  }
  else if (envJoinToken && envJoinToken.length > 0 && envGatewayUrl && envGatewayUrl.length > 0) {
    gatewayUrl = envGatewayUrl
    enroll = {
      joinToken: envJoinToken,
      apiToken: state.tokenPlaintext,
      ...(envDisplayName ? { displayName: envDisplayName } : {}),
    }
  }
  else if (envJoinToken && envJoinToken.length > 0) {
    consola.warn('[aiw serve] AIWORKER_JOIN_TOKEN set but AIWORKER_GATEWAY_URL missing; skipping self-enroll')
  }

  if (gatewayUrl) {
    if (enroll)
      consola.info(`[aiw serve] self-enrolling to ${gatewayUrl} as ${enroll.displayName ?? state.workerId}`)
    gatewayNode = startGatewayNode({
      url: gatewayUrl,
      token: options.gatewayToken ?? '',
      workerId: state.workerId,
      ...(options.gatewayReconnect === false ? { reconnect: false } : {}),
      ...(enroll ? { enroll } : {}),
      getRuntime: () => state.runtime,
      handlers: {
        configGet: async () => {
          const stored = await readConfig(getWorkerDb())
          return { version: stored.version, config: stored.config }
        },
        // 与 HTTP `PUT /api/worker/config` 共享 applyConfigUpdate；
        // InvalidConfig / VersionConflict 会从 putConfig 冒上来，由 dispatcher
        // 转成 invalid_config / version_conflict wire code，避免吞成 internal_error。
        configPut: async ({ ifMatch, config }) => {
          const result = await applyConfigUpdate({
            db: getWorkerDb(),
            vault: getSecretsVault(),
            raw: config,
            ifMatchVersion: ifMatch,
            workerId: state.workerId,
            reloadRuntime,
          })
          return { version: result.version, appliedAt: Date.now(), runtimeReload: result.runtimeReload }
        },
        tokenRotate: async () => {
          const { newToken } = await handleTokenRotate(getWorkerDb(), getSecretsVault(), state)
          return { deviceToken: newToken }
        },
        // 懒取 cron service：runtime hot-reload 后取的就是新 runtime 上的实例。
        ...buildCronHandlers(() => state.runtime.cron),
      },
    })
    consola.success(`[aiw serve] gateway-client dialing ${gatewayUrl}`)
  }

  // SIGTERM / SIGINT：同时优雅关 HTTP server 与 gateway-client，最长等 5s。
  const shutdown = async (signal: string) => {
    consola.info(`[aiw serve] received ${signal}, shutting down`)
    try {
      if (gatewayNode) {
        await gatewayNode.stop()
        gatewayNode = null
      }
    }
    catch (err) {
      consola.warn(`[aiw serve] gateway shutdown failed: ${String(err)}`)
    }
    try {
      server.stop()
    }
    catch (err) {
      consola.warn(`[aiw serve] http shutdown failed: ${String(err)}`)
    }
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}
