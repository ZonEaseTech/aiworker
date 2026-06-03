import { describe, expect, mock, test } from 'bun:test'
import * as bridgeModule from './index'

type BridgeExports = Record<string, unknown>
interface EngineBridge {
  cancelInvocation: (request: Record<string, unknown>) => Promise<unknown>
  discover: (target: string) => Promise<unknown>
  followUp: (request: Record<string, unknown>) => Promise<unknown>
  normalize: (target: string, chunk: Record<string, unknown>) => unknown[]
  reattachInvocationEvents: (request: Record<string, unknown>) => Promise<unknown>
  reconcileInvocation: (request: Record<string, unknown>) => Promise<unknown>
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
  cancelFails?: boolean
  discoverFails?: boolean
  followUpFails?: boolean
  inspectFails?: boolean
  listBridgeEventsFails?: boolean
  processBelongsToInvocation?: boolean
  rawChunkStoreFails?: boolean
  startFails?: boolean
  reconciledProcessState?: 'lost' | 'spawned'
} = {}) {
  const createEngineBridge = expectExportedFunction('createEngineBridge')
  const callOrder: string[] = []
  const storedRawChunks: unknown[] = []
  const storedBridgeEvents: unknown[] = []
  const listedBridgeEvents = [
    {
      data: { text: 'token=sk-test-secret' },
      id: 3,
      invocationId: 'invocation-follow-up',
      type: 'invocation.output.delta',
    },
    {
      id: 4,
      invocationId: 'other-invocation',
      type: 'invocation.progress',
    },
    {
      exitCode: 0,
      id: 5,
      invocationId: 'invocation-follow-up',
      type: 'process.exited',
    },
  ]
  const listBridgeEvents = mock(async () => {
    if (options.listBridgeEventsFails)
      throw new Error('bridge event list failed with token=sk-test-secret')
    return listedBridgeEvents
  })

  const adapter = {
    target: 'codex',
    discover: mock(async () => {
      if (options.discoverFails)
        throw new Error('native discover failed with token=sk-test-secret')
      return {
        callable: true,
        diagnosticMessage: 'codex ready',
        installed: true,
        supportedInputMode: 'stdin',
        supportsNativeResume: options.supportsNativeResume ?? true,
        supportsProtocolCancel: true,
        target: 'codex',
        version: '1.2.3',
      }
    }),
    start: mock(async (_request: unknown, sink: { event: (event: unknown) => void, raw: (chunk: unknown) => void }) => {
      callOrder.push('adapter.start')
      if (options.startFails)
        throw new Error('native protocol init failed with token=sk-test-secret')
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
      if (options.followUpFails)
        throw new Error('native follow-up failed with token=sk-test-secret')
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
      if (options.cancelFails)
        throw new Error('cancel failed authorization = "literal-secret-value"')
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
    inspect: mock(async (handle: { invocationId: string }, guard: { invocationId: string }) => {
      expect(handle.invocationId).toBe(guard.invocationId)
      callOrder.push('process.inspect')
      if (options.inspectFails)
        throw new Error('process inspect failed with token=sk-test-secret')
      return {
        diagnostic: 'process vanished with token=sk-test-secret',
        invocationId: handle.invocationId,
        state: options.reconciledProcessState ?? 'lost',
      }
    }),
  }

  const engineBridge = createEngineBridge({
    adapters: [adapter],
    bridgeEventStore: {
      append: mock(async (event: unknown) => storedBridgeEvents.push(event)),
      list: listBridgeEvents,
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
      append: mock(async (chunk: unknown) => {
        if (options.rawChunkStoreFails)
          throw new Error('raw chunk store failed with token=sk-test-secret')
        storedRawChunks.push(chunk)
      }),
    },
    resolveLatestExternalSessionRef: mock(async () => options.latestExternalSessionRef),
  }) as EngineBridge

  return {
    adapter,
    callOrder,
    engineBridge,
    listBridgeEvents,
    processManager,
    listedBridgeEvents,
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
    expect(engineBridge.reattachInvocationEvents).toBeFunction()
    expect(engineBridge.reconcileInvocation).toBeFunction()
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

  test('exports a generic bridge redaction helper for native engine diagnostics', () => {
    const redactEngineBridgeValue = expectExportedFunction('redactEngineBridgeValue')

    const redacted = redactEngineBridgeValue({
      headers: { authorization: 'Bearer native-secret-token' },
      lines: ['token=sk-test-secret', 'apiKey = "literal-secret-value"'],
      profile: { token: 'literal-secret-value' },
    })

    expect(JSON.stringify(redacted)).not.toContain('native-secret-token')
    expect(JSON.stringify(redacted)).not.toContain('sk-test-secret')
    expect(JSON.stringify(redacted)).not.toContain('literal-secret-value')
    expect(JSON.stringify(redacted)).toContain('[REDACTED]')
  })

  test('redacts value-format credentials (ghp_/gho_/github_pat_/AKIA/AIza/JWT/PEM) by format, not only prefix/secret-key forms', () => {
    // Author-owned native MCP files may carry literal secrets and are shown
    // view-only through this redactor. Value-format credentials commonly appear
    // under a non-secret key name or as a bare args-array element (e.g. an MCP
    // server config), so display redaction must match credential VALUE formats —
    // the same coverage the storage write-reject regex already enforces — not
    // only Bearer/sk-/token=/secret-key assignments.
    const redactEngineBridgeValue = expectExportedFunction('redactEngineBridgeValue')

    // Neutral key names (no api_key/secret/token/password/authorization substring)
    // so this isolates VALUE-format redaction, not key-name-based redaction.
    const corpus = {
      awsLine: 'id = "AKIAIOSFODNN7EXAMPLE"',
      repoLine: 'repo = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      ghoBare: 'gho_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      githubPatBare: 'github_pat_cccccccccccccccccccccccccccc',
      googleLine: 'gkey = "AIzaSyA00000000000000000000000000000000"',
      jwtBare: 'eyJhbGciOiJIUzI1Ni1.eyJzdWIiOiIxMjM0NTY.SflKxwRJSMeKKF2QT4',
      argsArray: ['run', '-e', 'AKIAIOSFODNN7EXAMPLE', 'image'],
      pemBlock: '-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqhkiG9w0BAQEFAASCAm2X\n-----END PRIVATE KEY-----',
    }

    const out = JSON.stringify(redactEngineBridgeValue(corpus))
    for (const leak of [
      'AKIAIOSFODNN7EXAMPLE',
      'ghp_aaaaaaaaaaaaaaaaaaaa',
      'gho_bbbbbbbbbbbbbbbbbbbb',
      'github_pat_cccccccccccc',
      'AIzaSyA000000000000',
      'eyJhbGciOiJIUzI1Ni1',
      'MIIBVAIBADANBgkqhkiG9w0B',
    ])
      expect(out, `display redaction must cover ${leak}`).not.toContain(leak)
    expect(out).toContain('[REDACTED]')
  })

  test('redacts adapter discover failures and classifies them as callable failures', async () => {
    const { engineBridge } = createContractHarness({ discoverFails: true })

    try {
      await engineBridge.discover('codex')
      throw new Error('expected discover to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_NOT_CALLABLE' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-test-secret')
    }
  })

  test('redacts unsupported engine target diagnostics', async () => {
    const { engineBridge } = createContractHarness()

    try {
      await engineBridge.discover('codex token=sk-test-secret')
      throw new Error('expected discover to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_NOT_CALLABLE' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-test-secret')
    }
  })
})

describe('engine-bridge start invocation contract', () => {
  test.each([
    ['workspace locator id', { workspaceLocatorId: undefined }, 'WORKSPACE_LOCATOR_MISSING'],
    ['workspace root cwd', { cwd: undefined }, 'WORKSPACE_ROOT_MISSING'],
  ] as const)('rejects missing %s before adapter spawn', async (_label, override, expectedCode) => {
    const { adapter, engineBridge } = createContractHarness()

    await expect(engineBridge.startInvocation({
      capabilityDescriptorRef: 'capability/default-task',
      cwd: '/workspace',
      engineTarget: 'codex',
      input: { body: 'start' },
      invocationId: 'invocation-start',
      projectionReceiptId: 'projection-receipt-1',
      sessionId: 'session-1',
      workerId: 'worker-1',
      workspaceLocatorId: 'workspace-1',
      ...override,
    })).rejects.toMatchObject({ code: expectedCode })
    expect(adapter.start).not.toHaveBeenCalled()
  })

  test.each([
    ['missing', 'PROJECTION_RECEIPT_MISSING'],
    ['stale', 'PROJECTION_RECEIPT_STALE'],
  ] as const)('rejects %s projection receipt before adapter spawn', async (projectionReceiptState, expectedCode) => {
    const { adapter, engineBridge } = createContractHarness({ projectionReceiptState })

    await expect(engineBridge.startInvocation({
      capabilityDescriptorRef: 'capability/default-task',
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
      capabilityDescriptorRef: 'capability/default-task',
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

  test('fails start invocation when redacted raw chunk persistence fails', async () => {
    const { engineBridge } = createContractHarness({ rawChunkStoreFails: true })

    try {
      await engineBridge.startInvocation({
        capabilityDescriptorRef: 'capability/default-task',
        cwd: '/workspace',
        engineTarget: 'codex',
        input: { body: 'start' },
        invocationId: 'invocation-start',
        projectionReceiptId: 'projection-receipt-1',
        sessionId: 'session-1',
        workerId: 'worker-1',
        workspaceLocatorId: 'workspace-1',
      })
      throw new Error('expected startInvocation to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'BRIDGE_REDACTION_FAILED' })
      expect(error instanceof Error ? error.message : String(error)).not.toContain('sk-test-secret')
    }
  })

  test('redacts adapter start failures and classifies them as protocol init failures', async () => {
    const { engineBridge } = createContractHarness({ startFails: true })

    try {
      await engineBridge.startInvocation({
        capabilityDescriptorRef: 'capability/default-task',
        cwd: '/workspace',
        engineTarget: 'codex',
        input: { body: 'start' },
        invocationId: 'invocation-start',
        projectionReceiptId: 'projection-receipt-1',
        sessionId: 'session-1',
        workerId: 'worker-1',
        workspaceLocatorId: 'workspace-1',
      })
      throw new Error('expected startInvocation to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_PROTOCOL_INIT_FAILED' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-test-secret')
    }
  })

  test('preserves local executor process-exit failures and redacts partial results', async () => {
    const createEngineBridge = expectExportedFunction('createEngineBridge')
    const localExecutorFailure = Object.assign(
      new Error('codex exited token=sk-test-secret'),
      {
        name: 'LocalExecutorFailure',
        partialResult: {
          metadata: { diagnostic: 'authorization = "literal-secret-value"' },
          summary: 'Codex exited token=sk-test-secret.',
        },
      },
    )
    const engineBridge = createEngineBridge({
      adapters: [{
        async cancel() {
          return {}
        },
        async discover() {
          return { callable: true, installed: true, target: 'codex' }
        },
        async followUp() {
          return {}
        },
        normalize() {
          return [{ type: 'invocation.progress' }]
        },
        async start() {
          throw localExecutorFailure
        },
        target: 'codex',
      }],
    }) as EngineBridge

    try {
      await engineBridge.startInvocation({
        cwd: '/workspace',
        engineTarget: 'codex',
        invocationId: 'invocation-start',
        projectionReceiptId: 'projection-receipt-1',
        workspaceLocatorId: 'workspace-1',
      })
      throw new Error('expected startInvocation to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_PROCESS_EXITED', name: 'LocalExecutorFailure' })
      expect(JSON.stringify(error)).not.toContain('sk-test-secret')
      expect(JSON.stringify(error)).not.toContain('literal-secret-value')
      expect(JSON.stringify(error)).toContain('[REDACTED]')
    }
  })
})

describe('engine-bridge follow-up native resume contract', () => {
  test.each([
    ['workspace locator id', { workspaceLocatorId: undefined }, 'WORKSPACE_LOCATOR_MISSING'],
    ['workspace root cwd', { cwd: undefined }, 'WORKSPACE_ROOT_MISSING'],
  ] as const)('rejects missing %s before adapter follow-up', async (_label, override, expectedCode) => {
    const { adapter, engineBridge } = createContractHarness({
      latestExternalSessionRef: { id: 'native-thread-1', target: 'codex' },
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
      ...override,
    })).rejects.toMatchObject({ code: expectedCode })
    expect(adapter.start).not.toHaveBeenCalled()
    expect(adapter.followUp).not.toHaveBeenCalled()
  })

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

  test('redacts adapter follow-up failures and classifies them as protocol init failures', async () => {
    const { engineBridge } = createContractHarness({
      followUpFails: true,
      latestExternalSessionRef: { id: 'native-thread-1', target: 'codex' },
      supportsNativeResume: true,
    })

    try {
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
      throw new Error('expected followUp to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_PROTOCOL_INIT_FAILED' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-test-secret')
    }
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

  test('uses the requested engine target adapter for protocol cancel', async () => {
    const createEngineBridge = expectExportedFunction('createEngineBridge')
    const codexCancel = mock(async () => {
      throw new Error('codex adapter must not cancel claude-code invocations')
    })
    const claudeCancel = mock(async () => ({ cancelled: true }))
    const minimalAdapter = {
      async discover() {
        return { callable: true, installed: true, target: 'codex' }
      },
      async followUp() {
        return {}
      },
      normalize() {
        return [{ type: 'invocation.progress' }]
      },
      async start() {
        return {}
      },
    }
    const engineBridge = createEngineBridge({
      adapters: [
        { ...minimalAdapter, cancel: codexCancel, target: 'codex' },
        { ...minimalAdapter, cancel: claudeCancel, target: 'claude-code' },
      ],
      cancelGracePeriodMs: 0,
    }) as EngineBridge

    await engineBridge.cancelInvocation({
      engineTarget: 'claude-code',
      handle: { invocationId: 'claude-invocation', pid: 202 },
      invocationId: 'claude-invocation',
      reason: 'user-request',
    })

    expect(codexCancel).not.toHaveBeenCalled()
    expect(claudeCancel).toHaveBeenCalledTimes(1)
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

  test('does not hard-kill a newer invocation after the cancel grace period', async () => {
    const { engineBridge, processManager } = createContractHarness()
    const handle = { invocationId: 'older-invocation', pid: 101 }
    processManager.softInterrupt.mockImplementationOnce(async () => {
      handle.invocationId = 'newer-invocation'
    })

    await expect(engineBridge.cancelInvocation({
      handle,
      invocationId: 'older-invocation',
      reason: 'user-request',
    })).rejects.toMatchObject({ code: 'ENGINE_CANCEL_FAILED' })
    expect(processManager.softInterrupt).toHaveBeenCalledTimes(1)
    expect(processManager.terminateGroup).not.toHaveBeenCalled()
  })

  test('redacts adapter cancellation failure diagnostics', async () => {
    const { engineBridge } = createContractHarness({ cancelFails: true })

    try {
      await engineBridge.cancelInvocation({
        handle: { invocationId: 'invocation-start', pid: 101 },
        invocationId: 'invocation-start',
        reason: 'user-request',
      })
      throw new Error('expected cancelInvocation to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_CANCEL_FAILED' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).not.toContain('literal-secret-value')
      expect(message).toContain('[REDACTED]')
    }
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

  test('classifies unsupported native bridge event output as a redacted platform parse failure', () => {
    const { engineBridge } = createContractHarness()

    try {
      engineBridge.normalize('codex', { data: '{}', stream: 'protocol', type: 'review.approved token=sk-test-secret' })
      throw new Error('expected normalize to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_OUTPUT_PARSE_FAILED' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-test-secret')
    }
  })
})

describe('engine-bridge event reattach contract', () => {
  test('reattaches invocation-scoped normalized bridge events from a cursor without leaking secrets', async () => {
    const { engineBridge, listBridgeEvents } = createContractHarness()

    const result = await engineBridge.reattachInvocationEvents({
      after: 2,
      invocationId: 'invocation-follow-up',
      limit: 2,
    })

    expect(result).toEqual({
      after: 2,
      events: [
        {
          data: { text: 'token=[REDACTED]' },
          id: 3,
          invocationId: 'invocation-follow-up',
          type: 'invocation.output.delta',
        },
        {
          exitCode: 0,
          id: 5,
          invocationId: 'invocation-follow-up',
          type: 'process.exited',
        },
      ],
      invocationId: 'invocation-follow-up',
      nextAfter: 5,
    })
    expect(listBridgeEvents).toHaveBeenCalledWith({
      after: 2,
      invocationId: 'invocation-follow-up',
      limit: 2,
    })
    expect(JSON.stringify(result)).not.toContain('sk-test-secret')
  })

  test('redacts bridge event store failures during reattach', async () => {
    const { engineBridge } = createContractHarness({ listBridgeEventsFails: true })

    try {
      await engineBridge.reattachInvocationEvents({
        after: 2,
        invocationId: 'invocation-follow-up',
        limit: 2,
      })
      throw new Error('expected reattachInvocationEvents to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_OUTPUT_PARSE_FAILED' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-test-secret')
    }
  })
})

describe('engine-bridge reconciler contract', () => {
  test('classifies lost native processes as invocation state without changing session lifecycle', async () => {
    const { engineBridge, processManager, storedBridgeEvents } = createContractHarness()

    const result = await engineBridge.reconcileInvocation({
      handle: { invocationId: 'invocation-lost', pid: 404 },
      invocationId: 'invocation-lost',
    })

    expect(result).toEqual({
      events: [
        {
          diagnostic: 'process vanished with token=[REDACTED]',
          failureCode: 'ENGINE_PROCESS_LOST',
          invocationId: 'invocation-lost',
          processState: 'lost',
          type: 'process.lost',
        },
      ],
      failureCode: 'ENGINE_PROCESS_LOST',
      invocationId: 'invocation-lost',
      processState: 'lost',
      status: 'lost',
    })
    expect(processManager.inspect).toHaveBeenCalledWith(
      { invocationId: 'invocation-lost', pid: 404 },
      { invocationId: 'invocation-lost' },
    )
    expect(storedBridgeEvents).toContainEqual(expect.objectContaining({
      failureCode: 'ENGINE_PROCESS_LOST',
      type: 'process.lost',
    }))
    expect(result).not.toHaveProperty('sessionStatus')
    expect(JSON.stringify({ result, storedBridgeEvents })).not.toContain('sk-test-secret')
  })

  test('redacts process inspection failures and classifies them as process lost', async () => {
    const { engineBridge } = createContractHarness({ inspectFails: true })

    try {
      await engineBridge.reconcileInvocation({
        handle: { invocationId: 'invocation-lost', pid: 404 },
        invocationId: 'invocation-lost',
      })
      throw new Error('expected reconcileInvocation to fail')
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'ENGINE_PROCESS_LOST' })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-test-secret')
    }
  })
})
