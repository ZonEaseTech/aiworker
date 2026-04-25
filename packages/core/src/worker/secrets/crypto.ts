import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison. Returns false on length mismatch without
 * invoking `timingSafeEqual` (which throws on mismatched lengths). Kept local
 * to the worker side so `apps/api/src/worker/**` does not depend on gateway
 * crypto — master key 物理隔离,见 CLAUDE.md §Architecture Constraints。
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length)
    return false
  return timingSafeEqual(bufA, bufB)
}
