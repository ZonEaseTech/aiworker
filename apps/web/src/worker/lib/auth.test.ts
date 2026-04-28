import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetBearerForTests, bootstrapBearerFromLocation, getBearerToken, setBearerToken } from './auth'

/**
 * FEAT-035 §验收 8：bearer-token 引导路径的核心保证——
 *
 * - URL hash `#token=...` → sessionStorage，且立即清掉 hash（不留浏览历史）；
 * - getBearerToken 永远不读 query string / localStorage；
 * - reset 后状态完全归零，避免跨 tab/case 污染。
 */
describe('worker bearer-auth bootstrap', () => {
  beforeEach(() => {
    __resetBearerForTests()
  })
  afterEach(() => {
    __resetBearerForTests()
  })

  it('extracts bearer from URL hash, stores it, and clears the hash', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    window.location.hash = '#token=abc123xyz'

    bootstrapBearerFromLocation()

    expect(getBearerToken()).toBe('abc123xyz')
    // hash 被清空——`replaceState` 用相对路径，不会保留 token 在 url。
    expect(replaceState).toHaveBeenCalled()
    expect(window.sessionStorage.getItem('aiworker.worker.bearer')).toBe('abc123xyz')
  })

  it('falls back to null when no hash and no sessionStorage entry', () => {
    expect(getBearerToken()).toBeNull()
  })

  it('round-trips via setBearerToken + sessionStorage', () => {
    setBearerToken('tok-1')
    expect(getBearerToken()).toBe('tok-1')
    expect(window.sessionStorage.getItem('aiworker.worker.bearer')).toBe('tok-1')

    setBearerToken(null)
    expect(getBearerToken()).toBeNull()
    expect(window.sessionStorage.getItem('aiworker.worker.bearer')).toBeNull()
  })

  it('decodes percent-encoded tokens from hash', () => {
    window.location.hash = '#token=abc%20def'
    bootstrapBearerFromLocation()
    expect(getBearerToken()).toBe('abc def')
  })

  it('skips bootstrapping when hash is empty', () => {
    window.location.hash = ''
    bootstrapBearerFromLocation()
    expect(getBearerToken()).toBeNull()
  })

  it('clears empty token hashes without storing a token', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    window.location.hash = '#token='

    bootstrapBearerFromLocation()

    expect(getBearerToken()).toBeNull()
    expect(replaceState).toHaveBeenCalled()
  })

  it('clears malformed token hashes without throwing', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    window.location.hash = '#token=%E0%A4%A'

    expect(() => bootstrapBearerFromLocation()).not.toThrow()
    expect(getBearerToken()).toBeNull()
    expect(replaceState).toHaveBeenCalled()
  })
})
