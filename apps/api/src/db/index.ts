import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

let db: ReturnType<typeof createDb> | null = null

function createDb(dbPath: string) {
  const sqlite = new Database(dbPath, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}

export function initDb(dbPath: string) {
  db = createDb(dbPath)
  return db
}

export function closeDb() {
  db = null
}

export type AppDatabase = ReturnType<typeof createDb>
