import { describe, expect, it } from 'bun:test'
import { app } from '../../app'

describe('Health endpoints', () => {
  it('GET /health returns status with services', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toMatch(/^(ok|degraded|down)$/)
    expect(body.services).toBeDefined()
    expect(body.services.hermes).toBeDefined()
    expect(body.services.openclaw).toBeDefined()
  })

  it('GET /health/hermes returns service health', async () => {
    const res = await app.request('/health/hermes')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toMatch(/^(ok|degraded|down)$/)
  })

  it('GET /health/openclaw returns service health', async () => {
    const res = await app.request('/health/openclaw')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toMatch(/^(ok|degraded|down)$/)
  })
})

describe('Skills endpoints', () => {
  it('GET /api/skills returns skill list', async () => {
    const res = await app.request('/api/skills')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skills).toBeArray()
    expect(body.total).toBeGreaterThan(0)
  })

  it('GET /api/skills/:name returns 404 for unknown', async () => {
    const res = await app.request('/api/skills/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('Memory endpoints', () => {
  it('GET /api/memories returns memory list', async () => {
    const res = await app.request('/api/memories')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.memories).toBeArray()
    expect(body.total).toBeGreaterThanOrEqual(0)
  })

  it('GET /api/memories/search?q=typescript returns results', async () => {
    const res = await app.request('/api/memories/search?q=typescript')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toBeArray()
    expect(body.query).toBe('typescript')
  })
})
