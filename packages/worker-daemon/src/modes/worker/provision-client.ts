import type { WorkerAccessHello, WorkerAccessRequestEnvelope, WorkerAccessResponseEnvelope, WorkerCheckInRequest, WorkerCheckInResponse } from '@zonease/aiworker-worker-control-protocol'
import {
  parseWorkerAccessFrame,
  parseWorkerCheckInResponse,

} from '@zonease/aiworker-worker-control-protocol'

export type CheckInFetch = (url: URL, init: RequestInit) => Promise<Response>
export type WorkerAccessLocalFetch = (request: Request) => Promise<Response>
export type WorkerAccessWebSocket = Pick<WebSocket, 'send'> & {
  close?: () => void
  onclose?: (() => void) | null
  onmessage: ((event: { data: string }) => Promise<void> | void) | null
  onopen?: (() => void) | null
  readyState?: number
}

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
}

export interface HandleAccessRequestEnvelopeInput {
  envelope: WorkerAccessRequestEnvelope
  localFetch: WorkerAccessLocalFetch
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
   * 启动周期 keepalive 的注入缝（测试用可控时钟）。返回一个清理函数；连接关闭时调用以清除定时器，
   * 防止 tunnel 断开/重连泄漏 timer。默认包装 setInterval 且 unref，避免阻塞进程退出。
   */
  startKeepalive?: (tick: () => void, intervalMs: number) => () => void
}

const DEFAULT_KEEPALIVE_INTERVAL_MS = 25_000

function defaultStartKeepalive(tick: () => void, intervalMs: number): () => void {
  const timer = setInterval(tick, intervalMs)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return () => clearInterval(timer)
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
  const host = input.env.AIWORKER_HOST_URL
  const provisionToken = input.env.AIWORKER_PROVISION_TOKEN
  if (!host || !provisionToken)
    return null
  return await (input.checkIn ?? checkInToHost)({
    host,
    id: input.activeResolution.worker.appId,
    provisionToken,
    version: input.runtimeVersion,
    workerId: input.activeResolution.worker.id,
    workbenchUrl: '/',
  })
}

export async function connectWorkerAccessTunnel(input: ConnectWorkerAccessTunnelInput): Promise<WorkerAccessTunnelHandle | null> {
  const host = input.env.AIWORKER_HOST_URL
  if (!host || input.access.mode !== 'worker_access')
    return null

  const url = new URL('/api/provision/access', host)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = input.createWebSocket?.(url) ?? new WebSocket(url) as WorkerAccessWebSocket
  socket.onmessage = async (event) => {
    const frame = parseWorkerAccessFrame(JSON.parse(String(event.data)))
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

    if (frame.type === 'ping')
      socket.send(JSON.stringify({ type: 'pong', id: frame.id }))
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

  let keepaliveSeq = 0
  const sendKeepalivePing = () => {
    // 仅在连接处于 CONNECTING 时跳过，避免在 open 前 send 抛错；readyState 不可知（如注入的
    // fake socket）时照常发送。语义与 sendHello 的 readyState 守卫一致。
    if (typeof socket.readyState === 'number' && socket.readyState !== 1)
      return
    keepaliveSeq += 1
    socket.send(JSON.stringify({ type: 'ping', id: `wkr-keepalive-${keepaliveSeq}` }))
  }
  const stopTimer = (input.startKeepalive ?? defaultStartKeepalive)(
    sendKeepalivePing,
    resolveKeepaliveIntervalMs(input),
  )
  // 幂等清理：close() 与 socket 端 onclose（host 主动断开/重连）都收口到这里，
  // 任一路径都清掉定时器，杜绝 tunnel 断开后 timer 泄漏。
  let keepaliveStopped = false
  const stopKeepalive = () => {
    if (keepaliveStopped)
      return
    keepaliveStopped = true
    stopTimer()
  }
  // host 侧断开 socket 时同样清理（不追踪 pong/不做 death-detection，仅对真实 close 事件做清理）。
  socket.onclose = stopKeepalive

  return {
    close() {
      stopKeepalive()
      socket.close?.()
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
