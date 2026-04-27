import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from './schema'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Migrations 路径解析（BUG-011/BUG-012 修复，bundle 兼容）：
 *   - dev / source 布局：`<package>/src/fleet/index.ts` → `../../drizzle/fleet`
 *   - bundle 布局（cli `dist/aiworker.js`）：sibling `./drizzle/fleet`
 *     （由 `apps/cli/scripts/build-publish-manifest.ts` 在 build 时拷过来）
 *
 * 优先 dev layout（开发体验不变），fallback bundle layout（npm install 场景）。
 * 两者都不存在时返回 dev path，让 drizzle 抛清晰的 `meta/_journal.json` 错。
 */
function resolveMigrationsFolder(rel: string): string {
  const dev = path.resolve(moduleDir, '../../drizzle', rel)
  if (existsSync(dev))
    return dev
  const bundled = path.resolve(moduleDir, 'drizzle', rel)
  if (existsSync(bundled))
    return bundled
  return dev
}

export const defaultFleetMigrationsFolder: string = resolveMigrationsFolder('fleet')

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

export function runFleetMigrations(migrationsFolder: string = defaultFleetMigrationsFolder) {
  migrate(getFleetDb(), { migrationsFolder })
}

export type FleetDatabase = ReturnType<typeof createDb>
export { schema as fleetSchema }
export * from './schema'
