import { createServer } from 'node:net'
import { describe, expect, it } from 'bun:test'
import {
  buildWorkerAdminBaseUrl,
  buildWorkerAdminTokenUrl,
  formatWorkerAdminBaseUrlMessage,
  tryBindPreflight,
} from './serve'

describe('worker serve admin URL helpers', () => {
  it('builds a tokenized admin URL only for the browser-open path', () => {
    expect(buildWorkerAdminBaseUrl({ host: '0.0.0.0', port: 9217 }))
      .toBe('http://127.0.0.1:9217/admin/')
    expect(buildWorkerAdminTokenUrl({ host: '127.0.0.1', port: 9217, token: 'wtk_a/b c' }))
      .toBe('http://127.0.0.1:9217/admin/#token=wtk_a%2Fb%20c')
  })

  it('prints the base admin URL as locked without exposing the bearer token', () => {
    const message = formatWorkerAdminBaseUrlMessage('http://127.0.0.1:9217/admin/')

    expect(message).toContain('无 token 会显示锁定态')
    expect(message).toContain('--open')
    expect(message).not.toContain('#token=')
  })
})

describe('tryBindPreflight (TODO-016)', () => {
  it('returns null when the requested port is free', async () => {
    const result = await tryBindPreflight('127.0.0.1', 0)
    expect(result).toBeNull()
  })

  it('returns a descriptive error string when the port is already bound', async () => {
    const squat = createServer()
    await new Promise<void>((resolve, reject) => {
      squat.once('error', reject)
      squat.once('listening', () => resolve())
      squat.listen({ host: '127.0.0.1', port: 0 })
    })
    const address = squat.address()
    if (typeof address !== 'object' || address === null)
      throw new Error('squat server has no port')
    const port = address.port
    try {
      const result = await tryBindPreflight('127.0.0.1', port)
      expect(result).not.toBeNull()
      expect(result).toContain(String(port))
      expect(result).toMatch(/EADDRINUSE|in use|already/i)
    }
    finally {
      await new Promise<void>((resolve) => {
        squat.close(() => resolve())
      })
    }
  })
})
