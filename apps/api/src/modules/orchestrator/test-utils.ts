import path from 'node:path'
import { runMigrations } from '../../db/migrate'

/**
 * Resolve the repository-level `drizzle/` folder and apply all migrations. The
 * service tests initialise an in-memory SQLite instance per case; this helper
 * keeps the pathing logic in one place.
 */
export function runMigrationsForTesting(): void {
  const folder = path.resolve(import.meta.dir, '../../../drizzle')
  runMigrations(folder)
}
