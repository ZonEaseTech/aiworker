import type { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { WORKER_ID_ALPHABET } from '@aiworker/shared'

/** Crockford base32 encoder that emits the exact number of characters requested. */
function encodeBase32(bytes: Buffer, outputLen: number): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < bytes.length && output.length < outputLen; i += 1) {
    value = (value << 8) | bytes[i]!
    bits += 8
    while (bits >= 5 && output.length < outputLen) {
      output += WORKER_ID_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return output.padEnd(outputLen, '0')
}

/** Mint a new worker id (`w_` + 12 Crockford base32 chars). */
export function mintWorkerId(): string {
  const raw = randomBytes(10)
  return `w_${encodeBase32(raw, 12)}`
}

/** Slugify a name into a URL-safe, lowercase slug. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
