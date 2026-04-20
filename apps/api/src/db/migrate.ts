import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { getDb } from '.'

export function runMigrations(migrationsFolder: string) {
  const db = getDb()
  migrate(db, { migrationsFolder })
}
