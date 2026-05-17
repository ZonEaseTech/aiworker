import type { SoulAppProjectionReceipt } from '@zonease/aiworker-shared'
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
import type { EngineAssetSource } from './engine-assets'
import type { LocalExecutor, LocalExecutorEvent, LocalExecutorResult } from './executor'
import type { GitOperationResult, ProfileWorkspaceBootstrapResult } from './profile-ledger'

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
  getArtifact,
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
import { engineAssetProjectionReceiptPath, projectEngineAssetsToWorkspace, resolveSoulAppEngineTarget } from './engine-assets'
import { LocalWorkerEventBus } from './events'
import { createExternalEngineExecutor, LocalExecutorFailure } from './executor'
import { LocalWorkspaceFiles } from './files'
import { bootstrapProfileWorkspace, promoteProfileRevision as promoteProfileRevisionFiles } from './profile-ledger'

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

export interface PromoteProfileRevisionInput {
  artifactId: string
  findingsJson?: Record<string, unknown>[]
  profileMarkdown?: string
  risksJson?: Record<string, unknown>[]
  tagName?: string | null
  verdict?: ReviewRow['verdict']
  workspaceId: string
}

export interface ProfileRevisionPromotionResult {
  git: GitOperationResult
  profilePath: string
  review: ReviewRow
  reviewPath: string
  tag: GitOperationResult | null
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
        profileLedger: {
          git: layout.profile.git,
          profilePath: layout.profile.profilePath,
        },
      },
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
    const metadata = {
      ...(session.metadataJson ?? {}),
      ...(input.metadata ?? {}),
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
      engineId: input.engineId,
      engineCommand: input.engineCommand ?? null,
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
        engineCommand: input.engineCommand ?? null,
        engineId: input.engineId,
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
      const currentSession = updateSession({ id: session.id, status: 'active', at: this.#now() })
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
        : { artifacts: [], files: [], lessons: [], review: null }
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

  async promoteProfileRevision(input: PromoteProfileRevisionInput): Promise<ProfileRevisionPromotionResult> {
    const workspace = this.requireWorkspace(input.workspaceId)
    const artifact = getArtifact(input.artifactId)
    if (!artifact || artifact.workspaceId !== workspace.id)
      throw new Error(`Artifact not found for workspace ${workspace.id}: ${input.artifactId}`)

    const verdict = input.verdict ?? 'pass'
    const reviewId = randomUUID()
    const files = new LocalWorkspaceFiles(workspace.rootPath)
    const artifactContent = await files.read(artifact.path)
    const at = this.#now()
    const promotion = await promoteProfileRevisionFiles({
      artifactPath: artifact.path,
      artifactTitle: artifact.title,
      findingsJson: input.findingsJson ?? [{ message: 'Profile revision approved.' }],
      now: at,
      profileMarkdown: input.profileMarkdown ?? artifactContent,
      reviewId,
      risksJson: input.risksJson ?? [],
      tagName: input.tagName,
      verdict,
      workspaceName: workspace.name,
      workspaceRoot: workspace.rootPath,
    })
    const review = createReview({
      id: reviewId,
      workspaceId: workspace.id,
      sessionId: artifact.sessionId,
      turnId: artifact.turnId,
      artifactId: artifact.id,
      verdict,
      findingsJson: input.findingsJson ?? [{ message: 'Profile revision approved.' }],
      risksJson: input.risksJson ?? [],
      at,
    })
    if (review.sessionId) {
      this.appendEvent(review.sessionId, 'review', { reviewId: review.id, verdict: review.verdict, profilePath: promotion.profilePath }, review.turnId, null)
      this.bus.emit({ kind: 'review', workspaceId: workspace.id, sessionId: review.sessionId, turnId: review.turnId ?? undefined, payload: { reviewId: review.id, profilePath: promotion.profilePath }, at: this.#now() })
    }
    return {
      ...promotion,
      review,
    }
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
          ...(typeof metadata.soulAppId === 'string' ? { soulAppId: metadata.soulAppId } : {}),
          ...(artifact.metadata ?? {}),
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
    const lines = [
      `Soul worker: ${this.#workerInput.name}`,
      `Soul id: ${this.#workerInput.soulId}`,
      `Workspace session: ${session.title}`,
      `Capability template: ${session.capabilityTemplateId}`,
      `Output kind: ${readString(metadata.outputKind, 'business-artifact')}`,
      '',
      'Workspace profile ledger:',
      '- README.md is the accepted profile for this workspace.',
      `- Proposed changes should be written under artifacts/${session.id}/ before review.`,
      '- Human review records live under reviews/.',
      '- Native skills may be projected under .agents/skills and .claude/skills when the Soul App provides them.',
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
    const capabilityPrompt = capabilityAsset(metadata.capabilityPrompt)
    const capabilityReviewRubric = capabilityAsset(metadata.capabilityReviewRubric)
    if (capabilityPrompt)
      lines.push('', `Capability prompt source ref: ${capabilityPrompt.ref}`, 'Use the embedded content below; the source ref is not expected to exist in this workspace.', capabilityPrompt.content)
    if (capabilityReviewRubric)
      lines.push('', `Capability review rubric source ref: ${capabilityReviewRubric.ref}`, 'Use the embedded content below; the source ref is not expected to exist in this workspace.', capabilityReviewRubric.content)
    return lines.join('\n')
  }

  private async materializeSessionContext(workspace: WorkspaceRow, session: SessionRow, metadata: Record<string, unknown>): Promise<void> {
    const files = new LocalWorkspaceFiles(workspace.rootPath)
    const sessionRoot = path.posix.join('.aiworker', 'sessions', session.id)
    await mkdir(files.resolve(path.posix.join(sessionRoot, 'context', 'capability')), { recursive: true })
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'active-context.md')), this.buildActiveContext(session, metadata), 'utf8')
    await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'capability', 'SKILL.md')), this.buildCapabilitySkill(session, metadata), 'utf8')
    const capabilityPrompt = capabilityAsset(metadata.capabilityPrompt)
    const capabilityReviewRubric = capabilityAsset(metadata.capabilityReviewRubric)
    if (capabilityPrompt)
      await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'capability', 'prompt.md')), capabilityPrompt.content, 'utf8')
    if (capabilityReviewRubric)
      await writeFile(files.resolve(path.posix.join(sessionRoot, 'context', 'capability', 'review.md')), capabilityReviewRubric.content, 'utf8')
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
      `- Accepted profile: README.md`,
      `- Proposed change directory: artifacts/${session.id}/`,
      '- Native skill projections: .agents/skills and .claude/skills when available',
      '',
      '## Context',
      session.context || 'No context supplied.',
    ].join('\n')
  }

  private buildCapabilitySkill(session: SessionRow, metadata: Record<string, unknown>): string {
    const name = readString(metadata.skillName, session.capabilityTemplateId)
    const rubric = Array.isArray(metadata.reviewRubric) ? metadata.reviewRubric.map(String) : []
    const capabilityPrompt = capabilityAsset(metadata.capabilityPrompt)
    const capabilityReviewRubric = capabilityAsset(metadata.capabilityReviewRubric)
    return [
      `# ${name}`,
      '',
      'Use this capability in the current AIWorker session only.',
      ...(capabilityPrompt ? ['', '## Capability Prompt', `Source ref: ${capabilityPrompt.ref}`, 'Use the embedded content below; this source ref is not expected to exist in the workspace.', '', capabilityPrompt.content] : []),
      ...(capabilityReviewRubric ? ['', '## Capability Review Rubric', `Source ref: ${capabilityReviewRubric.ref}`, 'Use the embedded content below; this source ref is not expected to exist in the workspace.', '', capabilityReviewRubric.content] : []),
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

  private async repairWorkspaceLayouts(): Promise<void> {
    for (const workspace of listWorkspaces(this.workerId))
      await this.prepareWorkspaceLayout({ name: workspace.name, rootPath: workspace.rootPath })
  }

  private async prepareWorkspaceLayout(input: { name: string, rootPath: string }): Promise<{
    engineAssets: SoulAppProjectionReceipt | null
    profile: ProfileWorkspaceBootstrapResult
  }> {
    const engineAssets = this.#engineAssetSource
      ? await projectEngineAssetsToWorkspace({
          appId: this.#engineAssetSource.appId,
          engineAssets: this.#engineAssetSource.engineAssets,
          engineTarget: resolveSoulAppEngineTarget(this.#workerInput.defaultEngineId),
          now: this.#now(),
          sourceRoot: this.#engineAssetSource.sourceRoot,
          variables: {
            appId: this.#engineAssetSource.appId,
            soulId: this.#workerInput.soulId,
            workerName: this.#workerInput.name,
            workspaceName: input.name,
          },
          workspaceRoot: input.rootPath,
        })
      : null
    const profile = await bootstrapProfileWorkspace({
      name: input.name,
      now: this.#now(),
      rootPath: input.rootPath,
      seedProfileFiles: !this.#engineAssetSource,
      soulId: this.#workerInput.soulId,
      workerName: this.#workerInput.name,
    })
    return { engineAssets, profile }
  }
}

export function createLocalWorkerRuntime(options: LocalWorkerRuntimeOptions): LocalWorkerRuntime {
  return new LocalWorkerRuntime(options)
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function capabilityAsset(value: unknown): { content: string, ref: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const record = value as Record<string, unknown>
  const content = readString(record.content, '')
  const ref = readString(record.ref, '')
  return content && ref ? { content, ref } : null
}
