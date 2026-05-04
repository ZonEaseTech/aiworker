import type {
  BrainArtifact,
  BrainArtifactRegisterInput,
  BrainArtifactSensitivity,
  BrainArtifactStatus,
} from '@zonease/aiworker-shared'

import {
  brainArtifactRegisterInputSchema,
  brainArtifactSchema,
  redactBrainArtifact,
} from '@zonease/aiworker-shared'
import { brainArtifacts, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { and, desc, eq } from 'drizzle-orm'

/**
 * Brain artifact registry (PLAN-099).
 *
 * Soul-agnostic surface over the `brain_artifacts` table. The registry never
 * copies artifact content — it stores ref/hash/sensitivity/retention/status
 * plus opaque `metadata` the owning Soul interprets. Soul module declares the
 * artifact `type` universe (PLAN-100); this layer only enforces shape and
 * default sensitivity.
 *
 * Reads can opt in to redacted output (default) which replaces `ref` and
 * `hash` for `confidential` / `secret` artifacts. CLI / API callers should
 * stay redacted unless the operator passes an explicit unlock flag.
 */
export interface ListBrainArtifactsOptions {
  /** Filter by `scopeId`. Pass `null` to match rows whose `scopeId IS NULL`. */
  scopeId?: string | null
  type?: string
  status?: BrainArtifactStatus
  /** Minimum sensitivity to include. Default: include everything. */
  minSensitivity?: BrainArtifactSensitivity
  /** Hard cap. Defaults to 200. */
  limit?: number
}

export interface ReadBrainArtifactsOptions {
  /** Default true — redacts `ref` / `hash` for confidential / secret rows. */
  redactSensitive?: boolean
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

const SENSITIVITY_RANK: Record<BrainArtifactSensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  secret: 3,
}

function rankSensitivity(value: BrainArtifactSensitivity): number {
  return SENSITIVITY_RANK[value]
}

interface BrainArtifactRow {
  id: string
  scopeId: string | null
  type: string
  ref: string
  hash: string | null
  source: BrainArtifact['source']
  sensitivity: BrainArtifactSensitivity
  retention: string | null
  status: BrainArtifactStatus
  summary: string | null
  evidenceRefs: readonly string[]
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

function toBrainArtifact(row: BrainArtifactRow): BrainArtifact {
  const artifact: BrainArtifact = {
    createdAt: row.createdAt,
    evidenceRefs: row.evidenceRefs ?? [],
    id: row.id,
    ref: row.ref,
    sensitivity: row.sensitivity,
    source: row.source,
    status: row.status,
    type: row.type,
    updatedAt: row.updatedAt,
  }
  if (row.scopeId !== null)
    artifact.scopeId = row.scopeId
  if (row.hash !== null)
    artifact.hash = row.hash
  if (row.retention !== null)
    artifact.retention = row.retention
  if (row.summary !== null)
    artifact.summary = row.summary
  if (row.metadata !== null)
    artifact.metadata = row.metadata
  return brainArtifactSchema.parse(artifact)
}

function maybeRedact(artifact: BrainArtifact, options: ReadBrainArtifactsOptions | undefined): BrainArtifact {
  return options?.redactSensitive === false ? artifact : redactBrainArtifact(artifact)
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined)
    return DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error(`brain artifact limit must be a positive integer, got ${String(limit)}`)
  return Math.min(limit, MAX_LIMIT)
}

export class BrainArtifactRegistry {
  /**
   * Register a new artifact. Throws on duplicate id.
   *
   * Caller controls `source`; `sensitivity` defaults to `internal` and
   * `status` defaults to `active`. `metadata` is opaque — Kernel does not
   * inspect it.
   */
  register(input: BrainArtifactRegisterInput, at: string = new Date().toISOString()): BrainArtifact {
    const parsed = brainArtifactRegisterInputSchema.parse(input)
    const db = getWorkerDb()
    const existing = db
      .select({ id: brainArtifacts.id })
      .from(brainArtifacts)
      .where(eq(brainArtifacts.id, parsed.id))
      .get()
    if (existing !== undefined)
      throw new Error(`brain artifact "${parsed.id}" already registered`)

    db.insert(brainArtifacts).values({
      createdAt: at,
      evidenceRefs: parsed.evidenceRefs ?? [],
      hash: parsed.hash ?? null,
      id: parsed.id,
      metadata: parsed.metadata ?? null,
      ref: parsed.ref,
      retention: parsed.retention ?? null,
      scopeId: parsed.scopeId ?? null,
      sensitivity: parsed.sensitivity,
      source: parsed.source,
      status: parsed.status,
      summary: parsed.summary ?? null,
      type: parsed.type,
      updatedAt: at,
    }).run()

    return this.requireById(parsed.id, { redactSensitive: false })
  }

  get(id: string, options?: ReadBrainArtifactsOptions): BrainArtifact | null {
    const row = getWorkerDb()
      .select()
      .from(brainArtifacts)
      .where(eq(brainArtifacts.id, id))
      .get()
    if (row === undefined)
      return null
    return maybeRedact(toBrainArtifact(row as BrainArtifactRow), options)
  }

  requireById(id: string, options?: ReadBrainArtifactsOptions): BrainArtifact {
    const artifact = this.get(id, options)
    if (artifact === null)
      throw new Error(`brain artifact "${id}" not found`)
    return artifact
  }

  list(options?: ListBrainArtifactsOptions, readOptions?: ReadBrainArtifactsOptions): BrainArtifact[] {
    const limit = clampLimit(options?.limit)
    const minRank = options?.minSensitivity === undefined ? 0 : rankSensitivity(options.minSensitivity)

    const filters = []
    if (options?.scopeId !== undefined) {
      filters.push(options.scopeId === null
        ? eq(brainArtifacts.scopeId, null as unknown as string)
        : eq(brainArtifacts.scopeId, options.scopeId))
    }
    if (options?.type !== undefined)
      filters.push(eq(brainArtifacts.type, options.type))
    if (options?.status !== undefined)
      filters.push(eq(brainArtifacts.status, options.status))

    const query = getWorkerDb()
      .select()
      .from(brainArtifacts)
      .orderBy(desc(brainArtifacts.updatedAt))
      .limit(limit)

    const rows = (filters.length === 0
      ? query
      : query.where(and(...filters))).all()

    return rows
      .map(row => toBrainArtifact(row as BrainArtifactRow))
      .filter(artifact => rankSensitivity(artifact.sensitivity) >= minRank)
      .map(artifact => maybeRedact(artifact, readOptions))
  }

  /**
   * Update workflow status. Returns the updated row (redacted unless
   * `readOptions.redactSensitive === false`).
   */
  setStatus(
    id: string,
    status: BrainArtifactStatus,
    at: string = new Date().toISOString(),
    readOptions?: ReadBrainArtifactsOptions,
  ): BrainArtifact {
    const db = getWorkerDb()
    db.update(brainArtifacts)
      .set({ status, updatedAt: at })
      .where(eq(brainArtifacts.id, id))
      .run()
    return this.requireById(id, readOptions)
  }

  count(options?: Pick<ListBrainArtifactsOptions, 'scopeId' | 'type' | 'status'>): number {
    const filters = []
    if (options?.scopeId !== undefined) {
      filters.push(options.scopeId === null
        ? eq(brainArtifacts.scopeId, null as unknown as string)
        : eq(brainArtifacts.scopeId, options.scopeId))
    }
    if (options?.type !== undefined)
      filters.push(eq(brainArtifacts.type, options.type))
    if (options?.status !== undefined)
      filters.push(eq(brainArtifacts.status, options.status))

    const baseRows = filters.length === 0
      ? getWorkerDb().select({ id: brainArtifacts.id }).from(brainArtifacts).all()
      : getWorkerDb().select({ id: brainArtifacts.id }).from(brainArtifacts).where(and(...filters)).all()
    return baseRows.length
  }
}

export function createBrainArtifactRegistry(): BrainArtifactRegistry {
  return new BrainArtifactRegistry()
}
