import type { MiddlewareHandler } from 'hono'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

export interface DashboardAuthOptions {
  /** Shared secret compared against Bearer token and Basic password. */
  secret: string
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length)
    return false
  return timingSafeEqual(bufA, bufB)
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: { code: 'auth-required', message: 'Authorization required' } }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Basic realm="AIWorker", charset="UTF-8"',
      },
    },
  )
}

/**
 * Guards dashboard HTTP endpoints with a single shared secret. Accepts two
 * credential shapes both backed by `INTERNAL_SHARED_SECRET`:
 *
 *   - `Authorization: Bearer <secret>` — service-to-service callers (CI,
 *     deploy scripts, smoke tests).
 *   - `Authorization: Basic base64(user:<secret>)` — browsers honour the
 *     native WWW-Authenticate prompt without a bespoke login UI; the username
 *     is ignored.
 *
 * All failures emit `401 { code: 'auth-required' }` + `WWW-Authenticate: Basic`
 * so browsers re-prompt. See PLAN-010 §P1.
 */
export function buildDashboardAuth({ secret }: DashboardAuthOptions): MiddlewareHandler {
  if (!secret)
    throw new Error('buildDashboardAuth: secret is required')

  return async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header)
      return unauthorized()

    const [scheme, credential] = header.split(/\s+/, 2)
    if (!scheme || !credential)
      return unauthorized()

    const lower = scheme.toLowerCase()
    if (lower === 'bearer') {
      if (timingSafeEqualStrings(credential, secret))
        return next()
      return unauthorized()
    }
    if (lower === 'basic') {
      let decoded: string
      try {
        decoded = Buffer.from(credential, 'base64').toString('utf8')
      }
      catch {
        return unauthorized()
      }
      const idx = decoded.indexOf(':')
      if (idx < 0)
        return unauthorized()
      const presented = decoded.slice(idx + 1)
      if (timingSafeEqualStrings(presented, secret))
        return next()
      return unauthorized()
    }
    return unauthorized()
  }
}
