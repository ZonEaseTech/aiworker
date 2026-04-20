import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { errorHandler, requestLogger } from './shared'
import { health } from './modules/health'
import { skills } from './modules/skills'
import { memory } from './modules/memory'

const app = new OpenAPIHono()

app.use(requestLogger)
app.onError(errorHandler)

app.route('/health', health)
app.route('/api/skills', skills)
app.route('/api/memories', memory)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'AIWorker API',
    version: '0.1.0',
    description: 'Middleware glue service bridging Hermes Agent with OpenClaw',
  },
})

app.get('/docs', apiReference({
  spec: { url: '/openapi.json' },
}))

export { app }
