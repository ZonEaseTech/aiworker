import type { EngineAdapter, EngineBridgeFailureCode, EngineBridgeOptions, EngineEventSink } from '@zonease/aiworker-engine-bridge'
import type { EngineAssetSource, ReservedOverlayProjectionConfig, WorkerOverlayProjectionAsset } from '@zonease/aiworker-engine-projection'
import type { LocalExecutionMode, SoulAppEngineTarget, SoulAppProjectionReceipt } from '@zonease/aiworker-soul-protocol'
import type {
  EngineInvocationRow,
  FileRow,
  SessionEventRow,
  SessionRow,
  WorkerRow,
  WorkspaceRow,
} from '@zonease/aiworker-storage-sqlite/worker'
import type { LocalExecutor, LocalExecutorEvent, LocalExecutorResult } from './executor'
import type { FrozenSessionEngine } from './session-engine'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createEngineBridge, ENGINE_BRIDGE_FAILURE_CODES, redactEngineBridgeValue } from '@zonease/aiworker-engine-bridge'
import {
  cleanupWorkspaceProjectionReceipt as cleanupProjectedWorkspaceReceipt,
  computeWorkspaceProjectionFreshnessMarker,
  engineAssetProjectionReceiptPath,
  projectEngineAssetsToWorkspace,
  resolveSoulAppEngineTarget,
} from '@zonease/aiworker-engine-projection'
import { AppError, soulAppProjectionReceiptSchema } from '@zonease/aiworker-soul-protocol'
import {
  appendSessionEvent,
  createEngineInvocation,
  createSession,
  createWorkspace,
  getEngineInvocation,
  getSession,
  getWorker,
  getWorkspace,
  listEngineInvocations,
  listFiles,
  listInvocationEvents,
  listSessionEvents,
  listSessions,
  listWorkerConfigValues,
  listWorkerOverlayAssets,
  listWorkspaces,
  nextEngineInvocationSeq,
  nextSessionEventSeq,
  updateEngineInvocation,
  updateSession,
  updateWorkspace,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { LocalWorkerEventBus } from './events'
import { createExternalEngineExecutor, LocalExecutorFailure } from './executor'
import { LocalWorkspaceFiles } from './files'
import {
  freezeSessionEngineMetadata,

  inferLatestInvocationEngine,
  readFrozenSessionEngine,
  resolveFrozenSessionEngine,
} from './session-engine'

type LocalEngineBridgeOptions = Pick<
  EngineBridgeOptions,
  'adapters' | 'cancelGracePeriodMs' | 'processManager' | 'projectionReceipts' | 'rawChunkStore'
>

interface WorkerConfigProjectionAssetRef {
  enabled: boolean
  id: string
  kind: WorkerOverlayProjectionAsset['kind']
  sourceRef: string | null
  target: string
}

export interface LocalWorkerRuntimeOptions {
  worker: {
    id: string
    appId: string
    name: string
    defaultEngineId?: string | null
    metadata?: Record<string, unknown>
  }
  workspacesRoot: string
  executor?: LocalExecutor
  engineBridge?: LocalEngineBridgeOptions | null
  engineAssetSource?: EngineAssetSource | null
  now?: () => string
}

export interface CreateLocalWorkspaceInput {
  name: string
  rootPath?: string
  type?: string
  sourcePointers?: Record<string, unknown>[]
  metadata?: Record<string, unknown>
}

export interface CreateLocalSessionInput {
  workspaceId: string
  capabilityId: string
  title: string
  metadata?: Record<string, unknown>
}

export interface StartLocalInvocationInput {
  sessionId: string
  input: string
  engineId: string
  engineCommand?: string | null
  metadata?: Record<string, unknown>
}

export interface LocalInvocationStartResult {
  session: SessionRow
  invocation: EngineInvocationRow
  events: SessionEventRow[]
  files: FileRow[]
}

export interface LocalInvocationCancelResult {
  session: SessionRow
  invocation: EngineInvocationRow
  events: SessionEventRow[]
}

export interface LocalInvocationEventReattachResult {
  after: number
  bridgeEvents: Array<Record<string, unknown>>
  events: SessionEventRow[]
  invocation: EngineInvocationRow
  invocationId: string
  nextAfter: number
  session: SessionRow
}

export interface LocalInvocationReconcileInput {
  diagnostic?: string
  handle?: Record<string, unknown>
  state?: EngineInvocationRow['processState']
}

export interface LocalInvocationReconcileResult {
  bridgeEvents: Array<Record<string, unknown>>
  events: SessionEventRow[]
  invocation: EngineInvocationRow
  session: SessionRow
}

export interface LocalWorkerSnapshot {
  worker: WorkerRow
  workspaces: WorkspaceRow[]
  sessions: SessionRow[]
  invocations: EngineInvocationRow[]
  files: FileRow[]
  events: SessionEventRow[]
}

export interface WorkspaceAssetProjectionResult {
  receipt: SoulAppProjectionReceipt | null
  workspace: WorkspaceRow
}

export interface WorkspaceProjectionReceiptResult {
  manifestPath: string
  receipt: SoulAppProjectionReceipt
  receiptId: string
  workspace: WorkspaceRow
}

export interface WorkspaceProjectionCleanupResult extends WorkspaceProjectionReceiptResult {
  cleanedTargets: string[]
}

export class LocalWorkerRuntime {
  readonly #workerInput: LocalWorkerRuntimeOptions['worker']
  readonly #workspacesRoot: string
  readonly #executor: LocalExecutor
  readonly #engineAssetSource: EngineAssetSource | null
  readonly #engineBridgeOptions: LocalEngineBridgeOptions | null
  readonly #now: () => string
  readonly bus = new LocalWorkerEventBus()

  constructor(options: LocalWorkerRuntimeOptions) {
    this.#workerInput = options.worker
    this.#workspacesRoot = path.resolve(options.workspacesRoot)
    this.#executor = options.executor ?? createExternalEngineExecutor()
    this.#engineAssetSource = options.engineAssetSource ?? null
    this.#engineBridgeOptions = options.engineBridge ?? null
    this.#now = options.now ?? (() => new Date().toISOString())
  }

  get workerId(): string {
    return this.#workerInput.id
  }

  get workspacesRoot(): string {
    return this.#workspacesRoot
  }

  async init(): Promise<WorkerRow> {
    await mkdir(this.#workspacesRoot, { recursive: true })
    const worker = upsertWorker({
      id: this.#workerInput.id,
      appId: this.#workerInput.appId,
      name: this.#workerInput.name,
      defaultEngineId: this.#workerInput.defaultEngineId ?? null,
      metadataJson: this.#workerInput.metadata ?? {},
      at: this.#now(),
    })
    await this.repairWorkspaceLayouts()
    return worker
  }

  async createWorkspace(input: CreateLocalWorkspaceInput): Promise<WorkspaceRow> {
    this.requireActiveWorker()
    const id = randomUUID()
    const rootPath = input.rootPath ? path.resolve(input.rootPath) : path.join(this.#workspacesRoot, id)
    const layout = await this.prepareWorkspaceLayout({
      name: input.name,
      projectEngineAssets: true,
      projectWorkerOverlayAssets: true,
      rootPath,
    })
    return createWorkspace({
      id,
      workerId: this.workerId,
      name: input.name,
      rootPath,
      type: input.type ?? 'workspace',
      sourcePointersJson: input.sourcePointers ?? [],
      metadataJson: {
        ...(input.metadata ?? {}),
        engineAssetProjection: layout.engineAssets
          ? {
              projectionCount: layout.engineAssets.projections.length,
              projectionManifestPath: engineAssetProjectionReceiptPath(),
            }
          : null,
      },
      at: this.#now(),
    })
  }

  async reprojectWorkspaceAssets(workspaceId: string, input: { engineTarget?: SoulAppEngineTarget | null } = {}): Promise<WorkspaceAssetProjectionResult> {
    this.requireActiveWorker()
    const workspace = this.requireActiveWorkspace(workspaceId)
    const layout = await this.prepareWorkspaceLayout({
      engineTarget: input.engineTarget,
      name: workspace.name,
      preserveUnownedExistingTargets: true,
      projectEngineAssets: true,
      projectWorkerOverlayAssets: true,
      rootPath: workspace.rootPath,
    })
    const updatedWorkspace = updateWorkspace({
      id: workspace.id,
      metadataJson: {
        ...workspace.metadataJson,
        engineAssetProjection: layout.engineAssets
          ? {
              projectionCount: layout.engineAssets.projections.length,
              projectionManifestPath: engineAssetProjectionReceiptPath(),
              projectedAt: layout.engineAssets.generatedAt,
            }
          : null,
      },
      at: this.#now(),
    })
    return {
      receipt: layout.engineAssets,
      workspace: updatedWorkspace,
    }
  }

  async readWorkspaceProjectionReceipt(workspaceId: string): Promise<WorkspaceProjectionReceiptResult | null> {
    const workspace = this.requireWorkspace(workspaceId)
    const manifestPath = engineAssetProjectionReceiptPath()
    try {
      const raw = await readFile(path.join(workspace.rootPath, ...manifestPath.split('/')), 'utf8')
      const parsed = JSON.parse(raw) as unknown
      const receiptId = readNullableString(readRecord(parsed).receiptId)
      const receipt = soulAppProjectionReceiptSchema.parse(parsed)
      return {
        manifestPath,
        receipt,
        receiptId: readNullableString(receiptId) ?? workspace.id,
        workspace,
      }
    }
    catch (error) {
      if (isNoEntryError(error))
        return null
      if (isInvalidProjectionReceiptError(error)) {
        throw localEngineBridgeFailure(
          'PROJECTION_RECEIPT_STALE',
          `Projection receipt is invalid for workspace ${workspace.id}.`,
        )
      }
      throw error
    }
  }

  async cleanupWorkspaceProjectionReceipt(workspaceId: string): Promise<WorkspaceProjectionCleanupResult | null> {
    const result = await this.readWorkspaceProjectionReceipt(workspaceId)
    if (!result)
      return null

    const cleanup = await cleanupProjectedWorkspaceReceipt({
      receipt: result.receipt,
      workspaceRoot: result.workspace.rootPath,
    })

    return {
      ...result,
      cleanedTargets: cleanup.cleanedTargets,
    }
  }

  async createSession(input: CreateLocalSessionInput): Promise<SessionRow> {
    this.requireActiveWorker()
    const workspace = this.requireActiveWorkspace(input.workspaceId)
    const sessionMetadata = freezeSessionEngineMetadata(input.metadata ?? {}, this.requestedSessionEngine(input.metadata ?? {}))
    const session = createSession({
      id: randomUUID(),
      workerId: this.workerId,
      workspaceId: workspace.id,
      capabilityId: input.capabilityId,
      title: input.title,
      status: 'active',
      metadataJson: sessionMetadata,
      startedAt: this.#now(),
      at: this.#now(),
    })
    await this.materializeSessionContext(workspace, session, sessionMetadata)
    this.bus.emit({ kind: 'session', workspaceId: workspace.id, sessionId: session.id, payload: { status: 'active' }, at: this.#now() })
    return session
  }

  async startInvocation(input: StartLocalInvocationInput): Promise<LocalInvocationStartResult> {
    this.requireActiveWorker()
    const session = this.requireActiveSession(input.sessionId)
    const workspace = this.requireActiveWorkspace(session.workspaceId)
    const sessionEngine = this.resolveSessionEngine(session, input)
    const frozenSessionMetadata = freezeSessionEngineMetadata(session.metadataJson ?? {}, sessionEngine)
    const currentSession = sessionEngine.source === 'session'
      ? session
      : updateSession({
          id: session.id,
          metadataJson: frozenSessionMetadata,
          at: this.#now(),
        })
    const metadata = {
      ...(currentSession.metadataJson ?? {}),
      ...(input.metadata ?? {}),
      engineCommand: sessionEngine.engineCommand,
      engineId: sessionEngine.engineId,
      executionMode: sessionEngine.executionMode,
      capabilityId: session.capabilityId,
      sessionId: session.id,
      workerId: this.workerId,
      workspaceId: workspace.id,
    }
    const prompt = this.buildInvocationPromptFromRequest(session, input.input, metadata)
    const invocationId = randomUUID()
    const invocation = createEngineInvocation({
      id: invocationId,
      sessionId: session.id,
      seq: nextEngineInvocationSeq(session.id),
      engineId: sessionEngine.engineId,
      engineCommand: sessionEngine.engineCommand,
      inputRef: `aiworker://sessions/${session.id}/invocations/${invocationId}/input`,
      processState: 'spawned',
      status: 'running',
      metadataJson: metadata,
      startedAt: this.#now(),
      at: this.#now(),
    })
    this.appendEvent(session.id, 'status', { invocationId: invocation.id, status: 'running' }, invocation.id)
    this.bus.emit({ kind: 'event', workspaceId: workspace.id, sessionId: session.id, invocationId: invocation.id, payload: { invocation, status: 'running' }, at: this.#now() })

    try {
      const invocationRoot = await this.ensureInvocationRoot(workspace, session, invocation)
      const result = await this.invokeEngine({
        invocation,
        invocationRoot,
        metadata,
        prompt,
        requestInput: input.input,
        session: currentSession,
        sessionEngine,
        workspace,
      })
      const resultMetadata = redactEngineRecord(result.metadata ?? {})
      const summary = redactEngineString(result.summary)
      const finishedInvocation = updateEngineInvocation({
        id: invocation.id,
        ...engineInvocationReferenceFields(result),
        status: 'succeeded',
        processState: 'exited',
        summary,
        metadataJson: { ...metadata, ...resultMetadata },
        finishedAt: this.#now(),
        at: this.#now(),
      })
      this.appendEvent(session.id, 'status', { invocationId: invocation.id, status: 'succeeded' }, invocation.id)
      this.bus.emit({ kind: 'event', workspaceId: workspace.id, sessionId: session.id, invocationId: invocation.id, payload: { invocation: finishedInvocation, status: 'succeeded' }, at: this.#now() })
      return {
        session: currentSession,
        invocation: finishedInvocation,
        events: listSessionEvents(session.id).filter(event => event.invocationId === invocation.id),
        files: [],
      }
    }
    catch (error) {
      const message = redactEngineString(error instanceof Error ? error.message : String(error))
      const recoveredMetadata = isLocalExecutorFailureLike(error) ? redactEngineRecord(error.partialResult?.metadata ?? {}) : {}
      const failureCode = engineFailureCode(error)
      const processState = engineFailureProcessState(error)
      const failedInvocation = updateEngineInvocation({
        id: invocation.id,
        status: 'failed',
        processState,
        failureCode,
        eventLogRef: `aiworker://sessions/${session.id}/invocations/${invocation.id}/events`,
        error: message,
        metadataJson: { ...metadata, ...recoveredMetadata },
        summary: isLocalExecutorFailureLike(error) ? redactEngineNullableString(error.partialResult?.summary ?? null) : null,
        finishedAt: this.#now(),
        at: this.#now(),
      })
      this.appendEvent(session.id, 'error', { failureCode, invocationId: invocation.id, message }, invocation.id)
      this.bus.emit({ kind: 'event', workspaceId: workspace.id, sessionId: session.id, invocationId: invocation.id, payload: { invocation: failedInvocation, status: 'failed' }, at: this.#now() })
      return {
        session: currentSession,
        invocation: failedInvocation,
        events: listSessionEvents(session.id).filter(event => event.invocationId === invocation.id),
        files: [],
      }
    }
  }

  async cancelEngineInvocation(
    invocationId: string,
    input: { reason?: unknown } = {},
  ): Promise<LocalInvocationCancelResult> {
    const invocation = getEngineInvocation(invocationId)
    if (!invocation)
      throw new Error(`Engine invocation not found: ${invocationId}`)
    const session = this.requireSession(invocation.sessionId)
    if (session.workerId !== this.workerId)
      throw new Error(`Engine invocation does not belong to worker ${this.workerId}: ${invocationId}`)

    const eventsForInvocation = () => listSessionEvents(session.id).filter(event => event.invocationId === invocation.id)
    if (invocation.status !== 'queued' && invocation.status !== 'running')
      return { session, invocation, events: eventsForInvocation() }

    const processHandle = readRecord(readRecord(invocation.metadataJson).processHandle)
    const processHandleInvocationId = typeof processHandle.invocationId === 'string' && processHandle.invocationId.trim().length > 0
      ? processHandle.invocationId
      : null
    const engineBridgeOptions = this.#engineBridgeOptions
    if (processHandleInvocationId && engineBridgeOptions && engineBridgeOptions.adapters.length > 0) {
      const bridge = createEngineBridge({
        adapters: engineBridgeOptions.adapters,
        cancelGracePeriodMs: engineBridgeOptions.cancelGracePeriodMs,
        processManager: engineBridgeOptions.processManager,
      })
      try {
        await bridge.cancelInvocation({
          engineTarget: invocation.engineId,
          handle: processHandle,
          invocationId: invocation.id,
          reason: input.reason,
        })
      }
      catch (error) {
        const failureCode = readEngineBridgeFailureCode(error)
        if (failureCode)
          throw AppError.internal(redactEngineString(error instanceof Error ? error.message : String(error)), failureCode)
        throw error
      }
    }

    const processState = invocation.status === 'queued' ? 'not_spawned' : 'killed'
    const cancelledInvocation = updateEngineInvocation({
      id: invocation.id,
      status: 'cancelled',
      processState,
      summary: 'Invocation cancelled.',
      finishedAt: this.#now(),
      at: this.#now(),
    })
    this.appendEvent(session.id, 'status', {
      bridgeEvent: 'invocation.cancelled',
      invocationId: invocation.id,
      processState,
      status: 'cancelled',
    }, invocation.id)
    this.bus.emit({
      kind: 'event',
      workspaceId: session.workspaceId,
      sessionId: session.id,
      invocationId: invocation.id,
      payload: { invocation: cancelledInvocation, status: 'cancelled' },
      at: this.#now(),
    })
    return {
      session,
      invocation: cancelledInvocation,
      events: eventsForInvocation(),
    }
  }

  async reattachEngineInvocationEvents(
    invocationId: string,
    options: { after?: number, limit?: number } = {},
  ): Promise<LocalInvocationEventReattachResult> {
    const { invocation, session } = this.requireEngineInvocationForWorker(invocationId)
    const limit = options.limit ?? 500
    const bridge = createEngineBridge({
      adapters: [],
      bridgeEventStore: {
        list: async ({ after, limit }) => listInvocationEvents(invocation.id, { after, limit }).map(bridgeEventFromSessionEvent),
      },
    })
    const result = readRecord(await bridge.reattachInvocationEvents({
      after: options.after ?? 0,
      invocationId: invocation.id,
      limit,
    }))
    const after = readNumber(result.after, options.after ?? 0)
    const nextAfter = readNumber(result.nextAfter, after)
    return {
      after,
      bridgeEvents: readRecords(result.events),
      events: listInvocationEvents(invocation.id, { after, limit }),
      invocation,
      invocationId: invocation.id,
      nextAfter,
      session,
    }
  }

  async reconcileEngineInvocation(
    invocationId: string,
    input: LocalInvocationReconcileInput = {},
  ): Promise<LocalInvocationReconcileResult> {
    const { invocation, session } = this.requireEngineInvocationForWorker(invocationId)
    const bridgeEvents: Array<Record<string, unknown>> = []
    const bridge = createEngineBridge({
      adapters: [],
      bridgeEventStore: {
        append: async (event) => {
          bridgeEvents.push(readRecord(event))
        },
      },
      processManager: {
        inspect: async (_handle, guard) => ({
          diagnostic: input.diagnostic,
          invocationId: guard.invocationId,
          state: input.state ?? 'lost',
        }),
      },
    })
    const result = readRecord(await bridge.reconcileInvocation({
      handle: input.handle ?? { invocationId: invocation.id },
      invocationId: invocation.id,
    }))
    const processState = readEngineProcessState(result.processState, invocation.processState)
    const status = readEngineInvocationStatus(result.status, invocation.status)
    const failureCode = readNullableString(result.failureCode)
    const updated = updateEngineInvocation({
      id: invocation.id,
      status,
      processState,
      failureCode,
      summary: status === 'lost' ? 'Native engine process was lost.' : invocation.summary,
      finishedAt: status === 'lost' ? this.#now() : invocation.finishedAt,
      at: this.#now(),
    })
    for (const bridgeEvent of bridgeEvents)
      this.appendEvent(session.id, 'status', sessionPayloadFromBridgeEvent(bridgeEvent, status), invocation.id)
    this.bus.emit({
      kind: 'event',
      workspaceId: session.workspaceId,
      sessionId: session.id,
      invocationId: invocation.id,
      payload: { invocation: updated, status },
      at: this.#now(),
    })
    return {
      bridgeEvents,
      events: listInvocationEvents(invocation.id),
      invocation: updated,
      session,
    }
  }

  snapshot(): LocalWorkerSnapshot {
    const worker = this.requireWorker()
    const workspaces = listWorkspaces(worker.id)
    const workspaceIds = new Set(workspaces.map(workspace => workspace.id))
    const sessions = listSessions().filter(session => workspaceIds.has(session.workspaceId))
    const sessionIds = new Set(sessions.map(session => session.id))
    return {
      worker,
      workspaces,
      sessions,
      invocations: listEngineInvocations().filter(invocation => sessionIds.has(invocation.sessionId)),
      files: listFiles().filter(file => workspaceIds.has(file.workspaceId)),
      events: listSessionEvents().filter(event => sessionIds.has(event.sessionId)),
    }
  }

  files(workspaceId: string): LocalWorkspaceFiles {
    const workspace = this.requireWorkspace(workspaceId)
    return new LocalWorkspaceFiles(workspace.rootPath)
  }

  dispose(): void {
    return undefined
  }

  private async invokeEngine(input: {
    invocation: EngineInvocationRow
    invocationRoot: string
    metadata: Record<string, unknown>
    prompt: string
    requestInput: string
    session: SessionRow
    sessionEngine: FrozenSessionEngine
    workspace: WorkspaceRow
  }): Promise<LocalExecutorResult> {
    const bridgeOptions = this.#engineBridgeOptions && this.#engineBridgeOptions.adapters.length > 0
      ? this.#engineBridgeOptions
      : createLocalExecutorBridgeOptions(this.#executor, input.sessionEngine.engineId, {
          assertUsable: request => this.assertWorkspaceProjectionReceipt(input.workspace, request),
        })

    const previousInvocation = latestPriorEngineInvocation(input.session.id, input.invocation.seq, input.sessionEngine.engineId)
    const bridge = createEngineBridge({
      adapters: bridgeOptions.adapters,
      bridgeEventStore: {
        append: async event => this.appendBridgeEvent(input.session.id, readRecord(event), input.invocation.id, 'running'),
      },
      projectionReceipts: bridgeOptions.projectionReceipts,
      rawChunkStore: bridgeOptions.rawChunkStore,
      resolveLatestExternalSessionRef: async () => latestExternalSessionRef(previousInvocation),
    })
    const request = {
      capabilityDescriptorRef: input.session.capabilityId,
      cwd: input.workspace.rootPath,
      engineCommand: input.sessionEngine.engineCommand,
      engineTarget: input.sessionEngine.engineId,
      input: { body: input.requestInput },
      invocationId: input.invocation.id,
      invocationRoot: input.invocationRoot,
      metadata: input.metadata,
      projectionManifestPath: readString(readRecord(input.workspace.metadataJson.engineAssetProjection).projectionManifestPath, engineAssetProjectionReceiptPath()),
      projectionReceiptId: input.workspace.id,
      prompt: input.prompt,
      sessionId: input.session.id,
      workerId: this.workerId,
      workspaceId: input.workspace.id,
      workspaceLocatorId: input.workspace.id,
    }
    const result = readRecord(previousInvocation
      ? await bridge.followUp(request)
      : await bridge.startInvocation(request))
    return {
      ...localExecutorResultFromBridgeResult(result),
      eventLogRef: readNullableString(result.eventLogRef) ?? `aiworker://sessions/${input.session.id}/invocations/${input.invocation.id}/events`,
      projectionReceiptId: readNullableString(result.projectionReceiptId) ?? input.workspace.id,
    }
  }

  private appendBridgeEvent(
    sessionId: string,
    event: Record<string, unknown>,
    invocationId: string,
    status: EngineInvocationRow['status'],
  ): SessionEventRow {
    return this.appendEvent(sessionId, sessionEventTypeFromBridgeEvent(readString(event.type, 'invocation.progress')), sessionPayloadFromBridgeEvent(event, status), invocationId)
  }

  private async assertWorkspaceProjectionReceipt(workspace: WorkspaceRow, request: Record<string, unknown>): Promise<void> {
    const projection = readRecord(workspace.metadataJson.engineAssetProjection)
    const expectedManifestPath = readNullableString(projection.projectionManifestPath)
    if (!expectedManifestPath)
      return

    const requestManifestPath = readString(request.projectionManifestPath, '')
    if (requestManifestPath !== expectedManifestPath) {
      throw localEngineBridgeFailure(
        'PROJECTION_RECEIPT_STALE',
        `Projection receipt path changed for workspace ${workspace.id}.`,
      )
    }

    let receipt: WorkspaceProjectionReceiptResult | null
    try {
      receipt = await this.readWorkspaceProjectionReceipt(workspace.id)
    }
    catch (error) {
      if (isInvalidProjectionReceiptError(error)) {
        throw localEngineBridgeFailure(
          'PROJECTION_RECEIPT_STALE',
          `Projection receipt is invalid for workspace ${workspace.id}.`,
        )
      }
      throw error
    }
    if (!receipt) {
      throw localEngineBridgeFailure(
        'PROJECTION_RECEIPT_MISSING',
        `Projection receipt is missing for workspace ${workspace.id}.`,
      )
    }

    const requestReceiptId = readString(request.projectionReceiptId, '')
    if (requestReceiptId && requestReceiptId !== receipt.receiptId) {
      throw localEngineBridgeFailure(
        'PROJECTION_RECEIPT_STALE',
        `Projection receipt id changed for workspace ${workspace.id}.`,
      )
    }

    if (!this.#engineAssetSource)
      return

    const engineTarget = resolveSoulAppEngineTarget(readNullableString(request.engineTarget))
    const expectedFreshnessMarker = await computeWorkspaceProjectionFreshnessMarker({
      appId: this.#engineAssetSource.appId,
      engineAssets: this.#engineAssetSource.engineAssets,
      engineTarget,
      reservedOverlayConfigs: this.resolveReservedOverlayProjectionConfigs(),
      sourceRoot: this.#engineAssetSource.sourceRoot,
      variables: this.projectionVariables(workspace.name),
      workerOverlayAssets: await this.resolveCurrentWorkerOverlayProjectionAssets(engineTarget),
    })
    if (receipt.receipt.freshnessMarker !== expectedFreshnessMarker) {
      throw localEngineBridgeFailure(
        'PROJECTION_RECEIPT_STALE',
        `Projection receipt freshness marker changed for workspace ${workspace.id}.`,
      )
    }
  }

  private appendEvent(sessionId: string, type: SessionEventRow['type'], payloadJson: Record<string, unknown>, invocationId: string): SessionEventRow {
    const row = appendSessionEvent({
      sessionId,
      invocationId,
      seq: nextSessionEventSeq(sessionId),
      type,
      payloadJson,
      at: this.#now(),
    })
    const session = getSession(sessionId)
    if (session) {
      this.bus.emit({
        at: row.createdAt,
        invocationId,
        kind: 'event',
        payload: { event: row },
        sessionId,
        workspaceId: session.workspaceId,
      })
    }
    return row
  }

  private buildInvocationPromptFromRequest(session: SessionRow, request: string, metadata: Record<string, unknown>): string {
    return this.buildSessionPrompt(session, 'Invocation request:', request, metadata)
  }

  private buildSessionPrompt(session: SessionRow, requestLabel: string, request: string, metadata: Record<string, unknown>): string {
    const mentions = explicitMentionLines(metadata.mentions)
    const lines = [
      `Current date: ${this.#now().slice(0, 10)}`,
      `Soul worker: ${this.#workerInput.name}`,
      `App id: ${this.#workerInput.appId}`,
      `Workspace session: ${session.title}`,
      `Capability: ${session.capabilityId}`,
      `Output kind: ${readString(metadata.outputKind, 'session')}`,
      '',
      ...mentions,
      ...(mentions.length > 0 ? [''] : []),
      requestLabel,
      request.trim(),
    ]
    return lines.join('\n')
  }

  private async materializeSessionContext(workspace: WorkspaceRow, session: SessionRow, metadata: Record<string, unknown>): Promise<void> {
    const files = new LocalWorkspaceFiles(workspace.rootPath)
    const sessionRoot = path.posix.join('.aiworker', 'sessions', session.id)
    const sessionEngine = readFrozenSessionEngine(metadata)
    await mkdir(files.resolve(path.posix.join(sessionRoot, 'context')), { recursive: true })
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'cwd.txt')), workspace.rootPath, 'utf8')
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'engine.json')), JSON.stringify({
      engineCommand: sessionEngine?.engineCommand ?? null,
      engineId: sessionEngine?.engineId ?? this.#workerInput.defaultEngineId ?? 'codex',
      executionMode: sessionEngine?.executionMode ?? 'local-cli',
      soulId: this.#workerInput.appId,
    }, null, 2), 'utf8')
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'soul-app.json')), JSON.stringify({
      soulId: this.#workerInput.appId,
      name: this.#workerInput.name,
    }, null, 2), 'utf8')
    await mkdir(files.resolve(path.posix.join(sessionRoot, 'invocations')), { recursive: true })
  }

  private async ensureInvocationRoot(workspace: WorkspaceRow, session: SessionRow, invocation: EngineInvocationRow): Promise<string> {
    const files = new LocalWorkspaceFiles(workspace.rootPath)
    const padded = String(invocation.seq).padStart(4, '0')
    const invocationRoot = files.resolve(path.posix.join('.aiworker', 'sessions', session.id, 'invocations', padded))
    await mkdir(invocationRoot, { recursive: true })
    return invocationRoot
  }

  private requireWorker(): WorkerRow {
    const worker = getWorker(this.workerId)
    if (!worker)
      throw new Error('Local Soul worker is not initialized.')
    return worker
  }

  private requireActiveWorker(): WorkerRow {
    const worker = this.requireWorker()
    if (worker.status === 'archived')
      throw AppError.badRequest(`Worker ${this.workerId} is archived and cannot start new work.`, 'WORKER_ARCHIVED')
    return worker
  }

  private requireWorkspace(id: string): WorkspaceRow {
    const workspace = getWorkspace(id)
    if (!workspace || workspace.workerId !== this.workerId)
      throw new Error(`Workspace not found for worker ${this.workerId}: ${id}`)
    return workspace
  }

  private requireActiveWorkspace(id: string): WorkspaceRow {
    const workspace = this.requireWorkspace(id)
    if (workspace.status === 'archived')
      throw AppError.badRequest(`Workspace ${id} is archived and cannot start new work.`, 'WORKSPACE_ARCHIVED')
    return workspace
  }

  private requireSession(id: string): SessionRow {
    const session = getSession(id)
    if (!session || session.workerId !== this.workerId)
      throw new Error(`Session not found for worker ${this.workerId}: ${id}`)
    return session
  }

  private requireActiveSession(id: string): SessionRow {
    const session = this.requireSession(id)
    if (session.status === 'archived')
      throw AppError.badRequest(`Session ${id} is archived and cannot start new work.`, 'SESSION_ARCHIVED')
    return session
  }

  private requireEngineInvocationForWorker(invocationId: string): { invocation: EngineInvocationRow, session: SessionRow } {
    const invocation = getEngineInvocation(invocationId)
    if (!invocation)
      throw new Error(`Engine invocation not found: ${invocationId}`)
    const session = this.requireSession(invocation.sessionId)
    return { invocation, session }
  }

  private requestedSessionEngine(metadata: Record<string, unknown>): FrozenSessionEngine {
    return {
      engineCommand: readNullableString(metadata.engineCommand),
      engineId: readString(metadata.engineId, this.#workerInput.defaultEngineId ?? 'codex'),
      executionMode: readExecutionMode(metadata.executionMode),
    }
  }

  private requestedInvocationEngine(input: StartLocalInvocationInput): FrozenSessionEngine {
    return {
      engineCommand: input.engineCommand ?? null,
      engineId: input.engineId,
      executionMode: readExecutionMode(input.metadata?.executionMode),
    }
  }

  private latestInvocationEngine(sessionId: string) {
    const latestInvocation = listEngineInvocations(sessionId, 1)[0]
    return inferLatestInvocationEngine(latestInvocation
      ? {
          engineCommand: latestInvocation.engineCommand,
          engineId: latestInvocation.engineId,
          metadata: latestInvocation.metadataJson,
        }
      : {
          engineCommand: null,
          engineId: null,
          metadata: null,
        })
  }

  private resolveSessionEngine(session: SessionRow, input: StartLocalInvocationInput) {
    const requested = this.requestedInvocationEngine(input)
    return resolveFrozenSessionEngine({
      latestInvocation: this.latestInvocationEngine(session.id),
      requested,
      sessionMetadata: session.metadataJson,
    })
  }

  private async repairWorkspaceLayouts(): Promise<void> {
    for (const workspace of listWorkspaces(this.workerId)) {
      await this.prepareWorkspaceLayout({
        name: workspace.name,
        projectEngineAssets: true,
        projectWorkerOverlayAssets: false,
        rootPath: workspace.rootPath,
      })
    }
  }

  private async prepareWorkspaceLayout(input: { engineTarget?: SoulAppEngineTarget | null, name: string, preserveUnownedExistingTargets?: boolean, projectEngineAssets: boolean, projectWorkerOverlayAssets: boolean, rootPath: string }): Promise<{
    engineAssets: SoulAppProjectionReceipt | null
  }> {
    const engineTarget = input.engineTarget ?? resolveSoulAppEngineTarget(this.#workerInput.defaultEngineId)
    const workerOverlayAssets = this.#engineAssetSource && input.projectWorkerOverlayAssets
      ? await this.resolveCurrentWorkerOverlayProjectionAssets(engineTarget)
      : []
    const engineAssets = this.#engineAssetSource && input.projectEngineAssets
      ? await projectEngineAssetsToWorkspace({
          appId: this.#engineAssetSource.appId,
          engineAssets: this.#engineAssetSource.engineAssets,
          engineTarget,
          now: this.#now(),
          preserveUnownedExistingTargets: input.preserveUnownedExistingTargets,
          reservedOverlayConfigs: this.resolveReservedOverlayProjectionConfigs(),
          sourceRoot: this.#engineAssetSource.sourceRoot,
          variables: this.projectionVariables(input.name),
          workerOverlayAssets,
          workspaceRoot: input.rootPath,
        })
      : null
    return { engineAssets }
  }

  private async resolveCurrentWorkerOverlayProjectionAssets(engineTarget: SoulAppEngineTarget | null): Promise<WorkerOverlayProjectionAsset[]> {
    if (!this.#engineAssetSource)
      return []
    return [
      ...await this.resolveWorkerOverlayProjectionAssets(this.#engineAssetSource.sourceRoot),
      ...await this.resolveWorkerConfigOverlayProjectionAssets(this.#engineAssetSource.sourceRoot, engineTarget),
    ]
  }

  private projectionVariables(workspaceName: string): Record<string, string> {
    return {
      appId: this.#engineAssetSource?.appId ?? '',
      soulId: this.#workerInput.appId,
      workerName: this.#workerInput.name,
      workspaceName,
    }
  }

  private async resolveWorkerOverlayProjectionAssets(sourceRoot: string): Promise<WorkerOverlayProjectionAsset[]> {
    const assets: WorkerOverlayProjectionAsset[] = []
    for (const asset of listWorkerOverlayAssets(this.workerId)) {
      assets.push({
        content: asset.enabled ? await readFile(this.resolveWorkerOverlaySourcePath(sourceRoot, asset.kind, asset.sourceRef, asset.target), 'utf8') : '',
        enabled: asset.enabled,
        id: asset.id,
        kind: asset.kind,
        target: asset.target,
      })
    }
    return assets
  }

  private async resolveWorkerConfigOverlayProjectionAssets(sourceRoot: string, engineTarget: SoulAppEngineTarget | null): Promise<WorkerOverlayProjectionAsset[]> {
    const assets: WorkerOverlayProjectionAsset[] = []
    for (const row of listWorkerConfigValues(this.workerId)) {
      for (const assetRef of this.workerConfigProjectionAssetRefs(row.configValueJson, engineTarget)) {
        if (assetRef.enabled && !assetRef.sourceRef?.trim())
          throw new Error('Invalid worker overlay sourceRef: ')
        assets.push({
          content: assetRef.enabled ? await readFile(this.resolveWorkerOverlaySourcePath(sourceRoot, assetRef.kind, assetRef.sourceRef ?? '', assetRef.target), 'utf8') : '',
          enabled: assetRef.enabled,
          id: assetRef.id,
          kind: assetRef.kind,
          target: assetRef.target,
        })
      }
    }
    return assets
  }

  private resolveReservedOverlayProjectionConfigs(): ReservedOverlayProjectionConfig[] {
    const configs: ReservedOverlayProjectionConfig[] = []
    for (const row of listWorkerConfigValues(this.workerId)) {
      const value = row.configValueJson
      if (this.workerConfigString(value.kind) !== 'projection-overlay')
        continue
      configs.push({
        checksum: this.workerConfigString(value.checksum),
        enabled: value.enabled !== false,
        kind: 'projection-overlay',
        options: this.workerConfigOptions(value.options),
        sourceRef: this.workerConfigString(value.sourceRef),
        target: this.workerConfigString(value.target) ?? 'all',
      })
    }
    return configs
  }

  private workerConfigProjectionAssetRefs(value: Record<string, unknown>, engineTarget: SoulAppEngineTarget | null): WorkerConfigProjectionAssetRef[] {
    const kind = value.kind
    if (kind !== 'entry-file-overlay' && kind !== 'skill-overlay' && kind !== 'mcp-overlay')
      return []

    const options = this.workerConfigOptions(value.options)
    if (this.workerConfigString(options.overlayId) && this.workerConfigString(options.overlayKind))
      return []

    const overlayKind = this.workerConfigProjectionKind(kind)
    const sourceRef = this.workerConfigString(value.sourceRef)
    const id = this.workerConfigProjectionAssetId(overlayKind, sourceRef, options, value.target, engineTarget)
    if (!id)
      return []

    return this.workerConfigProjectionTargets(overlayKind, value.target, engineTarget).map(target => ({
      enabled: value.enabled !== false,
      id,
      kind: overlayKind,
      sourceRef,
      target,
    }))
  }

  private workerConfigProjectionKind(kind: 'entry-file-overlay' | 'mcp-overlay' | 'skill-overlay'): WorkerOverlayProjectionAsset['kind'] {
    if (kind === 'entry-file-overlay')
      return 'entry-file'
    if (kind === 'mcp-overlay')
      return 'mcp-client'
    return 'skill'
  }

  private workerConfigProjectionAssetId(
    kind: WorkerOverlayProjectionAsset['kind'],
    sourceRef: string | null,
    options: Record<string, unknown>,
    target: unknown,
    engineTarget: SoulAppEngineTarget | null,
  ): string | null {
    const replaces = this.workerConfigString(options.replaces) ?? this.workerConfigString(options.replacesSourceRef)
    if (kind === 'entry-file')
      return this.workerConfigString(options.targetPath) ?? this.workspaceOverlayIdFromRef(replaces ?? sourceRef)
    if (kind === 'skill')
      return this.skillOverlayIdFromRef(replaces ?? sourceRef)
    if (target === 'codex' || target === 'claude-code')
      return target
    return engineTarget
  }

  private workerConfigProjectionTargets(kind: WorkerOverlayProjectionAsset['kind'], target: unknown, engineTarget: SoulAppEngineTarget | null): string[] {
    if (kind === 'entry-file')
      return ['all']
    if (target === 'codex' || target === 'claude-code')
      return [target]
    if (target !== 'all')
      return []
    if (kind === 'mcp-client')
      return engineTarget ? [engineTarget] : []
    return ['codex', 'claude-code']
  }

  private workspaceOverlayIdFromRef(ref: string | null): string | null {
    if (!ref)
      return null
    for (const prefix of ['descriptor://engine/workspaceAssets/', 'descriptor://engine/workspace/']) {
      if (ref.startsWith(prefix))
        return ref.slice(prefix.length)
    }
    return null
  }

  private skillOverlayIdFromRef(ref: string | null): string | null {
    const prefix = 'descriptor://engine/skills/'
    if (!ref?.startsWith(prefix))
      return null
    return ref.slice(prefix.length).replace(/\/SKILL\.md$/, '')
  }

  private workerConfigOptions(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return {}
    return value as Record<string, unknown>
  }

  private workerConfigString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }

  private resolveWorkerOverlaySourcePath(sourceRoot: string, kind: WorkerOverlayProjectionAsset['kind'], sourceRef: string, target: string): string {
    return path.join(path.resolve(sourceRoot), ...this.workerOverlaySourceSegments(kind, sourceRef, target))
  }

  private workerOverlaySourceSegments(kind: WorkerOverlayProjectionAsset['kind'], sourceRef: string, target: string): string[] {
    const ref = sourceRef.trim()
    if (ref.startsWith('descriptor://engine/skills/')) {
      const skillPath = ref.slice('descriptor://engine/skills/'.length).replace(/\/SKILL\.md$/, '')
      return this.safeEngineAssetSegments(['engine-assets', 'skills', ...this.workerOverlayRefPathSegments(skillPath, sourceRef), 'SKILL.md'], sourceRef)
    }
    if (ref.startsWith('descriptor://engine/workspace/')) {
      const workspacePath = ref.slice('descriptor://engine/workspace/'.length)
      return this.safeEngineAssetSegments(['engine-assets', 'workspace', ...this.workerOverlayRefPathSegments(workspacePath, sourceRef)], sourceRef)
    }
    if (ref.startsWith('descriptor://engine/workspaceAssets/')) {
      const workspacePath = ref.slice('descriptor://engine/workspaceAssets/'.length)
      return this.safeEngineAssetSegments(['engine-assets', 'workspace', ...this.workerOverlayRefPathSegments(workspacePath, sourceRef)], sourceRef)
    }
    if (kind === 'mcp-client' && ref.startsWith('descriptor://engine/mcp/')) {
      const engineTarget = ref.slice('descriptor://engine/mcp/'.length) || target
      const file = engineTarget === 'claude-code' ? '.mcp.json' : 'config.toml'
      return this.safeEngineAssetSegments(['engine-assets', 'mcp', ...this.workerOverlayRefPathSegments(engineTarget, sourceRef), file], sourceRef)
    }
    return this.safeEngineAssetSegments(this.workerOverlayRefPathSegments(ref, sourceRef), sourceRef)
  }

  private workerOverlayRefPathSegments(pathValue: string, sourceRef: string): string[] {
    const refPath = pathValue.trim()
    if (refPath.length === 0 || refPath.startsWith('/'))
      throw new Error(`Invalid worker overlay sourceRef: ${sourceRef}`)
    return refPath.split('/')
  }

  private safeEngineAssetSegments(segments: string[], sourceRef: string): string[] {
    const safe = segments.filter(Boolean)
    if (safe.length === 0 || path.isAbsolute(sourceRef.trim()) || safe.some(segment => segment === '.' || segment === '..' || segment.includes('\0') || segment.includes('/') || segment.includes('\\')))
      throw new Error(`Invalid worker overlay sourceRef: ${sourceRef}`)
    return safe
  }
}

export function createLocalWorkerRuntime(options: LocalWorkerRuntimeOptions): LocalWorkerRuntime {
  return new LocalWorkerRuntime(options)
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readExecutionMode(value: unknown, fallback: LocalExecutionMode = 'local-cli'): LocalExecutionMode {
  return value === 'local-cli' || value === 'byok' ? value : fallback
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function redactEngineRecord(value: Record<string, unknown>): Record<string, unknown> {
  return readRecord(redactEngineBridgeValue(value))
}

function redactEngineString(value: string): string {
  const redacted = redactEngineBridgeValue(value)
  return typeof redacted === 'string' ? redacted : ''
}

function redactEngineNullableString(value: string | null): string | null {
  return value == null ? null : redactEngineString(value)
}

function readRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(readRecord).filter(record => Object.keys(record).length > 0) : []
}

function readEngineInvocationStatus(value: unknown, fallback: EngineInvocationRow['status']): EngineInvocationRow['status'] {
  return value === 'queued'
    || value === 'starting'
    || value === 'running'
    || value === 'succeeded'
    || value === 'failed'
    || value === 'cancelled'
    || value === 'lost'
    ? value
    : fallback
}

function readEngineProcessState(value: unknown, fallback: EngineInvocationRow['processState']): EngineInvocationRow['processState'] {
  return value === 'not_spawned'
    || value === 'spawned'
    || value === 'exited'
    || value === 'killed'
    || value === 'lost'
    ? value
    : fallback
}

function bridgeEventFromSessionEvent(event: SessionEventRow): Record<string, unknown> {
  const payload = readRecord(event.payloadJson)
  const { bridgeEvent, ...rest } = payload
  return {
    ...rest,
    id: event.id,
    invocationId: event.invocationId,
    type: readString(bridgeEvent, bridgeEventTypeFromSessionEvent(event.type)),
  }
}

function bridgeEventTypeFromSessionEvent(type: SessionEventRow['type']): string {
  if (type === 'assistant_delta')
    return 'invocation.output.delta'
  if (type === 'tool')
    return 'invocation.tool.observed'
  if (type === 'error')
    return 'invocation.error'
  return 'invocation.progress'
}

function sessionPayloadFromBridgeEvent(event: Record<string, unknown>, status: EngineInvocationRow['status']): Record<string, unknown> {
  const type = readString(event.type, 'invocation.progress')
  const { type: _type, ...payload } = event
  return {
    ...payload,
    bridgeEvent: type,
    status,
  }
}

function sessionEventTypeFromBridgeEvent(type: string): SessionEventRow['type'] {
  if (type === 'invocation.output.delta' || type === 'invocation.output.snapshot')
    return 'assistant_delta'
  if (type === 'invocation.tool.observed')
    return 'tool'
  if (type === 'invocation.error')
    return 'error'
  return 'status'
}

function latestPriorEngineInvocation(sessionId: string, beforeSeq: number, engineId: string): EngineInvocationRow | null {
  return listEngineInvocations(sessionId)
    .filter(invocation => invocation.seq < beforeSeq && invocation.engineId === engineId)
    .sort((left, right) => right.seq - left.seq)[0] ?? null
}

function latestExternalSessionRef(invocation: EngineInvocationRow | null): unknown {
  if (!invocation)
    return null
  const topLevel = parseExternalSessionRef(invocation.externalSessionRef)
  if (topLevel)
    return topLevel
  const metadataRef = readRecord(invocation.metadataJson).externalSessionRef
  return Object.keys(readRecord(metadataRef)).length > 0 ? metadataRef : null
}

function parseExternalSessionRef(value: string | null): unknown {
  if (!value)
    return null
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return value
  }
}

function createLocalExecutorBridgeOptions(
  executor: LocalExecutor,
  target: string,
  projectionReceipts?: LocalEngineBridgeOptions['projectionReceipts'],
): LocalEngineBridgeOptions {
  return {
    adapters: [createLocalExecutorBridgeAdapter(executor, target)],
    projectionReceipts,
  }
}

function createLocalExecutorBridgeAdapter(executor: LocalExecutor, target: string): EngineAdapter {
  return {
    target,
    async cancel() {
      return {}
    },
    async discover() {
      return {
        callable: true,
        installed: true,
        supportsNativeResume: false,
        supportsProtocolCancel: false,
        target,
      }
    },
    async followUp(request, sink) {
      return invokeLocalExecutorThroughBridge(executor, request, sink, target)
    },
    normalize(chunk) {
      return Object.keys(readRecord(chunk)).length > 0 ? [readRecord(chunk)] : []
    },
    async start(request, sink) {
      return invokeLocalExecutorThroughBridge(executor, request, sink, target)
    },
  }
}

async function invokeLocalExecutorThroughBridge(
  executor: LocalExecutor,
  request: Record<string, unknown>,
  sink: EngineEventSink,
  fallbackTarget: string,
): Promise<Record<string, unknown>> {
  const invocationId = readString(request.invocationId, '')
  const result = await executor.invoke({
    engineCommand: readNullableString(request.engineCommand),
    engineId: readString(request.engineTarget, fallbackTarget),
    invocationId,
    invocationRoot: readString(request.invocationRoot, ''),
    onEvent: event => sink.event(bridgeEventFromLocalExecutorEvent(event, invocationId)),
    prompt: readString(request.prompt, ''),
    sessionId: readString(request.sessionId, ''),
    workspaceId: readString(request.workspaceId, ''),
    workspaceRoot: readString(request.cwd, ''),
    metadata: readRecord(request.metadata),
  })
  return result as unknown as Record<string, unknown>
}

function bridgeEventFromLocalExecutorEvent(event: LocalExecutorEvent, invocationId: string): Record<string, unknown> {
  if (event.kind === 'text') {
    return {
      data: { text: event.text },
      invocationId,
      type: 'invocation.output.delta',
    }
  }
  if (event.kind === 'tool_use') {
    return {
      invocationId,
      tool: {
        id: event.id,
        input: event.input,
        name: event.name,
        phase: 'use',
      },
      type: 'invocation.tool.observed',
    }
  }
  if (event.kind === 'tool_result') {
    return {
      invocationId,
      tool: {
        content: event.content,
        id: event.id,
        isError: event.isError ?? false,
        name: event.name ?? null,
        phase: 'result',
      },
      type: 'invocation.tool.observed',
    }
  }
  if (event.kind === 'usage') {
    return {
      invocationId,
      type: 'invocation.usage.observed',
      usage: {
        costUsd: event.costUsd ?? null,
        inputTokens: event.inputTokens ?? null,
        outputTokens: event.outputTokens ?? null,
      },
    }
  }
  if (event.kind === 'thinking') {
    return {
      data: { text: event.text },
      invocationId,
      phase: 'thinking',
      type: 'invocation.progress',
    }
  }
  if (event.kind === 'log') {
    return {
      data: { chunk: event.chunk },
      invocationId,
      stream: event.stream,
      type: 'invocation.progress',
    }
  }
  if (event.kind === 'raw') {
    return {
      data: { line: event.line },
      invocationId,
      stream: 'raw',
      type: 'invocation.progress',
    }
  }
  return {
    detail: event.detail,
    invocationId,
    label: event.label,
    type: 'invocation.progress',
  }
}

function localExecutorResultFromBridgeResult(result: Record<string, unknown>): LocalExecutorResult {
  const externalSessionRef = readRecord(result.externalSessionRef)
  const processHandle = readRecord(result.processHandle)
  const metadata = {
    ...readRecord(result.metadata),
    ...(Object.keys(externalSessionRef).length > 0 ? { externalSessionRef } : {}),
    ...(Object.keys(processHandle).length > 0 ? { processHandle } : {}),
  }
  return {
    eventLogRef: readNullableString(result.eventLogRef),
    externalSessionRef: encodeExternalSessionRef(result.externalSessionRef),
    metadata,
    projectionReceiptId: readNullableString(result.projectionReceiptId),
    rawLogRef: readNullableString(result.rawLogRef),
    summary: readString(result.summary, 'Engine bridge invocation completed.'),
  }
}

function encodeExternalSessionRef(value: unknown): string | null {
  const ref = readRecord(value)
  if (Object.keys(ref).length === 0)
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  return JSON.stringify(ref)
}

function engineInvocationReferenceFields(result: LocalExecutorResult): {
  eventLogRef?: string | null
  externalSessionRef?: string | null
  projectionReceiptId?: string | null
  rawLogRef?: string | null
} {
  const fields: {
    eventLogRef?: string | null
    externalSessionRef?: string | null
    projectionReceiptId?: string | null
    rawLogRef?: string | null
  } = {}
  if (result.eventLogRef !== undefined)
    fields.eventLogRef = result.eventLogRef
  if (result.externalSessionRef !== undefined)
    fields.externalSessionRef = result.externalSessionRef
  if (result.projectionReceiptId !== undefined)
    fields.projectionReceiptId = result.projectionReceiptId
  if (result.rawLogRef !== undefined)
    fields.rawLogRef = result.rawLogRef
  return fields
}

function explicitMentionLines(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  const lines = value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return []
    const record = item as Record<string, unknown>
    const id = readString(record.id, '')
    const kind = readString(record.kind, '')
    return id && kind ? [`- ${kind}: ${id}`] : []
  })
  return lines.length > 0 ? ['Explicit skill mentions:', ...lines] : []
}

function engineFailureCode(error: unknown): EngineBridgeFailureCode | 'ENGINE_PROCESS_EXITED' | null {
  if (isLocalExecutorFailureLike(error))
    return 'ENGINE_PROCESS_EXITED'
  return readEngineBridgeFailureCode(error)
}

function engineFailureProcessState(error: unknown): 'exited' | 'not_spawned' | undefined {
  if (isLocalExecutorFailureLike(error))
    return 'exited'
  const failureCode = readEngineBridgeFailureCode(error)
  if (failureCode === 'ENGINE_PROCESS_EXITED')
    return 'exited'
  if (failureCode === 'PROJECTION_RECEIPT_MISSING'
    || failureCode === 'PROJECTION_RECEIPT_STALE'
    || failureCode === 'ENGINE_NOT_CALLABLE'
    || failureCode === 'ENGINE_NOT_INSTALLED'
    || failureCode === 'ENGINE_SESSION_REF_MISSING'
    || failureCode === 'WORKSPACE_LOCATOR_MISSING'
    || failureCode === 'WORKSPACE_ROOT_MISSING') {
    return 'not_spawned'
  }
  return undefined
}

function isLocalExecutorFailureLike(error: unknown): error is { partialResult?: LocalExecutorResult } {
  return error instanceof LocalExecutorFailure
    || (error instanceof Error && error.name === 'LocalExecutorFailure')
}

function readEngineBridgeFailureCode(error: unknown): EngineBridgeFailureCode | null {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    if ((ENGINE_BRIDGE_FAILURE_CODES as readonly string[]).includes(error.code))
      return error.code as EngineBridgeFailureCode
  }
  return null
}

function localEngineBridgeFailure(code: EngineBridgeFailureCode, message: string): Error & { code: EngineBridgeFailureCode } {
  return Object.assign(new Error(message), { code })
}

function isNoEntryError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isInvalidProjectionReceiptError(error: unknown): boolean {
  return error instanceof SyntaxError
    || (error instanceof Error && error.name === 'ZodError')
}
