import type { WorkerArtifactRow } from '@zonease/aiworker-storage-sqlite/worker'

import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { AppError } from '@zonease/aiworker-shared'
import { getWorkerDb, workerArtifacts } from '@zonease/aiworker-storage-sqlite/worker'
import { and, desc, eq } from 'drizzle-orm'

export type WorkerArtifactSource = 'executor' | 'operator' | 'system'
export type WorkerArtifactStatus = 'available' | 'missing' | 'archived'

export interface WorkerArtifact {
  id: string
  runId: string | null
  conversationId: string | null
  relativePath: string
  kind: string
  title: string
  mimeType: string | null
  sizeBytes: number | null
  hash: string | null
  source: WorkerArtifactSource
  status: WorkerArtifactStatus
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface RegisterWorkerArtifactInput {
  id?: string
  runId?: string | null
  conversationId?: string | null
  relativePath: string
  kind?: string
  title?: string
  mimeType?: string | null
  sizeBytes?: number | null
  hash?: string | null
  source?: WorkerArtifactSource
  status?: WorkerArtifactStatus
  metadata?: Record<string, unknown>
  at?: string
}

export interface ListWorkerArtifactsOptions {
  runId?: string
  conversationId?: string
  status?: WorkerArtifactStatus
  limit?: number
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

export class WorkerArtifactService {
  registerArtifact(input: RegisterWorkerArtifactInput): WorkerArtifact {
    const relativePath = normalizeArtifactPath(input.relativePath)
    const now = input.at ?? new Date().toISOString()
    const id = input.id?.trim() || randomUUID()
    const existing = getWorkerDb()
      .select({ id: workerArtifacts.id })
      .from(workerArtifacts)
      .where(eq(workerArtifacts.relativePath, relativePath))
      .get()

    const values = {
      conversationId: normalizeOptionalString(input.conversationId),
      hash: normalizeOptionalString(input.hash),
      kind: normalizeKind(input.kind),
      metadata: normalizeMetadata(input.metadata),
      mimeType: normalizeOptionalString(input.mimeType),
      relativePath,
      runId: normalizeOptionalString(input.runId),
      sizeBytes: normalizeSizeBytes(input.sizeBytes),
      source: input.source ?? 'executor',
      status: input.status ?? 'available',
      title: input.title?.trim() || path.posix.basename(relativePath),
      updatedAt: now,
    }

    if (existing === undefined) {
      getWorkerDb().insert(workerArtifacts).values({
        ...values,
        createdAt: now,
        id,
      }).run()
      return this.requireArtifact(id)
    }

    getWorkerDb()
      .update(workerArtifacts)
      .set(values)
      .where(eq(workerArtifacts.id, existing.id))
      .run()
    return this.requireArtifact(existing.id)
  }

  getArtifact(id: string): WorkerArtifact | null {
    const row = getWorkerDb()
      .select()
      .from(workerArtifacts)
      .where(eq(workerArtifacts.id, id))
      .get()
    return row === undefined ? null : rowToArtifact(row)
  }

  requireArtifact(id: string): WorkerArtifact {
    const artifact = this.getArtifact(id)
    if (artifact === null)
      throw AppError.notFound('artifact not found', 'not-found')
    return artifact
  }

  listArtifacts(options: ListWorkerArtifactsOptions = {}): WorkerArtifact[] {
    const filters = []
    if (options.runId !== undefined)
      filters.push(eq(workerArtifacts.runId, options.runId))
    if (options.conversationId !== undefined)
      filters.push(eq(workerArtifacts.conversationId, options.conversationId))
    if (options.status !== undefined)
      filters.push(eq(workerArtifacts.status, options.status))

    const query = getWorkerDb()
      .select()
      .from(workerArtifacts)
      .orderBy(desc(workerArtifacts.updatedAt))
      .limit(normalizeLimit(options.limit))

    const rows = (filters.length === 0
      ? query
      : query.where(and(...filters))).all()
    return rows.map(rowToArtifact)
  }
}

export function rowToArtifact(row: WorkerArtifactRow): WorkerArtifact {
  return {
    conversationId: row.conversationId ?? null,
    createdAt: row.createdAt,
    hash: row.hash ?? null,
    id: row.id,
    kind: row.kind,
    metadata: row.metadata ?? {},
    mimeType: row.mimeType ?? null,
    relativePath: row.relativePath,
    runId: row.runId ?? null,
    sizeBytes: row.sizeBytes ?? null,
    source: row.source,
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt,
  }
}

function normalizeArtifactPath(input: string): string {
  const raw = input.trim().replace(/\\/g, '/')
  if (!raw || raw === '.')
    throw AppError.badRequest('artifact relativePath is required', 'invalid-artifact-path')
  if (raw.startsWith('/') || raw.startsWith('//') || /^[A-Z]:\//i.test(raw))
    throw AppError.badRequest('artifact relativePath must be relative', 'invalid-artifact-path')
  const normalized = path.posix.normalize(raw)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../'))
    throw AppError.badRequest('artifact relativePath cannot escape the workspace', 'invalid-artifact-path')
  return normalized
}

function normalizeKind(kind: string | undefined): string {
  const normalized = kind?.trim()
  return normalized ? normalized : 'file'
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null)
    return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function normalizeSizeBytes(value: number | null | undefined): number | null {
  if (value === undefined || value === null)
    return null
  if (!Number.isInteger(value) || value < 0)
    throw AppError.badRequest('artifact sizeBytes must be a non-negative integer', 'invalid-artifact-size')
  return value
}

function normalizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value ?? {}
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined)
    return DEFAULT_LIMIT
  if (!Number.isFinite(limit))
    return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
}
