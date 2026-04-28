import type { ChannelType } from '@zonease/aiworker-shared'

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from './schema'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

/** 同 fleet/index.ts 注释：dev `../../drizzle/<rel>` → bundle `./drizzle/<rel>` fallback。 */
function resolveMigrationsFolder(rel: string): string {
  const dev = path.resolve(moduleDir, '../../drizzle', rel)
  if (existsSync(dev))
    return dev
  const bundled = path.resolve(moduleDir, 'drizzle', rel)
  if (existsSync(bundled))
    return bundled
  return dev
}

export const defaultWorkerMigrationsFolder: string = resolveMigrationsFolder('worker')

let db: ReturnType<typeof createDb> | null = null

function createDb(dbPath: string) {
  const sqlite = new Database(dbPath, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function initWorkerDb(dbPath: string) {
  db = createDb(dbPath)
  return db
}

export function getWorkerDb() {
  if (!db)
    throw new Error('Worker database not initialized. Call initWorkerDb() first.')
  return db
}

export function closeWorkerDb() {
  db = null
}

export function runWorkerMigrations(migrationsFolder: string = defaultWorkerMigrationsFolder) {
  migrate(getWorkerDb(), { migrationsFolder })
}

export type WorkerDatabase = ReturnType<typeof createDb>
export type SessionEntryRow = typeof schema.sessionEntries.$inferSelect

export interface UpsertSessionEntryInput {
  sessionKey: string
  currentConversationId: string
  channel: ChannelType
  chatId: string
  threadId?: string
  accountId?: string
  at?: string
  engineBindings?: Record<string, unknown>
}

export interface TouchSessionEntryInput {
  at?: string
  contextTokens?: number
  totalTokens?: number
  totalTokensFresh?: number
}

export interface RotateSessionConversationInput {
  sessionKey: string
  currentConversationId: string
  resetReason: string
  at?: string
}

export interface RecordSessionCompactionInput {
  at?: string
  memoryFlushAt?: string
}

export function getSessionEntry(sessionKey: string): SessionEntryRow | null {
  return getWorkerDb().select().from(schema.sessionEntries).where(eq(schema.sessionEntries.sessionKey, sessionKey)).get() ?? null
}

export function upsertSessionEntry(input: UpsertSessionEntryInput): SessionEntryRow {
  const db = getWorkerDb()
  const now = input.at ?? new Date().toISOString()
  const existing = getSessionEntry(input.sessionKey)
  if (!existing) {
    db.insert(schema.sessionEntries).values({
      sessionKey: input.sessionKey,
      currentConversationId: input.currentConversationId,
      channel: input.channel,
      chatId: input.chatId,
      threadId: input.threadId ?? null,
      accountId: input.accountId ?? null,
      status: 'active',
      sessionStartedAt: now,
      lastInteractionAt: now,
      engineBindings: input.engineBindings ?? {},
      createdAt: now,
      updatedAt: now,
    }).run()
  }
  else {
    db.update(schema.sessionEntries).set({
      currentConversationId: input.currentConversationId,
      channel: input.channel,
      chatId: input.chatId,
      threadId: input.threadId ?? null,
      accountId: input.accountId ?? null,
      status: 'active',
      lastInteractionAt: now,
      engineBindings: input.engineBindings ?? existing.engineBindings,
      updatedAt: now,
    }).where(eq(schema.sessionEntries.sessionKey, input.sessionKey)).run()
  }
  return getSessionEntry(input.sessionKey)!
}

export function touchSessionEntry(sessionKey: string, input: TouchSessionEntryInput = {}): SessionEntryRow | null {
  const existing = getSessionEntry(sessionKey)
  if (!existing)
    return null

  const now = input.at ?? new Date().toISOString()
  getWorkerDb().update(schema.sessionEntries).set({
    lastInteractionAt: now,
    updatedAt: now,
    ...(input.contextTokens === undefined ? {} : { contextTokens: input.contextTokens }),
    ...(input.totalTokens === undefined ? {} : { totalTokens: input.totalTokens }),
    ...(input.totalTokensFresh === undefined ? {} : { totalTokensFresh: input.totalTokensFresh }),
  }).where(eq(schema.sessionEntries.sessionKey, sessionKey)).run()
  return getSessionEntry(sessionKey)
}

export function rotateSessionConversation(input: RotateSessionConversationInput): SessionEntryRow | null {
  const existing = getSessionEntry(input.sessionKey)
  if (!existing)
    return null

  const now = input.at ?? new Date().toISOString()
  getWorkerDb().update(schema.sessionEntries).set({
    currentConversationId: input.currentConversationId,
    status: 'active',
    sessionStartedAt: now,
    lastInteractionAt: now,
    resetAt: now,
    resetReason: input.resetReason,
    contextTokens: 0,
    totalTokens: 0,
    totalTokensFresh: 0,
    compactionCount: 0,
    memoryFlushAt: null,
    memoryFlushCompactionCount: 0,
    engineBindings: {},
    updatedAt: now,
  }).where(eq(schema.sessionEntries.sessionKey, input.sessionKey)).run()
  return getSessionEntry(input.sessionKey)
}

export function recordSessionCompaction(sessionKey: string, input: RecordSessionCompactionInput = {}): SessionEntryRow | null {
  const existing = getSessionEntry(sessionKey)
  if (!existing)
    return null

  const now = input.at ?? new Date().toISOString()
  const nextCompactionCount = existing.compactionCount + 1
  getWorkerDb().update(schema.sessionEntries).set({
    compactionCount: nextCompactionCount,
    ...(input.memoryFlushAt === undefined
      ? {}
      : {
          memoryFlushAt: input.memoryFlushAt,
          memoryFlushCompactionCount: nextCompactionCount,
        }),
    updatedAt: now,
  }).where(eq(schema.sessionEntries.sessionKey, sessionKey)).run()
  return getSessionEntry(sessionKey)
}

export function updateSessionEngineBinding(sessionKey: string, engine: string, binding: unknown | null, at?: string): SessionEntryRow | null {
  const existing = getSessionEntry(sessionKey)
  if (!existing)
    return null

  const next = { ...existing.engineBindings }
  if (binding === null)
    delete next[engine]
  else
    next[engine] = binding

  getWorkerDb().update(schema.sessionEntries).set({
    engineBindings: next,
    updatedAt: at ?? new Date().toISOString(),
  }).where(eq(schema.sessionEntries.sessionKey, sessionKey)).run()
  return getSessionEntry(sessionKey)
}

export { schema as workerSchema }
export * from './schema'
