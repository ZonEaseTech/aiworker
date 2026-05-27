import type { EngineEventSink } from '@zonease/aiworker-engine-bridge'
import type { SoulAppEngineAssets } from '@zonease/aiworker-soul-protocol'

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendSessionEvent, closeWorkerDb, createEngineInvocation, getEngineInvocation, getWorkerConfigValue, initWorkerDb, listSessionEvents, runWorkerMigrations, updateSession, updateWorkspace, upsertWorker, upsertWorkerOverlayAssets } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { LocalExecutorFailure } from './executor'
import { LocalWorkerRuntime } from './runtime'
import {
  freezeSessionEngineMetadata,
  readFrozenSessionEngine,
  resolveFrozenSessionEngine,
} from './session-engine'

describe('LocalWorkerRuntime', () => {
  let dir: string
  let tick: number

  beforeEach(() => {
    closeWorkerDb()
    tick = 0
    dir = mkdtempSync(join(tmpdir(), 'aiworker-workspace-runtime-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function now(): string {
    tick += 1
    return `2026-05-09T00:00:${String(tick).padStart(2, '0')}.000Z`
  }

  function runtime(executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor']) {
    return new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor,
    })
  }

  function runtimeWithEngineAssets(
    sourceRoot: string,
    executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor'],
    options: { defaultEngineId?: string, engineAssets?: SoulAppEngineAssets } = {},
  ) {
    return new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul-app',
        name: 'Demo Worker',
        defaultEngineId: options.defaultEngineId ?? 'codex',
      },
      engineAssetSource: {
        appId: 'demo-soul-app',
        ...(options.engineAssets ? { engineAssets: options.engineAssets } : {}),
        sourceRoot,
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor,
    })
  }

  function runtimeFor(worker: { id: string, name: string, soulId: string }, executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor']) {
    return new LocalWorkerRuntime({
      worker: {
        id: worker.id,
        soulId: worker.soulId,
        name: worker.name,
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', worker.id, 'workspaces'),
      now,
      executor,
    })
  }

  describe('session engine metadata helpers', () => {
    it('session engine metadata helpers freezes and reads session engine metadata', () => {
      const metadata = freezeSessionEngineMetadata({}, {
        engineCommand: 'claude',
        engineId: 'claude-code',
        executionMode: 'local-cli',
      })

      expect(metadata).toMatchObject({
        engineCommand: 'claude',
        engineId: 'claude-code',
        executionMode: 'local-cli',
      })
      expect(readFrozenSessionEngine(metadata)).toEqual({
        engineCommand: 'claude',
        engineId: 'claude-code',
        executionMode: 'local-cli',
      })
    })

    it('session engine metadata helpers keeps the existing session engine immutable over a new preference', () => {
      expect(resolveFrozenSessionEngine({
        latestInvocation: null,
        requested: { engineCommand: 'codex', engineId: 'codex', executionMode: 'local-cli' },
        sessionMetadata: { engineCommand: 'claude', engineId: 'claude-code', executionMode: 'local-cli' },
      })).toEqual({
        engineCommand: 'claude',
        engineId: 'claude-code',
        executionMode: 'local-cli',
        source: 'session',
      })
    })

    it('session engine metadata helpers falls back to the latest invocation for legacy sessions', () => {
      expect(resolveFrozenSessionEngine({
        latestInvocation: { engineCommand: null, engineId: 'openai', executionMode: 'byok' },
        requested: { engineCommand: 'codex', engineId: 'codex', executionMode: 'local-cli' },
        sessionMetadata: {},
      })).toEqual({
        engineCommand: null,
        engineId: 'openai',
        executionMode: 'byok',
        source: 'latest-invocation',
      })
    })

    it('session engine metadata helpers ignores partial or invalid frozen metadata and falls back to the latest invocation', () => {
      expect(readFrozenSessionEngine({ engineId: 'codex' })).toBeNull()

      expect(resolveFrozenSessionEngine({
        latestInvocation: { engineCommand: 'claude', engineId: 'claude-code', executionMode: 'local-cli' },
        requested: { engineCommand: 'codex', engineId: 'codex', executionMode: 'local-cli' },
        sessionMetadata: { engineId: 'bad-engine', executionMode: 'invalid' },
      })).toEqual({
        engineCommand: 'claude',
        engineId: 'claude-code',
        executionMode: 'local-cli',
        source: 'latest-invocation',
      })
    })
  })

  it('rejects new work on archived workers while preserving existing metadata', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return { summary: `Should not run ${input.invocationId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Existing Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Existing session',
      metadata: { outputKind: 'freeform' },
    })

    upsertWorker({
      id: 'worker-demo',
      name: 'Demo',
      soulId: 'demo-soul',
      defaultEngineId: 'codex',
      status: 'archived',
    })

    await expect(workerRuntime.createWorkspace({ name: 'New Workspace' }))
      .rejects
      .toThrow('Worker worker-demo is archived and cannot start new work.')
    await expect(workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Blocked session',
    }))
      .rejects
      .toThrow('Worker worker-demo is archived and cannot start new work.')
    await expect(workerRuntime.reprojectWorkspaceAssets(workspace.id))
      .rejects
      .toThrow('Worker worker-demo is archived and cannot start new work.')
    await expect(workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue archived worker work.',
      engineId: 'codex',
      engineCommand: 'codex',
    }))
      .rejects
      .toThrow('Worker worker-demo is archived and cannot start new work.')
  })

  it('rejects new work on archived workspaces while preserving existing metadata', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return { summary: `Should not run ${input.invocationId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Archived Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Existing workspace session',
      metadata: { outputKind: 'freeform' },
    })

    updateWorkspace({ id: workspace.id, status: 'archived' })

    await expect(workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Blocked workspace session',
    }))
      .rejects
      .toThrow(`Workspace ${workspace.id} is archived and cannot start new work.`)
    await expect(workerRuntime.reprojectWorkspaceAssets(workspace.id))
      .rejects
      .toThrow(`Workspace ${workspace.id} is archived and cannot start new work.`)
    await expect(workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue archived workspace work.',
      engineId: 'codex',
      engineCommand: 'codex',
    }))
      .rejects
      .toThrow(`Workspace ${workspace.id} is archived and cannot start new work.`)
  })

  it('rejects new work on archived sessions while preserving existing metadata', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return { summary: `Should not run ${input.invocationId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Archived Session Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Archived session',
      metadata: { outputKind: 'freeform' },
    })

    updateSession({ id: session.id, status: 'archived' })

    await expect(workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue archived session work.',
      engineId: 'codex',
      engineCommand: 'codex',
    }))
      .rejects
      .toThrow(`Session ${session.id} is archived and cannot start new work.`)
  })

  it('runs the workspace session loop from invocation to completion', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return { summary: `Finished ${input.invocationId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({
      name: 'Demo Workspace',
    })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'candidate-screen',
      title: 'Screen candidate',
      metadata: {
        outputKind: 'candidate-screen',
        capabilityName: 'Candidate Screen',
      },
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Prepare the screen.',
      engineId: 'codex',
      engineCommand: 'codex',
      metadata: {
        outputKind: 'candidate-screen',
        capabilityName: 'Candidate Screen',
      },
    })

    expect('turn' in result).toBe(false)
    expect(result.invocation.status).toBe('succeeded')
    expect(result.invocation.processState).toBe('exited')
    expect(result.session.status).toBe('active')
    expect(result.session.endedAt).toBeNull()
    expect(result.files).toHaveLength(0)
    expect(result.events.map(event => event.type)).toEqual(['status', 'status'])

    const snapshot = workerRuntime.snapshot()
    expect(snapshot.worker.soulId).toBe('demo-soul')
    expect(snapshot.workspaces).toHaveLength(1)
    expect(snapshot.sessions[0]?.capabilityId).toBe('candidate-screen')
    expect(snapshot.sessions[0]?.status).toBe('active')
    expect(snapshot.sessions[0]?.endedAt).toBeNull()
    expect(snapshot).not.toHaveProperty('turns')
    expect(snapshot.invocations[0]).toMatchObject({ metadataJson: { outputKind: 'candidate-screen' }, processState: 'exited', status: 'succeeded' })
    expect(snapshot).not.toHaveProperty('reviews')
    expect(snapshot).not.toHaveProperty('lessons')
  })

  it('starts first session-level engine invocation through the engine bridge when adapters are configured', async () => {
    const callOrder: string[] = []
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          throw new Error('executor fallback should not run when engine bridge is configured')
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
          async cancel() {
            return {}
          },
          async discover() {
            return { callable: true, installed: true, target: 'codex' }
          },
          async followUp() {
            throw new Error('first invocation should use bridge start')
          },
          normalize() {
            return []
          },
          async start(request: Record<string, unknown>, sink: EngineEventSink) {
            callOrder.push('adapter.start')
            expect(request.engineTarget).toBe('codex')
            expect(typeof request.invocationId).toBe('string')
            sink.event({
              data: { text: 'Bridge invocation text' },
              invocationId: request.invocationId,
              type: 'invocation.output.delta',
            })
            return {
              externalSessionRef: { id: 'native-thread-invocation-1', target: 'codex' },
              metadata: { executionSource: 'engine-bridge' },
              processHandle: { invocationId: request.invocationId, pid: 301 },
              summary: 'Bridge invocation summary.',
            }
          },
        }],
        projectionReceipts: {
          async assertUsable() {
            callOrder.push('projection.assert')
          },
        },
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Bridge Invocation Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Bridge invocation session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Start first invocation through bridge.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(callOrder).toEqual(['projection.assert', 'adapter.start'])
    expect('turn' in result).toBe(false)
    expect(result.invocation).toMatchObject({
      externalSessionRef: expect.stringContaining('native-thread-invocation-1'),
      processState: 'exited',
      projectionReceiptId: workspace.id,
      status: 'succeeded',
      summary: 'Bridge invocation summary.',
    })
    expect(result.invocation.metadataJson).toMatchObject({
      externalSessionRef: { id: 'native-thread-invocation-1', target: 'codex' },
      processHandle: { invocationId: result.invocation.id, pid: 301 },
    })
    expect(result.events.some(event => event.invocationId === result.invocation.id && event.payloadJson.bridgeEvent === 'invocation.output.delta')).toBe(true)
  })

  it('runs session-level engine invocations without creating turn execution rows', async () => {
    const executorInputs: Array<{ hasTurnId: boolean, prompt: string }> = []
    const workerRuntime = runtime({
      async invoke(input) {
        executorInputs.push({ hasTurnId: 'turnId' in input, prompt: input.prompt })
        return { summary: `Finished ${input.sessionId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({
      name: 'Invocation Workspace',
    })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Session-level invocation',
      metadata: {
        outputKind: 'freeform',
      },
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue through a session-level invocation.',
      engineId: 'codex',
      engineCommand: 'codex',
      metadata: {
        outputKind: 'freeform',
      },
    })

    expect('turn' in result).toBe(false)
    expect(executorInputs).toEqual([{
      hasTurnId: false,
      prompt: expect.stringContaining('Invocation request:'),
    }])
    expect(result.session.status).toBe('active')
    expect(result.session.endedAt).toBeNull()
    expect(result.invocation.status).toBe('succeeded')
    expect(result.invocation.processState).toBe('exited')
    expect(result.invocation).not.toHaveProperty('turnId')
    expect(result.events.some(event => 'turnId' in event)).toBe(false)
    expect(result.events.map(event => event.invocationId)).toEqual([
      result.invocation.id,
      result.invocation.id,
    ])

    const snapshot = workerRuntime.snapshot()
    expect(snapshot).not.toHaveProperty('turns')
    expect(snapshot.sessions[0]).toMatchObject({ endedAt: null, status: 'active' })
    expect(snapshot.invocations[0]).toMatchObject({ processState: 'exited', status: 'succeeded' })
    expect(snapshot.invocations[0]).not.toHaveProperty('turnId')
  })

  it('routes default local executor events through the engine bridge event pipeline', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        input.onEvent?.({ kind: 'text', text: 'Bridge default text token=sk-runtime-event-secret' })
        return { summary: `Finished ${input.sessionId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Default Bridge Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Default bridge session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Run through the default bridge.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    const delta = result.events.find(event => event.type === 'assistant_delta')
    expect(delta?.payloadJson).toMatchObject({
      bridgeEvent: 'invocation.output.delta',
      data: { text: 'Bridge default text token=[REDACTED]' },
      invocationId: result.invocation.id,
      status: 'running',
    })
    expect(delta?.payloadJson).not.toHaveProperty('agentEvent')
    expect(JSON.stringify(result.events)).not.toContain('sk-runtime-event-secret')
    expect(result.invocation).toMatchObject({
      eventLogRef: `aiworker://sessions/${session.id}/invocations/${result.invocation.id}/events`,
      processState: 'exited',
      projectionReceiptId: workspace.id,
      status: 'succeeded',
    })
  })

  it('rejects default bridge invocations before executor spawn when projection receipts are missing', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-default-bridge-receipt')
    await writeProfileEngineAssets(appRoot)
    const executorInputs: string[] = []
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke(input) {
        executorInputs.push(input.invocationId)
        return { summary: 'should not run' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Missing Receipt Workspace' })
    await rm(join(workspace.rootPath, '.aiworker', 'projections.json'), { force: true })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Missing receipt session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Run with a missing projection receipt.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(executorInputs).toEqual([])
    expect(result.invocation).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_MISSING',
      processState: 'not_spawned',
      status: 'failed',
    })
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_MISSING',
      invocationId: result.invocation.id,
    })
  })

  it('rejects default bridge invocations before executor spawn when projection receipts are stale', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-default-bridge-stale-receipt')
    await writeProfileEngineAssets(appRoot)
    const executorInputs: string[] = []
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke(input) {
        executorInputs.push(input.invocationId)
        return { summary: 'should not run' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Stale Receipt Workspace' })
    const receiptPath = join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    await writeFile(receiptPath, `${JSON.stringify({ ...receipt, receiptId: 'stale-receipt' }, null, 2)}\n`)
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Stale receipt session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Run with a stale projection receipt.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(executorInputs).toEqual([])
    expect(result.invocation).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_STALE',
      processState: 'not_spawned',
      status: 'failed',
    })
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_STALE',
      invocationId: result.invocation.id,
    })
  })

  it('starts first session-level engine invocations through the engine bridge when adapters are configured', async () => {
    const callOrder: string[] = []
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          throw new Error('executor fallback should not run when engine bridge is configured')
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
          async cancel() {
            return {}
          },
          async discover() {
            return { callable: true, installed: true, supportsNativeResume: true, target: 'codex' }
          },
          async followUp() {
            throw new Error('first invocation should use bridge start')
          },
          normalize() {
            return []
          },
          async start(request: Record<string, unknown>, sink: EngineEventSink) {
            callOrder.push('adapter.start')
            expect(request.engineTarget).toBe('codex')
            expect(typeof request.sessionId).toBe('string')
            expect(request.workerId).toBe('worker-demo')
            expect(typeof request.workspaceId).toBe('string')
            sink.event({
              data: { text: 'Bridge text' },
              invocationId: request.invocationId,
              type: 'invocation.output.delta',
            })
            return {
              externalSessionRef: { id: 'native-thread-1', target: 'codex' },
              metadata: { executionSource: 'engine-bridge' },
              processHandle: { invocationId: request.invocationId, pid: 201 },
              summary: 'Bridge summary.',
            }
          },
        }],
        projectionReceipts: {
          async assertUsable(request: Record<string, unknown>) {
            callOrder.push('projection.assert')
            expect(typeof request.invocationId).toBe('string')
            expect(typeof request.sessionId).toBe('string')
          },
        },
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Bridge Start Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Bridge start session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Start through bridge.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(callOrder).toEqual(['projection.assert', 'adapter.start'])
    expect(result.invocation).toMatchObject({
      externalSessionRef: expect.stringContaining('native-thread-1'),
      processState: 'exited',
      projectionReceiptId: workspace.id,
      status: 'succeeded',
      summary: 'Bridge summary.',
    })
    expect(result.invocation.metadataJson).toMatchObject({
      executionSource: 'engine-bridge',
      externalSessionRef: { id: 'native-thread-1', target: 'codex' },
      processHandle: { invocationId: result.invocation.id, pid: 201 },
    })
    expect(result.events.some(event => event.payloadJson.bridgeEvent === 'invocation.output.delta')).toBe(true)
  })

  it('continues session-level engine invocations through bridge follow-up with the latest external session ref', async () => {
    const callOrder: string[] = []
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          throw new Error('executor fallback should not run when engine bridge is configured')
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
          async cancel() {
            return {}
          },
          async discover() {
            callOrder.push('adapter.discover')
            return { callable: true, installed: true, supportsNativeResume: true, target: 'codex' }
          },
          async followUp(request: Record<string, unknown>) {
            callOrder.push('adapter.followUp')
            expect(request.externalSessionRef).toEqual({ id: 'native-thread-1', target: 'codex' })
            return {
              externalSessionRef: { id: 'native-thread-2', target: 'codex' },
              metadata: { executionSource: 'engine-bridge' },
              processHandle: { invocationId: request.invocationId, pid: 202 },
              summary: 'Bridge follow-up summary.',
            }
          },
          normalize() {
            return []
          },
          async start() {
            throw new Error('follow-up should not start a fresh native session')
          },
        }],
        projectionReceipts: {
          async assertUsable() {
            callOrder.push('projection.assert')
          },
        },
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Bridge Follow-up Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Bridge follow-up session',
    })
    createEngineInvocation({
      id: 'bridge-previous-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/bridge-previous-invocation-1/input`,
      metadataJson: {
        externalSessionRef: { id: 'native-thread-1', target: 'codex' },
      },
      processState: 'exited',
      status: 'succeeded',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue through bridge.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(callOrder).toEqual(['projection.assert', 'adapter.discover', 'adapter.followUp'])
    expect(result.invocation.seq).toBe(2)
    expect(result.invocation).toMatchObject({
      externalSessionRef: expect.stringContaining('native-thread-2'),
      processState: 'exited',
      projectionReceiptId: workspace.id,
      status: 'succeeded',
      summary: 'Bridge follow-up summary.',
    })
    expect(result.invocation.metadataJson).toMatchObject({
      externalSessionRef: { id: 'native-thread-2', target: 'codex' },
      processHandle: { invocationId: result.invocation.id, pid: 202 },
    })
  })

  it('records missing native session refs as not-spawned bridge failures', async () => {
    const callOrder: string[] = []
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          throw new Error('executor fallback should not run when engine bridge is configured')
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
          async cancel() {
            return {}
          },
          async discover() {
            callOrder.push('adapter.discover')
            return { callable: true, installed: true, supportsNativeResume: true, target: 'codex' }
          },
          async followUp() {
            callOrder.push('adapter.followUp')
            throw new Error('follow-up should not run without an external session ref')
          },
          normalize() {
            return []
          },
          async start() {
            callOrder.push('adapter.start')
            throw new Error('follow-up should not start a fresh native session')
          },
        }],
        projectionReceipts: {
          async assertUsable() {
            callOrder.push('projection.assert')
          },
        },
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Missing Native Ref Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Missing native ref session',
    })
    createEngineInvocation({
      id: 'bridge-previous-missing-ref-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/bridge-previous-missing-ref-invocation-1/input`,
      processState: 'exited',
      status: 'succeeded',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue through bridge without a native ref.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(callOrder).toEqual(['projection.assert', 'adapter.discover'])
    expect(result.invocation).toMatchObject({
      failureCode: 'ENGINE_SESSION_REF_MISSING',
      processState: 'not_spawned',
      status: 'failed',
    })
    expect(result.session.status).toBe('active')
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      failureCode: 'ENGINE_SESSION_REF_MISSING',
      invocationId: result.invocation.id,
    })
  })

  it('freezes the session engine and date context across continuation invocations', async () => {
    const engineInputs: Array<{ engineCommand: string | null, engineId: string, prompt: string }> = []
    const workerRuntime = runtime({
      async invoke(input) {
        engineInputs.push({
          engineCommand: input.engineCommand ?? null,
          engineId: input.engineId,
          prompt: input.prompt ?? '',
        })
        return { summary: `Finished ${input.invocationId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Demo Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'candidate-screen',
      title: 'Screen candidate',
      metadata: {
        engineCommand: 'codex',
        engineId: 'codex',
        executionMode: 'local-cli',
      },
    })

    await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Prepare the screen.',
      engineId: 'codex',
      engineCommand: 'codex',
      metadata: { executionMode: 'local-cli' },
    })
    const continuation = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue with the newly selected engine.',
      engineId: 'claude-code',
      engineCommand: 'claude',
      metadata: { executionMode: 'local-cli' },
    })

    expect(engineInputs).toEqual([
      expect.objectContaining({ engineCommand: 'codex', engineId: 'codex' }),
      expect.objectContaining({ engineCommand: 'codex', engineId: 'codex' }),
    ])
    expect(engineInputs[0]?.prompt).toContain('Current date: 2026-05-09')
    expect(continuation.invocation).toMatchObject({
      engineCommand: 'codex',
      engineId: 'codex',
    })
    expect(continuation.invocation.metadataJson).toMatchObject({
      engineCommand: 'codex',
      engineId: 'codex',
      executionMode: 'local-cli',
    })
  })

  it('infers metadata-free latest invocation execution mode without using the current request preference', async () => {
    const engineInputs: Array<{ engineCommand: string | null, engineId: string, executionMode: unknown }> = []
    const workerRuntime = runtime({
      async invoke(input) {
        engineInputs.push({
          engineCommand: input.engineCommand ?? null,
          engineId: input.engineId,
          executionMode: input.metadata?.executionMode,
        })
        return { summary: `Finished ${input.invocationId}` }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Legacy BYOK Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'candidate-screen',
      title: 'Legacy BYOK session',
    })
    updateSession({
      id: session.id,
      metadataJson: {},
      at: now(),
    })
    createEngineInvocation({
      id: 'legacy-invocation',
      engineCommand: null,
      engineId: 'openai',
      metadataJson: {},
      inputRef: `aiworker://sessions/${session.id}/invocations/legacy-invocation/input`,
      sessionId: session.id,
      status: 'succeeded',
      seq: 1,
      at: now(),
    })

    const continuation = await workerRuntime.startInvocation({
      engineCommand: 'codex',
      engineId: 'codex',
      input: 'Continue after changing local CLI preference.',
      metadata: { executionMode: 'local-cli' },
      sessionId: session.id,
    })

    expect(engineInputs).toEqual([{
      engineCommand: null,
      engineId: 'openai',
      executionMode: 'byok',
    }])
    expect(continuation.invocation).toMatchObject({
      engineCommand: null,
      engineId: 'openai',
    })
    expect(continuation.invocation.metadataJson).toMatchObject({
      engineCommand: null,
      engineId: 'openai',
      executionMode: 'byok',
    })
  })

  it('carries session capability metadata into continuation invocation prompts and artifacts', async () => {
    const prompts: string[] = []
    const workerRuntime = runtime({
      async invoke(input) {
        prompts.push(input.prompt)
        return {
          summary: `Finished ${input.invocationId}`,
          artifacts: [
            {
              path: `artifacts/${input.sessionId}/${input.invocationId}-candidate-screen.md`,
              kind: 'candidate-screen',
              title: 'Candidate Screen',
              content: '# Candidate Screen\n\nEvidence attached.\n',
            },
          ],
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Demo Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'candidate-screen',
      title: 'Screen candidate',
      metadata: {
        outputKind: 'candidate-screen',
        capabilityName: 'Candidate Screen',
      },
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue the screen.',
      engineId: 'codex',
      metadata: { executionMode: 'local-cli' },
    })

    expect(prompts[0]).toContain('Capability: candidate-screen')
    expect(prompts[0]).not.toContain('Capability template:')
    expect(prompts[0]).toContain('Output kind: candidate-screen')
    expect(result.invocation.metadataJson).toMatchObject({ capabilityName: 'Candidate Screen', executionMode: 'local-cli', outputKind: 'candidate-screen' })
  })

  it('records explicit skill mention metadata while preserving natural language input', async () => {
    const prompts: string[] = []
    const workerRuntime = runtime({
      async invoke(input) {
        prompts.push(input.prompt)
        return {
          summary: `Finished ${input.invocationId}`,
          artifacts: [],
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Candidate pool' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'candidate-profile',
      title: 'Candidate pool',
      metadata: {
        mentions: [{ id: 'interview-brief', kind: 'skill', label: 'Interview brief' }],
      },
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Use $interview-brief for this resume.',
      engineId: 'codex',
      metadata: {
        mentions: [{ id: 'interview-brief', kind: 'skill', label: 'Interview brief' }],
      },
    })

    expect(result.invocation.metadataJson).toMatchObject({
      mentions: [{ id: 'interview-brief', kind: 'skill' }],
    })
    expect(prompts[0]).toContain('Explicit skill mentions:\n- skill: interview-brief')
    expect(prompts[0]).toContain('Invocation request:\nUse $interview-brief for this resume.')
  })

  it('uses a protocol-generic output kind when session metadata does not provide one', async () => {
    const prompts: string[] = []
    const workerRuntime = runtime({
      async invoke(input) {
        prompts.push(input.prompt)
        return {
          summary: `Finished ${input.invocationId}`,
          artifacts: [],
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Generic workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform-session',
      title: 'Generic session',
      metadata: {},
    })

    await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Continue generically.',
      engineId: 'codex',
      metadata: {},
    })

    expect(prompts[0]).toContain('Output kind: session')
    expect(prompts[0]).not.toContain('business-artifact')
  })

  it('records failed session-level invocations without throwing away the event trail', async () => {
    const workerRuntime = runtime({
      async invoke() {
        throw new Error('executor failed')
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Demo Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'candidate-screen',
      title: 'Screen candidate',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Start direct session invocation.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(result.session.status).toBe('active')
    expect(result.session.endedAt).toBeNull()
    expect('turn' in result).toBe(false)
    expect(result.invocation.status).toBe('failed')
    expect(result.invocation.error).toBe('executor failed')
    expect(result.events.map(event => event.type)).toEqual(['status', 'error'])
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      invocationId: result.invocation.id,
      message: 'executor failed',
    })

    const snapshot = workerRuntime.snapshot()
    expect(snapshot.sessions.find(item => item.id === result.session.id)?.status).toBe('active')
    expect(snapshot.invocations.find(item => item.id === result.invocation.id)).toMatchObject({
      error: 'executor failed',
      status: 'failed',
    })
  })

  it('records platform failure code and process state for failed session-level engine invocations', async () => {
    const workerRuntime = runtime({
      async invoke() {
        throw new LocalExecutorFailure('codex exited with code 7', {
          metadata: {
            engineExitCode: 7,
            executionSource: 'local-cli',
          },
          summary: 'Codex exited with code 7.',
        })
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Failure Lifecycle Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Failure lifecycle session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Trigger a failing invocation.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(result.invocation).toMatchObject({
      error: 'codex exited with code 7',
      failureCode: 'ENGINE_PROCESS_EXITED',
      processState: 'exited',
      status: 'failed',
      summary: 'Codex exited with code 7.',
    })
    expect(result.session.status).toBe('active')
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      failureCode: 'ENGINE_PROCESS_EXITED',
      invocationId: result.invocation.id,
      message: 'codex exited with code 7',
    })
  })

  it('records bridge redaction pipeline failures without leaking diagnostics', async () => {
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          throw new Error('executor fallback should not run when engine bridge is configured')
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
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
            return []
          },
          async start(_request: Record<string, unknown>, sink: EngineEventSink) {
            sink.raw({ data: 'token=sk-runtime-redaction-secret', stream: 'stdout' })
            return { summary: 'should not be trusted after redaction failure' }
          },
        }],
        rawChunkStore: {
          async append() {
            throw new Error('raw chunk store failed token=sk-runtime-redaction-secret')
          },
        },
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Redaction Failure Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Redaction failure session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Trigger redaction failure.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(JSON.stringify(result)).not.toContain('sk-runtime-redaction-secret')
    expect(result.invocation).toMatchObject({
      failureCode: 'BRIDGE_REDACTION_FAILED',
      status: 'failed',
    })
    expect(result.invocation.error).toContain('[REDACTED]')
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      failureCode: 'BRIDGE_REDACTION_FAILED',
      message: expect.stringContaining('[REDACTED]'),
    })
  })

  it('redacts native engine success diagnostics before persisting invocation state', async () => {
    const workerRuntime = runtime({
      async invoke() {
        return {
          metadata: {
            authorization: 'literal-secret-value',
            diagnostic: 'token=sk-runtime-secret',
            executionSource: 'local-cli',
          },
          summary: 'Codex succeeded token=sk-runtime-secret.',
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Redacted Success Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Redacted success session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Trigger a secret-bearing success.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(result.invocation.status).toBe('succeeded')
    expect(JSON.stringify(result)).not.toContain('sk-runtime-secret')
    expect(JSON.stringify(result)).not.toContain('literal-secret-value')
    expect(result.invocation.summary).toBe('Codex succeeded token=[REDACTED]')
    expect(result.invocation.metadataJson).toMatchObject({
      authorization: '[REDACTED]',
      diagnostic: 'token=[REDACTED]',
      executionSource: 'local-cli',
    })
  })

  it('redacts native engine failure diagnostics before persisting invocation state', async () => {
    const workerRuntime = runtime({
      async invoke() {
        throw new LocalExecutorFailure('codex exited token=sk-runtime-secret', {
          metadata: {
            diagnostic: 'authorization = "literal-secret-value"',
            executionSource: 'local-cli',
          },
          summary: 'Codex failed token=sk-runtime-secret.',
        })
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Redacted Failure Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Redacted failure session',
    })

    const result = await workerRuntime.startInvocation({
      sessionId: session.id,
      input: 'Trigger a secret-bearing failure.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(JSON.stringify(result)).not.toContain('sk-runtime-secret')
    expect(JSON.stringify(result)).not.toContain('literal-secret-value')
    expect(result.invocation.error).toContain('[REDACTED]')
    expect(result.invocation.summary).toContain('[REDACTED]')
    expect(result.invocation.metadataJson).toMatchObject({
      diagnostic: 'authorization = "[REDACTED]"',
    })
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      message: 'codex exited token=[REDACTED]',
    })
  })

  it('cancels engine invocations by id without changing session lifecycle', async () => {
    const workerRuntime = runtime({
      async invoke() {
        return { summary: 'unused' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Cancel Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Cancel session',
    })
    const invocation = createEngineInvocation({
      id: 'cancel-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/cancel-invocation-1/input`,
      processState: 'spawned',
      status: 'running',
      startedAt: now(),
      at: now(),
    })

    const result = await workerRuntime.cancelEngineInvocation(invocation.id)

    expect(result.invocation).toMatchObject({
      id: invocation.id,
      processState: 'killed',
      status: 'cancelled',
      summary: 'Invocation cancelled.',
    })
    expect(result.session.status).toBe('active')
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      bridgeEvent: 'invocation.cancelled',
      invocationId: invocation.id,
      processState: 'killed',
      status: 'cancelled',
    })
  })

  it('uses the engine bridge protocol cancel chain when a process handle is available', async () => {
    const callOrder: string[] = []
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          return { summary: 'unused' }
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
          async cancel(handle: unknown, reason: unknown) {
            expect(handle).toEqual({ invocationId: 'cancel-bridge-invocation-1', pid: 101 })
            expect(reason).toBe('user-request')
            callOrder.push('adapter.cancel')
            return { cancelled: true }
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
            return {}
          },
        }],
        cancelGracePeriodMs: 0,
        processManager: {
          async softInterrupt(handle: unknown, guard: { invocationId: string }) {
            expect(handle).toEqual({ invocationId: 'cancel-bridge-invocation-1', pid: 101 })
            expect(guard).toEqual({ invocationId: 'cancel-bridge-invocation-1' })
            callOrder.push('process.softInterrupt')
          },
          async terminateGroup(handle: unknown, guard: { invocationId: string }) {
            expect(handle).toEqual({ invocationId: 'cancel-bridge-invocation-1', pid: 101 })
            expect(guard).toEqual({ invocationId: 'cancel-bridge-invocation-1' })
            callOrder.push('process.terminateGroup')
          },
        },
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Bridge Cancel Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Bridge cancel session',
    })
    const invocation = createEngineInvocation({
      id: 'cancel-bridge-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/cancel-bridge-invocation-1/input`,
      metadataJson: {
        processHandle: { invocationId: 'cancel-bridge-invocation-1', pid: 101 },
      },
      processState: 'spawned',
      status: 'running',
    })

    const result = await workerRuntime.cancelEngineInvocation(invocation.id, { reason: 'user-request' })

    expect(callOrder).toEqual(['adapter.cancel', 'process.softInterrupt', 'process.terminateGroup'])
    expect(result.invocation).toMatchObject({
      processState: 'killed',
      status: 'cancelled',
    })
    expect(result.session.status).toBe('active')
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      bridgeEvent: 'invocation.cancelled',
      invocationId: invocation.id,
      processState: 'killed',
      status: 'cancelled',
    })
  })

  it('cancels through the adapter that matches the invocation engine target', async () => {
    const callOrder: string[] = []
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          return { summary: 'unused' }
        },
      },
      engineBridge: {
        adapters: [
          {
            target: 'codex',
            async cancel() {
              throw new Error('codex adapter must not cancel claude-code invocations')
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
              return {}
            },
          },
          {
            target: 'claude-code',
            async cancel(handle: unknown, reason: unknown) {
              expect(handle).toEqual({ invocationId: 'cancel-claude-invocation-1', pid: 202 })
              expect(reason).toBe('user-request')
              callOrder.push('claude.cancel')
              return { cancelled: true }
            },
            async discover() {
              return { callable: true, installed: true, target: 'claude-code' }
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
          },
        ],
        cancelGracePeriodMs: 0,
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Claude Cancel Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Claude cancel session',
    })
    const invocation = createEngineInvocation({
      id: 'cancel-claude-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'claude-code',
      engineCommand: 'claude',
      inputRef: `aiworker://sessions/${session.id}/invocations/cancel-claude-invocation-1/input`,
      metadataJson: {
        processHandle: { invocationId: 'cancel-claude-invocation-1', pid: 202 },
      },
      processState: 'spawned',
      status: 'running',
    })

    const result = await workerRuntime.cancelEngineInvocation(invocation.id, { reason: 'user-request' })

    expect(callOrder).toEqual(['claude.cancel'])
    expect(result.invocation).toMatchObject({
      processState: 'killed',
      status: 'cancelled',
    })
  })

  it('surfaces bridge cancel failures without marking the invocation cancelled', async () => {
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          return { summary: 'unused' }
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
          async cancel() {
            throw new Error('cancel failed authorization = "literal-secret-value"')
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
            return {}
          },
        }],
        cancelGracePeriodMs: 0,
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Cancel Failure Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Cancel failure session',
    })
    const invocation = createEngineInvocation({
      id: 'cancel-failure-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/cancel-failure-invocation-1/input`,
      metadataJson: {
        processHandle: { invocationId: 'cancel-failure-invocation-1', pid: 303 },
      },
      processState: 'spawned',
      status: 'running',
    })

    try {
      await workerRuntime.cancelEngineInvocation(invocation.id, { reason: 'user-request' })
      throw new Error('expected cancel to fail')
    }
    catch (error) {
      expect(error).toMatchObject({
        code: 'ENGINE_CANCEL_FAILED',
        status: 500,
      })
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('literal-secret-value')
    }
    expect(getEngineInvocation(invocation.id)).toMatchObject({
      processState: 'spawned',
      status: 'running',
    })
    expect(listSessionEvents(session.id)).toEqual([])
  })

  it('falls back to DB-only cancellation when stored process handle metadata is incomplete', async () => {
    const callOrder: string[] = []
    const workerRuntime = new LocalWorkerRuntime({
      worker: {
        id: 'worker-demo',
        soulId: 'demo-soul',
        name: 'Demo',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-demo', 'workspaces'),
      now,
      executor: {
        async invoke() {
          return { summary: 'unused' }
        },
      },
      engineBridge: {
        adapters: [{
          target: 'codex',
          async cancel() {
            callOrder.push('adapter.cancel')
            return { cancelled: true }
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
            return {}
          },
        }],
        cancelGracePeriodMs: 0,
        processManager: {
          async softInterrupt() {
            callOrder.push('process.softInterrupt')
          },
          async terminateGroup() {
            callOrder.push('process.terminateGroup')
          },
        },
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Incomplete Handle Cancel Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Incomplete handle cancel session',
    })
    const invocation = createEngineInvocation({
      id: 'cancel-incomplete-handle-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/cancel-incomplete-handle-invocation-1/input`,
      metadataJson: {
        processHandle: { pid: 101 },
      },
      processState: 'spawned',
      status: 'running',
    })

    const result = await workerRuntime.cancelEngineInvocation(invocation.id)

    expect(callOrder).toEqual([])
    expect(result.invocation).toMatchObject({
      processState: 'killed',
      status: 'cancelled',
    })
    expect(result.session.status).toBe('active')
  })

  it('reattaches invocation bridge events through the engine bridge cursor contract', async () => {
    const workerRuntime = runtime({
      async invoke() {
        return { summary: 'unused' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Reattach Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Reattach session',
    })
    const invocation = createEngineInvocation({
      id: 'reattach-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/reattach-invocation-1/input`,
      status: 'running',
    })
    const otherInvocation = createEngineInvocation({
      id: 'reattach-invocation-2',
      sessionId: session.id,
      seq: 2,
      engineId: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/reattach-invocation-2/input`,
      status: 'running',
    })
    const first = appendSessionEvent({
      invocationId: invocation.id,
      payloadJson: { bridgeEvent: 'invocation.progress', invocationId: invocation.id },
      seq: 1,
      sessionId: session.id,
      type: 'status',
    })
    appendSessionEvent({
      invocationId: otherInvocation.id,
      payloadJson: { bridgeEvent: 'invocation.progress', invocationId: otherInvocation.id },
      seq: 2,
      sessionId: session.id,
      type: 'status',
    })
    const second = appendSessionEvent({
      invocationId: invocation.id,
      payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'hello' }, invocationId: invocation.id },
      seq: 3,
      sessionId: session.id,
      type: 'assistant_delta',
    })

    const result = await workerRuntime.reattachEngineInvocationEvents(invocation.id, { after: first.id, limit: 1 })

    expect(result).toMatchObject({
      after: first.id,
      bridgeEvents: [
        {
          data: { text: 'hello' },
          id: second.id,
          invocationId: invocation.id,
          type: 'invocation.output.delta',
        },
      ],
      invocationId: invocation.id,
      nextAfter: second.id,
      session: { id: session.id, status: 'active' },
    })
  })

  it('reconciles lost engine invocations without changing session lifecycle or leaking diagnostics', async () => {
    const workerRuntime = runtime({
      async invoke() {
        return { summary: 'unused' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Reconcile Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'freeform',
      title: 'Reconcile session',
    })
    const invocation = createEngineInvocation({
      id: 'lost-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/lost-invocation-1/input`,
      processState: 'spawned',
      status: 'running',
    })

    const result = await workerRuntime.reconcileEngineInvocation(invocation.id, {
      diagnostic: 'process vanished token=sk-runtime-secret',
      handle: { invocationId: invocation.id, pid: 404 },
      state: 'lost',
    })

    expect(result.invocation).toMatchObject({
      failureCode: 'ENGINE_PROCESS_LOST',
      id: invocation.id,
      processState: 'lost',
      status: 'lost',
      summary: 'Native engine process was lost.',
    })
    expect(result.session.status).toBe('active')
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      bridgeEvent: 'process.lost',
      diagnostic: 'process vanished token=[REDACTED]',
      failureCode: 'ENGINE_PROCESS_LOST',
      invocationId: invocation.id,
      processState: 'lost',
      status: 'lost',
    })
    expect(JSON.stringify(result)).not.toContain('sk-runtime-secret')
  })

  it('materializes simplified session locator files with cwd, engine, and soul-app files', async () => {
    const workerRuntime = runtime({
      async invoke(_input) {
        return { summary: 'ok' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Demo Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityId: 'demo-soul-app.interview-brief',
      title: 'Interview brief',
      metadata: {
        outputKind: 'interview-brief',
      },
    })

    await expect(
      workerRuntime.files(workspace.id).read(`.aiworker/sessions/${session.id}/context/cwd.txt`),
    ).resolves.toBe(workspace.rootPath)
    await expect(
      workerRuntime.files(workspace.id).read(`.aiworker/sessions/${session.id}/context/engine.json`),
    ).resolves.toContain('"engineId": "codex"')
    await expect(
      workerRuntime.files(workspace.id).read(`.aiworker/sessions/${session.id}/context/soul-app.json`),
    ).resolves.toContain('"soulId": "demo-soul"')
  })

  it('keeps runtime workspaces isolated when two workers share one Soul', async () => {
    const executor = {
      async invoke() {
        return { summary: 'ok' }
      },
    }
    const recruitingRuntime = runtimeFor({ id: 'worker-demo-primary', soulId: 'demo-soul', name: 'Demo Primary' }, executor)
    const talentRuntime = runtimeFor({ id: 'worker-demo-secondary', soulId: 'demo-soul', name: 'Demo Secondary' }, executor)

    await recruitingRuntime.init()
    await talentRuntime.init()
    const recruitingWorkspace = await recruitingRuntime.createWorkspace({ name: 'Open roles' })
    const talentWorkspace = await talentRuntime.createWorkspace({ name: 'Talent pool' })

    expect(recruitingRuntime.snapshot().worker.soulId).toBe('demo-soul')
    expect(talentRuntime.snapshot().worker.soulId).toBe('demo-soul')
    expect(recruitingRuntime.snapshot().workspaces.map(workspace => workspace.id)).toEqual([recruitingWorkspace.id])
    expect(talentRuntime.snapshot().workspaces.map(workspace => workspace.id)).toEqual([talentWorkspace.id])
  })

  it('projects worker overlay source refs without storing projected content in Host metadata', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-overlay-skill')
    await writeProfileEngineAssets(appRoot)
    await mkdir(join(appRoot, 'engine-assets', 'skills', 'interview-brief'), { recursive: true })
    await writeFile(join(appRoot, 'engine-assets', 'skills', 'interview-brief', 'SKILL.md'), '# Baseline Interview Brief\n')
    await mkdir(join(appRoot, 'engine-assets', 'skills', 'overlay-brief'), { recursive: true })
    await writeFile(join(appRoot, 'engine-assets', 'skills', 'overlay-brief', 'SKILL.md'), '# Overlay Interview Brief\n')

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const existingWorkspace = await workerRuntime.createWorkspace({ name: 'Existing candidate pool' })
    await expect(readFile(join(existingWorkspace.rootPath, '.agents', 'skills', 'demo-soul-app-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Baseline Interview Brief')

    upsertWorkerOverlayAssets(workerRuntime.workerId, [{
      checksum: 'sha256:overlay',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      sourceRef: 'descriptor://engine/skills/overlay-brief',
      target: 'codex',
    }])
    expect(JSON.stringify(getWorkerConfigValue(workerRuntime.workerId, 'overlay:skill:codex:interview-brief'))).not.toContain('Overlay Interview Brief')

    await workerRuntime.init()
    await expect(readFile(join(existingWorkspace.rootPath, '.agents', 'skills', 'demo-soul-app-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Baseline Interview Brief')

    const reprojected = await workerRuntime.reprojectWorkspaceAssets(existingWorkspace.id)
    await expect(readFile(join(existingWorkspace.rootPath, '.agents', 'skills', 'demo-soul-app-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Overlay Interview Brief')
    expect(reprojected.receipt?.projections).toContainEqual(expect.objectContaining({
      source: 'worker-overlay',
      target: '.agents/skills/demo-soul-app-interview-brief/SKILL.md',
    }))
    expect(reprojected.workspace.metadataJson.engineAssetProjection).toMatchObject({
      projectionManifestPath: '.aiworker/projections.json',
    })

    const newWorkspace = await workerRuntime.createWorkspace({ name: 'New candidate pool' })
    await expect(readFile(join(newWorkspace.rootPath, '.agents', 'skills', 'demo-soul-app-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Overlay Interview Brief')
    const receipt = JSON.parse(await readFile(join(newWorkspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ source: string, target: string }>
    }
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      source: 'worker-overlay',
      target: '.agents/skills/demo-soul-app-interview-brief/SKILL.md',
    }))
  })

  it('rejects worker overlay source refs that escape descriptor engine assets', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-overlay-escape')
    await writeProfileEngineAssets(appRoot)
    await mkdir(join(appRoot, '..', 'outside-secret'), { recursive: true })
    await writeFile(join(appRoot, '..', 'outside-secret', 'SKILL.md'), '# Outside Secret\n')
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Escaping overlay workspace' })
    upsertWorkerOverlayAssets(workerRuntime.workerId, [{
      checksum: 'sha256:outside',
      enabled: true,
      id: 'candidate-profile',
      kind: 'skill',
      sourceRef: 'descriptor://engine/skills/../../../outside-secret',
      target: 'codex',
    }])

    await expect(workerRuntime.reprojectWorkspaceAssets(workspace.id))
      .rejects
      .toThrow('Invalid worker overlay sourceRef')
  })

  it('projects worker MCP overlay source refs from descriptor engine mcp assets', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-overlay-mcp')
    await writeProfileEngineAssets(appRoot)
    await mkdir(join(appRoot, 'engine-assets', 'mcp', 'codex'), { recursive: true })
    await writeFile(join(appRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), 'command = "canonical-overlay-mcp"\n')
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, {
      engineAssets: canonicalMcpClientEngineAssets(),
    })

    await workerRuntime.init()
    upsertWorkerOverlayAssets(workerRuntime.workerId, [{
      checksum: 'sha256:canonical-mcp',
      enabled: true,
      id: 'codex',
      kind: 'mcp-client',
      sourceRef: 'descriptor://engine/mcp/codex',
      target: 'codex',
    }])
    const workspace = await workerRuntime.createWorkspace({ name: 'Canonical MCP overlay workspace' })

    await expect(readFile(join(workspace.rootPath, '.codex', 'config.toml'), 'utf8'))
      .resolves
      .toContain('canonical-overlay-mcp')
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ source: string, target: string }>
    }
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      source: 'worker-overlay',
      target: '.codex/config.toml',
    }))
  })

  it('projects Codex MCP client config for codex workers', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-mcp-codex')
    await writeMcpClientEngineAssets(appRoot)

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, { engineAssets: mcpClientEngineAssets() })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Codex MCP Workspace' })

    await expect(readFile(join(workspace.rootPath, '.codex', 'config.toml'), 'utf8')).resolves.toContain('mcp_servers.ats')
    await expect(stat(join(workspace.rootPath, '.mcp.json'))).rejects.toThrow()
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ engineTarget?: string, kind: string, source: string, target: string }>
    }
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      engineTarget: 'codex',
      kind: 'mcp-client',
      source: 'engine-assets/mcp/codex/config.toml',
      target: '.codex/config.toml',
    }))
  })

  it('projects Claude Code MCP client config for claude-code workers', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-mcp-claude')
    await writeMcpClientEngineAssets(appRoot)

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, {
      defaultEngineId: 'claude-code',
      engineAssets: mcpClientEngineAssets(),
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Claude MCP Workspace' })

    await expect(readFile(join(workspace.rootPath, '.mcp.json'), 'utf8')).resolves.toContain('aiworker-mcp-ats')
    await expect(stat(join(workspace.rootPath, '.codex', 'config.toml'))).rejects.toThrow()
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ engineTarget?: string, kind: string, source: string, target: string }>
    }
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      engineTarget: 'claude-code',
      kind: 'mcp-client',
      source: 'engine-assets/mcp/claude-code/.mcp.json',
      target: '.mcp.json',
    }))
  })

  it('skips MCP client config for unsupported worker engine targets', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-mcp-http')
    await writeMcpClientEngineAssets(appRoot)

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, {
      defaultEngineId: 'http',
      engineAssets: mcpClientEngineAssets(),
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'HTTP MCP Workspace' })
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ kind: string }>
    }

    expect(receipt.projections.filter(item => item.kind === 'mcp-client')).toEqual([])
    await expect(stat(join(workspace.rootPath, '.mcp.json'))).rejects.toThrow()
    await expect(stat(join(workspace.rootPath, '.codex', 'config.toml'))).rejects.toThrow()
  })

  it('projects author-owned MCP client config secrets without copying them into Host metadata or receipts', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-mcp-secret')
    await writeMcpClientEngineAssets(appRoot)
    await writeFile(join(appRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), 'token = "sk-test-literal-secret"\n')

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, { engineAssets: mcpClientEngineAssets() })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Secret MCP Workspace' })
    const receipt = await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')

    await expect(readFile(join(workspace.rootPath, '.codex', 'config.toml'), 'utf8')).resolves.toContain('sk-test-literal-secret')
    expect(JSON.stringify(workspace.metadataJson)).not.toContain('sk-test-literal-secret')
    expect(receipt).not.toContain('sk-test-literal-secret')
  })

  it('repairs stale workspace root agent instructions during runtime init', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app')
    await writeProfileEngineAssets(appRoot)
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Repairable Profile' })
    await writeFile(join(workspace.rootPath, 'AGENTS.md'), '# stale\n')
    await writeFile(join(workspace.rootPath, 'CLAUDE.md'), 'stale\n')

    await workerRuntime.init()

    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('README.md is the accepted profile state')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Repairable Profile')
    await expect(readFile(join(workspace.rootPath, 'CLAUDE.md'), 'utf8')).resolves.toBe('@AGENTS.md\n')
  })

  it('keeps a Soul App without native skills valid and usable', async () => {
    const appRoot = join(dir, 'souls', 'demo-soul-app-no-skills')
    await writeWorkspaceEngineAssets(appRoot)
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'No Skills Profile' })
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      appId: string
      projections: Array<{ kind: string }>
    }

    expect(receipt.appId).toBe('demo-soul-app')
    expect(receipt.projections.filter(item => item.kind === 'native-skill')).toEqual([])
    const readme = await readFile(join(workspace.rootPath, 'README.md'), 'utf8')
    expect(readme).toContain('## Identity And Basics')
    expect(readme).toContain('## Profile Update State')
    expect(readme).toContain('No accepted profile update yet.')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Available native skills may be empty')
    await expect(readFile(join(workspace.rootPath, 'CLAUDE.md'), 'utf8')).resolves.toBe('@AGENTS.md\n')
  })
})

async function writeProfileEngineAssets(appRoot: string): Promise<void> {
  await writeWorkspaceEngineAssets(appRoot)
  await mkdir(join(appRoot, 'engine-assets', 'skills', 'candidate-profile'), { recursive: true })
  await writeFile(join(appRoot, 'engine-assets', 'skills', 'candidate-profile', 'SKILL.md'), [
    '---',
    'name: candidate-profile',
    'description: Maintain a source-backed candidate profile.',
    '---',
    '',
    '# Candidate Profile',
    '',
    'Use candidate, employee, and alumni lifecycle language.',
    '',
  ].join('\n'))
}

async function writeMcpClientEngineAssets(appRoot: string): Promise<void> {
  await writeProfileEngineAssets(appRoot)
  await mkdir(join(appRoot, 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await mkdir(join(appRoot, 'engine-assets', 'mcp', 'claude-code'), { recursive: true })
  await writeFile(join(appRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), [
    '[mcp_servers.ats]',
    'command = "uvx"',
    'args = ["aiworker-mcp-ats"]',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'mcp', 'claude-code', '.mcp.json'), `${JSON.stringify({
    mcpServers: {
      ats: {
        args: ['aiworker-mcp-ats'],
        command: 'uvx',
      },
    },
  }, null, 2)}\n`)
}

function mcpClientEngineAssets(): SoulAppEngineAssets {
  return {
    mcpClients: [
      { source: './engine-assets/mcp/codex', target: 'codex' },
      { source: './engine-assets/mcp/claude-code', target: 'claude-code' },
    ],
    skills: {
      source: './engine-assets/skills',
      targets: ['codex', 'claude-code'],
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  }
}

function canonicalMcpClientEngineAssets(): SoulAppEngineAssets {
  return {
    mcpClients: [
      { source: './engine-assets/mcp/codex', target: 'codex' },
    ],
    skills: {
      source: './engine-assets/skills',
      targets: ['codex', 'claude-code'],
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  }
}

async function writeWorkspaceEngineAssets(appRoot: string): Promise<void> {
  await mkdir(join(appRoot, 'engine-assets', 'workspace', 'evidence'), { recursive: true })
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'AGENTS.md'), [
    '# {{workerName}} Workspace Instructions',
    '',
    'This workspace belongs to an AIWorker Soul App profile ledger.',
    '',
    '## Workspace Identity',
    '',
    '- Soul worker: {{workerName}}',
    '- Soul id: {{soulId}}',
    '- Workspace profile: {{workspaceName}}',
    '',
    '## Accepted State',
    '',
    '- README.md is the accepted profile state for this workspace.',
    '- Do not directly update `README.md` during an agent session.',
    '- If a result should change the accepted profile, write a clear artifact with an `aiworker-profile-readme` draft.',
    '- The owning Soul App decides when a README patch is accepted into `README.md`.',
    '',
    '## Action and Skill Binding',
    '',
    '- When a session is started from a Soul App action, treat that action as an explicit skill selection.',
    '- Do not silently switch to another skill.',
    '- Available native skills may be empty.',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'CLAUDE.md'), '@AGENTS.md\n')
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'README.md'), [
    '# {{workspaceName}}',
    '',
    '> Starter People Profile for this workspace. The owning Soul App may replace this scaffold with accepted profile content.',
    '',
    '## Current Profile Summary',
    '',
    'No accepted profile update yet.',
    '',
    '## Identity And Basics',
    '',
    '- Lifecycle: Unknown',
    '- Target role: Unknown',
    '- Current stage: Not started',
    '- Profile confidence: No accepted evidence yet',
    '',
    '## Role Context And Responsibilities',
    '',
    'No accepted role context yet.',
    '',
    '## Capabilities And Stack',
    '',
    '- No accepted capabilities yet.',
    '',
    '## Confirmed Facts',
    '',
    '- No confirmed facts yet.',
    '',
    '## Evidence Status',
    '',
    '| Signal | Status | Source |',
    '| --- | --- | --- |',
    '| Profile baseline | Missing | No accepted profile update |',
    '',
    '## Risks And Gaps',
    '',
    '- No accepted risks or gaps yet.',
    '',
    '## Next HR Actions',
    '',
    '- Add source-backed profile evidence through the owning Soul App.',
    '',
    '## Profile Update State',
    '',
    'No accepted profile update yet.',
    '',
    '## Accepted External Sections',
    '',
    '- None yet.',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'workspace', '.gitignore'), [
    '.aiworker/sessions/',
    '.aiworker/projections.json',
    'evidence/raw/',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'evidence', 'README.md'), '# Evidence\n')
}

function _gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
}
