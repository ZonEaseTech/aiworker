import { describe, expect, it } from 'bun:test'

import {
  generateWorkerApiToken,
  isWorkerApiToken,
  WORKER_API_TOKEN_PATTERN,
  WORKER_API_TOKEN_PREFIX,
} from './worker-identity'

describe('generateWorkerApiToken', () => {
  it('produces a token accepted by isWorkerApiToken', () => {
    const token = generateWorkerApiToken()
    expect(isWorkerApiToken(token)).toBe(true)
  })

  it('always emits the wtk_ prefix', () => {
    for (let i = 0; i < 20; i += 1)
      expect(generateWorkerApiToken().startsWith(WORKER_API_TOKEN_PREFIX)).toBe(true)
  })

  it('matches WORKER_API_TOKEN_PATTERN for a large sample', () => {
    for (let i = 0; i < 100; i += 1)
      expect(WORKER_API_TOKEN_PATTERN.test(generateWorkerApiToken())).toBe(true)
  })

  it('yields 32 bytes of entropy encoded as base64url (43 chars after prefix)', () => {
    const token = generateWorkerApiToken()
    expect(token.length).toBe(WORKER_API_TOKEN_PREFIX.length + 43)
  })

  it('does not repeat across 1000 invocations', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i += 1)
      seen.add(generateWorkerApiToken())
    expect(seen.size).toBe(1000)
  })

  it('stays inside the base64url alphabet (no +, /, =)', () => {
    for (let i = 0; i < 50; i += 1) {
      const token = generateWorkerApiToken()
      expect(token).not.toMatch(/[+/=]/)
    }
  })
})
