import type { Role } from '@aiworker/gateway-proto'
import type { ServerWebSocket } from 'bun'

/**
 * 每个已建立的 WS 连接都会带一份 ConnectionData：
 *
 * - `role` 在收到 `connect` 帧之前是 `undefined`，握手成功后固定为 `operator` /
 *   `node`，或 PLAN-019 OTP enroll 中间态 `node-pending`（未升级为正式 node、
 *   等 operator approve）。`node-pending` 故意不进 RoleSchema —— 它仅是 gateway
 *   内存状态，不会出现在线缆上。
 * - `agentId` / `deviceId` 来自 connect 帧（operator: device id；node: workerId）。
 * - `loopback` 在 upgrade 期间一次性判定，方法 handler 使用它判断是否允许敏感操作。
 * - `path`（PLAN-019）：fetch handler 升级时根据 URL pathname 标记 `/ws` /
 *   `/enroll-ws`，handleMessage 据此分流握手。
 *
 * 注意：字段故意保留为可变，Bun.serve 不允许 websocket 升级后修改 `data`
 * 的外壳（只能修改其字段），所以握手前先用 undefined 占位，握手成功后回填。
 */
export type ConnectionRole = Role | 'node-pending'
export type ConnectionPath = '/ws' | '/enroll-ws'

export interface ConnectionData {
  role: ConnectionRole | undefined
  agentId: string | undefined
  deviceId: string | undefined
  loopback: boolean
  remoteAddress: string | undefined
  connectedAt: number
  /** 所有通过本连接解析到的事件订阅；当前实现是全量订阅，此字段预留给 S5。 */
  subscribedAll: boolean
  /** PLAN-019 path-aware 握手：fetch 升级阶段写入。缺省视为 `/ws`（兼容老测试）。 */
  path: ConnectionPath
}

/** 便捷别名：WS handler 收到的对象。 */
export type AnyWs = ServerWebSocket<ConnectionData>
