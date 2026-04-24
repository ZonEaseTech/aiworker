import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Gateway 侧 AES-256-GCM helpers — 用于把 operator 注册时拿到的 worker bearer
 * token 在 `fleet.db.registered_workers` 里落库加密保存。
 *
 * 与 worker 侧 `SecretsVault` 的 AES-GCM shape 有意重复实现（约束见
 * CLAUDE.md §Architecture Constraints §加密与认证）：
 * - 两侧 master key 物理隔离（gateway 持有 fleet 层 master key，worker 持有
 *   自己的 vault master key），抽出来共享模块反而会诱导混用；
 * - dashboard 迁至 gateway（PLAN-013 S5）时，算法 / nonce 字节数 / base64 编
 *   码必须与旧 dashboard `crypto.ts` 一致，否则旧 fleet.db 数据无法解密。
 */

const ALGO = 'aes-256-gcm'
const NONCE_BYTES = 12
const KEY_BYTES = 32
const MASTER_KEY_PATTERN = /^[0-9a-f]{64}$/

export interface SealedToken {
  ciphertext: string
  nonce: string
  authTag: string
}

function decodeMasterKey(masterKeyHex: string): Buffer {
  if (!MASTER_KEY_PATTERN.test(masterKeyHex))
    throw new Error('Gateway AIWORKER_MASTER_KEY must be 32-byte hex')
  const key = Buffer.from(masterKeyHex, 'hex')
  if (key.length !== KEY_BYTES)
    throw new Error('Gateway AIWORKER_MASTER_KEY must be 32-byte hex')
  return key
}

export function encryptToken(token: string, masterKeyHex: string): SealedToken {
  const key = decodeMasterKey(masterKeyHex)
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGO, key, nonce)
  const buf = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: buf.toString('base64'),
    nonce: nonce.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

export function decryptToken(
  ciphertext: string,
  nonce: string,
  authTag: string,
  masterKeyHex: string,
): string {
  const key = decodeMasterKey(masterKeyHex)
  const decipher = createDecipheriv(ALGO, key, Buffer.from(nonce, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const buf = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])
  return buf.toString('utf8')
}

/** 常量时间字符串比较（长度不一致立刻返回 false）。 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length)
    return false
  return timingSafeEqual(bufA, bufB)
}
