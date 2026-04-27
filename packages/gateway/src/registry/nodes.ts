import type { AnyWs } from './types'

/**
 * 一个 worker node 的在线记录。完全放内存：gateway 进程重启 = 所有节点要重新
 * 连接。fleet.db 的 `registered_workers` 表只记持久化指针（baseUrl /
 * displayName / 加密 bearer token），不记在线状态。
 */
export interface NodeEntry {
  workerId: string
  deviceId: string
  ws: AnyWs
  pairedAt: number
  meta: Record<string, string>
}

export interface NodeRegisterResult {
  /** 该 workerId 的先前会话（若存在），调用方负责 close(code, reason)。 */
  replaced?: NodeEntry
}

/**
 * 在线 node 注册表。非线程安全——Bun WebSocket handler 是单线程事件循环，
 * 所有访问天然串行。
 */
export class NodeRegistry {
  private readonly byWorkerId: Map<string, NodeEntry> = new Map()
  private readonly byWs: WeakMap<AnyWs, NodeEntry> = new WeakMap()

  register(entry: NodeEntry): NodeRegisterResult {
    const prior = this.byWorkerId.get(entry.workerId)
    this.byWorkerId.set(entry.workerId, entry)
    this.byWs.set(entry.ws, entry)
    if (prior) {
      this.byWs.delete(prior.ws)
      return { replaced: prior }
    }
    return {}
  }

  /**
   * 通过 ws 句柄反查——WS close 回调只拿到 ws，用这个反查 workerId 做清理。
   * 成功删除返回被移除的 entry，否则 undefined。
   */
  unregisterByWs(ws: AnyWs): NodeEntry | undefined {
    const entry = this.byWs.get(ws)
    if (!entry)
      return undefined
    // 防御：若同一 workerId 已被新连接覆盖，不要误删新记录。
    const current = this.byWorkerId.get(entry.workerId)
    if (current && current.ws === ws)
      this.byWorkerId.delete(entry.workerId)
    this.byWs.delete(ws)
    return entry
  }

  get(workerId: string): NodeEntry | undefined {
    return this.byWorkerId.get(workerId)
  }

  has(workerId: string): boolean {
    return this.byWorkerId.has(workerId)
  }

  list(): NodeEntry[] {
    return Array.from(this.byWorkerId.values())
  }

  size(): number {
    return this.byWorkerId.size
  }
}
