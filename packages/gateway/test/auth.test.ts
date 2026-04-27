import { describe, expect, test } from 'bun:test'
import { assertGatewayBindIsSafe, isLoopbackAddress } from '../src/auth/loopback'
import { authorizeConnection, timingSafeEqualStrings } from '../src/auth/token'

describe('isLoopbackAddress', () => {
  test('IPv4 127.0.0.1 判为 loopback', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
  })
  test('IPv6 ::1 判为 loopback', () => {
    expect(isLoopbackAddress('::1')).toBe(true)
  })
  test('IPv4-mapped-IPv6 ::ffff:127.0.0.1 判为 loopback', () => {
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
  })
  test('127.0.0.x 全网段也算 loopback', () => {
    expect(isLoopbackAddress('127.0.0.5')).toBe(true)
  })
  test('公网 IP 不算 loopback', () => {
    expect(isLoopbackAddress('8.8.8.8')).toBe(false)
  })
  test('undefined / 空字符串不算 loopback', () => {
    expect(isLoopbackAddress(undefined)).toBe(false)
    expect(isLoopbackAddress('')).toBe(false)
  })
})

describe('timingSafeEqualStrings', () => {
  test('相等返回 true', () => {
    expect(timingSafeEqualStrings('hello-world-123456', 'hello-world-123456')).toBe(true)
  })
  test('长度不等立即 false', () => {
    expect(timingSafeEqualStrings('a', 'ab')).toBe(false)
  })
  test('同长度不同内容返回 false', () => {
    expect(timingSafeEqualStrings('abcdef', 'abcxyz')).toBe(false)
  })
})

describe('authorizeConnection', () => {
  test('loopback：token 空字符串也放行', () => {
    expect(
      authorizeConnection({ loopback: true, sharedSecret: undefined, presentedToken: '' }).ok,
    ).toBe(true)
  })
  test('loopback：即便带 token 也放行', () => {
    expect(
      authorizeConnection({
        loopback: true,
        sharedSecret: 'secret-abcdefghijklmnop',
        presentedToken: 'anything',
      }).ok,
    ).toBe(true)
  })
  test('remote：未配置 sharedSecret → 拒绝', () => {
    const r = authorizeConnection({
      loopback: false,
      sharedSecret: undefined,
      presentedToken: 'whatever',
    })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.reason).toBe('remote_requires_secret_but_unset')
  })
  test('remote：token 空 → 拒绝', () => {
    const r = authorizeConnection({
      loopback: false,
      sharedSecret: 'secret-abcdefghijklmnop',
      presentedToken: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.reason).toBe('missing_token')
  })
  test('remote：token 正确 → 放行', () => {
    expect(
      authorizeConnection({
        loopback: false,
        sharedSecret: 'secret-abcdefghijklmnop',
        presentedToken: 'secret-abcdefghijklmnop',
      }).ok,
    ).toBe(true)
  })
  test('remote：token 错误 → 拒绝', () => {
    const r = authorizeConnection({
      loopback: false,
      sharedSecret: 'secret-abcdefghijklmnop',
      presentedToken: 'secret-abcdefghijklmnoq',
    })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.reason).toBe('invalid_token')
  })
})

describe('assertGatewayBindIsSafe (BUG-019)', () => {
  test('loopback bind + 无 secret → 放行', () => {
    expect(() => assertGatewayBindIsSafe({ host: '127.0.0.1', internalSharedSecret: undefined })).not.toThrow()
    expect(() => assertGatewayBindIsSafe({ host: '::1', internalSharedSecret: undefined })).not.toThrow()
    expect(() => assertGatewayBindIsSafe({ host: 'localhost', internalSharedSecret: undefined })).not.toThrow()
    expect(() => assertGatewayBindIsSafe({ host: '127.0.0.5', internalSharedSecret: undefined })).not.toThrow()
  })

  test('loopback bind + 有 secret → 放行', () => {
    expect(() => assertGatewayBindIsSafe({ host: '127.0.0.1', internalSharedSecret: 'shhhhh-1234567890abc' })).not.toThrow()
  })

  test('0.0.0.0 bind + 无 secret → 抛错', () => {
    expect(() => assertGatewayBindIsSafe({ host: '0.0.0.0', internalSharedSecret: undefined })).toThrow(
      /INTERNAL_SHARED_SECRET/,
    )
  })

  test('0.0.0.0 bind + 空字符串 secret → 抛错', () => {
    expect(() => assertGatewayBindIsSafe({ host: '0.0.0.0', internalSharedSecret: '' })).toThrow(
      /INTERNAL_SHARED_SECRET/,
    )
  })

  test('0.0.0.0 bind + 有 secret → 放行', () => {
    expect(() => assertGatewayBindIsSafe({ host: '0.0.0.0', internalSharedSecret: 'shhhhh-1234567890abc' })).not.toThrow()
  })

  test('IPv6 :: (any) bind + 无 secret → 抛错', () => {
    expect(() => assertGatewayBindIsSafe({ host: '::', internalSharedSecret: undefined })).toThrow(
      /INTERNAL_SHARED_SECRET/,
    )
  })

  test('public IP bind + 无 secret → 抛错', () => {
    expect(() => assertGatewayBindIsSafe({ host: '192.168.1.5', internalSharedSecret: undefined })).toThrow(
      /INTERNAL_SHARED_SECRET/,
    )
    expect(() => assertGatewayBindIsSafe({ host: '10.0.0.1', internalSharedSecret: undefined })).toThrow(
      /INTERNAL_SHARED_SECRET/,
    )
  })

  test('错误信息包含修复方式提示', () => {
    expect(() => assertGatewayBindIsSafe({ host: '0.0.0.0', internalSharedSecret: undefined })).toThrow(
      /AIWORKER_GATEWAY_HOST=127\.0\.0\.1/,
    )
  })
})
