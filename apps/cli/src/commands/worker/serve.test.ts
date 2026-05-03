import { describe, expect, it } from 'bun:test'
import {
  buildWorkerAdminBaseUrl,
  buildWorkerAdminTokenUrl,
  formatWorkerAdminBaseUrlMessage,
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
