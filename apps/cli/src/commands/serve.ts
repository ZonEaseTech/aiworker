import type { GatewayNode, GatewayNodeEnrollOptions } from '@zonease/aiworker-core'
import { spawn } from 'node:child_process'
import process from 'node:process'

import { bootstrapWorkerApp } from '@zonease/aiworker-api/bootstrap'
import {
  applyConfigUpdate,
  buildCronHandlers,
  buildInfo,
  deleteSecret,
  getAvailabilityProbe,
  getSecretsVault,
  handleBrainTest,
  handleChannelTest,
  handleExecutorTest,
  handleTokenRotate,
  listSecrets,
  putSecret,
  readConfig,
  startGatewayNode,
  workerEnv,
} from '@zonease/aiworker-core'
import { assertAdminServingIsSafe } from '@zonease/aiworker-shared'
import {
  getWorkerDb,
  listAgentTasks,
  listConversationMessages,
  listConversations,
} from '@zonease/aiworker-storage-sqlite/worker'
import consola from 'consola'
import { resolveWebStaticDir } from '../lib/web-static'

export interface ServeOptions {
  port?: number
  /** Runtime/package version surfaced through worker info. */
  runtimeVersion?: string
  /** Worker HTTP bind host. Defaults to AIWORKER_WORKER_HOST (127.0.0.1). */
  host?: string
  /** gateway WS URL；留空则不启动 gateway-client（保持纯 HTTP 兼容形态）。 */
  gateway?: string
  /** gateway 下发的 node bearer token；loopback 场景可留空字符串。 */
  gatewayToken?: string
  /** 显式禁用重连（方便 E2E / smoke）。默认启用。 */
  gatewayReconnect?: boolean
  /**
   * PLAN-022 / FEAT-033：默认挂载 worker bundle 至 `/admin/*`。`--no-serve-web`
   * 把它关掉（CI smoke / 纯 API 部署不希望多一份静态依赖）。
   */
  serveWeb?: boolean
  /**
   * worker admin 浏览器打开模式：
   * undefined = 交互式 TTY 自动打开；true = 强制打开；false = 禁用。
   */
  open?: boolean
}

interface WorkerAdminUrlOptions {
  host: string
  port: number
}

interface WorkerAdminTokenUrlOptions extends WorkerAdminUrlOptions {
  token: string
}

interface OpenBrowserCommand {
  args: string[]
  command: string
}

export function buildWorkerAdminBaseUrl({ host, port }: WorkerAdminUrlOptions): string {
  const browserHost = resolveBrowserHost(host)
  return `http://${formatHostForUrl(browserHost)}:${port}/admin/`
}

export function buildWorkerAdminTokenUrl({ token, ...baseOptions }: WorkerAdminTokenUrlOptions): string {
  return `${buildWorkerAdminBaseUrl(baseOptions)}#token=${encodeURIComponent(token)}`
}

export function shouldOpenWorkerAdminBrowser({ open, stdoutIsTTY }: {
  open?: boolean
  stdoutIsTTY: boolean
}): boolean {
  if (open === false)
    return false
  if (open === true)
    return true
  return stdoutIsTTY
}

export function buildOpenBrowserCommand(url: string, platform: NodeJS.Platform = process.platform): OpenBrowserCommand {
  if (platform === 'darwin')
    return { command: 'open', args: [url] }
  if (platform === 'win32')
    return { command: 'cmd', args: ['/c', 'start', '', url] }
  return { command: 'xdg-open', args: [url] }
}

/**
 * `aiworker serve` — boot the existing worker HTTP surface. Behaviour is
 * bit-for-bit compatible with `AIWORKER_MODE=worker bun src/index.ts`:
 * same bootstrap, same routes, same hot-reload contract. Intended for
 * production parity; use `aiworker run` for CLI-only (no HTTP) workflows.
 *
 * PLAN-013 S4：当 `--gateway` 传入时，在 HTTP server 之外再起一条 gateway
 * WS 连接，把 node 模式能力（chat.send / config.get / token.rotate）接入。
 * 两条路径独立，SIGTERM 时都做优雅关闭。
 */
export async function runServe(options: ServeOptions = {}): Promise<void> {
  const runtimeVersion = options.runtimeVersion ?? 'dev'
  // gatewayNode 在 bootstrap 之后才能 start（要拿到 state.workerId / reloadRuntime），
  // 但 bootstrap 自己又需要在 reloadRuntime 完成 swap 后回调 gatewayNode 让 subscriber
  // 重新挂到新 bus——chicken-and-egg。先建可变 ref，bootstrap 闭包里读这个 ref，
  // 真正的 GatewayNode 实例 startGatewayNode() 之后再写入。
  let gatewayNode: GatewayNode | null = null
  // PLAN-022 / FEAT-033：默认开启 web 静态托管。`--no-serve-web` 禁用。
  // 也允许 `AIWORKER_WORKER_NO_SERVE_WEB=1` env 透传——systemd unit 不动
  // ExecStart 也能开关（与 gateway 路径的 AIWORKER_GATEWAY_NO_SERVE_WEB
  // 对称）。资源缺失（npm 包旧版本不带 web/、或 dev 未跑 web build）→
  // 解析返 undefined，bootstrapWorkerApp 收到 undefined 时只是不挂
  // `/admin/*`，不阻塞启动，与显式禁用同等处理。
  const envOff = process.env.AIWORKER_WORKER_NO_SERVE_WEB === '1'
  const serveWeb = options.serveWeb !== false && !envOff
  const webStaticDir = serveWeb ? resolveWebStaticDir('worker') : undefined
  if (serveWeb && !webStaticDir)
    consola.warn('[aiworker serve] web 静态资源未找到（apps/web/dist/worker 缺失？），/admin/* 将返回 404')
  const host = options.host ?? workerEnv.AIWORKER_WORKER_HOST
  assertAdminServingIsSafe({
    surface: 'worker',
    host,
    serveWeb: webStaticDir !== undefined,
    externalAuthAcknowledged: workerEnv.AIWORKER_ADMIN_EXTERNAL_AUTH,
  })
  const { app, port: envPort, state, reloadRuntime } = await bootstrapWorkerApp({
    onRuntimeReloaded: () => gatewayNode?.notifyRuntimeReloaded(),
    runtimeVersion,
    ...(webStaticDir ? { webStaticDir } : {}),
  })
  const port = options.port ?? envPort

  const server = Bun.serve({ port, hostname: host, fetch: app.fetch })
  consola.success(`[aiworker serve] worker ${state.workerId} listening on ${host}:${port} (config v${state.configVersion})`)
  if (webStaticDir) {
    consola.info(`[aiworker serve] /admin/* serving worker bundle from ${webStaticDir}`)
    const adminBaseUrl = buildWorkerAdminBaseUrl({ host, port })
    consola.info(`[aiworker serve] worker admin: ${adminBaseUrl}`)
    if (shouldOpenWorkerAdminBrowser({ open: options.open, stdoutIsTTY: process.stdout.isTTY === true })) {
      const adminUrl = buildWorkerAdminTokenUrl({ host, port, token: state.tokenPlaintext })
      openWorkerAdminBrowser(adminUrl)
    }
  }
  else if (options.open === true) {
    consola.warn('[aiworker serve] --open 已请求，但 worker web 静态资源未挂载，跳过打开浏览器')
  }

  // PLAN-018 / FEAT-024 self-enrollment + PLAN-019 / FEAT-026 OTP-attended 接入。
  // 触发表（与 PLAN-019 §Worker side 一致）：
  //   --gateway 显式 flag                                → 老路径（operator-pull 后 token 已下发）
  //   env URL + JOIN_TOKEN（ENROLL_MODE!='otp'）         → PLAN-018 self-enroll（带 enroll 块 + joinToken）
  //   env URL + JOIN_TOKEN + ENROLL_MODE='otp'           → PLAN-019 OTP（强制 attended，忽略 JOIN_TOKEN）
  //   env URL only                                       → PLAN-019 OTP enroll
  //   只有 JOIN_TOKEN 没 URL                              → warn 后跳过
  //   全无                                               → 不连 gateway
  // 老 flag 与新 env 同时给时，--gateway 优先（运维显式覆盖）。
  // OTP 模式下 worker WS 强制走 `/enroll-ws` path——与 PLAN-019 §Caddy path
  // split 配套，且 token 直接用 worker 自己 mint 的 apiToken（OTP approve
  // 后 deviceToken 等同 apiToken，不需要再 swap）。
  const envGatewayUrl = workerEnv.AIWORKER_GATEWAY_URL
  const envJoinToken = workerEnv.AIWORKER_JOIN_TOKEN
  const envDisplayName = workerEnv.AIWORKER_DISPLAY_NAME
  const envEnrollMode = workerEnv.AIWORKER_ENROLL_MODE
  const flagGatewayUrl = options.gateway && options.gateway.length > 0 ? options.gateway : undefined

  let gatewayUrl: string | undefined
  let gatewayToken = options.gatewayToken ?? ''
  let enroll: GatewayNodeEnrollOptions | undefined
  let mode: 'legacy' | 'self-enroll' | 'otp' = 'legacy'
  if (flagGatewayUrl) {
    gatewayUrl = flagGatewayUrl
  }
  else if (envGatewayUrl && envGatewayUrl.length > 0) {
    const forceOtp = envEnrollMode === 'otp'
    const hasJoinToken = !!envJoinToken && envJoinToken.length > 0
    if (!forceOtp && hasJoinToken) {
      // PLAN-018 self-enroll
      gatewayUrl = envGatewayUrl
      mode = 'self-enroll'
      enroll = {
        mode: 'join-token',
        joinToken: envJoinToken!,
        apiToken: state.tokenPlaintext,
        ...(envDisplayName ? { displayName: envDisplayName } : {}),
      }
    }
    else {
      // PLAN-019 OTP enroll：path 强制 /enroll-ws
      const otpUrl = new URL(envGatewayUrl)
      otpUrl.pathname = '/enroll-ws'
      gatewayUrl = otpUrl.toString()
      mode = 'otp'
      // OTP 模式下 worker auth.token 直接用自己 mint 的 apiToken；approve 后
      // deviceToken == apiToken，gateway 后续按 fleet.db 行验证身份。
      gatewayToken = state.tokenPlaintext
      enroll = {
        mode: 'otp',
        apiToken: state.tokenPlaintext,
        ...(envDisplayName ? { displayName: envDisplayName } : {}),
      }
      if (forceOtp && hasJoinToken)
        consola.info('[aiworker serve] AIWORKER_ENROLL_MODE=otp 已生效，忽略 AIWORKER_JOIN_TOKEN')
    }
  }
  else if (envJoinToken && envJoinToken.length > 0) {
    consola.warn('[aiworker serve] AIWORKER_JOIN_TOKEN set but AIWORKER_GATEWAY_URL missing; skipping self-enroll')
  }

  if (gatewayUrl) {
    if (mode === 'self-enroll')
      consola.info(`[aiworker serve] self-enrolling to ${gatewayUrl} as ${envDisplayName ?? state.workerId}`)
    else if (mode === 'otp')
      consola.info(`[aiworker serve] OTP enrolling to ${gatewayUrl}; awaiting operator approval`)
    gatewayNode = startGatewayNode({
      url: gatewayUrl,
      token: gatewayToken,
      workerId: state.workerId,
      ...(options.gatewayReconnect === false ? { reconnect: false } : {}),
      ...(enroll ? { enroll } : {}),
      ...(mode === 'otp'
        ? {
            onEnrollmentOtp: ({ otp, expiresAt }) => {
              const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
              const display = formatOtpBox(otp, seconds)
              process.stdout.write(`${display}\n`)
              consola.info(`[aiworker serve] OTP ${otp} 已签发，请用 \`aiworker enroll approve ${otp}\` 准入；expires in ${seconds}s`)
            },
            onEnrollmentApproved: ({ workerId, deviceToken }) => {
              consola.success(
                `[aiworker serve] approved as ${workerId}; deviceToken=${deviceToken.slice(0, 8)}…，已加入 fleet`,
              )
            },
          }
        : {}),
      getRuntime: () => state.runtime,
      handlers: {
        workersInfo: async () => {
          const stored = await readConfig(getWorkerDb())
          return await buildInfo(state, stored.config, {
            runtimeVersion,
            ...(workerEnv.AIWORKER_ADVERTISED_BASE_URL === undefined
              ? {}
              : { advertisedBaseUrl: workerEnv.AIWORKER_ADVERTISED_BASE_URL }),
          })
        },
        workersStop: async () => {
          setTimeout(() => {
            try {
              process.kill(process.pid, 'SIGTERM')
            }
            catch (err) {
              consola.error(`[aiworker serve] workers.stop failed to signal self: ${String(err)}`)
            }
          }, 0)
        },
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
        secretsList: async () => {
          return { keys: await listSecrets(getSecretsVault()) }
        },
        secretsPut: async ({ key, value }) => {
          await putSecret(getSecretsVault(), key, value)
          return { ok: true }
        },
        secretsDelete: async ({ key }) => {
          await deleteSecret(getSecretsVault(), key)
          return { ok: true }
        },
        enginesList: async ({ refresh }) => {
          return { engines: await getAvailabilityProbe().probeAll({ refresh: refresh === true }) }
        },
        brainTest: async () => {
          const stored = await readConfig(getWorkerDb())
          return await handleBrainTest(state, stored.config)
        },
        executorTest: async ({ probe }) => {
          const stored = await readConfig(getWorkerDb())
          return await handleExecutorTest(state, stored.config, { probe: probe === true })
        },
        channelTest: async ({ channel, body }) => {
          return await handleChannelTest(state, channel, body ?? {})
        },
        tasksList: async () => {
          return { tasks: listAgentTasks(200) }
        },
        tasksCreate: async ({ prompt }) => {
          const task = await state.runtime.orchestrator.submitTask(prompt)
          return { task }
        },
        conversationsList: async () => {
          return { conversations: listConversations(200) }
        },
        messagesList: async ({ conversationId }) => {
          return { messages: listConversationMessages(conversationId) }
        },
      },
    })
    consola.success(`[aiworker serve] gateway-client dialing ${gatewayUrl}`)
  }

  // SIGTERM / SIGINT：同时优雅关 HTTP server 与 gateway-client，最长等 5s。
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown)
      return
    shuttingDown = true
    consola.info(`[aiworker serve] received ${signal}, shutting down`)
    try {
      if (gatewayNode) {
        await gatewayNode.stop()
        gatewayNode = null
      }
    }
    catch (err) {
      consola.warn(`[aiworker serve] gateway shutdown failed: ${String(err)}`)
    }
    try {
      server.stop()
    }
    catch (err) {
      consola.warn(`[aiworker serve] http shutdown failed: ${String(err)}`)
    }
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))

  // Keep the CLI foreground service alive until the signal handlers exit.
  await new Promise<never>(() => {})
}

/**
 * PLAN-019：把 OTP + 过期秒数渲染成方框，给 deployer 视觉提示。consola.box
 * 在 non-TTY 下会被吃掉颜色但仍可见；这里直接 stdout.write 保证 journalctl
 * /docker logs 也能截到。
 */
function formatOtpBox(otp: string, expiresInSec: number): string {
  const line1 = `OTP:  ${otp}`
  const line2 = `expires in ${expiresInSec}s`
  const width = Math.max(line1.length, line2.length) + 6
  const horiz = '─'.repeat(width)
  const pad = (s: string) => `│  ${s}${' '.repeat(width - s.length - 4)}│`
  return ['', `┌${horiz}┐`, pad(line1), pad(line2), `└${horiz}┘`].join('\n')
}

function resolveBrowserHost(host: string): string {
  const trimmed = host.trim()
  if (trimmed === '' || trimmed === '0.0.0.0' || trimmed === '*')
    return '127.0.0.1'
  if (trimmed === '::' || trimmed === '[::]' || trimmed === '0:0:0:0:0:0:0:0')
    return '::1'
  if (trimmed.startsWith('[') && trimmed.endsWith(']'))
    return trimmed.slice(1, -1)
  return trimmed
}

function formatHostForUrl(host: string): string {
  return host.includes(':') ? `[${host}]` : host
}

function openWorkerAdminBrowser(url: string): void {
  const { command, args } = buildOpenBrowserCommand(url)
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', (err) => {
      consola.warn(`[aiworker serve] 打开浏览器失败：${err instanceof Error ? err.message : String(err)}`)
    })
    child.unref()
    consola.info('[aiworker serve] 正在打开 worker admin（bearer 通过 URL fragment 带入，UI 会立即清理 hash）')
  }
  catch (err) {
    consola.warn(`[aiworker serve] 打开浏览器失败：${err instanceof Error ? err.message : String(err)}`)
  }
}
