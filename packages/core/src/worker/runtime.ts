import type {
  ArtifactRow,
  EngineInvocationRow,
  FileRow,
  LessonRow,
  ReviewRow,
  SessionEventRow,
  SessionRow,
  TurnRow,
  WorkerRow,
  WorkspaceRow,
} from '@zonease/aiworker-storage-sqlite/worker'
import type { LocalExecutor, LocalExecutorResult } from './executor'

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  appendSessionEvent,
  createEngineInvocation,
  createLesson,
  createReview,
  createSession,
  createTurn,
  createWorkspace,
  getSession,
  getWorker,
  getWorkspace,
  listArtifacts,
  listEngineInvocations,
  listFiles,
  listLessons,
  listReviews,
  listSessionEvents,
  listSessions,
  listTurns,
  listWorkspaces,
  nextEngineInvocationSeq,
  nextSessionEventSeq,
  nextTurnSeq,
  registerArtifact,
  updateEngineInvocation,
  updateSession,
  updateTurn,
  upsertFile,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { LocalWorkerEventBus } from './events'
import { createExternalEngineExecutor } from './executor'
import { LocalWorkspaceFiles } from './files'

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
  artifacts: ArtifactRow[]
  review: ReviewRow | null
  lessons: LessonRow[]
}

export interface LocalWorkerSnapshot {
  worker: WorkerRow
  workspaces: WorkspaceRow[]
  sessions: SessionRow[]
  turns: TurnRow[]
  invocations: EngineInvocationRow[]
  files: FileRow[]
  artifacts: ArtifactRow[]
  reviews: ReviewRow[]
  lessons: LessonRow[]
  events: SessionEventRow[]
}

export class LocalWorkerRuntime {
  readonly #workerInput: LocalWorkerRuntimeOptions['worker']
  readonly #workspacesRoot: string
  readonly #executor: LocalExecutor
  readonly #now: () => string
  readonly bus = new LocalWorkerEventBus()

  constructor(options: LocalWorkerRuntimeOptions) {
    this.#workerInput = options.worker
    this.#workspacesRoot = path.resolve(options.workspacesRoot)
    this.#executor = options.executor ?? createExternalEngineExecutor()
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
    return upsertWorker({
      id: this.#workerInput.id,
      soulId: this.#workerInput.soulId,
      name: this.#workerInput.name,
      defaultEngineId: this.#workerInput.defaultEngineId ?? null,
      metadataJson: this.#workerInput.metadata ?? {},
      at: this.#now(),
    })
  }

  async createWorkspace(input: CreateLocalWorkspaceInput): Promise<WorkspaceRow> {
    this.requireWorker()
    const id = randomUUID()
    const rootPath = path.join(this.#workspacesRoot, id)
    const files = new LocalWorkspaceFiles(rootPath)
    await files.ensureRoot()
    await mkdir(files.resolve('evidence'), { recursive: true })
    await mkdir(files.resolve('artifacts'), { recursive: true })
    await mkdir(files.resolve(path.posix.join('.aiworker', 'sessions')), { recursive: true })
    return createWorkspace({
      id,
      workerId: this.workerId,
      name: input.name,
      rootPath,
      type: input.type ?? 'workspace',
      sourcePointersJson: input.sourcePointers ?? [],
      metadataJson: input.metadata ?? {},
      at: this.#now(),
    })
  }

  async createSession(input: CreateLocalSessionInput): Promise<SessionRow> {
    const workspace = this.requireWorkspace(input.workspaceId)
    const session = createSession({
      id: randomUUID(),
      workerId: this.workerId,
      workspaceId: workspace.id,
      capabilityTemplateId: input.capabilityTemplateId,
      title: input.title,
      context: input.context ?? '',
      status: 'active',
      metadataJson: input.metadata ?? {},
      startedAt: this.#now(),
      at: this.#now(),
    })
    await this.materializeSessionContext(workspace, session, input.metadata ?? {})
    this.appendEvent(session.id, 'status', { status: 'active' })
    this.bus.emit({ kind: 'session', workspaceId: workspace.id, sessionId: session.id, payload: { status: 'active' }, at: this.#now() })
    return session
  }

  async startTurn(input: StartLocalTurnInput): Promise<LocalTurnStartResult> {
    const session = this.requireSession(input.sessionId)
    const workspace = this.requireWorkspace(session.workspaceId)
    const seq = nextTurnSeq(session.id)
    const turn = createTurn({
      id: randomUUID(),
      sessionId: session.id,
      seq,
      input: input.input,
      status: 'running',
      metadataJson: input.metadata ?? {},
      at: this.#now(),
    })
    const prompt = this.buildInvocationPrompt(session, turn, input.metadata ?? {})
    const invocation = createEngineInvocation({
      id: randomUUID(),
      sessionId: session.id,
      turnId: turn.id,
      seq: nextEngineInvocationSeq(session.id),
      engineId: input.engineId,
      engineCommand: input.engineCommand ?? null,
      prompt,
      status: 'running',
      metadataJson: input.metadata ?? {},
      startedAt: this.#now(),
      at: this.#now(),
    })
    this.appendEvent(session.id, 'status', { status: 'running', turnId: turn.id }, turn.id, invocation.id)
    this.bus.emit({ kind: 'turn', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { status: 'running' }, at: this.#now() })

    try {
      const invocationRoot = await this.ensureInvocationRoot(workspace, session, invocation)
      const result = await this.#executor.invoke({
        engineCommand: input.engineCommand ?? null,
        engineId: input.engineId,
        invocationId: invocation.id,
        invocationRoot,
        prompt,
        sessionId: session.id,
        turnId: turn.id,
        workspaceId: workspace.id,
        workspaceRoot: workspace.rootPath,
        metadata: {
          ...(session.metadataJson ?? {}),
          ...(input.metadata ?? {}),
          capabilityTemplateId: session.capabilityTemplateId,
          sessionId: session.id,
          turnId: turn.id,
          workerId: this.workerId,
          workspaceId: workspace.id,
        },
      })
      const output = await this.captureResult(workspace, session, turn, invocation, result, input.metadata ?? {})
      const finishedInvocation = updateEngineInvocation({
        id: invocation.id,
        status: 'succeeded',
        summary: result.summary,
        metadataJson: { ...(input.metadata ?? {}), ...(result.metadata ?? {}) },
        finishedAt: this.#now(),
        at: this.#now(),
      })
      const finishedTurn = updateTurn({
        id: turn.id,
        status: 'succeeded',
        response: result.summary,
        at: this.#now(),
      })
      const currentSession = updateSession({ id: session.id, status: 'active', at: this.#now() })
      this.appendEvent(session.id, 'status', { status: 'succeeded', turnId: turn.id }, turn.id, invocation.id)
      this.bus.emit({ kind: 'turn', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { status: 'succeeded' }, at: this.#now() })
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
      const failedInvocation = updateEngineInvocation({
        id: invocation.id,
        status: 'failed',
        error: message,
        finishedAt: this.#now(),
        at: this.#now(),
      })
      const failedTurn = updateTurn({
        id: turn.id,
        status: 'failed',
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
      this.bus.emit({ kind: 'turn', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { status: 'failed' }, at: this.#now() })
      return {
        session: failedSession,
        turn: failedTurn,
        invocation: failedInvocation,
        events: listSessionEvents(session.id),
        files: [],
        artifacts: [],
        review: null,
        lessons: [],
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
      artifacts: listArtifacts().filter(artifact => workspaceIds.has(artifact.workspaceId)),
      reviews: listReviews().filter(review => workspaceIds.has(review.workspaceId)),
      lessons: listLessons().filter(lesson => workspaceIds.has(lesson.workspaceId)),
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
    workspace: WorkspaceRow,
    session: SessionRow,
    turn: TurnRow,
    invocation: EngineInvocationRow,
    result: LocalExecutorResult,
    metadata: Record<string, unknown>,
  ): Promise<Omit<LocalTurnStartResult, 'events' | 'invocation' | 'session' | 'turn'>> {
    const filesApi = new LocalWorkspaceFiles(workspace.rootPath)
    const files: FileRow[] = []
    const artifacts: ArtifactRow[] = []
    for (const artifact of result.artifacts ?? []) {
      const entry = await filesApi.write({ path: artifact.path, content: artifact.content })
      const file = upsertFile({
        id: randomUUID(),
        workspaceId: workspace.id,
        path: entry.path,
        kind: 'generated',
        size: entry.size,
        mtime: entry.mtime,
        hash: entry.hash,
        source: 'session',
        at: this.#now(),
      })
      files.push(file)
      const row = registerArtifact({
        id: randomUUID(),
        workspaceId: workspace.id,
        sessionId: session.id,
        turnId: turn.id,
        invocationId: invocation.id,
        path: artifact.path,
        kind: artifact.kind ?? 'file',
        title: artifact.title ?? artifact.path,
        metadataJson: {
          capabilityTemplateId: session.capabilityTemplateId,
          fileId: file.id,
          outputKind: artifact.kind ?? metadata.outputKind,
          workerId: this.workerId,
        },
        at: this.#now(),
      })
      artifacts.push(row)
      this.appendEvent(session.id, 'artifact', { artifactId: row.id, path: row.path }, turn.id, invocation.id)
      this.bus.emit({ kind: 'artifact', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { artifactId: row.id }, at: this.#now() })
    }

    const review = result.review
      ? createReview({
          id: randomUUID(),
          workspaceId: workspace.id,
          sessionId: session.id,
          turnId: turn.id,
          artifactId: artifacts[0]?.id ?? null,
          verdict: result.review.verdict ?? 'needs_review',
          findingsJson: result.review.findings ?? [],
          risksJson: result.review.risks ?? [],
          at: this.#now(),
        })
      : null
    if (review) {
      this.appendEvent(session.id, 'review', { reviewId: review.id, verdict: review.verdict }, turn.id, invocation.id)
      this.bus.emit({ kind: 'review', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { reviewId: review.id }, at: this.#now() })
    }

    const lessons = (result.lessons ?? []).map(lesson => createLesson({
      id: randomUUID(),
      workspaceId: workspace.id,
      sourceReviewId: review?.id ?? null,
      statement: lesson.statement,
      evidenceJson: lesson.evidence ?? [],
      at: this.#now(),
    }))
    for (const lesson of lessons) {
      this.appendEvent(session.id, 'lesson', { lessonId: lesson.id }, turn.id, invocation.id)
      this.bus.emit({ kind: 'lesson', workspaceId: workspace.id, sessionId: session.id, turnId: turn.id, invocationId: invocation.id, payload: { lessonId: lesson.id }, at: this.#now() })
    }

    return { files, artifacts, review, lessons }
  }

  private appendEvent(sessionId: string, type: SessionEventRow['type'], payloadJson: Record<string, unknown>, turnId?: string | null, invocationId?: string | null): SessionEventRow {
    return appendSessionEvent({
      sessionId,
      turnId: turnId ?? null,
      invocationId: invocationId ?? null,
      seq: nextSessionEventSeq(sessionId),
      type,
      payloadJson,
      at: this.#now(),
    })
  }

  private buildInvocationPrompt(session: SessionRow, turn: TurnRow, metadata: Record<string, unknown>): string {
    const lines = [
      `Soul worker: ${this.#workerInput.name}`,
      `Soul id: ${this.#workerInput.soulId}`,
      `Workspace session: ${session.title}`,
      `Capability template: ${session.capabilityTemplateId}`,
      `Output kind: ${readString(metadata.outputKind, 'business-artifact')}`,
      '',
      'Session context:',
      session.context || '(no prior context)',
      '',
      'Turn request:',
      turn.input.trim(),
    ]
    const hints = Array.isArray(metadata.inputHints) ? metadata.inputHints : []
    const rubric = Array.isArray(metadata.reviewRubric) ? metadata.reviewRubric : []
    if (hints.length > 0)
      lines.push('', 'Input hints:', ...hints.map(item => `- ${String(item)}`))
    if (rubric.length > 0)
      lines.push('', 'Review rubric:', ...rubric.map(item => `- ${String(item)}`))
    return lines.join('\n')
  }

  private async materializeSessionContext(workspace: WorkspaceRow, session: SessionRow, metadata: Record<string, unknown>): Promise<void> {
    const files = new LocalWorkspaceFiles(workspace.rootPath)
    const sessionRoot = path.posix.join('.aiworker', 'sessions', session.id)
    await mkdir(files.resolve(path.posix.join(sessionRoot, 'context', 'capability')), { recursive: true })
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'active-context.md')), this.buildActiveContext(session, metadata), 'utf8')
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'capability', 'SKILL.md')), this.buildCapabilitySkill(session, metadata), 'utf8')
    await mkdir(files.resolve(path.posix.join(sessionRoot, 'invocations')), { recursive: true })
  }

  private buildActiveContext(session: SessionRow, metadata: Record<string, unknown>): string {
    return [
      `# ${session.title}`,
      '',
      `- Worker: ${this.#workerInput.name}`,
      `- Soul: ${this.#workerInput.soulId}`,
      `- Capability template: ${session.capabilityTemplateId}`,
      `- Output kind: ${readString(metadata.outputKind, 'business-artifact')}`,
      '',
      '## Context',
      session.context || 'No context supplied.',
    ].join('\n')
  }

  private buildCapabilitySkill(session: SessionRow, metadata: Record<string, unknown>): string {
    const name = readString(metadata.skillName, session.capabilityTemplateId)
    const rubric = Array.isArray(metadata.reviewRubric) ? metadata.reviewRubric.map(String) : []
    return [
      `# ${name}`,
      '',
      'Use this capability in the current AIWorker session only.',
      '',
      '## Review Rubric',
      ...(rubric.length > 0 ? rubric.map(item => `- ${item}`) : ['- Separate facts, assumptions, risks, and next actions.']),
    ].join('\n')
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
}

export function createLocalWorkerRuntime(options: LocalWorkerRuntimeOptions): LocalWorkerRuntime {
  return new LocalWorkerRuntime(options)
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}
