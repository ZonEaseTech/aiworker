import { describe, expect, it } from 'bun:test'

import {
  assertAdminServingIsSafe,
  isLoopbackAddress,
  parseAdminExternalAuthAcknowledgement,
} from './admin-exposure'

describe('isLoopbackAddress', () => {
  it('accepts loopback literals and localhost', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('127.0.0.5')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('localhost')).toBe(true)
  })

  it('rejects public or empty addresses', () => {
    expect(isLoopbackAddress('0.0.0.0')).toBe(false)
    expect(isLoopbackAddress('192.168.1.5')).toBe(false)
    expect(isLoopbackAddress(undefined)).toBe(false)
    expect(isLoopbackAddress('')).toBe(false)
  })
})

describe('parseAdminExternalAuthAcknowledgement', () => {
  it('accepts explicit acknowledgement values only', () => {
    expect(parseAdminExternalAuthAcknowledgement('1')).toBe(true)
    expect(parseAdminExternalAuthAcknowledgement('true')).toBe(true)
    expect(parseAdminExternalAuthAcknowledgement('0')).toBe(false)
    expect(parseAdminExternalAuthAcknowledgement('false')).toBe(false)
    expect(parseAdminExternalAuthAcknowledgement(undefined)).toBe(false)
  })
})

describe('assertAdminServingIsSafe', () => {
  it('allows loopback admin serving without acknowledgement', () => {
    expect(() => {
      assertAdminServingIsSafe({
        surface: 'fleet',
        host: '127.0.0.1',
        serveWeb: true,
      })
    }).not.toThrow()
  })

  it('rejects non-loopback admin serving without acknowledgement', () => {
    expect(() => {
      assertAdminServingIsSafe({
        surface: 'fleet',
        host: '0.0.0.0',
        serveWeb: true,
      })
    }).toThrow(/AIWORKER_ADMIN_EXTERNAL_AUTH=1/)
  })

  it('allows non-loopback binds when admin serving is disabled', () => {
    expect(() => {
      assertAdminServingIsSafe({
        surface: 'worker',
        host: '0.0.0.0',
        serveWeb: false,
      })
    }).not.toThrow()
  })

  it('allows non-loopback admin serving with explicit acknowledgement', () => {
    expect(() => {
      assertAdminServingIsSafe({
        surface: 'worker',
        host: '0.0.0.0',
        serveWeb: true,
        externalAuthAcknowledged: true,
      })
    }).not.toThrow()
  })
})
