import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from './schema'

let db: ReturnType<typeof createDb> | null = null

function createDb(dbPath: string) {
  const sqlite = new Database(dbPath, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function initFleetDb(dbPath: string) {
  db = createDb(dbPath)
  return db
}

export function getFleetDb() {
  if (!db)
    throw new Error('Fleet database not initialized. Call initFleetDb() first.')
  return db
}

export function closeFleetDb() {
  db = null
}

export function runFleetMigrations(migrationsFolder: string) {
  migrate(getFleetDb(), { migrationsFolder })
}

export type FleetDatabase = ReturnType<typeof createDb>
export { schema as fleetSchema }
