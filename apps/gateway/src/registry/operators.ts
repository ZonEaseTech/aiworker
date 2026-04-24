import type { AnyWs } from './types'

/**
 * 在线 operator 记录。operator = aim CLI / Web Console / 自动化客户端。
 *
 * PLAN-013 S2 的订阅模型简化为全量：每条 operator 连接都会收到所有 node
 * 广播的 event。S5 可以细化成按 workerId / event name 过滤（参考
 * `ConnectionData.subscribedAll` 预留字段）。
 */
export interface OperatorEntry {
  agentId: string
  deviceId: string
  ws: AnyWs
  connectedAt: number
}

export class OperatorRegistry {
  private readonly byWs: Map<AnyWs, OperatorEntry> = new Map()

  register(entry: OperatorEntry): void {
    this.byWs.set(entry.ws, entry)
  }

  unregister(ws: AnyWs): OperatorEntry | undefined {
    const existing = this.byWs.get(ws)
    if (!existing)
      return undefined
    this.byWs.delete(ws)
    return existing
  }

  list(): OperatorEntry[] {
    return Array.from(this.byWs.values())
  }

  size(): number {
    return this.byWs.size
  }

  forEach(fn: (entry: OperatorEntry) => void): void {
    this.byWs.forEach(fn)
  }
}
