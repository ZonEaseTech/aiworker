import { describe, expect, mock, test } from 'bun:test'
import * as bridgeModule from './index'

type BridgeExports = Record<string, unknown>
interface EngineBridge {
  cancelInvocation: (request: Record<string, unknown>) => Promise<unknown>
  discover: (target: string) => Promise<unknown>
  followUp: (request: Record<string, unknown>) => Promise<unknown>
  normalize: (target: string, chunk: Record<string, unknown>) => unknown[]
  startInvocation: (request: Record<string, unknown>) => Promise<unknown>
}

const exported = bridgeModule as BridgeExports

const expectedFailureCodes = [
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

const allowedBridgeEventTypes = [
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

const forbiddenDomainEventTypes = [
  'candidate.created',
  'review.approved',
  'release.failed',
] as const

function expectExportedFunction(name: string): (...args: unknown[]) => unknown {
  const value = exported[name]
  expect(value, `${name} must be exported by packages/engine-bridge`).toBeFunction()
  return value as (...args: unknown[]) => unknown
}

function createContractHarness(options: {
  projectionReceiptState?: 'valid' | 'missing' | 'stale'
  supportsNativeResume?: boolean
  latestExternalSessionRef?: unknown
  processBelongsToInvocation?: boolean
} = {}) {
  const createEngineBridge = expectExportedFunction('createEngineBridge')
  const callOrder: string[] = []
  const storedRawChunks: unknown[] = []
  const storedBridgeEvents: unknown[] = []

  const adapter = {
    target: 'codex',
    discover: mock(async () => ({
      callable: true,
      diagnosticMessage: 'codex ready',
      installed: true,
      supportedInputMode: 'stdin',
      supportsNativeResume: options.supportsNativeResume ?? true,
      supportsProtocolCancel: true,
      target: 'codex',
      version: '1.2.3',
    })),
    start: mock(async (_request: unknown, sink: { event: (event: unknown) => void, raw: (chunk: unknown) => void }) => {
      callOrder.push('adapter.start')
      sink.raw({ data: 'stdout token=sk-test-secret', stream: 'stdout' })
      sink.event({ data: { text: 'token=sk-test-secret' }, type: 'invocation.output.delta' })
      return {
        eventStreamRef: 'events/invocation-start',
        externalSessionRef: { id: 'native-thread-1', target: 'codex' },
        invocationId: 'invocation-start',
        normalizedEventLogRef: 'events/invocation-start/normalized',
        processHandle: { invocationId: 'invocation-start', pid: 101 },
        rawChunkLogRef: 'events/invocation-start/raw',
        redactedSpawnCommand: 'codex --token [REDACTED]',
      }
    }),
    followUp: mock(async (request: { externalSessionRef?: unknown }) => {
      callOrder.push('adapter.followUp')
      expect(request.externalSessionRef).toEqual({ id: 'native-thread-1', target: 'codex' })
      return {
        eventStreamRef: 'events/invocation-follow-up',
        externalSessionRef: { id: 'native-thread-2', target: 'codex' },
        invocationId: 'invocation-follow-up',
        normalizedEventLogRef: 'events/invocation-follow-up/normalized',
        processHandle: { invocationId: 'invocation-follow-up', pid: 102 },
        rawChunkLogRef: 'events/invocation-follow-up/raw',
        redactedSpawnCommand: 'codex resume [REDACTED]',
      }
    }),
    cancel: mock(async () => {
      callOrder.push('adapter.cancel')
      return { completed: true, stage: 'protocol' }
    }),
    normalize: mock((chunk: { type?: string }) => [{ type: chunk.type ?? 'invocation.progress' }]),
  }

  const processManager = {
    softInterrupt: mock(async (handle: { invocationId: string }, guard: { invocationId: string }) => {
      expect(handle.invocationId).toBe(guard.invocationId)
      callOrder.push('process.softInterrupt')
    }),
    terminateGroup: mock(async (handle: { invocationId: string }, guard: { invocationId: string }) => {
      expect(handle.invocationId).toBe(guard.invocationId)
      if (options.processBelongsToInvocation === false)
        throw new Error('must not terminate a newer invocation')
      callOrder.push('process.terminateGroup')
    }),
  }

  const engineBridge = createEngineBridge({
    adapters: [adapter],
    bridgeEventStore: {
      append: mock(async (event: unknown) => storedBridgeEvents.push(event)),
    },
    cancelGracePeriodMs: 0,
    processManager,
    projectionReceipts: {
      assertUsable: mock(async () => {
        if (options.projectionReceiptState === 'missing')
          throw Object.assign(new Error('Projection receipt missing'), { code: 'PROJECTION_RECEIPT_MISSING' })
        if (options.projectionReceiptState === 'stale')
          throw Object.assign(new Error('Projection receipt stale'), { code: 'PROJECTION_RECEIPT_STALE' })
        return { id: 'projection-receipt-1', stale: false }
      }),
    },
    rawChunkStore: {
      append: mock(async (chunk: unknown) => storedRawChunks.push(chunk)),
    },
    resolveLatestExternalSessionRef: mock(async () => options.latestExternalSessionRef),
  }) as EngineBridge

  return {
    adapter,
    callOrder,
    engineBridge,
    processManager,
    storedBridgeEvents,
    storedRawChunks,
  }
}

describe('engine-bridge B+ adapter contract exports', () => {
  test('exports adapter contract API and stable platform failure codes', async () => {
    const { engineBridge } = createContractHarness()
    const failureCodes = exported.ENGINE_BRIDGE_FAILURE_CODES

    expect(engineBridge.discover).toBeFunction()
    expect(engineBridge.startInvocation).toBeFunction()
    expect(engineBridge.followUp).toBeFunction()
    expect(engineBridge.cancelInvocation).toBeFunction()
    expect(engineBridge.normalize).toBeFunction()
    expect(failureCodes).toEqual(expectedFailureCodes)
  })

  test('keeps session lifecycle, invocation status, and process state as separate vocabularies', () => {
    expect(exported.AIWORKER_SESSION_LIFECYCLES).toEqual(['active', 'archived', 'deleted'])
    expect(exported.ENGINE_INVOCATION_STATUSES).toEqual([
      'queued',
      'starting',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'lost',
    ])
    expect(exported.ENGINE_PROCESS_STATES).toEqual(['not_spawned', 'spawned', 'exited', 'killed', 'lost'])
  })
})

describe('engine-bridge start invocation contract', () => {
  test.each([
    ['missing', 'PROJECTION_RECEIPT_MISSING'],
    ['stale', 'PROJECTION_RECEIPT_STALE'],
  ] as const)('rejects %s projection receipt before adapter spawn', async (projectionReceiptState, expectedCode) => {
    const { adapter, engineBridge } = createContractHarness({ projectionReceiptState })

    await expect(engineBridge.startInvocation({
      capabilityDescriptorRef: 'capability/hr-review',
      cwd: '/workspace',
      engineTarget: 'codex',
      input: { body: 'start' },
      invocationId: 'invocation-start',
      projectionReceiptId: 'projection-receipt-1',
      sessionId: 'session-1',
      workerId: 'worker-1',
      workspaceLocatorId: 'workspace-1',
    })).rejects.toMatchObject({ code: expectedCode })
    expect(adapter.start).not.toHaveBeenCalled()
  })

  test('redacts raw chunks before raw storage and bridge event output', async () => {
    const { engineBridge, storedBridgeEvents, storedRawChunks } = createContractHarness()

    const result = await engineBridge.startInvocation({
      capabilityDescriptorRef: 'capability/hr-review',
      cwd: '/workspace',
      engineTarget: 'codex',
      input: { body: 'start' },
      invocationId: 'invocation-start',
      projectionReceiptId: 'projection-receipt-1',
      sessionId: 'session-1',
      workerId: 'worker-1',
      workspaceLocatorId: 'workspace-1',
    })

    const storedPayload = JSON.stringify({ result, storedBridgeEvents, storedRawChunks })
    expect(storedPayload).not.toContain('sk-test-secret')
    expect(storedPayload).toContain('[REDACTED]')
    expect(storedBridgeEvents).toContainEqual(expect.objectContaining({ type: 'invocation.output.delta' }))
  })
})

describe('engine-bridge follow-up native resume contract', () => {
  test('requires latest external session ref for native-resume adapters and never falls back to adapter.start', async () => {
    const { adapter, engineBridge } = createContractHarness({
      latestExternalSessionRef: undefined,
      supportsNativeResume: true,
    })

    await expect(engineBridge.followUp({
      cwd: '/workspace',
      engineTarget: 'codex',
      input: { body: 'continue' },
      invocationId: 'invocation-follow-up',
      projectionReceiptId: 'projection-receipt-1',
      sessionId: 'session-1',
      workerId: 'worker-1',
      workspaceLocatorId: 'workspace-1',
    })).rejects.toMatchObject({ code: 'ENGINE_SESSION_REF_MISSING' })
    expect(adapter.start).not.toHaveBeenCalled()
    expect(adapter.followUp).not.toHaveBeenCalled()
  })

  test('passes the latest external session ref to adapter.followUp', async () => {
    const { adapter, engineBridge } = createContractHarness({
      latestExternalSessionRef: { id: 'native-thread-1', target: 'codex' },
      supportsNativeResume: true,
    })

    await engineBridge.followUp({
      cwd: '/workspace',
      engineTarget: 'codex',
      input: { body: 'continue' },
      invocationId: 'invocation-follow-up',
      projectionReceiptId: 'projection-receipt-1',
      sessionId: 'session-1',
      workerId: 'worker-1',
      workspaceLocatorId: 'workspace-1',
    })
    expect(adapter.followUp).toHaveBeenCalledTimes(1)
  })
})

describe('engine-bridge cancel contract', () => {
  test('sends protocol cancel before soft interrupt and terminate, guarded by invocation id', async () => {
    const { callOrder, engineBridge } = createContractHarness()

    await engineBridge.cancelInvocation({
      handle: { invocationId: 'invocation-start', pid: 101 },
      invocationId: 'invocation-start',
      reason: 'user-request',
    })

    expect(callOrder).toEqual(['adapter.cancel', 'process.softInterrupt', 'process.terminateGroup'])
  })

  test('does not terminate when the process handle no longer belongs to the requested invocation', async () => {
    const { adapter, processManager, engineBridge } = createContractHarness({ processBelongsToInvocation: false })

    await expect(engineBridge.cancelInvocation({
      handle: { invocationId: 'newer-invocation', pid: 101 },
      invocationId: 'older-invocation',
      reason: 'user-request',
    })).rejects.toMatchObject({ code: 'ENGINE_CANCEL_FAILED' })
    expect(adapter.cancel).not.toHaveBeenCalled()
    expect(processManager.terminateGroup).not.toHaveBeenCalled()
  })
})

describe('engine-bridge normalized event class contract', () => {
  test('exports the allowed generic invocation/process bridge event classes', () => {
    expect(exported.ALLOWED_BRIDGE_EVENT_TYPES).toEqual(allowedBridgeEventTypes)
  })

  test.each([...allowedBridgeEventTypes])('accepts generic bridge event class %s', (type) => {
    const { engineBridge } = createContractHarness()

    expect(engineBridge.normalize('codex', { data: '{}', stream: 'protocol', type })).toContainEqual({ type })
  })

  test.each([...forbiddenDomainEventTypes])('rejects forbidden domain bridge event class %s', (type) => {
    const { engineBridge } = createContractHarness()

    expect(() => engineBridge.normalize('codex', { data: '{}', stream: 'protocol', type })).toThrow(/domain|forbidden|bridge event/i)
  })
})
