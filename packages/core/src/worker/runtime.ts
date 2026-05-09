import type {
  ArtifactRow,
  BriefRow,
  FileRow,
  LessonRow,
  ReviewRow,
  RunEventRow,
  RunRow,
  WorkspaceRow,
} from '@zonease/aiworker-storage-sqlite/worker'
import type { LocalExecutor, LocalExecutorResult } from './executor'

import { randomUUID } from 'node:crypto'
import {
  appendRunEvent,
  createBrief,
  createLesson,
  createReview,
  createRun,
  getBrief,
  getWorkspace,
  listArtifacts,
  listBriefs,
  listFiles,
  listLessons,
  listReviews,
  listRunEvents,
  listRuns,
  nextRunEventSeq,
  registerArtifact,
  updateBrief,
  updateRun,
  upsertFile,
  upsertWorkspace,
} from '@zonease/aiworker-storage-sqlite/worker'
import { LocalWorkerEventBus } from './events'
import { createNoopExecutor } from './executor'
import { LocalWorkspaceFiles } from './files'

export interface LocalWorkerRuntimeOptions {
  workerId: string
  workspace: {
    id: string
    name: string
    rootPath: string
  }
  executor?: LocalExecutor
  now?: () => string
}

export interface CreateLocalBriefInput {
  title: string
  body: string
}

export interface LocalRunStartInput {
  briefId?: string
  prompt?: string
  executor?: string
  metadata?: Record<string, unknown>
}

export interface LocalRunStartResult {
  run: RunRow
  events: RunEventRow[]
  files: FileRow[]
  artifacts: ArtifactRow[]
  review: ReviewRow | null
  lessons: LessonRow[]
}

export interface LocalWorkspaceSnapshot {
  workspace: WorkspaceRow
  briefs: BriefRow[]
  runs: RunRow[]
  files: FileRow[]
  artifacts: ArtifactRow[]
  reviews: ReviewRow[]
  lessons: LessonRow[]
}

export class LocalWorkerRuntime {
  readonly #workerId: string
  readonly #workspaceInput: LocalWorkerRuntimeOptions['workspace']
  readonly #executor: LocalExecutor
  readonly #now: () => string
  readonly files: LocalWorkspaceFiles
  readonly bus = new LocalWorkerEventBus()

  constructor(options: LocalWorkerRuntimeOptions) {
    this.#workerId = options.workerId
    this.#workspaceInput = options.workspace
    this.#executor = options.executor ?? createNoopExecutor()
    this.#now = options.now ?? (() => new Date().toISOString())
    this.files = new LocalWorkspaceFiles(options.workspace.rootPath)
  }

  get workerId(): string {
    return this.#workerId
  }

  async init(): Promise<WorkspaceRow> {
    await this.files.ensureRoot()
    return upsertWorkspace({
      id: this.#workspaceInput.id,
      name: this.#workspaceInput.name,
      rootPath: this.files.root,
      at: this.#now(),
    })
  }

  createBrief(input: CreateLocalBriefInput): BriefRow {
    const workspace = this.requireWorkspace()
    return createBrief({
      id: randomUUID(),
      workspaceId: workspace.id,
      title: input.title,
      body: input.body,
      status: 'queued',
      at: this.#now(),
    })
  }

  async startRun(input: LocalRunStartInput = {}): Promise<LocalRunStartResult> {
    const workspace = this.requireWorkspace()
    const brief = input.briefId ? this.requireBrief(input.briefId) : null
    const prompt = input.prompt ?? brief?.body
    if (!prompt)
      throw new Error('Run requires a prompt or a brief id.')

    const run = createRun({
      id: randomUUID(),
      workspaceId: workspace.id,
      briefId: brief?.id ?? null,
      executor: input.executor ?? 'local',
      prompt,
      status: 'running',
      metadataJson: input.metadata ?? {},
      startedAt: this.#now(),
      at: this.#now(),
    })
    if (brief)
      updateBrief({ id: brief.id, status: 'running', at: this.#now() })
    this.appendEvent(run.id, 'status', { status: 'running' })

    try {
      const result = await this.#executor.run({
        workspaceId: workspace.id,
        workspaceRoot: this.files.root,
        runId: run.id,
        prompt,
        metadata: input.metadata,
      })
      const output = await this.captureResult(workspace.id, run.id, result)
      const finished = updateRun({
        id: run.id,
        status: 'succeeded',
        summary: result.summary,
        metadataJson: result.metadata ?? run.metadataJson,
        finishedAt: this.#now(),
        at: this.#now(),
      })
      if (brief)
        updateBrief({ id: brief.id, status: 'completed', at: this.#now() })
      this.appendEvent(run.id, 'status', { status: 'succeeded' })
      this.bus.emit({ kind: 'run', workspaceId: workspace.id, runId: run.id, payload: { status: 'succeeded' }, at: this.#now() })
      return {
        run: finished,
        events: listRunEvents(run.id),
        ...output,
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed = updateRun({
        id: run.id,
        status: 'failed',
        error: message,
        finishedAt: this.#now(),
        at: this.#now(),
      })
      if (brief)
        updateBrief({ id: brief.id, status: 'failed', at: this.#now() })
      this.appendEvent(run.id, 'error', { message })
      this.bus.emit({ kind: 'run', workspaceId: workspace.id, runId: run.id, payload: { status: 'failed' }, at: this.#now() })
      return {
        run: failed,
        events: listRunEvents(run.id),
        files: [],
        artifacts: [],
        review: null,
        lessons: [],
      }
    }
  }

  snapshot(): LocalWorkspaceSnapshot {
    const workspace = this.requireWorkspace()
    return {
      workspace,
      briefs: listBriefs(workspace.id),
      runs: listRuns(workspace.id),
      files: listFiles(workspace.id),
      artifacts: listArtifacts(workspace.id),
      reviews: listReviews(workspace.id),
      lessons: listLessons(workspace.id),
    }
  }

  dispose(): void {
    return undefined
  }

  private async captureResult(workspaceId: string, runId: string, result: LocalExecutorResult): Promise<Omit<LocalRunStartResult, 'run' | 'events'>> {
    const files: FileRow[] = []
    const artifacts: ArtifactRow[] = []
    for (const artifact of result.artifacts ?? []) {
      const entry = await this.files.write({ path: artifact.path, content: artifact.content })
      const file = upsertFile({
        id: randomUUID(),
        workspaceId,
        path: entry.path,
        kind: 'generated',
        size: entry.size,
        mtime: entry.mtime,
        hash: entry.hash,
        source: 'run',
        at: this.#now(),
      })
      files.push(file)
      const row = registerArtifact({
        id: randomUUID(),
        workspaceId,
        runId,
        path: artifact.path,
        kind: artifact.kind ?? 'file',
        title: artifact.title ?? artifact.path,
        metadataJson: { fileId: file.id },
        at: this.#now(),
      })
      artifacts.push(row)
      this.appendEvent(runId, 'artifact', { artifactId: row.id, path: row.path })
      this.bus.emit({ kind: 'artifact', workspaceId, runId, payload: { artifactId: row.id }, at: this.#now() })
    }

    const review = result.review
      ? createReview({
          id: randomUUID(),
          workspaceId,
          runId,
          artifactId: artifacts[0]?.id ?? null,
          verdict: result.review.verdict ?? 'needs_review',
          findingsJson: result.review.findings ?? [],
          risksJson: result.review.risks ?? [],
          at: this.#now(),
        })
      : null
    if (review) {
      this.appendEvent(runId, 'review', { reviewId: review.id, verdict: review.verdict })
      this.bus.emit({ kind: 'review', workspaceId, runId, payload: { reviewId: review.id }, at: this.#now() })
    }

    const lessons = (result.lessons ?? []).map(lesson => createLesson({
      id: randomUUID(),
      workspaceId,
      sourceReviewId: review?.id ?? null,
      statement: lesson.statement,
      evidenceJson: lesson.evidence ?? [],
      at: this.#now(),
    }))
    for (const lesson of lessons) {
      this.appendEvent(runId, 'lesson', { lessonId: lesson.id })
      this.bus.emit({ kind: 'lesson', workspaceId, runId, payload: { lessonId: lesson.id }, at: this.#now() })
    }

    return { files, artifacts, review, lessons }
  }

  private appendEvent(runId: string, type: RunEventRow['type'], payloadJson: Record<string, unknown>): RunEventRow {
    return appendRunEvent({
      runId,
      seq: nextRunEventSeq(runId),
      type,
      payloadJson,
      at: this.#now(),
    })
  }

  private requireWorkspace(): WorkspaceRow {
    const workspace = getWorkspace(this.#workspaceInput.id)
    if (!workspace)
      throw new Error('Local workspace is not initialized.')
    return workspace
  }

  private requireBrief(id: string): BriefRow {
    const brief = getBrief(id)
    if (!brief)
      throw new Error(`Brief not found: ${id}`)
    return brief
  }
}

export function createLocalWorkerRuntime(options: LocalWorkerRuntimeOptions): LocalWorkerRuntime {
  return new LocalWorkerRuntime(options)
}
