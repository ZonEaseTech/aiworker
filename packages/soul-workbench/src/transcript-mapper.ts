import type {
  TranscriptActivityModel,
  TranscriptItemModel,
  TranscriptTurnModel,
} from '@zonease/aiworker-ui/components/transcript-types'

/**
 * Map the daemon's normalized engine-bridge events (as delivered over the US-005
 * SSE stream) into packages/ui transcript turns. Pure and transport-independent.
 *
 * This is the mounted-workbench (方案 C) counterpart of worker-web's
 * buildInvocationTurns. It is a distinct mapper, not a reuse: worker-web keys on
 * raw session-event types (`assistant_delta`/`tool`/`error`) while the broker SSE
 * delivers normalized bridge events whose fields live at the top level
 * (`data.text`, `tool.{phase,name,isError}`, `error`). Keeping the SSE contract on
 * normalized bridge events is the right consumer boundary for the mounted plane.
 *
 * v1 semantics (one turn per invocation):
 * - `invocation.output.delta` / `invocation.output.snapshot` accumulate into one
 *   `assistant-markdown` item;
 * - `invocation.tool.observed` becomes an `activity-group` (`phase: 'use'` →
 *   running, `'result'` → succeeded unless `tool.isError`);
 * - `invocation.error` becomes a danger `status` item.
 *
 * Other bridge events (started/progress/usage/completed/cancelled/warning) carry no
 * transcript body in v1 and are ignored.
 */
export interface WorkbenchBridgeEvent {
  [key: string]: unknown
  id?: number | string
  invocationId?: string
  type?: string
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

export function bridgeEventsToTranscriptTurns(events: WorkbenchBridgeEvent[]): TranscriptTurnModel[] {
  const order: string[] = []
  const byInvocation = new Map<string, WorkbenchBridgeEvent[]>()
  for (const event of events) {
    const invocationId = readString(event.invocationId)
    const existing = byInvocation.get(invocationId)
    if (existing) {
      existing.push(event)
    }
    else {
      byInvocation.set(invocationId, [event])
      order.push(invocationId)
    }
  }

  return order.map((invocationId) => {
    const invocationEvents = [...byInvocation.get(invocationId)!].sort((left, right) => readNumber(left.id) - readNumber(right.id))
    const items: TranscriptItemModel[] = []

    const markdown = invocationEvents
      .filter(event => event.type === 'invocation.output.delta' || event.type === 'invocation.output.snapshot')
      .map(event => readString(readRecord(event.data).text))
      .join('')
    if (markdown.length > 0)
      items.push({ id: `${invocationId}:assistant`, kind: 'assistant-markdown', markdown })

    const toolActivities: TranscriptActivityModel[] = invocationEvents
      .filter(event => event.type === 'invocation.tool.observed')
      .map((event, index) => {
        const tool = readRecord(event.tool)
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

    for (const event of invocationEvents.filter(event => event.type === 'invocation.error')) {
      // The daemon's error event carries the human message in `message` and the
      // machine code in `failureCode` (worker-runtime appendEvent on failure).
      items.push({
        body: readString(event.message) || readString(event.failureCode) || 'Engine error',
        id: `${invocationId}:error:${readNumber(event.id)}`,
        kind: 'status',
        tone: 'danger',
      })
    }

    return { id: invocationId, items }
  })
}
