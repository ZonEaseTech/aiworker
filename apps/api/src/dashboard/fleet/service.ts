import type { CreateWorkerInput, UpdateWorkerInput, Worker, WorkerConfig, WorkerSummary } from '@aiworker/shared'
import { desc, eq } from 'drizzle-orm'

import { dashboardConfig } from '../../config/dashboard'
import { getFleetDb } from '../../db/fleet'
import { workerConfigs, workers, workerSecrets } from '../../db/fleet/schema'
import { AppError, mintWorkerId, slugify } from '../../shared'
import { getSecretsVault } from '../secrets'
import { enumerateSecretPaths, hydrateSecrets, redactSecrets } from './secret-paths'

function rowToWorker(row: typeof workers.$inferSelect): Worker {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    status: row.status,
    ...(row.containerId === null ? {} : { containerId: row.containerId }),
    containerImage: row.containerImage,
    configVersion: row.configVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function storeSecrets(workerId: string, config: WorkerConfig) {
  const vault = getSecretsVault()
  await vault.removeAllForWorker(workerId)
  const pairs = enumerateSecretPaths(config)
  for (const { path, value } of pairs) {
    if (value && value.length > 0)
      await vault.put(workerId, path, value)
  }
}

async function loadSecrets(workerId: string): Promise<Map<string, string>> {
  const vault = getSecretsVault()
  const keys = await vault.list(workerId)
  const out = new Map<string, string>()
  for (const key of keys) {
    const value = await vault.get(workerId, key)
    if (value !== null)
      out.set(key, value)
  }
  return out
}

export async function createWorker(input: CreateWorkerInput): Promise<Worker> {
  const db = getFleetDb()
  const name = input.name.trim()
  if (!name)
    throw AppError.badRequest('Worker name is required')

  const slug = (input.slug ? slugify(input.slug) : slugify(name)) || `worker-${Date.now()}`
  const collision = db.select({ id: workers.id }).from(workers).where(eq(workers.slug, slug)).get()
  if (collision)
    throw new AppError('SLUG_CONFLICT', 409, `Slug "${slug}" is already used`)

  const id = mintWorkerId()
  const now = new Date().toISOString()

  db.insert(workers).values({
    id,
    slug,
    name,
    ...(input.description ? { description: input.description } : {}),
    containerImage: dashboardConfig.AIWORKER_IMAGE,
    configVersion: 1,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).run()

  const redacted = redactSecrets(input.config)
  db.insert(workerConfigs).values({
    workerId: id,
    configJson: redacted,
    version: 1,
    updatedAt: now,
  }).run()

  await storeSecrets(id, input.config)

  const inserted = db.select().from(workers).where(eq(workers.id, id)).get()!
  return rowToWorker(inserted)
}

export function getWorker(id: string): Worker | null {
  const row = getFleetDb().select().from(workers).where(eq(workers.id, id)).get()
  return row ? rowToWorker(row) : null
}

export function getWorkerBySlug(slug: string): Worker | null {
  const row = getFleetDb().select().from(workers).where(eq(workers.slug, slug)).get()
  return row ? rowToWorker(row) : null
}

export function listWorkers(): Worker[] {
  return getFleetDb().select().from(workers).orderBy(desc(workers.createdAt)).all().map(rowToWorker)
}

export function listWorkerSummaries(): WorkerSummary[] {
  const db = getFleetDb()
  const rows = db.select().from(workers).orderBy(desc(workers.createdAt)).all()
  return rows.map((row) => {
    const configRow = db.select().from(workerConfigs).where(eq(workerConfigs.workerId, row.id)).get()
    const cfg = configRow?.configJson
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      enabledChannels: cfg?.channels.filter(c => c.enabled).map(c => c.channel) ?? [],
      brainCount: cfg?.brains.length ?? 0,
      executorType: cfg?.executor.type ?? 'http',
    } satisfies WorkerSummary
  })
}

export function getRedactedConfig(workerId: string): WorkerConfig | null {
  const row = getFleetDb().select().from(workerConfigs).where(eq(workerConfigs.workerId, workerId)).get()
  return row?.configJson ?? null
}

export async function getResolvedConfig(workerId: string): Promise<WorkerConfig | null> {
  const redacted = getRedactedConfig(workerId)
  if (!redacted)
    return null
  const secrets = await loadSecrets(workerId)
  return hydrateSecrets(redacted, secrets)
}

export async function updateWorker(id: string, input: UpdateWorkerInput): Promise<Worker> {
  const db = getFleetDb()
  const existing = db.select().from(workers).where(eq(workers.id, id)).get()
  if (!existing)
    throw AppError.notFound(`Worker ${id} not found`)

  const now = new Date().toISOString()
  const updates: Partial<typeof workers.$inferInsert> = { updatedAt: now }

  if (input.name !== undefined)
    updates.name = input.name.trim()
  if (input.description !== undefined)
    updates.description = input.description
  if (input.status !== undefined)
    updates.status = input.status

  if (input.slug !== undefined) {
    const slug = slugify(input.slug)
    if (slug && slug !== existing.slug) {
      const collision = db.select({ id: workers.id })
        .from(workers)
        .where(eq(workers.slug, slug))
        .get()
      if (collision)
        throw new AppError('SLUG_CONFLICT', 409, `Slug "${slug}" is already used`)
      updates.slug = slug
    }
  }

  if (input.config !== undefined) {
    updates.configVersion = existing.configVersion + 1
    const redacted = redactSecrets(input.config)
    const configRow = db.select().from(workerConfigs).where(eq(workerConfigs.workerId, id)).get()
    if (configRow) {
      db.update(workerConfigs)
        .set({ configJson: redacted, version: existing.configVersion + 1, updatedAt: now })
        .where(eq(workerConfigs.workerId, id))
        .run()
    }
    else {
      db.insert(workerConfigs).values({
        workerId: id,
        configJson: redacted,
        version: existing.configVersion + 1,
        updatedAt: now,
      }).run()
    }
    await storeSecrets(id, input.config)
  }

  db.update(workers).set(updates).where(eq(workers.id, id)).run()
  const updated = db.select().from(workers).where(eq(workers.id, id)).get()!
  return rowToWorker(updated)
}

export async function deleteWorker(id: string): Promise<void> {
  const db = getFleetDb()
  const existing = db.select({ id: workers.id }).from(workers).where(eq(workers.id, id)).get()
  if (!existing)
    throw AppError.notFound(`Worker ${id} not found`)
  const vault = getSecretsVault()
  await vault.removeAllForWorker(id)
  db.delete(workerSecrets).where(eq(workerSecrets.workerId, id)).run()
  db.delete(workerConfigs).where(eq(workerConfigs.workerId, id)).run()
  db.delete(workers).where(eq(workers.id, id)).run()
}

export function setContainerId(workerId: string, containerId: string | null) {
  getFleetDb().update(workers).set({ containerId, updatedAt: new Date().toISOString() }).where(eq(workers.id, workerId)).run()
}
