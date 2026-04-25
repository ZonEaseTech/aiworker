/**
 * Worker node 模式的 gateway 客户端：装配 WS client + dispatcher +
 * subscriber，让 worker 作为 `role=node` 主动接入一条 gateway WS 连接。
 *
 * HTTP server 继续存在（S5 会决定去留）；本模块与 HTTP 路由并行跑，两条
 * 入站路径各自独立——dispatcher 走 orchestrator.ingest，subscriber 走
 * runtime.bus 订阅。两者都通过 `() => state.runtime` 懒取，遵循项目
 * hot-reload 不变量。
 */
import type { Frame, RequestFrame } from '@aiworker/gateway-proto'
import type { GatewayNodeOptions } from './config'
import type { NodeHandlers, RuntimeLike } from './dispatcher'

import consola from 'consola'
import { GatewayClient } from './client'
import { resolveGatewayNodeOptions } from './config'
import { GatewayDispatcher } from './dispatcher'
import { GatewaySubscriber } from './subscriber'

export type { WebSocketCtor, WebSocketLike } from './client'
export type { GatewayNodeOptions } from './config'
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
      // 方向出现，一旦出现就是 gateway 侧协议 bug）。
      if (frame.type === 'request') {
        void dispatcher.handleRequest(frame as RequestFrame)
        return
      }
      consola.warn(`[gateway-client ${resolved.workerId}] unexpected inbound frame type=${frame.type}`)
    },
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
  }
}

/**
 * 等价别名：对齐任务描述里的 stopGatewayNode 命名。内部就是 node.stop()。
 */
export async function stopGatewayNode(node: GatewayNode): Promise<void> {
  await node.stop()
}
