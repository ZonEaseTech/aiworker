import type { LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type {
  TranscriptActivityModel,
  TranscriptItemModel,
  TranscriptTurnModel,
} from '@zonease/aiworker-ui/components/transcript-types'

type TranscriptTimelineStepItem = Extract<TranscriptItemModel, { kind: 'timeline-step' }>
type TranscriptActivityGroupItem = Extract<TranscriptItemModel, { kind: 'activity-group' }>
type TranscriptAssistantMarkdownItem = Extract<TranscriptItemModel, { kind: 'assistant-markdown' }>

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
 *   (one replacing activity row per tool call; `use` → running, `result` →
 *   succeeded/failed in the same row);
 * - generic lifecycle/progress observations become replacing timeline state
 *   slots, so the UI shows the current state instead of a raw event checklist;
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
    let assistantItem: TranscriptAssistantMarkdownItem | null = null
    let toolGroupItem: TranscriptActivityGroupItem | null = null
    const itemSlots = new Map<string, number>()
    const toolActivitySlots = new Map<string, number>()

    for (const event of invocationEvents) {
      const timelineStep = timelineStepForEvent(event)
      if (timelineStep)
        upsertTimelineStep(items, itemSlots, timelineStep)

      if (event.type === 'assistant_delta') {
        const delta = readString(readRecord(readRecord(event.payloadJson).data).text)
        if (delta.length > 0) {
          if (!assistantItem) {
            assistantItem = { id: `${invocationId}:assistant`, kind: 'assistant-markdown', markdown: '' }
            items.push(assistantItem)
          }
          assistantItem.markdown += delta
        }
      }

      if (event.type === 'tool') {
        if (!toolGroupItem) {
          toolGroupItem = {
            activities: [],
            id: `${invocationId}:tools`,
            kind: 'activity-group',
            summary: '',
          }
          items.push(toolGroupItem)
        }
        const activitySlot = toolActivitySlotForEvent(event, toolGroupItem.activities.length)
        const existingActivityIndex = toolActivitySlots.get(activitySlot)
        const activityIndex = existingActivityIndex ?? toolGroupItem.activities.length
        const activity = toolActivityForEvent(event, invocationId, activityIndex)
        if (existingActivityIndex === undefined) {
          toolActivitySlots.set(activitySlot, activityIndex)
          toolGroupItem.activities.push(activity)
        }
        else {
          toolGroupItem.activities[existingActivityIndex] = activity
        }
        toolGroupItem.summary = toolActivitySummary(toolGroupItem.activities.length)
      }

      if (event.type === 'error') {
        items.push({
          body: readString(readRecord(event.payloadJson).error) || 'Engine error',
          id: `${invocationId}:error:${event.seq}`,
          kind: 'status',
          tone: 'danger',
        })
      }
    }

    return { id: invocationId, items }
  })
}

function upsertTimelineStep(
  items: TranscriptItemModel[],
  itemSlots: Map<string, number>,
  step: TranscriptTimelineStepItem,
): void {
  const slot = step.category ?? step.id
  const existingIndex = itemSlots.get(slot)
  if (existingIndex === undefined) {
    itemSlots.set(slot, items.length)
    items.push(step)
    return
  }

  const existing = items[existingIndex]
  if (!existing || existing.kind !== 'timeline-step') {
    items[existingIndex] = step
    return
  }

  items[existingIndex] = {
    ...existing,
    ...step,
    body: timelineStepBodyForReplacement(existing, step),
    id: existing.id,
  }
}

function timelineStepBodyForReplacement(
  existing: TranscriptTimelineStepItem,
  step: TranscriptTimelineStepItem,
): TranscriptTimelineStepItem['body'] {
  if (step.body !== undefined)
    return step.body
  if (step.category === 'progress')
    return existing.body
  if (step.category === 'lifecycle' && isInvocationTerminalTitle(step.title))
    return existing.body ?? timelineTitleDetail(existing, step)
  return undefined
}

function isInvocationTerminalTitle(title: TranscriptTimelineStepItem['title']): boolean {
  return title === 'Invocation completed' || title === 'Invocation cancelled'
}

function timelineTitleDetail(
  existing: TranscriptTimelineStepItem,
  step: TranscriptTimelineStepItem,
): string | undefined {
  if (typeof existing.title !== 'string' || existing.title === step.title)
    return undefined
  return existing.title
}

function toolActivityForEvent(event: LocalSessionEvent, invocationId: string, index: number): TranscriptActivityModel {
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
}

function toolActivitySlotForEvent(event: LocalSessionEvent, fallbackIndex: number): string {
  const tool = readRecord(readRecord(event.payloadJson).tool)
  return readString(tool.id)
    || readString(tool.callId)
    || readString(tool.call_id)
    || readString(tool.name)
    || `tool:${fallbackIndex}`
}

function toolActivitySummary(count: number): string {
  return `${count} tool ${count === 1 ? 'activity' : 'activities'}`
}

function timelineStepForEvent(event: LocalSessionEvent): TranscriptTimelineStepItem | null {
  const payload = readRecord(event.payloadJson)
  const bridgeEvent = readString(payload.bridgeEvent)

  if (bridgeEvent === 'invocation.started') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'running',
      title: 'Invocation started',
    }
  }

  if (bridgeEvent === 'invocation.progress') {
    const body = readProgressMessage(payload)
    return {
      body,
      category: 'progress',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'running',
      title: 'Progress update',
    }
  }

  if (bridgeEvent === 'invocation.warning') {
    return {
      body: readProgressMessage(payload) || 'Engine warning',
      category: 'progress',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'waiting',
      title: 'Invocation warning',
    }
  }

  if (bridgeEvent === 'invocation.completed') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'succeeded',
      title: 'Invocation completed',
    }
  }

  if (bridgeEvent === 'invocation.cancelled') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'failed',
      title: 'Invocation cancelled',
    }
  }

  if (bridgeEvent === 'process.started') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'running',
      title: 'Process started',
    }
  }

  if (bridgeEvent === 'process.exited') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'succeeded',
      title: 'Process exited',
    }
  }

  if (bridgeEvent === 'process.lost') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'failed',
      title: 'Process lost',
    }
  }

  return null
}

function readProgressMessage(payload: Record<string, unknown>): string | undefined {
  const data = readRecord(payload.data)
  const message = readString(data.message)
  return message || undefined
}
