/**
 * Worker node 模式的 gateway 客户端：装配 WS client + dispatcher +
 * subscriber，让 worker 作为 `role=node` 主动接入一条 gateway WS 连接。
 *
 * HTTP server 继续存在（S5 会决定去留）；本模块与 HTTP 路由并行跑，两条
 * 入站路径各自独立——dispatcher 走 orchestrator.ingest，subscriber 走
 * runtime.bus 订阅。两者都通过 `() => state.runtime` 懒取，遵循项目
 * hot-reload 不变量。
 */
import type {
  EnrollmentApprovedPayload,
  EnrollmentOtpPayload,
  Frame,
  RequestFrame,
} from '@zonease/aiworker-gateway-proto'
import type { GatewayNodeOptions } from './config'
import type { NodeHandlers, RuntimeLike } from './dispatcher'

import consola from 'consola'
import { GatewayClient } from './client'
import { resolveGatewayNodeOptions } from './config'
import { GatewayDispatcher } from './dispatcher'
import { GatewaySubscriber } from './subscriber'

export type { WebSocketCtor, WebSocketLike } from './client'
export type { GatewayNodeEnrollOptions, GatewayNodeOptions } from './config'
export type { NodeHandlers, OrchestratorLike, RuntimeLike } from './dispatcher'

/**
 * 外部配置：启动 node 需要的所有拼装参数。
 */
export interface StartGatewayNodeOptions extends GatewayNodeOptions {
  /**
   * 懒取 runtime—gateway-client 不持有 runtime 实例，而是每次用的时候调
   * 一次这个函数，保证 hot-reload 换 runtime 后 bus / orchestrator / approvals
   * 都自动跟上。
   */
  getRuntime: () => RuntimeLike
  /** 节点级 handler（config / token / logs），按需注入。 */
  handlers?: NodeHandlers
  /**
   * PLAN-019：OTP enroll 模式下，gateway 推 `enrollment.otp` 时透传给上层
   * （`aiworker serve` 渲染到 stdout 给 deployer 看）。仅在 `enroll.mode='otp'`
   * 路径下会被触发。
   */
  onEnrollmentOtp?: (payload: EnrollmentOtpPayload) => void
  /**
   * PLAN-019：operator approve 后 gateway 推 `enrollment.approved`，透传给
   * 上层做"已加入 fleet"提示。client 内部已经把 enroll 状态置为已接入；
   * 上层无需做 reconnect，当前 socket 直接当作正式 node 连接继续用。
   */
  onEnrollmentApproved?: (payload: EnrollmentApprovedPayload) => void
  /**
   * 测试注入的 WebSocket 构造器。production 走默认 globalThis.WebSocket。
   * 签名用 unknown 以避开 any，实际类型与 client.ts 的 WebSocketCtor 一致。
   */
  webSocketCtor?: import('./client').WebSocketCtor
}

export interface GatewayNode {
  /** 停止：禁用重连、关闭 socket、解绑 subscriber。幂等。 */
  stop: () => Promise<void>
  /** 诊断：当前是否已经握手成功。 */
  isConnected: () => boolean
  /**
   * 在 worker runtime hot-reload 之后调用：subscriber 内部持有的
   * unsubscribe 闭包仍指向上一代 bus，老 bus 已经被 dispose 解绑，
   * 必须在新 runtime 上重新订阅，否则 `agent.thinking / agent.done`
   * 不会再上行。
   *
   * 仅在 socket 已 connected 时重挂——未连上时 onConnected 回调本身
   * 会 start subscriber，重复 start 会浪费一次 emit→sendEvent 路径
   * （sendEvent 此时是 no-op，但仍会触发 listener 重组）。
   */
  notifyRuntimeReloaded: () => void
}

export function startGatewayNode(options: StartGatewayNodeOptions): GatewayNode {
  const resolved = resolveGatewayNodeOptions(options)

  let connected = false
  let client: GatewayClient | null = null
  const subscriber = new GatewaySubscriber({
    workerId: resolved.workerId,
    getBus: () => options.getRuntime().bus,
    sendEvent: frame => client?.send(frame),
  })
  const dispatcher = new GatewayDispatcher({
    workerId: resolved.workerId,
    getRuntime: options.getRuntime,
    ...(options.handlers ? { handlers: options.handlers } : {}),
    sendResponse: frame => client?.send(frame),
  })

  client = new GatewayClient({
    options: resolved,
    onConnected: () => {
      connected = true
      // connect 后重新挂 subscriber（如果上次断开前解绑过），保证不漏事件。
      subscriber.start()
    },
    onDisconnected: (reason) => {
      connected = false
      subscriber.stop()
      consola.info(`[gateway-client ${resolved.workerId}] disconnected: ${reason}`)
    },
    onFrame: (frame: Frame) => {
      // node 只处理入站 request；其它 frame 一律忽略（不应在 node→gateway
      // 方向出现，一旦出现就是 gateway 侧协议 bug）。enrollment.otp /
      // enrollment.approved 这两个 event 已在 client 层早于本回调拦截分流。
      if (frame.type === 'request') {
        void dispatcher.handleRequest(frame as RequestFrame)
        return
      }
      consola.warn(`[gateway-client ${resolved.workerId}] unexpected inbound frame type=${frame.type}`)
    },
    ...(options.onEnrollmentOtp ? { onEnrollmentOtp: options.onEnrollmentOtp } : {}),
    ...(options.onEnrollmentApproved ? { onEnrollmentApproved: options.onEnrollmentApproved } : {}),
    ...(options.webSocketCtor ? { webSocketCtor: options.webSocketCtor } : {}),
  })

  client.start()

  return {
    async stop() {
      subscriber.stop()
      if (client) {
        await client.stop()
        client = null
      }
    },
    isConnected() {
      return connected
    },
    notifyRuntimeReloaded() {
      // subscriber.start() 内部幂等（先 stop 老 unsub 再挂新 bus），
      // 但只有已 connected 时才有意义——未连上时连 sendEvent 都是
      // no-op，等 onConnected 第一次回调时再挂即可。
      if (connected)
        subscriber.start()
    },
  }
}

/**
 * 等价别名：对齐任务描述里的 stopGatewayNode 命名。内部就是 node.stop()。
 */
export async function stopGatewayNode(node: GatewayNode): Promise<void> {
  await node.stop()
}
