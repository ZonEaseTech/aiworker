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

export interface EngineBridgeOptions {
  adapters: EngineAdapter[]
  bridgeEventStore?: { append: (event: unknown) => Promise<unknown> }
  cancelGracePeriodMs?: number
  processManager?: {
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

export function createEngineBridge(options: EngineBridgeOptions): EngineBridge {
  function adapterFor(target: EngineTarget): EngineAdapter {
    const adapter = options.adapters.find(item => item.target === target)
    if (!adapter)
      throw bridgeFailure('ENGINE_NOT_CALLABLE', `No engine adapter registered for ${target}.`)
    return adapter
  }

  async function assertProjectionUsable(request: Record<string, unknown>): Promise<void> {
    try {
      await options.projectionReceipts?.assertUsable?.(request)
    }
    catch (error) {
      throw bridgeFailure(errorCode(error, 'PROJECTION_RECEIPT_MISSING'), errorMessage(error))
    }
  }

  function sink(): EngineEventSink {
    return {
      event(event: unknown): void {
        const redacted = redactValue(event)
        for (const normalized of normalizeEvents([redacted as Record<string, unknown>])) {
          void options.bridgeEventStore?.append(normalized)
        }
      },
      raw(chunk: unknown): void {
        void options.rawChunkStore?.append(redactValue(chunk))
      },
    }
  }

  return {
    async cancelInvocation(request) {
      const invocationId = readInvocationId(request)
      const handle = readObject(request.handle)

      if (handle?.invocationId !== invocationId)
        throw bridgeFailure('ENGINE_CANCEL_FAILED', 'Process handle no longer belongs to the requested invocation.')

      const adapter = options.adapters[0]
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
      return adapterFor(target).discover()
    },

    async followUp(request) {
      await assertProjectionUsable(request)
      const adapter = adapterFor(readEngineTarget(request))
      const availability = await adapter.discover()
      const externalSessionRef = await options.resolveLatestExternalSessionRef?.(request)

      if (availability.supportsNativeResume && !externalSessionRef) {
        throw bridgeFailure(
          'ENGINE_SESSION_REF_MISSING',
          'Native resume requires the latest opaque external session ref.',
        )
      }

      const result = await adapter.followUp({
        ...request,
        externalSessionRef,
      }, sink())

      return redactValue(result)
    },

    normalize(target, chunk) {
      const adapter = adapterFor(target)
      return normalizeEvents(adapter.normalize(chunk).map(event => redactValue(event) as Record<string, unknown>))
    },

    async startInvocation(request) {
      await assertProjectionUsable(request)
      const adapter = adapterFor(readEngineTarget(request))
      const result = await adapter.start(request, sink())
      return redactValue(result)
    },
  }
}

function normalizeEvents(events: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return events.map((event) => {
    const type = typeof event.type === 'string' ? event.type : ''
    if (FORBIDDEN_DOMAIN_EVENT_TYPES.has(type)) {
      throw new Error(`Forbidden domain bridge event type: ${type}`)
    }
    if (!ALLOWED_EVENT_TYPE_SET.has(type)) {
      throw new Error(`Unsupported bridge event type: ${type}`)
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

function redactValue(value: unknown): unknown {
  if (typeof value === 'string')
    return redactString(value)
  if (Array.isArray(value))
    return value.map(item => redactValue(item))
  if (!value || typeof value !== 'object')
    return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactValue(nested)]))
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

function errorCode(error: unknown, fallback: EngineBridgeFailureCode): EngineBridgeFailureCode {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    if ((ENGINE_BRIDGE_FAILURE_CODES as readonly string[]).includes(error.code))
      return error.code as EngineBridgeFailureCode
  }
  return fallback
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}
