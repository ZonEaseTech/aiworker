import path from 'node:path'
import consola from 'consola'
import { app } from './app'
import { config } from './config'
import { initDb } from './db'
import { runMigrations } from './db/migrate'

const dbPath = path.resolve(import.meta.dir, '../data/aiworker.db')
initDb(dbPath)
const migrationsFolder = path.resolve(import.meta.dir, '../drizzle')
runMigrations(migrationsFolder)
consola.info(`[dev] Database initialized at ${dbPath}`)

Bun.serve({
  fetch: app.fetch,
  port: config.PORT,
})

consola.success(`[dev] API server running on http://localhost:${config.PORT}`)
