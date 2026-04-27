import type { EventFrame } from '@zonease/aiworker-gateway-proto'
import type { WorkerEvent, WorkerEventBus } from '../events/bus'

import { EVENTS } from '@zonease/aiworker-gateway-proto'

/**
 * 把 WorkerEventBus 的本地事件映射成 `@zonease/aiworker-gateway-proto` EVENTS 常量
 * 定义的外发事件 frame。不做过滤：每个订阅周期内所有映射成功的事件都会
 * 上行一条 frame。
 *
 * ```
 *   bus.type                          → EVENTS.*
 *   orchestrator.text                 → AGENT_THINKING  (chunk = delta)
 *   orchestrator.tool_call            → AGENT_TOOL_CALL (status = pending)
 *   orchestrator.finished             → AGENT_DONE      (finishReason = stop)
 *   orchestrator.error                → AGENT_DONE      (finishReason = error)
 *   conversation.message              → CHAT_MESSAGE    (role 由 payload 带)
 * ```
 *
 * 未映射的事件被吞掉，避免污染 gateway 侧的 schema 校验（event payload
 * 有强类型，陌生字段会被拒）。
 */
export interface GatewaySubscriberDeps {
  workerId: string
  /** 懒取 bus—支持 hot-reload 后换 runtime 时重新订阅最新 bus。 */
  getBus: () => WorkerEventBus
  /** 发送 event 帧（通常是 GatewayClient.send 的薄封装）。 */
  sendEvent: (frame: EventFrame) => void
}

export class GatewaySubscriber {
  private unsub: (() => void) | null = null

  constructor(private readonly deps: GatewaySubscriberDeps) {}

  /** 幂等订阅：重复 start 会先 stop 旧订阅再挂新的。 */
  start(): void {
    this.stop()
    const bus = this.deps.getBus()
    this.unsub = bus.on(event => this.handle(event))
  }

  stop(): void {
    if (this.unsub) {
      this.unsub()
      this.unsub = null
    }
  }

  /**
   * 主动外发 gateway-proto 已知事件。用于 config.put 这类 RPC 成功后需要
   * 立即广播但 bus 上没有对应事件的场景。
   */
  emit(name: string, payload: Record<string, unknown>): void {
    const frame: EventFrame = {
      type: 'event',
      name,
      payload: { workerId: this.deps.workerId, ...payload },
      ts: Date.now(),
    }
    this.deps.sendEvent(frame)
  }

  private handle(event: WorkerEvent): void {
    const mapped = this.map(event)
    if (!mapped)
      return
    this.deps.sendEvent({
      type: 'event',
      name: mapped.name,
      payload: { workerId: this.deps.workerId, ...mapped.payload },
      ts: Date.parse(event.at) || Date.now(),
    })
  }

  private map(event: WorkerEvent): { name: string, payload: Record<string, unknown> } | null {
    const p = event.payload
    switch (event.type) {
      case 'orchestrator.text': {
        const conversationId = strOrNull(p.conversationId)
        if (!conversationId)
          return null
        const chunk = typeof p.delta === 'string' ? p.delta : ''
        return {
          name: EVENTS.AGENT_THINKING,
          payload: { conversationId, chunk },
        }
      }
      case 'orchestrator.tool_call': {
        const conversationId = strOrNull(p.conversationId)
        const call = (p.call as Record<string, unknown> | undefined) ?? {}
        const toolCallId = strOrNull(call.id)
        const toolName = strOrNull(call.name)
        if (!conversationId || !toolCallId || !toolName)
          return null
        return {
          name: EVENTS.AGENT_TOOL_CALL,
          payload: {
            conversationId,
            toolCallId,
            toolName,
            status: 'pending',
            ...(call.arguments !== undefined ? { args: call.arguments } : {}),
          },
        }
      }
      case 'orchestrator.finished': {
        const conversationId = strOrNull(p.conversationId)
        if (!conversationId)
          return null
        return {
          name: EVENTS.AGENT_DONE,
          payload: { conversationId, finishReason: 'stop' },
        }
      }
      case 'orchestrator.error': {
        const conversationId = strOrNull(p.conversationId)
        if (!conversationId)
          return null
        return {
          name: EVENTS.AGENT_DONE,
          payload: { conversationId, finishReason: 'error' },
        }
      }
      case 'conversation.message': {
        const conversationId = strOrNull(p.conversationId)
        const role = strOrNull(p.role)
        if (!conversationId || !role)
          return null
        if (role !== 'user' && role !== 'assistant' && role !== 'system')
          return null
        // content 不在 bus payload 里，最小化上行：content 留空由 gateway
        // 侧需要时再拉取 messages 表；schema 只要求 content 存在（可空串）。
        return {
          name: EVENTS.CHAT_MESSAGE,
          payload: {
            conversationId,
            role,
            content: typeof p.content === 'string' ? p.content : '',
            createdAt: Date.parse(event.at) || Date.now(),
          },
        }
      }
      case 'approval.requested': {
        // PLAN-014 F2：orchestrator 在 toolPolicy=ask 命中时发到 bus 的事件，
        // 这里直接转换为 gateway 协议的 APPROVAL_REQUESTED 帧上行给 operator。
        // 注意 bus payload 里 workerId 已存在，但下游 emit 会把自身 workerId
        // 再贴一次——payload 里删掉它再走 emit 路径，避免覆盖。
        const taskId = strOrNull(p.taskId)
        const toolCallId = strOrNull(p.toolCallId)
        const toolName = strOrNull(p.toolName)
        const expiresAt = typeof p.expiresAt === 'number' ? p.expiresAt : null
        if (!taskId || !toolCallId || !toolName || expiresAt === null)
          return null
        const params = (typeof p.params === 'object' && p.params !== null)
          ? p.params as Record<string, unknown>
          : {}
        return {
          name: EVENTS.APPROVAL_REQUESTED,
          payload: { taskId, toolCallId, toolName, params, expiresAt },
        }
      }
      default:
        return null
    }
  }
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
