import type { LocalExecutionMode, SoulAppProjectionReceipt } from '@zonease/aiworker-shared'
import type {
  EngineInvocationRow,
  FileRow,
  SessionEventRow,
  SessionRow,
  TurnRow,
  WorkerRow,
  WorkspaceRow,
} from '@zonease/aiworker-storage-sqlite/worker'
import type { EngineAssetSource } from './engine-assets'
import type { LocalExecutor, LocalExecutorEvent, LocalExecutorResult } from './executor'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  appendSessionEvent,
  createEngineInvocation,
  createSession,
  createTurn,
  createWorkspace,
  getSession,
  getWorker,
  getWorkspace,
  listEngineInvocations,
  listFiles,
  listSessionEvents,
  listSessions,
  listTurns,
  listWorkerOverlayAssets,
  listWorkspaces,
  nextEngineInvocationSeq,
  nextSessionEventSeq,
  nextTurnSeq,
  updateEngineInvocation,
  updateSession,
  updateTurn,
  updateWorkspace,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { engineAssetProjectionReceiptPath, projectEngineAssetsToWorkspace, resolveSoulAppEngineTarget } from './engine-assets'
import { LocalWorkerEventBus } from './events'
import { createExternalEngineExecutor, LocalExecutorFailure } from './executor'
import { LocalWorkspaceFiles } from './files'
import {
  freezeSessionEngineMetadata,
  inferLatestInvocationEngine,
  readFrozenSessionEngine,
  resolveFrozenSessionEngine,
  type FrozenSessionEngine,
} from './session-engine'

export interface LocalWorkerRuntimeOptions {
  worker: {
    id: string
    soulId: string
    name: string
    defaultEngineId?: string | null
    metadata?: Record<string, unknown>
  }
  workspacesRoot: string
  executor?: LocalExecutor
  engineAssetSource?: EngineAssetSource | null
  now?: () => string
}

export interface CreateLocalWorkspaceInput {
  name: string
  type?: string
  sourcePointers?: Record<string, unknown>[]
  metadata?: Record<string, unknown>
}

export interface CreateLocalSessionInput {
  workspaceId: string
  capabilityTemplateId: string
  title: string
  context?: string
  metadata?: Record<string, unknown>
}

export interface StartLocalTurnInput {
  sessionId: string
  input: string
  engineId: string
  engineCommand?: string | null
  metadata?: Record<string, unknown>
}

export interface LocalTurnStartResult {
  session: SessionRow
  turn: TurnRow
  invocation: EngineInvocationRow
  events: SessionEventRow[]
  files: FileRow[]
}

export interface LocalWorkerSnapshot {
  worker: WorkerRow
  workspaces: WorkspaceRow[]
  sessions: SessionRow[]
  turns: TurnRow[]
  invocations: EngineInvocationRow[]
  files: FileRow[]
  events: SessionEventRow[]
}

export interface WorkspaceAssetProjectionResult {
  receipt: SoulAppProjectionReceipt | null
  workspace: WorkspaceRow
}

export class LocalWorkerRuntime {
  readonly #workerInput: LocalWorkerRuntimeOptions['worker']
  readonly #workspacesRoot: string
  readonly #executor: LocalExecutor
  readonly #engineAssetSource: EngineAssetSource | null
  readonly #now: () => string
  readonly bus = new LocalWorkerEventBus()

  constructor(options: LocalWorkerRuntimeOptions) {
    this.#workerInput = options.worker
    this.#workspacesRoot = path.resolve(options.workspacesRoot)
    this.#executor = options.executor ?? createExternalEngineExecutor()
    this.#engineAssetSource = options.engineAssetSource ?? null
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
      soulId: this.#workerInput.soulId,
      name: this.#workerInput.name,
      defaultEngineId: this.#workerInput.defaultEngineId ?? null,
      metadataJson: this.#workerInput.metadata ?? {},
      at: this.#now(),
    })
    await this.repairWorkspaceLayouts()
    return worker
  }

  async createWorkspace(input: CreateLocalWorkspaceInput): Promise<WorkspaceRow> {
    this.requireWorker()
    const id = randomUUID()
    const rootPath = path.join(this.#workspacesRoot, id)
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

  async reprojectWorkspaceAssets(workspaceId: string): Promise<WorkspaceAssetProjectionResult> {
    const workspace = this.requireWorkspace(workspaceId)
    const layout = await this.prepareWorkspaceLayout({
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

  async createSession(input: CreateLocalSessionInput): Promise<SessionRow> {
    const workspace = this.requireWorkspace(input.workspaceId)
    const sessionMetadata = freezeSessionEngineMetadata(input.metadata ?? {}, this.requestedSessionEngine(input.metadata ?? {}))
    const session = createSession({
      id: randomUUID(),
      workerId: this.workerId,
      workspaceId: workspace.id,
      capabilityTemplateId: input.capabilityTemplateId,
      title: input.title,
      context: input.context ?? '',
      status: 'active',
      metadataJson: sessionMetadata,
      startedAt: this.#now(),
      at: this.#now(),
    })
    await this.materializeSessionContext(workspace, session, sessionMetadata)
    this.appendEvent(session.id, 'status', { status: 'active' })
    this.bus.emit({ kind: 'session', workspaceId: workspace.id, sessionId: session.id, payload: { status: 'active' }, at: this.#now() })
    return session
  }

  async startTurn(input: StartLocalTurnInput): Promise<LocalTurnStartResult> {
    const session = this.requireSession(input.sessionId)
    const workspace = this.requireWorkspace(session.workspaceId)
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
      capabilityTemplateId: session.capabilityTemplateId,
      sessionId: session.id,
      workerId: this.workerId,
      workspaceId: workspace.id,
    }
    const seq = nextTurnSeq(session.id)
    const turn = createTurn({
      id: randomUUID(),
      sessionId: session.id,
      seq,
      input: input.input,
      status: 'running',
      metadataJson: metadata,
      at: this.#now(),
    })
    const prompt = this.buildInvocationPrompt(session, turn, metadata)
    const invocation = createEngineInvocation({
      id: randomUUID(),
      sessionId: session.id,
      turnId: turn.id,
      seq: nextEngineInvocationSeq(session.id),
      engineId: sessionEngine.engineId,
      engineCommand: sessionEngine.engineCommand,
      prompt,
      status: 'running',
      metadataJson: metadata,
      startedAt: this.#now(),
      at: this.#now(),
    })
    this.appendEvent(session.id, 'status', { status: 'running', turnId: turn.id }, turn.id, invocation.id)
    this.bus.emit({ kind: 'turn', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { status: 'running', turn }, at: this.#now() })

    try {
      const invocationRoot = await this.ensureInvocationRoot(workspace, session, invocation)
      const result = await this.#executor.invoke({
        engineCommand: sessionEngine.engineCommand,
        engineId: sessionEngine.engineId,
        invocationId: invocation.id,
        invocationRoot,
        onEvent: event => this.appendAgentEvent(session.id, event, turn.id, invocation.id),
        prompt,
        sessionId: session.id,
        turnId: turn.id,
        workspaceId: workspace.id,
        workspaceRoot: workspace.rootPath,
        metadata: {
          ...metadata,
          turnId: turn.id,
        },
      })
      const output = await this.captureResult(workspace, session, turn, invocation, result, metadata)
      const finishedInvocation = updateEngineInvocation({
        id: invocation.id,
        status: 'succeeded',
        summary: result.summary,
        metadataJson: { ...metadata, ...(result.metadata ?? {}) },
        finishedAt: this.#now(),
        at: this.#now(),
      })
      const finishedTurn = updateTurn({
        id: turn.id,
        status: 'succeeded',
        response: result.summary,
        at: this.#now(),
      })
      const finishedAt = this.#now()
      const currentSession = updateSession({
        id: session.id,
        status: 'completed',
        endedAt: finishedAt,
        at: finishedAt,
      })
      this.appendEvent(session.id, 'status', { status: 'succeeded', turnId: turn.id }, turn.id, invocation.id)
      this.bus.emit({ kind: 'turn', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { status: 'succeeded', turn: finishedTurn }, at: this.#now() })
      return {
        session: currentSession,
        turn: finishedTurn,
        invocation: finishedInvocation,
        events: listSessionEvents(session.id),
        ...output,
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const recoveredOutput = error instanceof LocalExecutorFailure && error.partialResult
        ? await this.captureResult(workspace, session, turn, invocation, error.partialResult, metadata)
        : { files: [] }
      const recoveredMetadata = error instanceof LocalExecutorFailure ? error.partialResult?.metadata ?? {} : {}
      const failedInvocation = updateEngineInvocation({
        id: invocation.id,
        status: 'failed',
        error: message,
        metadataJson: { ...metadata, ...recoveredMetadata },
        summary: error instanceof LocalExecutorFailure ? error.partialResult?.summary ?? null : null,
        finishedAt: this.#now(),
        at: this.#now(),
      })
      const failedTurn = updateTurn({
        id: turn.id,
        status: 'failed',
        response: error instanceof LocalExecutorFailure ? error.partialResult?.summary ?? null : null,
        error: message,
        at: this.#now(),
      })
      const failedSession = updateSession({
        id: session.id,
        status: 'failed',
        endedAt: this.#now(),
        at: this.#now(),
      })
      this.appendEvent(session.id, 'error', { message, turnId: turn.id }, turn.id, invocation.id)
      this.bus.emit({ kind: 'turn', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { status: 'failed', turn: failedTurn }, at: this.#now() })
      return {
        session: failedSession,
        turn: failedTurn,
        invocation: failedInvocation,
        events: listSessionEvents(session.id),
        ...recoveredOutput,
      }
    }
  }

  snapshot(): LocalWorkerSnapshot {
    const worker = this.requireWorker()
    const workspaces = listWorkspaces(worker.id)
    const workspaceIds = new Set(workspaces.map(workspace => workspace.id))
    const sessions = listSessions().filter(session => workspaceIds.has(session.workspaceId))
    const sessionIds = new Set(sessions.map(session => session.id))
    const turns = listTurns().filter(turn => sessionIds.has(turn.sessionId))
    return {
      worker,
      workspaces,
      sessions,
      turns,
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

  private async captureResult(
    _workspace: WorkspaceRow,
    _session: SessionRow,
    _turn: TurnRow,
    _invocation: EngineInvocationRow,
    _result: LocalExecutorResult,
    _metadata: Record<string, unknown>,
  ): Promise<Omit<LocalTurnStartResult, 'events' | 'invocation' | 'session' | 'turn'>> {
    return { files: [] }
  }

  private appendAgentEvent(sessionId: string, event: LocalExecutorEvent, turnId?: string | null, invocationId?: string | null): SessionEventRow {
    if (event.kind === 'text') {
      return this.appendEvent(sessionId, 'assistant_delta', { agentEvent: event, delta: event.text, text: event.text }, turnId, invocationId)
    }
    if (event.kind === 'thinking' || event.kind === 'log' || event.kind === 'raw') {
      return this.appendEvent(sessionId, 'log', { agentEvent: event }, turnId, invocationId)
    }
    if (event.kind === 'tool_use' || event.kind === 'tool_result') {
      return this.appendEvent(sessionId, 'tool', { agentEvent: event }, turnId, invocationId)
    }
    return this.appendEvent(sessionId, event.kind === 'status' || event.kind === 'usage' ? 'status' : 'log', { agentEvent: event }, turnId, invocationId)
  }

  private appendEvent(sessionId: string, type: SessionEventRow['type'], payloadJson: Record<string, unknown>, turnId?: string | null, invocationId?: string | null): SessionEventRow {
    const row = appendSessionEvent({
      sessionId,
      turnId: turnId ?? null,
      invocationId: invocationId ?? null,
      seq: nextSessionEventSeq(sessionId),
      type,
      payloadJson,
      at: this.#now(),
    })
    const session = getSession(sessionId)
    if (session) {
      this.bus.emit({
        at: row.createdAt,
        invocationId: invocationId ?? undefined,
        kind: 'event',
        payload: { event: row },
        sessionId,
        turnId: turnId ?? undefined,
        workspaceId: session.workspaceId,
      })
    }
    return row
  }

  private buildInvocationPrompt(session: SessionRow, turn: TurnRow, metadata: Record<string, unknown>): string {
    const mentions = explicitMentionLines(metadata.mentions)
    const lines = [
      `Current date: ${this.#now().slice(0, 10)}`,
      `Soul worker: ${this.#workerInput.name}`,
      `Soul id: ${this.#workerInput.soulId}`,
      `Workspace session: ${session.title}`,
      `Capability template: ${session.capabilityTemplateId}`,
      `Output kind: ${readString(metadata.outputKind, 'business-artifact')}`,
      '',
      'Session context:',
      session.context || '(no prior context)',
      '',
      ...mentions,
      ...(mentions.length > 0 ? [''] : []),
      'Turn request:',
      turn.input.trim(),
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
      soulId: this.#workerInput.soulId,
    }, null, 2), 'utf8')
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'soul-app.json')), JSON.stringify({
      soulId: this.#workerInput.soulId,
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

  private requireWorkspace(id: string): WorkspaceRow {
    const workspace = getWorkspace(id)
    if (!workspace || workspace.workerId !== this.workerId)
      throw new Error(`Workspace not found for worker ${this.workerId}: ${id}`)
    return workspace
  }

  private requireSession(id: string): SessionRow {
    const session = getSession(id)
    if (!session || session.workerId !== this.workerId)
      throw new Error(`Session not found for worker ${this.workerId}: ${id}`)
    return session
  }

  private requestedSessionEngine(metadata: Record<string, unknown>): FrozenSessionEngine {
    return {
      engineCommand: readNullableString(metadata.engineCommand),
      engineId: readString(metadata.engineId, this.#workerInput.defaultEngineId ?? 'codex'),
      executionMode: readExecutionMode(metadata.executionMode),
    }
  }

  private requestedTurnEngine(input: StartLocalTurnInput): FrozenSessionEngine {
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

  private resolveSessionEngine(session: SessionRow, input: StartLocalTurnInput) {
    const requested = this.requestedTurnEngine(input)
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

  private async prepareWorkspaceLayout(input: { name: string, preserveUnownedExistingTargets?: boolean, projectEngineAssets: boolean, projectWorkerOverlayAssets: boolean, rootPath: string }): Promise<{
    engineAssets: SoulAppProjectionReceipt | null
  }> {
    const engineAssets = this.#engineAssetSource && input.projectEngineAssets
      ? await projectEngineAssetsToWorkspace({
          appId: this.#engineAssetSource.appId,
          engineAssets: this.#engineAssetSource.engineAssets,
          engineTarget: resolveSoulAppEngineTarget(this.#workerInput.defaultEngineId),
          now: this.#now(),
          preserveUnownedExistingTargets: input.preserveUnownedExistingTargets,
          sourceRoot: this.#engineAssetSource.sourceRoot,
          variables: {
            appId: this.#engineAssetSource.appId,
            soulId: this.#workerInput.soulId,
            workerName: this.#workerInput.name,
            workspaceName: input.name,
          },
          workerOverlayAssets: input.projectWorkerOverlayAssets
            ? listWorkerOverlayAssets(this.workerId).map(asset => ({
                content: asset.content,
                enabled: asset.enabled,
                id: asset.id,
                kind: asset.kind,
                target: asset.target,
              }))
            : [],
          workspaceRoot: input.rootPath,
        })
      : null
    return { engineAssets }
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
