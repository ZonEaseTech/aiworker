#!/usr/bin/env bun
import type { GatewayConfig } from './config'
import type { GatewayContext } from './router/context'
import type { StartedGateway } from './server'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { encodeFrame, EVENTS } from '@zonease/aiworker-gateway-proto'
import {
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  runFleetMigrations,
} from '@zonease/aiworker-storage-sqlite/fleet'
import consola from 'consola'
import { loadGatewayConfigFromEnv } from './config'
import { broadcastEventToOperators } from './events/broadcast'
import { ConnectRateLimiter, ForwardTable, NodeRegistry, OperatorRegistry, PendingEnrollmentRegistry } from './registry'
import { FleetPersistence } from './registry/persistence'
import { startGatewayServer } from './server'
import { FleetSupervisor } from './supervisor/service'

export interface CreateGatewayContextOptions {
  /**
   * PLAN-022 / FEAT-033：fleet bundle 静态根目录绝对路径。CLI 决议（npm
   * install 或源码 dev），未传则 `/admin/*` 一律 404 但不阻塞启动。
   */
  webStaticDir?: string
  /** FEAT-040：worker bundle 静态根，挂到 `/w/:workerId/*`。 */
  workerWebStaticDir?: string
}

/**
 * 构造一份可复用的 GatewayContext。
 *
 * - `fleet.db` 由 `initFleetDb` + `runFleetMigrations` 保证 schema 就绪;
 *   gateway 持有 master key,负责 pair/rotate 时的 AES 加解密。
 * - registry 三件套(nodes / operators / forwards)全内存、进程重启丢失。
 * - 当 `canLaunch=true` 时额外构造 `FleetSupervisor`——docker 能力按需开启。
 */
export function createGatewayContext(
  config: GatewayConfig,
  options: CreateGatewayContextOptions = {},
): GatewayContext {
  initFleetDb(config.fleetDbPath)
  runFleetMigrations(defaultFleetMigrationsFolder)
  const db = getFleetDb()
  const persistence = new FleetPersistence(db)
  const nodes = new NodeRegistry()
  const operators = new OperatorRegistry()
  const forwards = new ForwardTable({
    onExpire: (entry, reason) => {
      consola.warn(
        `[gateway] forward 取消 (method=${entry.method} workerId=${entry.workerId} reason=${reason})`,
      )
      // operator 已经断开——没有可送达的对端,静默清理即可。
      if (reason === 'operator_gone')
        return
      // node 下线 / 超时:补一条错误响应给 operator,避免 aim CLI 永久挂起。
      const code = reason === 'timeout' ? 'forward_timeout' : 'node_gone'
      const message = reason === 'timeout'
        ? `等待 worker ${entry.workerId} 响应超时`
        : `worker ${entry.workerId} 在等待响应期间下线`
      try {
        entry.operatorWs.send(encodeFrame({
          type: 'response',
          id: entry.operatorRequestId,
          ok: false,
          error: { code, message, details: { workerId: entry.workerId, method: entry.method } },
        }))
      }
      catch { /* operator 也已经断开——忽略。 */ }
    },
  })

  // PLAN-019：OTP-attended enrollment 待批队列。过期回调在这里就地写
  // gateway.enrollment.expired audit + 关 ws,handler 层只读不写 audit。
  const pendingEnrollments = new PendingEnrollmentRegistry({
    ttlMs: config.enrollOtpTtlSec * 1000,
    onExpire: (entry) => {
      try {
        entry.ws.close(4408, 'enroll:expired')
      }
      catch { /* ws 已断开,忽略 */ }
      try {
        persistence.recordAudit({
          actor: 'gateway',
          action: 'gateway.enrollment.expired',
          workerId: entry.workerId,
          detail: {
            displayName: entry.displayName,
            otpHash: createHash('sha256').update(entry.otp).digest('hex').slice(0, 16),
          },
        })
      }
      catch (err) {
        consola.warn('[gateway] 写 enrollment.expired audit 失败', err)
      }
      // FEAT-034 Phase 2：fleet UI 把这条从待批面板移除（无需重新拉 enroll.list）。
      try {
        broadcastEventToOperators(operators, {
          type: 'event',
          name: EVENTS.ENROLLMENT_PENDING,
          payload: {
            workerId: entry.workerId,
            ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
            otp: entry.otp,
            submittedAt: entry.submittedAt,
            expiresAt: entry.expiresAt,
            reason: 'expired',
          },
          ts: Date.now(),
        })
      }
      catch (err) {
        consola.warn('[gateway] 广播 enrollment.pending(expired) 失败', err)
      }
    },
  })

  let supervisor: FleetSupervisor | null = null
  if (config.canLaunch) {
    // superRefine 已经保证这些字段非空。
    supervisor = new FleetSupervisor({
      config: {
        dockerHost: config.supervisor.dockerHost,
        image: config.supervisor.image!,
        network: config.supervisor.network,
        workerDataRoot: config.supervisor.workerDataRoot!,
        workerMemoryLimit: config.supervisor.workerMemoryLimit!,
        workerCpuLimit: config.supervisor.workerCpuLimit!,
        launchBaseUrlTemplate: config.supervisor.launchBaseUrlTemplate,
        internalSharedSecret: config.internalSharedSecret!,
        nodeEnv: config.nodeEnv,
      },
    })
    consola.info('[gateway] AIWORKER_GATEWAY_CAN_LAUNCH=true — workers.launch 已开启')
  }

  // BUG-020：connect 失败累计 / 阻断（默认 60s 内 5 次失败 → block 10 min）。
  // 阈值与窗口给的是公网 brute-force 的常识值,不开 env：参数硬编码反而方便
  // 在 fail2ban / Caddy 反代叠加更严的层时彼此独立。
  const connectRateLimiter = new ConnectRateLimiter()

  return {
    persistence,
    nodes,
    operators,
    forwards,
    logger: consola.withTag('gateway'),
    masterKeyHex: config.masterKeyHex,
    supervisor,
    maxWorkers: config.maxWorkers,
    pendingEnrollments,
    connectRateLimiter,
    webStaticDir: options.webStaticDir,
    workerWebStaticDir: options.workerWebStaticDir,
  }
}

export interface StartGatewayResult extends StartedGateway {
  config: GatewayConfig
}

export interface StartGatewayOptions {
  /** PLAN-022 / FEAT-033：fleet bundle 静态根。详见 `CreateGatewayContextOptions`。 */
  webStaticDir?: string
  /** FEAT-040：worker bundle 静态根。详见 `CreateGatewayContextOptions`。 */
  workerWebStaticDir?: string
}

/** 完整启动流程:加载 env → 建 context → 起服务 → 装 SIGTERM 钩子。 */
export async function startGateway(
  override?: Partial<GatewayConfig>,
  options: StartGatewayOptions = {},
): Promise<StartGatewayResult> {
  const base = loadGatewayConfigFromEnv()
  const config: GatewayConfig = { ...base, ...override }
  const context = createGatewayContext(config, {
    webStaticDir: options.webStaticDir,
    workerWebStaticDir: options.workerWebStaticDir,
  })
  const started = startGatewayServer({ config, context })
  consola.success(
    `[gateway] listening ws://${config.host}:${started.port}/ws (auth=${config.internalSharedSecret ? 'shared-secret+loopback' : 'loopback-only'})`,
  )
  return { ...started, config }
}

async function main(): Promise<void> {
  const started = await startGateway()
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown)
      return
    shuttingDown = true
    consola.info(`[gateway] received ${signal}, shutting down`)
    try {
      await started.stop()
      closeFleetDb()
    }
    catch (err) {
      consola.error('[gateway] shutdown failed', err)
    }
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

// 只有作为入口被 `bun src/index.ts` 执行时才真正 main。import 进来做库用时
// 由调用方自行 startGateway()。
if (import.meta.main) {
  // eslint-disable-next-line antfu/no-top-level-await -- Bun 支持 top-level await 入口
  await main()
}
