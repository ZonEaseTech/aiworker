import path from 'node:path'
import process from 'node:process'
import consola from 'consola'
import { app } from './app'
import { config } from './config'
import { closeDb, initDb } from './db'

const dbPath = path.resolve(import.meta.dir, '../data/aiworker.db')
initDb(dbPath)
consola.info(`Database initialized at ${dbPath}`)

const server = Bun.serve({
  fetch: app.fetch,
  port: config.PORT,
})

consola.success(`API server running on http://localhost:${config.PORT}`)

process.on('SIGINT', () => {
  consola.info('Shutting down...')
  server.stop()
  closeDb()
  process.exit(0)
})

process.on('SIGTERM', () => {
  consola.info('Shutting down...')
  server.stop()
  closeDb()
  process.exit(0)
})
