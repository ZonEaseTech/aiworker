import type { LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type {
  TranscriptActivityModel,
  TranscriptItemModel,
  TranscriptTurnModel,
} from '@zonease/aiworker-ui/components/transcript-types'

type TranscriptTimelineStepItem = Extract<TranscriptItemModel, { kind: 'timeline-step' }>
type TranscriptActivityGroupItem = Extract<TranscriptItemModel, { kind: 'activity-group' }>
type TranscriptAssistantMarkdownItem = Extract<TranscriptItemModel, { kind: 'assistant-markdown' }>
type TranscriptResourceCardItem = Extract<TranscriptItemModel, { kind: 'resource-card' }>

/**
 * Display strings for the timeline/lifecycle steps the mapper produces. Injected
 * by the caller (worker-studio threads the active locale catalog) so this pure
 * mapper carries no locale dependency. Terminality is keyed off the semantic
 * bridge event, not these display strings, so localizing them never changes the
 * mapping logic.
 */
export interface BridgeTimelineLabels {
  invocationStarted: string
  working: string
  invocationWarning: string
  engineWarning: string
  invocationCompleted: string
  invocationCancelled: string
  invocationFailed: string
  processStarted: string
  processExited: string
  processLost: string
  engineError: string
}

export const DEFAULT_TIMELINE_LABELS: BridgeTimelineLabels = {
  invocationStarted: 'Invocation started',
  working: 'Working',
  invocationWarning: 'Invocation warning',
  engineWarning: 'Engine warning',
  invocationCompleted: 'Invocation completed',
  invocationCancelled: 'Invocation cancelled',
  invocationFailed: 'Invocation failed',
  processStarted: 'Process started',
  processExited: 'Process exited',
  processLost: 'Process lost',
  engineError: 'Engine error',
}

interface ToolActivitySlot {
  group: TranscriptActivityGroupItem
  index: number
}

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
 * - contiguous `assistant_delta` (`payloadJson.data.text`) events accumulate
 *   into an `assistant-markdown` segment; visible tool/resource/error events
 *   split assistant text so playback keeps native event order;
 * - `tool` (`payloadJson.tool.{name,phase,isError}`) becomes an `activity-group`
 *   (one replacing activity row per tool call; `use` → running, `result` →
 *   succeeded/failed in the same row). Contiguous tools share a group, while
 *   tools after assistant continuation create a later group;
 * - generic lifecycle/progress observations become replacing timeline state
 *   slots, so the UI shows the current state instead of a raw event checklist;
 * - `error` (`payloadJson.error`) becomes a danger `status` item.
 *
 * The user message and session artifacts are rendered by the chat surface from
 * the composer submission and the invocation `files`, not from this event stream.
 */
export function buildInvocationTurns(
  events: LocalSessionEvent[],
  labels: BridgeTimelineLabels = DEFAULT_TIMELINE_LABELS,
): TranscriptTurnModel[] {
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
    let assistantSegmentIndex = 0
    let toolGroupIndex = 0
    const itemSlots = new Map<string, number>()
    const toolActivitySlots = new Map<string, ToolActivitySlot>()

    for (const event of invocationEvents) {
      const timelineStep = timelineStepForEvent(event, labels)
      if (timelineStep)
        upsertTimelineStep(items, itemSlots, timelineStep, labels)

      if (event.type === 'assistant_delta') {
        const delta = readString(readRecord(readRecord(event.payloadJson).data).text)
        if (delta.length > 0) {
          if (!assistantItem) {
            assistantItem = {
              id: assistantItemId(invocationId, assistantSegmentIndex),
              kind: 'assistant-markdown',
              markdown: '',
            }
            assistantSegmentIndex += 1
            items.push(assistantItem)
          }
          assistantItem.markdown += delta
          toolGroupItem = null
        }
      }

      if (event.type === 'tool') {
        assistantItem = null
        const activitySlot = toolActivitySlotForEvent(event, toolGroupItem?.activities.length ?? 0)
        const existingActivitySlot = toolActivitySlots.get(activitySlot)
        if (!existingActivitySlot && !toolGroupItem) {
          toolGroupItem = {
            activities: [],
            id: toolGroupItemId(invocationId, toolGroupIndex),
            kind: 'activity-group',
            summary: '',
          }
          toolGroupIndex += 1
          items.push(toolGroupItem)
        }
        const groupForActivity = existingActivitySlot?.group ?? toolGroupItem!
        const activityIndex = existingActivitySlot?.index ?? groupForActivity.activities.length
        const activity = toolActivityForEvent(
          event,
          invocationId,
          activityIndex,
          existingActivitySlot === undefined ? undefined : groupForActivity.activities[existingActivitySlot.index],
        )
        if (existingActivitySlot === undefined) {
          toolActivitySlots.set(activitySlot, { group: groupForActivity, index: activityIndex })
          groupForActivity.activities.push(activity)
        }
        else {
          groupForActivity.activities[existingActivitySlot.index] = activity
        }
        groupForActivity.summary = toolActivitySummary(groupForActivity.activities)
      }

      if (event.type === 'error') {
        assistantItem = null
        toolGroupItem = null
        items.push({
          body: readString(readRecord(event.payloadJson).error) || labels.engineError,
          id: `${invocationId}:error:${event.seq}`,
          kind: 'status',
          tone: 'danger',
        })
      }

      const resource = resourceItemForEvent(event)
      if (resource) {
        assistantItem = null
        toolGroupItem = null
        items.push(resource)
      }
    }

    const hasAssistantText = items.some(item => item.kind === 'assistant-markdown' && item.markdown.trim().length > 0)
    pruneRedundantRunningLifecycleChrome(items)
    pruneAnsweredRunningProgress(items, hasAssistantText)
    pruneSuccessfulLifecycleChrome(items, hasAssistantText)
    return { id: invocationId, items }
  })
}

function assistantItemId(invocationId: string, segmentIndex: number): string {
  return segmentIndex === 0 ? `${invocationId}:assistant` : `${invocationId}:assistant:${segmentIndex}`
}

function toolGroupItemId(invocationId: string, groupIndex: number): string {
  return groupIndex === 0 ? `${invocationId}:tools` : `${invocationId}:tools:${groupIndex}`
}

function upsertTimelineStep(
  items: TranscriptItemModel[],
  itemSlots: Map<string, number>,
  step: TranscriptTimelineStepItem,
  labels: BridgeTimelineLabels,
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
    body: timelineStepBodyForReplacement(existing, step, labels),
    id: existing.id,
  }
}

function timelineStepBodyForReplacement(
  existing: TranscriptTimelineStepItem,
  step: TranscriptTimelineStepItem,
  labels: BridgeTimelineLabels,
): TranscriptTimelineStepItem['body'] {
  if (step.body !== undefined)
    return step.body
  if (step.category === 'progress')
    return existing.body
  if (step.category === 'lifecycle' && isInvocationTerminalTitle(step.title, labels))
    return existing.body ?? timelineTitleDetail(existing, step)
  return undefined
}

function isInvocationTerminalTitle(title: TranscriptTimelineStepItem['title'], labels: BridgeTimelineLabels): boolean {
  return title === labels.invocationCompleted || title === labels.invocationCancelled
}

function timelineTitleDetail(
  existing: TranscriptTimelineStepItem,
  step: TranscriptTimelineStepItem,
): string | undefined {
  if (typeof existing.title !== 'string' || existing.title === step.title)
    return undefined
  return existing.title
}

function toolActivityForEvent(
  event: LocalSessionEvent,
  invocationId: string,
  index: number,
  existingActivity?: TranscriptActivityModel,
): TranscriptActivityModel {
  const tool = readRecord(readRecord(event.payloadJson).tool)
  const phase = readString(tool.phase)
  const explicitStatus = readString(tool.status)
  const status = phase === 'result'
    ? (tool.isError === true || explicitStatus === 'failed' ? 'failed' : 'succeeded')
    : 'running'
  const title = readString(tool.name) || readReactText(existingActivity?.title) || 'tool'
  return {
    ...existingActivity,
    command: commandForTool(tool, title, status, existingActivity?.command),
    id: existingActivity?.id ?? `${invocationId}:tool:${index}`,
    status,
    title,
  }
}

function commandForTool(
  tool: Record<string, unknown>,
  title: string,
  status: TranscriptActivityModel['status'],
  existingCommand?: TranscriptActivityModel['command'],
): TranscriptActivityModel['command'] {
  const input = readRecord(tool.input)
  const command = readString(tool.command) || readString(input.command) || existingCommand?.command || ''
  if (!command)
    return undefined

  const output = readString(tool.output) || readString(tool.content) || existingCommand?.output || undefined

  return {
    command,
    output,
    status,
    title: readReactText(existingCommand?.title) || title,
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

function toolActivitySummary(activities: TranscriptActivityModel[]): string {
  const first = activities[0]
  if (!first)
    return 'Tool activity'
  const summary = toolActivitySummaryLabel(first)
  if (activities.length === 1)
    return summary
  return `${summary} + ${activities.length - 1} more`
}

function toolActivitySummaryLabel(activity: TranscriptActivityModel): string {
  const title = readReactText(activity.title) || 'tool'
  const command = activity.command?.command
  const verb = activity.status === 'failed'
    ? 'Failed'
    : activity.status === 'running' || activity.status === 'waiting'
      ? 'Running'
      : activity.status === 'succeeded'
        ? 'Ran'
        : 'Used'

  if (!command)
    return `${verb} ${title}`

  return `${verb} ${title}: ${summarizeCommandText(command)}`
}

function summarizeCommandText(command: string): string {
  const normalized = command.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 120)
    return normalized
  return `${normalized.slice(0, 96)}…${normalized.slice(-20)}`
}

function readReactText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function timelineStepForEvent(event: LocalSessionEvent, labels: BridgeTimelineLabels): TranscriptTimelineStepItem | null {
  const payload = readRecord(event.payloadJson)
  const bridgeEvent = readString(payload.bridgeEvent)

  if (bridgeEvent === 'invocation.started') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'running',
      title: labels.invocationStarted,
    }
  }

  if (bridgeEvent === 'invocation.progress') {
    const message = readProgressMessage(payload)
    return {
      category: 'progress',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'running',
      title: message || labels.working,
    }
  }

  if (bridgeEvent === 'invocation.warning') {
    return {
      body: readProgressMessage(payload) || labels.engineWarning,
      category: 'progress',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'waiting',
      title: labels.invocationWarning,
    }
  }

  if (bridgeEvent === 'invocation.completed') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'succeeded',
      title: labels.invocationCompleted,
    }
  }

  if (bridgeEvent === 'invocation.cancelled') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'failed',
      title: labels.invocationCancelled,
    }
  }

  if (bridgeEvent === 'process.started') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'running',
      title: labels.processStarted,
    }
  }

  if (bridgeEvent === 'process.exited') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'succeeded',
      title: labels.processExited,
    }
  }

  if (bridgeEvent === 'process.lost') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'failed',
      title: labels.processLost,
    }
  }

  const status = readString(payload.status)
  if (status === 'queued' || status === 'starting' || status === 'running') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'running',
      title: labels.invocationStarted,
    }
  }

  if (status === 'succeeded') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'succeeded',
      title: labels.invocationCompleted,
    }
  }

  if (status === 'cancelled') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'failed',
      title: labels.invocationCancelled,
    }
  }

  if (status === 'failed' || status === 'lost') {
    return {
      category: 'lifecycle',
      id: `${event.invocationId}:timeline:${event.seq}`,
      kind: 'timeline-step',
      provenance: 'engine',
      status: 'failed',
      title: status === 'lost' ? labels.processLost : labels.invocationFailed,
    }
  }

  return null
}

function readProgressMessage(payload: Record<string, unknown>): string | undefined {
  const data = readRecord(payload.data)
  const message = readString(data.message)
  return message || undefined
}

function resourceItemForEvent(event: LocalSessionEvent): TranscriptResourceCardItem | null {
  if (event.type !== 'artifact' && event.type !== 'file_change')
    return null

  const payload = readRecord(event.payloadJson)
  const resource = readRecord(payload.resource)
  const file = readRecord(payload.file)
  const source = Object.keys(resource).length > 0 ? resource : file
  const title = readString(source.title) || readString(source.path) || readString(source.href)
  if (!title)
    return null

  return {
    id: `${event.invocationId}:resource:${event.seq}`,
    kind: 'resource-card',
    resource: {
      href: readSafeHref(source.href),
      id: `${event.invocationId}:resource:${event.seq}:model`,
      kind: readResourceKind(source.kind),
      location: readString(source.location) || readString(source.path) || undefined,
      status: readString(source.status) || undefined,
      title,
    },
  }
}

function readResourceKind(value: unknown): TranscriptResourceCardItem['resource']['kind'] {
  if (
    value === 'browser'
    || value === 'directory'
    || value === 'document'
    || value === 'file'
    || value === 'image'
    || value === 'web'
  ) {
    return value
  }
  return 'unknown'
}

function readSafeHref(value: unknown): string | undefined {
  const href = readString(value).trim()
  if (!href || hasControlCharacter(href))
    return undefined

  try {
    const url = new URL(href, 'https://aiworker.local')
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return href
  }
  catch {
    return undefined
  }

  return undefined
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127)
      return true
  }
  return false
}

function pruneSuccessfulLifecycleChrome(
  items: TranscriptItemModel[],
  hasAssistantText: boolean,
): void {
  if (!hasAssistantText)
    return

  const hasSucceededLifecycle = items.some(item =>
    item.kind === 'timeline-step'
    && item.category === 'lifecycle'
    && item.status === 'succeeded',
  )
  if (!hasSucceededLifecycle)
    return

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (
      item?.kind === 'timeline-step'
      && (
        (item.category === 'lifecycle' && item.status === 'succeeded')
        || (item.category === 'progress' && item.status === 'running')
      )
    ) {
      items.splice(index, 1)
    }
  }
}

function pruneAnsweredRunningProgress(
  items: TranscriptItemModel[],
  hasAssistantText: boolean,
): void {
  if (!hasAssistantText)
    return

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item?.kind === 'timeline-step' && item.category === 'progress' && item.status === 'running')
      items.splice(index, 1)
  }
}

function pruneRedundantRunningLifecycleChrome(items: TranscriptItemModel[]): void {
  const hasClearerActivity = items.some(item =>
    item.kind === 'activity-group'
    || item.kind === 'assistant-markdown'
    || (item.kind === 'timeline-step' && item.category === 'progress')
    || item.kind === 'resource-card',
  )
  if (!hasClearerActivity)
    return

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (
      item?.kind === 'timeline-step'
      && item.category === 'lifecycle'
      && item.status === 'running'
    ) {
      items.splice(index, 1)
    }
  }
}
