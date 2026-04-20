import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'

import { configRouter } from './modules/config'
import { events } from './modules/events'
import { execution } from './modules/execution'
import { health } from './modules/health'
import { memory } from './modules/memory'
import { orchestrator } from './modules/orchestrator'
import { skills } from './modules/skills'
import { errorHandler, requestLogger } from './shared'

const app = new OpenAPIHono()

app.use(requestLogger)
app.onError(errorHandler)

app.route('/health', health)
app.route('/api/skills', skills)
app.route('/api/memories', memory)
app.route('/api/execution', execution)
app.route('/api/orchestrator', orchestrator)
app.route('/api/config', configRouter)
app.route('/api/events', events)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'AIWorker API',
    version: '0.1.0',
    description: 'Middleware glue service bridging Hermes Agent with an OpenAI-compatible executor',
  },
})

app.get('/docs', apiReference({
  spec: { url: '/openapi.json' },
}))

export { app }
