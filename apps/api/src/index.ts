import consola from 'consola'
import { app } from './app'
import { config } from './config'

Bun.serve({
  fetch: app.fetch,
  port: config.PORT,
})

consola.success(`API server running on http://localhost:${config.PORT}`)
