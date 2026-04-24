import type { EventName } from '@aiworker/gateway-proto'
import { EVENTS } from '@aiworker/gateway-proto'
import { useEffect } from 'react'
import { getGatewayClient } from '@/lib/gateway-client'

/**
 * PLAN-013 S5: 前端事件源从 `/api/events/stream` (SSE) 迁到 gateway WS `event`
 * 帧。handler 仍拿到 `{ type, payload, timestamp }` 这一旧 shape,便于已有
 * dashboard 组件继续使用;name 字段使用 gateway EVENTS 常量集合。
 */

export interface BusEvent {
  type: string
  payload: unknown
  timestamp: string
}

/** 只订阅这些事件——覆盖老 SSE 消费者关心的 worker / chat / agent 流。 */
const SUBSCRIBED_EVENTS: EventName[] = [
  EVENTS.WORKER_ONLINE,
  EVENTS.WORKER_OFFLINE,
  EVENTS.CHAT_MESSAGE,
  EVENTS.AGENT_THINKING,
  EVENTS.AGENT_TOOL_CALL,
  EVENTS.AGENT_DONE,
  EVENTS.CONFIG_CHANGED,
  EVENTS.LOGS_LINE,
]

export function useEventStream(onEvent: (event: BusEvent) => void, enabled = true) {
  useEffect(() => {
    if (!enabled)
      return undefined
    const client = getGatewayClient()
    const unsubs = SUBSCRIBED_EVENTS.map(name =>
      client.onEvent(name, (payload) => {
        onEvent({ type: name, payload, timestamp: new Date().toISOString() })
      }),
    )
    return () => {
      for (const u of unsubs) u()
    }
  }, [onEvent, enabled])
}
