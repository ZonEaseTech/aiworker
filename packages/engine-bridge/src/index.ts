export const ENGINE_BRIDGE_FAILURE_CODES = [
  'ENGINE_NOT_INSTALLED',
  'ENGINE_NOT_AUTHENTICATED',
  'ENGINE_NOT_CALLABLE',
  'ENGINE_PROTOCOL_INIT_FAILED',
  'ENGINE_SESSION_REF_MISSING',
  'ENGINE_PROCESS_EXITED',
  'ENGINE_PROCESS_LOST',
  'ENGINE_CANCEL_FAILED',
  'ENGINE_OUTPUT_PARSE_FAILED',
  'PROJECTION_RECEIPT_MISSING',
  'PROJECTION_RECEIPT_STALE',
  'WORKSPACE_LOCATOR_MISSING',
  'WORKSPACE_ROOT_MISSING',
  'BRIDGE_REDACTION_FAILED',
] as const

export const AIWORKER_SESSION_LIFECYCLES = ['active', 'archived', 'deleted'] as const
export const ENGINE_INVOCATION_STATUSES = ['queued', 'starting', 'running', 'succeeded', 'failed', 'cancelled', 'lost'] as const
export const ENGINE_PROCESS_STATES = ['not_spawned', 'spawned', 'exited', 'killed', 'lost'] as const

export const ALLOWED_BRIDGE_EVENT_TYPES = [
  'invocation.started',
  'invocation.progress',
  'invocation.output.delta',
  'invocation.output.snapshot',
  'invocation.tool.observed',
  'invocation.usage.observed',
  'invocation.warning',
  'invocation.error',
  'invocation.completed',
  'invocation.cancelled',
  'process.started',
  'process.exited',
  'process.lost',
] as const

const FORBIDDEN_DOMAIN_EVENT_TYPES = new Set([
  'artifact.accepted',
  'business.confirmed',
  'candidate.created',
  'domain.status.changed',
  'profile.updated',
  'release.failed',
  'review.approved',
])

const ALLOWED_EVENT_TYPE_SET = new Set<string>(ALLOWED_BRIDGE_EVENT_TYPES)
const SECRET_VALUE_RE = /(Bearer\s+)[\w.~+/-]{12,}|(sk-)[\w-]{8,}|(token=)[^\s"']+|(["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*[:=]\s*["'])[^"'\n]+(["'])/gi

export type EngineBridgeFailureCode = typeof ENGINE_BRIDGE_FAILURE_CODES[number]
export type EngineInvocationStatus = typeof ENGINE_INVOCATION_STATUSES[number]
export type EngineProcessState = typeof ENGINE_PROCESS_STATES[number]
export type BridgeEventType = typeof ALLOWED_BRIDGE_EVENT_TYPES[number]
export type EngineTarget = 'claude-code' | 'codex' | string

export interface EngineAdapter {
  cancel: (handle: unknown, reason: unknown) => Promise<unknown>
  discover: () => Promise<EngineAvailability>
  followUp: (request: Record<string, unknown>, sink: EngineEventSink) => Promise<Record<string, unknown>>
  normalize: (chunk: Record<string, unknown>) => Array<Record<string, unknown>>
  start: (request: Record<string, unknown>, sink: EngineEventSink) => Promise<Record<string, unknown>>
  target: EngineTarget
}

export interface EngineAvailability {
  callable: boolean
  installed: boolean
  supportsNativeResume?: boolean
  supportsProtocolCancel?: boolean
  target: EngineTarget
  version?: string
}

export interface EngineEventSink {
  event: (event: unknown) => void
  raw: (chunk: unknown) => void
}

export interface BridgeEventStore {
  append?: (event: unknown) => Promise<unknown>
  list?: (request: { after: number, invocationId: string, limit: number }) => Promise<unknown[]>
}

export interface EngineBridgeOptions {
  adapters: EngineAdapter[]
  bridgeEventStore?: BridgeEventStore
  cancelGracePeriodMs?: number
  processManager?: {
    inspect?: (handle: unknown, guard: { invocationId: string }) => Promise<unknown>
    softInterrupt?: (handle: unknown, guard: { invocationId: string }) => Promise<unknown>
    terminateGroup?: (handle: unknown, guard: { invocationId: string }) => Promise<unknown>
  }
  projectionReceipts?: {
    assertUsable?: (request: Record<string, unknown>) => Promise<unknown>
  }
  rawChunkStore?: { append: (chunk: unknown) => Promise<unknown> }
  resolveLatestExternalSessionRef?: (request: Record<string, unknown>) => Promise<unknown>
}

export interface EngineBridge {
  cancelInvocation: (request: Record<string, unknown>) => Promise<unknown>
  discover: (target: EngineTarget) => Promise<EngineAvailability>
  followUp: (request: Record<string, unknown>) => Promise<unknown>
  normalize: (target: EngineTarget, chunk: Record<string, unknown>) => Array<Record<string, unknown>>
  reattachInvocationEvents: (request: Record<string, unknown>) => Promise<unknown>
  reconcileInvocation: (request: Record<string, unknown>) => Promise<unknown>
  startInvocation: (request: Record<string, unknown>) => Promise<unknown>
}

export const engineBridgePackage = {
  name: '@zonease/aiworker-engine-bridge',
  owns: [
    'adapter-registry',
    'process-manager',
    'invocation-state',
    'event-pipeline',
    'reattach',
    'cancel',
    'reconciler',
    'redaction',
  ],
} as const

export function redactEngineBridgeValue(value: unknown): unknown {
  return redactValue(value)
}

export function createEngineBridge(options: EngineBridgeOptions): EngineBridge {
  function adapterFor(target: EngineTarget): EngineAdapter {
    const adapter = options.adapters.find(item => item.target === target)
    if (!adapter)
      throw bridgeFailure('ENGINE_NOT_CALLABLE', redactString(`No engine adapter registered for ${target}.`))
    return adapter
  }

  async function discoverAdapter(adapter: EngineAdapter): Promise<EngineAvailability> {
    try {
      return await adapter.discover()
    }
    catch (error) {
      throw bridgeFailureFromError(error, 'ENGINE_NOT_CALLABLE')
    }
  }

  async function assertProjectionUsable(request: Record<string, unknown>): Promise<void> {
    try {
      await options.projectionReceipts?.assertUsable?.(request)
    }
    catch (error) {
      throw bridgeFailure(errorCode(error, 'PROJECTION_RECEIPT_MISSING'), errorMessage(error))
    }
  }

  function assertWorkspaceInvocationContext(request: Record<string, unknown>): void {
    if (!readString(request.workspaceLocatorId, '')) {
      throw bridgeFailure(
        'WORKSPACE_LOCATOR_MISSING',
        'Workspace locator id is required before native engine invocation.',
      )
    }
    if (!readString(request.cwd, '')) {
      throw bridgeFailure(
        'WORKSPACE_ROOT_MISSING',
        'Workspace root cwd is required before native engine invocation.',
      )
    }
  }

  function eventPipeline(): { flush: () => Promise<void>, sink: EngineEventSink } {
    const pendingWrites: Promise<unknown>[] = []
    return {
      async flush(): Promise<void> {
        try {
          await Promise.all(pendingWrites)
        }
        catch (error) {
          throw bridgeFailure('BRIDGE_REDACTION_FAILED', redactString(errorMessage(error)))
        }
      },
      sink: {
        event(event: unknown): void {
          const redacted = redactValue(event)
          for (const normalized of normalizeEvents([redacted as Record<string, unknown>])) {
            const write = options.bridgeEventStore?.append?.(normalized)
            if (write)
              pendingWrites.push(Promise.resolve(write))
          }
        },
        raw(chunk: unknown): void {
          const write = options.rawChunkStore?.append(redactValue(chunk))
          if (write)
            pendingWrites.push(Promise.resolve(write))
        },
      },
    }
  }

  function normalizeBridgeEvent(event: unknown): Record<string, unknown> {
    return normalizeEvents([redactValue(event) as Record<string, unknown>])[0]!
  }

  return {
    async cancelInvocation(request) {
      const invocationId = readInvocationId(request)
      const handle = readObject(request.handle)

      if (handle?.invocationId !== invocationId)
        throw bridgeFailure('ENGINE_CANCEL_FAILED', 'Process handle no longer belongs to the requested invocation.')

      const requestedTarget = readEngineTarget(request)
      const adapter = requestedTarget ? adapterFor(requestedTarget) : options.adapters[0]
      if (!adapter)
        throw bridgeFailure('ENGINE_CANCEL_FAILED', 'No engine adapter is available for cancellation.')

      try {
        await adapter.cancel(handle, request.reason)
        await options.processManager?.softInterrupt?.(handle, { invocationId })
        if ((options.cancelGracePeriodMs ?? 0) > 0)
          await sleep(options.cancelGracePeriodMs ?? 0)
        await options.processManager?.terminateGroup?.(handle, { invocationId })
        return {
          invocationId,
          status: 'cancelled',
        }
      }
      catch (error) {
        throw bridgeFailure('ENGINE_CANCEL_FAILED', errorMessage(error))
      }
    },

    discover(target) {
      return discoverAdapter(adapterFor(target))
    },

    async followUp(request) {
      assertWorkspaceInvocationContext(request)
      await assertProjectionUsable(request)
      const adapter = adapterFor(readEngineTarget(request))
      const availability = await discoverAdapter(adapter)
      const externalSessionRef = await options.resolveLatestExternalSessionRef?.(request)

      if (availability.supportsNativeResume && !externalSessionRef) {
        throw bridgeFailure(
          'ENGINE_SESSION_REF_MISSING',
          'Native resume requires the latest opaque external session ref.',
        )
      }

      const pipeline = eventPipeline()
      let result: Record<string, unknown>
      try {
        result = await adapter.followUp({
          ...request,
          externalSessionRef,
        }, pipeline.sink)
      }
      catch (error) {
        throw bridgeFailureFromError(error, 'ENGINE_PROTOCOL_INIT_FAILED')
      }
      await pipeline.flush()

      return redactValue(result)
    },

    normalize(target, chunk) {
      const adapter = adapterFor(target)
      return normalizeEvents(adapter.normalize(chunk).map(event => redactValue(event) as Record<string, unknown>))
    },

    async reattachInvocationEvents(request) {
      const invocationId = readInvocationId(request)
      const after = readNonNegativeInteger(request.after, 0)
      const limit = readPositiveInteger(request.limit, 500)
      let events: Array<Record<string, unknown>>
      try {
        const storedEvents = await options.bridgeEventStore?.list?.({ after, invocationId, limit }) ?? []
        events = normalizeEvents(storedEvents
          .map(event => redactValue(event))
          .filter(isRecord)
          .filter(event => readInvocationIdFromEvent(event) === invocationId))
      }
      catch (error) {
        throw bridgeFailureFromError(error, 'ENGINE_OUTPUT_PARSE_FAILED')
      }
      return {
        after,
        events,
        invocationId,
        nextAfter: nextAfter(events, after),
      }
    },

    async reconcileInvocation(request) {
      const invocationId = readInvocationId(request)
      const handle = readObject(request.handle)
      if (handle?.invocationId !== invocationId)
        throw bridgeFailure('ENGINE_PROCESS_LOST', 'Process handle no longer belongs to the requested invocation.')
      if (!options.processManager?.inspect)
        throw bridgeFailure('ENGINE_PROCESS_LOST', 'No process manager is available for reconciliation.')

      let inspection: unknown
      try {
        inspection = await options.processManager.inspect(handle, { invocationId })
      }
      catch (error) {
        throw bridgeFailureFromError(error, 'ENGINE_PROCESS_LOST')
      }
      const observation = readObject(inspection) ?? {}
      const processState = readEngineProcessState(observation.state ?? observation.processState, 'lost')
      if (processState !== 'lost') {
        return {
          events: [],
          invocationId,
          processState,
          status: invocationStatusForProcessState(processState),
        }
      }

      const event = normalizeBridgeEvent({
        diagnostic: readString(observation.diagnostic, 'Native engine process was lost.'),
        failureCode: 'ENGINE_PROCESS_LOST',
        invocationId,
        processState,
        type: 'process.lost',
      })
      await options.bridgeEventStore?.append?.(event)
      return {
        events: [event],
        failureCode: 'ENGINE_PROCESS_LOST',
        invocationId,
        processState,
        status: 'lost',
      }
    },

    async startInvocation(request) {
      assertWorkspaceInvocationContext(request)
      await assertProjectionUsable(request)
      const adapter = adapterFor(readEngineTarget(request))
      const pipeline = eventPipeline()
      let result: Record<string, unknown>
      try {
        result = await adapter.start(request, pipeline.sink)
      }
      catch (error) {
        throw bridgeFailureFromError(error, 'ENGINE_PROTOCOL_INIT_FAILED')
      }
      await pipeline.flush()
      return redactValue(result)
    },
  }
}

function normalizeEvents(events: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return events.map((event) => {
    const type = typeof event.type === 'string' ? event.type : ''
    if (FORBIDDEN_DOMAIN_EVENT_TYPES.has(type)) {
      throw bridgeFailure('ENGINE_OUTPUT_PARSE_FAILED', redactString(`Forbidden domain bridge event type: ${type}`))
    }
    if (!ALLOWED_EVENT_TYPE_SET.has(type)) {
      throw bridgeFailure('ENGINE_OUTPUT_PARSE_FAILED', redactString(`Unsupported bridge event type: ${type}`))
    }
    return event
  })
}

function readEngineTarget(request: Record<string, unknown>): EngineTarget {
  return typeof request.engineTarget === 'string' ? request.engineTarget : ''
}

function readInvocationId(request: Record<string, unknown>): string {
  return typeof request.invocationId === 'string' ? request.invocationId : ''
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readInvocationIdFromEvent(event: Record<string, unknown>): string {
  return typeof event.invocationId === 'string' ? event.invocationId : ''
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readEngineProcessState(value: unknown, fallback: EngineProcessState): EngineProcessState {
  return typeof value === 'string' && (ENGINE_PROCESS_STATES as readonly string[]).includes(value)
    ? value as EngineProcessState
    : fallback
}

function invocationStatusForProcessState(processState: EngineProcessState): EngineInvocationStatus {
  if (processState === 'killed')
    return 'cancelled'
  if (processState === 'lost')
    return 'lost'
  return 'running'
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nextAfter(events: Array<Record<string, unknown>>, fallback: number): number {
  return events.reduce((max, event) => Math.max(max, readNonNegativeInteger(event.id, max)), fallback)
}

function redactValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string')
    return redactStringValue(value, key)
  if (Array.isArray(value))
    return value.map(item => redactValue(item))
  if (!value || typeof value !== 'object')
    return value
  return Object.fromEntries(Object.entries(value).map(([nestedKey, nested]) => [nestedKey, redactValue(nested, nestedKey)]))
}

function redactStringValue(value: string, key?: string): string {
  const redacted = redactString(value)
  if (redacted !== value)
    return redacted
  if (key && isSecretLikeKey(key) && !isSafeSecretReference(value))
    return '[REDACTED]'
  return value
}

function isSecretLikeKey(key: string): boolean {
  return /api[_-]?key|authorization|password|secret|token/i.test(key)
}

function isSafeSecretReference(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed === '[REDACTED]' || trimmed.startsWith('$') || trimmed.startsWith('env:') || trimmed.startsWith('secretref:')
}

function redactString(value: string): string {
  return value.replace(SECRET_VALUE_RE, (_match, bearerPrefix, skPrefix, tokenPrefix, assignmentPrefix, assignmentSuffix) => {
    if (bearerPrefix)
      return `${bearerPrefix}[REDACTED]`
    if (skPrefix)
      return `${skPrefix}[REDACTED]`
    if (tokenPrefix)
      return `${tokenPrefix}[REDACTED]`
    if (assignmentPrefix)
      return `${assignmentPrefix}[REDACTED]${assignmentSuffix ?? ''}`
    return '[REDACTED]'
  })
}

function bridgeFailure(code: EngineBridgeFailureCode, message: string): Error & { code: EngineBridgeFailureCode } {
  return Object.assign(new Error(message), { code })
}

function bridgeFailureFromError(error: unknown, fallback: EngineBridgeFailureCode): Error & { code: EngineBridgeFailureCode } {
  const failure = bridgeFailure(errorCode(error, fallback), errorMessage(error))
  const partialResult = readObject(error)?.partialResult
  if (partialResult)
    Object.assign(failure, { partialResult: redactValue(partialResult) })
  if (error instanceof Error && error.name)
    failure.name = error.name
  return failure
}

function errorCode(error: unknown, fallback: EngineBridgeFailureCode): EngineBridgeFailureCode {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    if ((ENGINE_BRIDGE_FAILURE_CODES as readonly string[]).includes(error.code))
      return error.code as EngineBridgeFailureCode
  }
  if (error && typeof error === 'object' && 'failureCode' in error && typeof error.failureCode === 'string') {
    if ((ENGINE_BRIDGE_FAILURE_CODES as readonly string[]).includes(error.failureCode))
      return error.failureCode as EngineBridgeFailureCode
  }
  if (error instanceof Error && error.name === 'LocalExecutorFailure')
    return 'ENGINE_PROCESS_EXITED'
  return fallback
}

function errorMessage(error: unknown): string {
  return redactString(error instanceof Error ? error.message : String(error))
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}
