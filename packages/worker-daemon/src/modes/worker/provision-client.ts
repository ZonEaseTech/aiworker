import type { WorkerAccessHello, WorkerAccessRequestEnvelope, WorkerAccessResponseEnvelope, WorkerCheckInRequest, WorkerCheckInResponse } from '@zonease/aiworker-worker-control-protocol'
import {
  parseWorkerAccessFrame,
  parseWorkerCheckInResponse,

} from '@zonease/aiworker-worker-control-protocol'
import { clearPersistedWorkerAccess, persistWorkerAccess, readPersistedWorkerAccess } from './access-token-store'

export type { PersistedWorkerAccess } from './access-token-store'
// Re-export the 0600 token-store surface here so consumers (e.g. the provision CLI doing
// first-provision bootstrap) reach the whole provision/reconnect surface from one entrypoint.
export {
  clearPersistedWorkerAccess,
  persistedWorkerAccessPath,
  persistWorkerAccess,
  readPersistedWorkerAccess,
  redactWorkerAccessToken,
} from './access-token-store'

export type CheckInFetch = (url: URL, init: RequestInit) => Promise<Response>
export type WorkerAccessLocalFetch = (request: Request) => Promise<Response>
/**
 * onclose 携带可选的 `{ code }`(真实 WebSocket CloseEvent 的 close code,或注入 fake 的模拟值)。
 * worker 据 code 区分撤销/拒绝(4401)与瞬断(其余/无 code)。死连接 force-close 走 handleConnectionLost()
 * 无 code → 当作瞬断重连。
 */
export type WorkerAccessWebSocket = Pick<WebSocket, 'send'> & {
  close?: () => void
  onclose?: ((event?: { code?: number }) => void) | null
  onmessage: ((event: { data: string }) => Promise<void> | void) | null
  onopen?: (() => void) | null
  readyState?: number
}

/** Host 在 access auth 失败(撤销/拒绝)时用的 application close code(RFC 6455 私有段)。 */
export const ACCESS_REJECTED_CLOSE_CODE = 4401

export interface WorkerAccessTunnelHandle {
  close: () => void
}

export interface BuildCheckInInput {
  id: string
  provisionToken: string
  version: string
  workerId: string
  workbenchUrl: string
}

export interface CheckInInput extends BuildCheckInInput {
  fetch?: CheckInFetch
  host: string
}

export interface ProvisionActiveWorker {
  appId: string
  id: string
}

export type ProvisionActiveResolution
  = | { kind: 'single', worker: ProvisionActiveWorker }
    | { kind: string }

export interface MaybeProvisionCheckInInput {
  activeResolution: ProvisionActiveResolution
  checkIn?: (input: CheckInInput) => Promise<WorkerCheckInResponse>
  env: Record<string, string | undefined>
  runtimeVersion: string
  /**
   * worker-home（= daemon 实际启动的 DB 目录，`path.dirname(dbPath)`）。提供时启用 D6 持久 token 路径：
   * 先读回 `<worker-home>/access-token`——存在则直接用它重连、跳过 check-in（provision token 单次消费，
   * 重 check-in 必 401）；不存在且 env 有 host+token → check-in 并把返回的 access 持久化。未提供时退回
   * 旧行为（纯 env 驱动 check-in、不落盘），保持已有调用方不变。
   */
  workerHome?: string
}

export interface HandleAccessRequestEnvelopeInput {
  envelope: WorkerAccessRequestEnvelope
  localFetch: WorkerAccessLocalFetch
}

/**
 * tunnel 运维日志出口。默认走 console；测试可注入捕获器。只输出非敏感的连接生命周期信息，
 * 绝不打印 access token / provision token。
 */
export interface TunnelLogger {
  info: (message: string) => void
  warn: (message: string) => void
}

export interface ConnectWorkerAccessTunnelInput {
  access: WorkerCheckInResponse['access']
  assignment: WorkerCheckInResponse['assignment']
  createWebSocket?: (url: URL) => WorkerAccessWebSocket
  env: Record<string, string | undefined>
  /**
   * 应用层 keepalive ping 间隔（毫秒）。每隔该间隔，Worker 主动向 Host 发一个 ping 帧，
   * Host 回 pong，产生双向流量，避免反向代理因 idle 掐断长时间空闲的 tunnel。
   * 默认 25s，留在典型反代 60s+ idle 之下作安全裕度。
   */
  keepaliveIntervalMs?: number
  localFetch: WorkerAccessLocalFetch
  /**
   * tunnel 生命周期日志出口（断连/重连/疑似需 re-provision）。默认 console，可注入捕获。
   */
  logger?: TunnelLogger
  /**
   * 死连接探测阈值：连续这么多个 keepalive ping 都没收到 pong，即判定 socket 半开
   * （如反代丢了上游却没发 FIN，onclose 永不触发）→ 主动 force-close 触发重连。默认 3。
   */
  missedPongLimit?: number
  /**
   * 重连退避的抖动源（注入缝，测试用可控值）。默认 Math.random。
   */
  random?: () => number
  /**
   * 重连退避基准毫秒（指数退避的第一档）。默认 1s。
   */
  reconnectBaseDelayMs?: number
  /**
   * 重连退避上限毫秒（指数退避封顶，避免长 Host 宕机时打爆 Host）。默认 30s。
   */
  reconnectMaxDelayMs?: number
  /**
   * 连续这么多次重连仍未恢复，就 warn 提示「access token 可能过期/assignment 被 revoke，
   * 可能需要 re-provision」，让运维能区分「重连中」与「卡死」。默认 5。
   */
  reconnectReprovisionHintAfter?: number
  /**
   * 启动周期 keepalive 的注入缝（测试用可控时钟）。返回一个清理函数；连接关闭时调用以清除定时器，
   * 防止 tunnel 断开/重连泄漏 timer。默认包装 setInterval 且 unref，避免阻塞进程退出。
   */
  startKeepalive?: (tick: () => void, intervalMs: number) => () => void
  /**
   * 调度一次重连（延迟 delayMs 后调用 run）的注入缝（测试用可控时钟）。返回一个取消函数，
   * 主动 close() 时调用以撤销待发重连。默认包装 setTimeout 且 unref。
   */
  startReconnectTimer?: (run: () => void, delayMs: number) => () => void
  /**
   * worker-home（= daemon 的 DB 目录）。提供时启用撤销检测：onclose code === 4401（access_rejected）
   * → 清 `<worker-home>/access-token`（死 token 不再被重启读回）+ 诚实告警 + 停止重连循环。未提供时
   * 4401 仍停循环 + 告警，只是不清盘（无落点）。
   */
  workerHome?: string
  /**
   * 撤销时清除持久 token 的注入缝（默认 = access-token-store 的 clearPersistedWorkerAccess）。测试可注入捕获器。
   */
  clearPersistedAccess?: (workerHome: string) => Promise<void>
}

const DEFAULT_KEEPALIVE_INTERVAL_MS = 25_000
const DEFAULT_MISSED_PONG_LIMIT = 3
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000
const DEFAULT_RECONNECT_REPROVISION_HINT_AFTER = 5

function defaultStartKeepalive(tick: () => void, intervalMs: number): () => void {
  const timer = setInterval(tick, intervalMs)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return () => clearInterval(timer)
}

function defaultStartReconnectTimer(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return () => clearTimeout(timer)
}

function resolvePositiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 指数退避 + equal jitter。attempt 从 1 起：exponential = base * 2^(attempt-1)，封顶 max；
 * 取一半固定 + 一半抖动（random ∈ [0,1)）。既避免对 Host 的惊群，又把上限钉死在 max。
 */
function computeReconnectDelayMs(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** (attempt - 1))
  return Math.round(exponential / 2 + random() * (exponential / 2))
}

/**
 * keepalive 间隔解析优先级：显式 input.keepaliveIntervalMs > 环境变量
 * AIWORKER_WORKER_ACCESS_KEEPALIVE_MS（正整数）> 默认 25s。非正/NaN 的 env 值被忽略。
 */
function resolveKeepaliveIntervalMs(input: ConnectWorkerAccessTunnelInput): number {
  if (typeof input.keepaliveIntervalMs === 'number' && input.keepaliveIntervalMs > 0)
    return input.keepaliveIntervalMs
  const fromEnv = Number(input.env.AIWORKER_WORKER_ACCESS_KEEPALIVE_MS)
  if (Number.isFinite(fromEnv) && fromEnv > 0)
    return fromEnv
  return DEFAULT_KEEPALIVE_INTERVAL_MS
}

export function buildCheckInBody(input: BuildCheckInInput): WorkerCheckInRequest {
  return {
    provisionToken: input.provisionToken,
    worker: {
      health: { ready: true },
      id: input.id,
      version: input.version,
      workerId: input.workerId,
      workbenchUrl: input.workbenchUrl,
    },
  }
}

export function buildAccessHello(input: WorkerAccessHello): WorkerAccessHello {
  return {
    assignmentId: input.assignmentId,
    token: input.token,
    workerId: input.workerId,
  }
}

export async function checkInToHost(input: CheckInInput): Promise<WorkerCheckInResponse> {
  const doFetch = input.fetch ?? fetch
  const res = await doFetch(new URL('/api/provision/check-in', input.host), {
    body: JSON.stringify(buildCheckInBody(input)),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!res.ok)
    throw new Error(`Worker check-in failed: ${res.status}`)
  return parseWorkerCheckInResponse(await res.json())
}

export async function maybeProvisionCheckIn(input: MaybeProvisionCheckInInput): Promise<WorkerCheckInResponse | null> {
  if (input.activeResolution.kind !== 'single' || !('worker' in input.activeResolution))
    return null

  // D6:持久 token 优先。first-provision（CLI 引导）落盘后，daemon boot 与后续每次重启都走这条——
  // 读回重连三元组、跳过 check-in，避免对已消费的 provision token 二次 check-in（必 401）。
  if (input.workerHome) {
    const persisted = await readPersistedWorkerAccess(input.workerHome)
    if (persisted) {
      return {
        access: persisted.access,
        // 重连只需 assignmentId + workerId（hello 帧三元组的剩余两项）；其余 receipt 字段在持久路径下
        // 不参与重连，故合成最小占位（旧 host 字段，不发往 Host，仅喂本地 tunnel 构造）。
        assignment: {
          assignedEmail: 'persisted@local',
          assignmentId: persisted.assignment.assignmentId,
          soulReleaseRef: 'persisted',
          workerId: persisted.assignment.workerId,
        },
      }
    }
  }

  const host = input.env.AIWORKER_HOST_URL
  const provisionToken = input.env.AIWORKER_PROVISION_TOKEN
  if (!host || !provisionToken)
    return null
  const receipt = await (input.checkIn ?? checkInToHost)({
    host,
    id: input.activeResolution.worker.appId,
    provisionToken,
    version: input.runtimeVersion,
    workerId: input.activeResolution.worker.id,
    workbenchUrl: '/',
  })

  // 兼容「daemon 首启直接带 env、worker 已建」路径：把 check-in 返回的 access 持久化，使下次重启免 check-in。
  if (input.workerHome) {
    await persistWorkerAccess(input.workerHome, {
      access: { mode: receipt.access.mode, token: receipt.access.token },
      assignment: { assignmentId: receipt.assignment.assignmentId, workerId: receipt.assignment.workerId },
    })
  }
  return receipt
}

export async function connectWorkerAccessTunnel(input: ConnectWorkerAccessTunnelInput): Promise<WorkerAccessTunnelHandle | null> {
  const host = input.env.AIWORKER_HOST_URL
  if (!host || input.access.mode !== 'worker_access')
    return null

  const url = new URL('/api/provision/access', host)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'

  const startKeepalive = input.startKeepalive ?? defaultStartKeepalive
  const startReconnectTimer = input.startReconnectTimer ?? defaultStartReconnectTimer
  const keepaliveIntervalMs = resolveKeepaliveIntervalMs(input)
  const missedPongLimit = resolvePositiveInt(input.missedPongLimit, DEFAULT_MISSED_PONG_LIMIT)
  const reconnectBaseDelayMs = resolvePositiveInt(input.reconnectBaseDelayMs, DEFAULT_RECONNECT_BASE_DELAY_MS)
  const reconnectMaxDelayMs = resolvePositiveInt(input.reconnectMaxDelayMs, DEFAULT_RECONNECT_MAX_DELAY_MS)
  const reprovisionHintAfter = resolvePositiveInt(input.reconnectReprovisionHintAfter, DEFAULT_RECONNECT_REPROVISION_HINT_AFTER)
  const random = input.random ?? Math.random
  const logger: TunnelLogger = input.logger ?? console
  const clearPersistedAccess = input.clearPersistedAccess ?? clearPersistedWorkerAccess

  // 跨重连的持久状态（每个 socket 周期内的状态在 openConnection 里重置）。
  let intentionallyClosed = false
  let failedAttempts = 0
  let cancelReconnect: (() => void) | null = null
  let currentSocket: WorkerAccessWebSocket | null = null
  let currentStopKeepalive: (() => void) | null = null

  // 撤销/拒绝收口（onclose code === 4401）：停止重连循环（复用 intentionallyClosed 守卫），
  // 清持久 token（死 token 不再被重启读回），诚实可操作告警。绝不打印 token。
  function handleAccessRevoked(): void {
    if (intentionallyClosed)
      return
    intentionallyClosed = true
    cancelReconnect?.()
    cancelReconnect = null
    logger.warn('[worker-access] host rejected the worker access token (access revoked or denied); reconnect stopped — re-provision is required to restore the tunnel')
    if (input.workerHome) {
      clearPersistedAccess(input.workerHome).catch(() => {
        // 清盘失败不致命：循环已停、告警已发；下次 boot 读回死 token 也只会再次被 4401 拒、再次走此路径。
        logger.warn('[worker-access] failed to clear the persisted worker access token after revocation')
      })
    }
  }

  function scheduleReconnect(): void {
    if (intentionallyClosed)
      return
    failedAttempts += 1
    const delayMs = computeReconnectDelayMs(failedAttempts, reconnectBaseDelayMs, reconnectMaxDelayMs, random)
    // 仅记录连接生命周期，不含任何 token。
    logger.info(`[worker-access] tunnel disconnected; reconnecting (attempt ${failedAttempts}, retry in ${delayMs}ms)`)
    // 跨过阈值时告警一次，之后每 reprovisionHintAfter 次再复述一次：长宕机下保持可见，
    // 又不至于每次重连（封顶 ~30s）都刷屏。
    if (failedAttempts >= reprovisionHintAfter && failedAttempts % reprovisionHintAfter === 0) {
      logger.warn(`[worker-access] tunnel still down after ${failedAttempts} reconnect attempts; the worker access token may be expired or the assignment revoked — re-provision may be required`)
    }
    cancelReconnect = startReconnectTimer(() => {
      cancelReconnect = null
      openConnection()
    }, delayMs)
  }

  function openConnection(): void {
    // 主动 close() 与一个已派发的重连 timer 之间的兜底：若期间已主动关停，则不再新建连接。
    // 默认 scheduler 下 close() 会 clearTimeout 故此分支不可达，仅为注入式 scheduler 加保险。
    if (intentionallyClosed)
      return
    const socket = input.createWebSocket?.(url) ?? new WebSocket(url) as WorkerAccessWebSocket
    currentSocket = socket

    // 每个 socket 周期独立的状态。
    let connectionLost = false
    let healthy = false
    let missedPongs = 0
    let keepaliveSeq = 0
    let keepaliveStopped = false
    // keepalive 清理函数：keepalive 启动后赋值。提前声明以便 stopKeepalive 在词法上先于其定义引用。
    let stopTimer: (() => void) | null = null

    function stopKeepalive(): void {
      if (keepaliveStopped)
        return
      keepaliveStopped = true
      stopTimer?.()
    }

    // 幂等收口：socket onclose（host 重启/断开）与死连接 force-close 都走这里——清 keepalive 定时器，
    // 若非主动 close 则按退避调度重连。connectionLost 守卫保证两条路径只处理一次。
    // event.code === 4401（access_rejected）= Host 撤销/拒绝了本 worker 的 access → 这不是瞬断，
    // 重连只会拿死 token 反复被拒。区分处理：停止重连循环 + 清持久 token + 诚实告警。
    const handleConnectionLost = (event?: { code?: number }): void => {
      if (connectionLost)
        return
      connectionLost = true
      stopKeepalive()
      if (intentionallyClosed)
        return
      if (event?.code === ACCESS_REJECTED_CLOSE_CODE) {
        handleAccessRevoked()
        return
      }
      scheduleReconnect()
    }

    socket.onmessage = async (event) => {
      const frame = parseWorkerAccessFrame(JSON.parse(String(event.data)))

      // 任一入站帧都证明 tunnel 真在承载流量 → 标记健康、把退避计数清零（仅记一次「reconnected」）。
      if (!healthy) {
        healthy = true
        if (failedAttempts > 0) {
          logger.info(`[worker-access] tunnel reconnected after ${failedAttempts} attempt(s)`)
          failedAttempts = 0
        }
      }

      if (frame.type === 'request') {
        try {
          const response = await handleAccessRequestEnvelope({
            envelope: frame,
            localFetch: input.localFetch,
          })
          socket.send(JSON.stringify(response))
        }
        catch {
          socket.send(JSON.stringify({
            type: 'response',
            id: frame.id,
            status: 502,
            headers: {},
            bodyText: '',
          }))
        }
        return
      }

      if (frame.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', id: frame.id }))
        return
      }

      if (frame.type === 'pong') {
        // host 应答了我们的 keepalive → 连接存活，清死连接计数。
        missedPongs = 0
      }
    }

    const sendHello = () => {
      socket.send(JSON.stringify({
        type: 'hello',
        assignmentId: input.assignment.assignmentId,
        token: input.access.token,
        workerId: input.assignment.workerId,
      }))
    }
    if (typeof socket.readyState === 'number' && socket.readyState !== 1)
      socket.onopen = sendHello
    else
      sendHello()

    const sendKeepalivePing = () => {
      if (connectionLost)
        return
      // 连续 missedPongLimit 个 ping 都没等到 pong → 判定半开（反代丢了上游却没发 FIN，
      // onclose 可能永不触发）→ 主动 close 并收口到重连，让 tunnel 自愈。
      if (missedPongs >= missedPongLimit) {
        socket.close?.()
        handleConnectionLost()
        return
      }
      // 仅在连接处于 CONNECTING 时跳过，避免在 open 前 send 抛错；readyState 不可知（如注入的
      // fake socket）时照常发送。语义与 sendHello 的 readyState 守卫一致。
      if (typeof socket.readyState === 'number' && socket.readyState !== 1)
        return
      keepaliveSeq += 1
      missedPongs += 1
      socket.send(JSON.stringify({ type: 'ping', id: `wkr-keepalive-${keepaliveSeq}` }))
    }
    stopTimer = startKeepalive(sendKeepalivePing, keepaliveIntervalMs)
    currentStopKeepalive = stopKeepalive

    socket.onclose = handleConnectionLost
  }

  openConnection()

  return {
    close() {
      intentionallyClosed = true
      cancelReconnect?.()
      cancelReconnect = null
      currentStopKeepalive?.()
      currentSocket?.close?.()
    },
  }
}

export async function handleAccessRequestEnvelope(
  input: HandleAccessRequestEnvelopeInput,
): Promise<WorkerAccessResponseEnvelope> {
  const url = resolveLocalAccessPath('http://aiworker.local', input.envelope.path)
  const init: RequestInit = {
    headers: input.envelope.headers,
    method: input.envelope.method,
  }
  if (input.envelope.method !== 'GET' && input.envelope.method !== 'HEAD')
    init.body = input.envelope.bodyText

  const response = await input.localFetch(new Request(url, init))
  return {
    type: 'response',
    id: input.envelope.id,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    bodyText: await response.text(),
  }
}

function resolveLocalAccessPath(localBaseUrl: string, path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path))
    throw new Error('invalid worker access path')

  const localBase = new URL(localBaseUrl)
  const url = new URL(path, localBase)
  if (url.origin !== localBase.origin)
    throw new Error('invalid worker access path')

  return url
}
