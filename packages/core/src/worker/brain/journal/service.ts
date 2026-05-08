import type { AgentTaskStatus, WorkerConfig } from '@zonease/aiworker-shared'
import type { BrainJournalEventRow } from '@zonease/aiworker-storage-sqlite/worker'

import { redactBodySecrets, redactSecretLikeValues } from '@zonease/aiworker-shared'
import {
  agentTasks,
  brainJournalEvents,
  conversations,
  getWorkerDb,
  messages,
} from '@zonease/aiworker-storage-sqlite/worker'
import { asc, desc, eq, or } from 'drizzle-orm'

export type BrainJournalEventKind
  = | 'admission.bypass_suspected'
    | 'assistant.message'
    | 'brain_engine.review'
    | 'conversation.created'
    | 'decision.capability'
    | 'decision.intent'
    | 'gate.quality'
    | 'inbox.candidates_proposed'
    | 'repair.attempted'
    | 'rerun.requested'
    | 'task.failed'
    | 'task.held'
    | 'task.queued'
    | 'task.running'
    | 'task.succeeded'
    | 'tool.result'
    | 'tool.use'
    | 'user.message'
    | 'executor.binding'
    | 'executor.error'
    | 'executor.finish'
    | 'executor.permission_request'
    | 'executor.token_usage'

export interface RecordBrainJournalEventInput {
  kind: BrainJournalEventKind
  taskId?: string
  conversationId?: string
  payload?: Record<string, unknown>
  at?: string
}

export type BrainJournalAuthorityMode = 'aiworker_brokered' | 'provider_managed' | 'unmanaged_ambient' | 'unknown'
export type BrainGateVerdictAction = 'pass' | 'warn' | 'repair' | 'rerun' | 'switch-executor' | 'hold' | 'block'
export type BrainGateVerdictReasonSource = 'kernel-invariant' | 'brain-engine-review' | 'executor-claim' | 'heuristic' | 'human-approval' | 'observe-only'
export type BrainGateVerdictReasonMode = 'observe-only' | 'enforced'

export interface BrainGateVerdictReason {
  source: BrainGateVerdictReasonSource
  mode: BrainGateVerdictReasonMode
  reason: string
  evidenceRef?: string
}

export interface BrainGateVerdict {
  action: BrainGateVerdictAction
  mode: BrainGateVerdictReasonMode
  reasons: BrainGateVerdictReason[]
  evidenceRefs: string[]
  latestEventId?: number
  recordedAt?: string
}

export interface BrainJournalTrace {
  version: 1
  workerId?: string
  task: {
    id: string
    prompt: string
    status: AgentTaskStatus
    conversationId?: string
    createdAt: string
    finishedAt?: string
    result?: Record<string, unknown>
    error?: string
  }
  conversation?: {
    id: string
    channel: string
    chatId: string
    threadId?: string
    status: string
    startedAt: string
    lastActiveAt: string
    closedAt?: string
  }
  executor: {
    engine?: string
    variant?: string
    authorityMode: BrainJournalAuthorityMode
    note: string
  }
  proofLoop: {
    status: AgentTaskStatus
    journal: 'recorded' | 'empty'
    gate: 'recorded' | 'missing'
    admission: 'candidate-recorded' | 'none'
  }
  gateVerdict: BrainGateVerdict
  brainContext: {
    loadedMemoryIds: string[]
    loadedSkillIds: string[]
  }
  lineage: {
    parentTaskIds: string[]
    childTaskIds: string[]
  }
  decisions: {
    intent?: Record<string, unknown>
    capability?: Record<string, unknown>
    qualityGate?: Record<string, unknown>
  }
  messages: BrainJournalMessageRef[]
  toolEvents: BrainJournalEventDto[]
  events: BrainJournalEventDto[]
}

export interface BrainJournalMessageRef {
  id: number
  role: string
  ref: string
  contentLength: number
  contentPreview: string
  createdAt: string
  toolCallIds: string[]
  toolCallId?: string
  auditKind?: string
}

export interface BrainJournalEventDto {
  id: number
  kind: string
  taskId?: string
  conversationId?: string
  at: string
  payload: Record<string, unknown>
}

export interface BrainJournalServiceDeps {
  workerId?: string
  config?: WorkerConfig
}

export interface ReadBrainJournalOptions {
  redactSensitive?: boolean
}

export function createBrainJournalService(deps: BrainJournalServiceDeps = {}): BrainJournalService {
  return new BrainJournalService(deps)
}

export function recordBrainJournalEvent(input: RecordBrainJournalEventInput): BrainJournalEventRow {
  const rows = getWorkerDb().insert(brainJournalEvents).values({
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
    kind: input.kind,
    payload: redactSecretLikeValues(input.payload ?? {}),
    createdAt: input.at ?? new Date().toISOString(),
  }).returning().all()
  return rows[0]!
}

export class BrainJournalService {
  constructor(private readonly deps: BrainJournalServiceDeps = {}) {}

  getTaskTrace(taskId: string, options: ReadBrainJournalOptions = {}): BrainJournalTrace | null {
    const task = getWorkerDb().select().from(agentTasks).where(eq(agentTasks.id, taskId)).get()
    if (!task)
      return null

    const conversation = this.findConversation(taskId, task.conversationId ?? undefined)
    const eventRows = this.listEvents(taskId, conversation?.id)
    const redactSensitive = options.redactSensitive !== false
    const events = eventRows.map(row => toEventDto(row, redactSensitive))
    const messageRefs = conversation ? this.listMessageRefs(conversation.id, redactSensitive) : []
    const capability = latestPayload(events, 'decision.capability')
    const qualityGate = latestPayload(events, 'gate.quality')
    const gateVerdict = buildGateVerdict(events)
    const admissionEvents = events.filter(event => event.kind.startsWith('admission.'))
    const { loadedMemoryIds, loadedSkillIds } = extractBrainContext(capability)

    return {
      version: 1,
      ...(this.deps.workerId === undefined ? {} : { workerId: this.deps.workerId }),
      task: {
        id: task.id,
        prompt: safeText(task.prompt, redactSensitive),
        status: task.status,
        ...(task.conversationId === null ? {} : { conversationId: task.conversationId }),
        createdAt: task.createdAt,
        ...(task.finishedAt === null ? {} : { finishedAt: task.finishedAt }),
        ...(task.result === null ? {} : { result: redactMaybe(task.result, redactSensitive) }),
        ...(task.error === null ? {} : { error: safeText(task.error, redactSensitive) }),
      },
      ...(conversation === undefined
        ? {}
        : {
            conversation: {
              id: conversation.id,
              channel: conversation.channel,
              chatId: conversation.chatId,
              ...(conversation.threadId === null ? {} : { threadId: conversation.threadId }),
              status: conversation.status,
              startedAt: conversation.startedAt,
              lastActiveAt: conversation.lastActiveAt,
              ...(conversation.closedAt === null ? {} : { closedAt: conversation.closedAt }),
            },
          }),
      executor: describeExecutorAuthority(this.deps.config),
      proofLoop: {
        status: task.status,
        journal: events.length > 0 ? 'recorded' : 'empty',
        gate: gateVerdict.latestEventId === undefined ? 'missing' : 'recorded',
        admission: admissionEvents.length > 0 ? 'candidate-recorded' : 'none',
      },
      gateVerdict,
      brainContext: {
        loadedMemoryIds,
        loadedSkillIds,
      },
      lineage: {
        parentTaskIds: extractLineageTaskIds(events, task.result, 'parent'),
        childTaskIds: extractLineageTaskIds(events, task.result, 'child'),
      },
      decisions: {
        ...(latestPayload(events, 'decision.intent') === undefined ? {} : { intent: latestPayload(events, 'decision.intent') }),
        ...(capability === undefined ? {} : { capability }),
        ...(qualityGate === undefined ? {} : { qualityGate }),
      },
      messages: messageRefs,
      toolEvents: events.filter(event => event.kind === 'tool.use' || event.kind === 'tool.result'),
      events,
    }
  }

  private findConversation(taskId: string, conversationId: string | undefined) {
    if (conversationId !== undefined) {
      const byTask = getWorkerDb().select().from(conversations).where(eq(conversations.id, conversationId)).get()
      if (byTask)
        return byTask
    }
    return getWorkerDb().select().from(conversations).where(eq(conversations.taskId, taskId)).orderBy(desc(conversations.startedAt)).get()
  }

  private listEvents(taskId: string, conversationId: string | undefined): BrainJournalEventRow[] {
    const predicate = conversationId === undefined
      ? eq(brainJournalEvents.taskId, taskId)
      : or(eq(brainJournalEvents.taskId, taskId), eq(brainJournalEvents.conversationId, conversationId))
    return getWorkerDb()
      .select()
      .from(brainJournalEvents)
      .where(predicate)
      .orderBy(asc(brainJournalEvents.createdAt), asc(brainJournalEvents.id))
      .all()
  }

  private listMessageRefs(conversationId: string, redactSensitive: boolean): BrainJournalMessageRef[] {
    return getWorkerDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.id))
      .all()
      .map(row => ({
        id: row.id,
        role: row.role,
        ref: `${conversationId}:${row.id}`,
        contentLength: row.content.length,
        contentPreview: excerpt(safeText(row.content, redactSensitive), 600),
        createdAt: row.createdAt,
        toolCallIds: row.toolCalls?.map(call => call.id) ?? [],
        ...(row.toolCallId === null ? {} : { toolCallId: row.toolCallId }),
        ...(auditKind(row.richMetadata) === undefined ? {} : { auditKind: auditKind(row.richMetadata) }),
      }))
  }
}

export function describeExecutorAuthority(config: WorkerConfig | undefined): BrainJournalTrace['executor'] {
  const engine = config?.executor.engine
  const variant = config?.executor.variant
  if (engine === undefined) {
    return {
      authorityMode: 'unknown',
      note: 'executor config is unavailable; Journal cannot infer authority mode',
    }
  }

  if (engine === 'codex' || engine === 'claude-code' || engine === 'cursor' || engine === 'acp') {
    return {
      engine,
      variant,
      authorityMode: 'unmanaged_ambient',
      note: 'external executor may load user/host-level tools, auth, native sessions, MCP, skills, plugins, and sandbox policy outside AIWorker control',
    }
  }

  if (engine === 'http' || engine === 'mcp') {
    return {
      engine,
      variant,
      authorityMode: 'provider_managed',
      note: 'AIWorker uses a thin adapter and records observed events; provider/runtime permissions remain outside Brain memory governance',
    }
  }

  return {
    engine,
    variant,
    authorityMode: 'unknown',
    note: 'executor authority mode is not classified; treat runtime capabilities as external until explicitly brokered',
  }
}

export function buildGateVerdict(events: BrainJournalEventDto[]): BrainGateVerdict {
  const admissionBypass = latestEvent(events, 'admission.bypass_suspected')
  const brainEngineReview = latestEvent(events, 'brain_engine.review')
  const brainEngineReason = brainEngineReview === undefined ? undefined : reasonFromBrainEngineReview(brainEngineReview)
  const qualityGate = latestEvent(events, 'gate.quality')
  const qualityGateReason = qualityGate === undefined ? undefined : reasonFromQualityGate(qualityGate)

  if (admissionBypass !== undefined) {
    return verdictFromReasons({
      action: 'hold',
      at: admissionBypass.at,
      eventId: admissionBypass.id,
      mode: 'enforced',
      reasons: [
        reasonFromEvent(admissionBypass, {
          mode: 'enforced',
          reason: stringValue(admissionBypass.payload.reason) ?? 'brain admission bypass suspected',
          source: 'kernel-invariant',
        }),
        ...optionalReason(brainEngineReason),
        ...optionalReason(qualityGateReason),
      ],
    })
  }

  if (brainEngineReview !== undefined && brainEngineReason !== undefined && brainEngineReview.payload.status === 'reviewed') {
    const action = gateAction(brainEngineReview.payload.action)
    if (action !== 'pass') {
      return verdictFromReasons({
        action,
        at: brainEngineReview.at,
        eventId: brainEngineReview.id,
        mode: brainEngineReason.mode,
        reasons: [
          brainEngineReason,
          ...optionalReason(qualityGateReason),
        ],
      })
    }
  }

  if (qualityGate !== undefined) {
    const action = gateAction(qualityGate.payload.action)
    return verdictFromReasons({
      action,
      at: qualityGate.at,
      eventId: qualityGate.id,
      mode: qualityGateReason?.mode ?? 'observe-only',
      reasons: [
        ...optionalReason(qualityGateReason),
        ...optionalReason(brainEngineReason),
      ],
    })
  }

  const executorError = latestEvent(events, 'executor.error') ?? latestEvent(events, 'task.failed')
  if (executorError !== undefined) {
    return verdictFromReasons({
      action: 'rerun',
      at: executorError.at,
      eventId: executorError.id,
      mode: 'observe-only',
      reasons: [
        reasonFromEvent(executorError, {
          mode: 'observe-only',
          reason: stringValue(executorError.payload.error) ?? 'executor failed before a quality gate verdict was recorded',
          source: 'executor-claim',
        }),
        ...optionalReason(brainEngineReason),
      ],
    })
  }

  return {
    action: 'hold',
    evidenceRefs: [],
    mode: 'observe-only',
    reasons: [
      {
        mode: 'observe-only',
        reason: 'no gate verdict recorded for this task',
        source: 'observe-only',
      },
    ],
  }
}

function reasonFromBrainEngineReview(event: BrainJournalEventDto): BrainGateVerdictReason {
  return reasonFromEvent(event, {
    mode: event.payload.mode === 'enforced' ? 'enforced' : 'observe-only',
    reason: stringValue(event.payload.reason) ?? 'Brain Engine review result',
    source: 'brain-engine-review',
  })
}

function reasonFromQualityGate(event: BrainJournalEventDto): BrainGateVerdictReason {
  const evaluator = stringValue(event.payload.evaluator)
  return reasonFromEvent(event, {
    mode: event.payload.mode === 'enforced' ? 'enforced' : 'observe-only',
    reason: stringValue(event.payload.reason) ?? `quality gate ${gateAction(event.payload.action)}`,
    source: evaluator === 'llm' ? 'brain-engine-review' : 'heuristic',
  })
}

function reasonFromEvent(
  event: BrainJournalEventDto,
  input: Omit<BrainGateVerdictReason, 'evidenceRef'>,
): BrainGateVerdictReason {
  return {
    ...input,
    evidenceRef: `brain_journal_events:${event.id}`,
  }
}

function optionalReason(reason: BrainGateVerdictReason | undefined): BrainGateVerdictReason[] {
  return reason === undefined ? [] : [reason]
}

function toEventDto(row: BrainJournalEventRow, redactSensitive: boolean): BrainJournalEventDto {
  return {
    id: row.id,
    kind: row.kind,
    ...(row.taskId === null ? {} : { taskId: row.taskId }),
    ...(row.conversationId === null ? {} : { conversationId: row.conversationId }),
    at: row.createdAt,
    payload: redactMaybe(row.payload, redactSensitive),
  }
}

function latestEvent(events: BrainJournalEventDto[], kind: string): BrainJournalEventDto | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (event.kind === kind)
      return event
  }
  return undefined
}

function latestPayload(events: BrainJournalEventDto[], kind: string): Record<string, unknown> | undefined {
  return latestEvent(events, kind)?.payload
}

function extractBrainContext(payload: Record<string, unknown> | undefined): { loadedMemoryIds: string[], loadedSkillIds: string[] } {
  return {
    loadedMemoryIds: stringArray(payload?.loadedMemoryIds),
    loadedSkillIds: stringArray(payload?.loadedSkillIds),
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function extractLineageTaskIds(events: BrainJournalEventDto[], taskResult: Record<string, unknown> | null, direction: 'parent' | 'child'): string[] {
  const keys = direction === 'parent'
    ? ['parentTaskId', 'rerunOfTaskId', 'repairOfTaskId', 'previousTaskId']
    : ['childTaskId', 'rerunTaskId', 'repairTaskId', 'nextTaskId']
  const ids = new Set<string>()
  for (const source of [taskResult, ...events.map(event => event.payload)]) {
    if (source === null || source === undefined)
      continue
    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'string' && value.length > 0) {
        ids.add(value)
      }
      else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.length > 0)
            ids.add(item)
        }
      }
    }
  }
  return [...ids]
}

function auditKind(raw: string | null): string | undefined {
  if (raw === null)
    return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const kind = (parsed as Record<string, unknown>).kind
      return typeof kind === 'string' ? kind : undefined
    }
  }
  catch {}
  return undefined
}

function redactMaybe<T>(value: T, redactSensitive: boolean): T {
  return redactSensitive ? redactSecretLikeValues(value) : value
}

function safeText(text: string, redactSensitive: boolean): string {
  return redactSensitive ? redactBodySecrets(text).body : text
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit)
    return text
  return `${text.slice(0, limit - 3)}...`
}

function gateAction(value: unknown): BrainGateVerdictAction {
  if (value === 'pass' || value === 'warn' || value === 'repair' || value === 'block')
    return value
  if (value === 'rerun' || value === 'switch-executor' || value === 'hold')
    return value
  return 'hold'
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function verdictFromReasons(input: {
  action: BrainGateVerdictAction
  at: string
  eventId: number
  mode: BrainGateVerdictReasonMode
  reasons: BrainGateVerdictReason[]
}): BrainGateVerdict {
  const evidenceRefs = input.reasons
    .map(reason => reason.evidenceRef)
    .filter((ref): ref is string => ref !== undefined)
  return {
    action: input.action,
    evidenceRefs,
    latestEventId: input.eventId,
    mode: input.mode,
    reasons: input.reasons,
    recordedAt: input.at,
  }
}
