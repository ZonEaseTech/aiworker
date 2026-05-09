import type { ProcessManager } from '../orchestrator/process-manager'
import type { Orchestrator } from '../orchestrator/service'

import { AppError } from '@zonease/aiworker-shared'
import { agentTasks, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { desc, eq } from 'drizzle-orm'

type AgentTaskRow = typeof agentTasks.$inferSelect

export type WorkerRunStatus = AgentTaskRow['status']

export interface WorkerRun {
  id: string
  prompt: string
  status: WorkerRunStatus
  conversationId: string | null
  createdAt: string
  finishedAt: string | null
  result: Record<string, unknown> | null
  error: string | null
}

export interface CreateWorkerRunInput {
  prompt: string
  conversationId?: string
}

export interface ListWorkerRunsOptions {
  limit?: number
}

export interface WorkerRunServiceDeps {
  orchestrator: Pick<Orchestrator, 'continueConversation' | 'submitTask'>
  processes: Pick<ProcessManager, 'cancelGroup'>
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500
const TERMINAL_STATUSES = new Set<WorkerRunStatus>(['succeeded', 'failed', 'cancelled'])

export class WorkerRunService {
  constructor(private readonly deps: WorkerRunServiceDeps) {}

  listRuns(options: ListWorkerRunsOptions = {}): WorkerRun[] {
    const limit = normalizeLimit(options.limit)
    return getWorkerDb()
      .select()
      .from(agentTasks)
      .orderBy(desc(agentTasks.createdAt))
      .limit(limit)
      .all()
      .map(rowToRun)
  }

  getRun(id: string): WorkerRun | null {
    const row = getWorkerDb().select().from(agentTasks).where(eq(agentTasks.id, id)).get()
    return row === undefined ? null : rowToRun(row)
  }

  async createRun(input: CreateWorkerRunInput): Promise<WorkerRun> {
    const prompt = input.prompt.trim()
    if (prompt.length === 0)
      throw AppError.badRequest('prompt is required', 'invalid-run-body')

    const submitted = input.conversationId === undefined
      ? await this.deps.orchestrator.submitTask(prompt)
      : await this.deps.orchestrator.continueConversation(input.conversationId, prompt)
    return this.requireRun(submitted.id)
  }

  async cancelRun(id: string): Promise<WorkerRun> {
    const run = this.requireRun(id)
    if (TERMINAL_STATUSES.has(run.status))
      return run
    if (!run.conversationId) {
      throw AppError.badRequest(
        'run has not been bound to a conversation yet',
        'run-not-cancellable',
      )
    }
    await this.deps.processes.cancelGroup(run.conversationId)
    return this.requireRun(id)
  }

  private requireRun(id: string): WorkerRun {
    const run = this.getRun(id)
    if (run === null)
      throw AppError.notFound('run not found', 'not-found')
    return run
  }
}

export function rowToRun(row: AgentTaskRow): WorkerRun {
  return {
    id: row.id,
    prompt: row.prompt,
    status: row.status,
    conversationId: row.conversationId ?? null,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt ?? null,
    result: row.result ?? null,
    error: row.error ?? null,
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined)
    return DEFAULT_LIMIT
  if (!Number.isFinite(limit))
    return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
}
