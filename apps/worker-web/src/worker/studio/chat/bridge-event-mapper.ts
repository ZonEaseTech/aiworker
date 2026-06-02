import type { LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type {
  TranscriptActivityModel,
  TranscriptItemModel,
  TranscriptTurnModel,
} from '@zonease/aiworker-ui/components/transcript-types'

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Map a session's normalized engine-bridge events into packages/ui transcript
 * turns. Pure and transport-independent — the same mapping serves a poll or an
 * SSE source.
 *
 * The Worker renders the session chat directly: worker-studio mounts the chat
 * surface on the session route and this pure mapper feeds its transcript view.
 *
 * v1 semantics (one turn per invocation):
 * - `assistant_delta` (`payloadJson.data.text`) accumulates into one
 *   `assistant-markdown` item;
 * - `tool` (`payloadJson.tool.{name,phase,isError}`) becomes an `activity-group`
 *   (one activity per observed tool event; `use` → running, `result` →
 *   succeeded/failed);
 * - `error` (`payloadJson.error`) becomes a danger `status` item.
 *
 * The user message and session artifacts are rendered by the chat surface from
 * the composer submission and the invocation `files`, not from this event stream.
 */
export function buildInvocationTurns(events: LocalSessionEvent[]): TranscriptTurnModel[] {
  const order: string[] = []
  const byInvocation = new Map<string, LocalSessionEvent[]>()
  for (const event of events) {
    const existing = byInvocation.get(event.invocationId)
    if (existing) {
      existing.push(event)
    }
    else {
      byInvocation.set(event.invocationId, [event])
      order.push(event.invocationId)
    }
  }

  return order.map((invocationId) => {
    const invocationEvents = [...byInvocation.get(invocationId)!].sort((left, right) => left.seq - right.seq)
    const items: TranscriptItemModel[] = []

    const markdown = invocationEvents
      .filter(event => event.type === 'assistant_delta')
      .map(event => readString(readRecord(readRecord(event.payloadJson).data).text))
      .join('')
    if (markdown.length > 0)
      items.push({ id: `${invocationId}:assistant`, kind: 'assistant-markdown', markdown })

    const toolActivities: TranscriptActivityModel[] = invocationEvents
      .filter(event => event.type === 'tool')
      .map((event, index) => {
        const tool = readRecord(readRecord(event.payloadJson).tool)
        const phase = readString(tool.phase)
        const status = phase === 'result'
          ? (tool.isError === true ? 'failed' : 'succeeded')
          : 'running'
        return {
          id: `${invocationId}:tool:${index}`,
          status,
          title: readString(tool.name) || 'tool',
        }
      })
    if (toolActivities.length > 0) {
      items.push({
        activities: toolActivities,
        id: `${invocationId}:tools`,
        kind: 'activity-group',
        summary: `${toolActivities.length} tool ${toolActivities.length === 1 ? 'activity' : 'activities'}`,
      })
    }

    for (const event of invocationEvents.filter(event => event.type === 'error')) {
      items.push({
        body: readString(readRecord(event.payloadJson).error) || 'Engine error',
        id: `${invocationId}:error:${event.seq}`,
        kind: 'status',
        tone: 'danger',
      })
    }

    return { id: invocationId, items }
  })
}
