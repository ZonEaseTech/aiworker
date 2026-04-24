import type { Role } from '@aiworker/gateway-proto'
import type { ServerWebSocket } from 'bun'

/**
 * 每个已建立的 WS 连接都会带一份 ConnectionData：
 *
 * - `role` 在收到 `connect` 帧之前是 `undefined`，之后固定为 `operator` / `node`。
 * - `agentId` / `deviceId` 来自 connect 帧（operator: device id；node: workerId）。
 * - `loopback` 在 upgrade 期间一次性判定，方法 handler 使用它判断是否允许敏感操作。
 *
 * 注意：字段故意保留为可变，Bun.serve 不允许 websocket 升级后修改 `data`
 * 的外壳（只能修改其字段），所以握手前先用 undefined 占位，握手成功后回填。
 */
export interface ConnectionData {
  role: Role | undefined
  agentId: string | undefined
  deviceId: string | undefined
  loopback: boolean
  remoteAddress: string | undefined
  connectedAt: number
  /** 所有通过本连接解析到的事件订阅；当前实现是全量订阅，此字段预留给 S5。 */
  subscribedAll: boolean
}

/** 便捷别名：WS handler 收到的对象。 */
export type AnyWs = ServerWebSocket<ConnectionData>
