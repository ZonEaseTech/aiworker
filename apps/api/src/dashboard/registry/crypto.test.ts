import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'bun:test'

import { decryptToken, encryptToken, timingSafeEqualStrings } from './crypto'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const OTHER_KEY = '112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00'

describe('registry/crypto', () => {
  it('round-trips encrypt/decrypt', () => {
    const sealed = encryptToken('wtk_abcdef0123456789_supersecret_value_9999', MASTER_KEY)
    const plain = decryptToken(sealed.ciphertext, sealed.nonce, sealed.authTag, MASTER_KEY)
    expect(plain).toBe('wtk_abcdef0123456789_supersecret_value_9999')
  })

  it('produces a fresh nonce each call', () => {
    const a = encryptToken('hello', MASTER_KEY)
    const b = encryptToken('hello', MASTER_KEY)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('rejects a malformed master key', () => {
    expect(() => encryptToken('hello', 'not-hex')).toThrow(/32-byte hex/)
    expect(() => encryptToken('hello', 'abcdef')).toThrow(/32-byte hex/)
    expect(() => decryptToken('x', 'x', 'x', 'not-hex')).toThrow(/32-byte hex/)
  })

  it('fails to decrypt with a different master key', () => {
    const sealed = encryptToken('hello', MASTER_KEY)
    expect(() =>
      decryptToken(sealed.ciphertext, sealed.nonce, sealed.authTag, OTHER_KEY),
    ).toThrow()
  })

  it('throws when the auth tag is tampered with', () => {
    const sealed = encryptToken('hello', MASTER_KEY)
    const tamperedTag = Buffer.from(sealed.authTag, 'base64')
    tamperedTag[0] = (tamperedTag[0] ?? 0) ^ 0xFF
    expect(() =>
      decryptToken(
        sealed.ciphertext,
        sealed.nonce,
        tamperedTag.toString('base64'),
        MASTER_KEY,
      ),
    ).toThrow()
  })

  it('throws when the ciphertext is tampered with', () => {
    const sealed = encryptToken('hello', MASTER_KEY)
    const tamperedCipher = Buffer.from(sealed.ciphertext, 'base64')
    tamperedCipher[0] = (tamperedCipher[0] ?? 0) ^ 0xFF
    expect(() =>
      decryptToken(
        tamperedCipher.toString('base64'),
        sealed.nonce,
        sealed.authTag,
        MASTER_KEY,
      ),
    ).toThrow()
  })

  it('timingSafeEqualStrings returns true for equal strings', () => {
    expect(timingSafeEqualStrings('abc123', 'abc123')).toBe(true)
  })

  it('timingSafeEqualStrings returns false for differing strings', () => {
    expect(timingSafeEqualStrings('abc123', 'abc124')).toBe(false)
  })

  it('timingSafeEqualStrings returns false for mismatched lengths', () => {
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStrings('', 'x')).toBe(false)
  })

  it('timingSafeEqualStrings returns true for two empty strings', () => {
    expect(timingSafeEqualStrings('', '')).toBe(true)
  })
})
