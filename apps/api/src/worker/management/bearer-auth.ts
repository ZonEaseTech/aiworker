import type { MiddlewareHandler } from 'hono'
import { timingSafeEqualStrings } from '@zonease/aiworker-core'

export interface BearerAuthIdentity {
  /** Current plaintext bearer token that inbound callers must present. */
  tokenPlaintext: string
}

export interface BearerAuthDeps {
  /**
   * Resolve the current plaintext token each request. Indirected so token
   * rotation can swap the accepted token without rebuilding the middleware.
   */
  getIdentity: () => BearerAuthIdentity
}

/**
 * Bearer-token auth middleware guarding every `/api/worker/*` route. Compares
 * the presented token against the worker's current plaintext token in
 * constant time. See PLAN-004 §Auth model.
 */
export function buildBearerAuth({ getIdentity }: BearerAuthDeps): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header)
      return c.json({ code: 'auth-failed', message: 'missing Authorization header' }, 401)

    const [scheme, presented] = header.split(/\s+/, 2)
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !presented)
      return c.json({ code: 'auth-failed', message: 'expected Bearer scheme' }, 401)

    const { tokenPlaintext } = getIdentity()
    if (!tokenPlaintext || !timingSafeEqualStrings(presented, tokenPlaintext))
      return c.json({ code: 'auth-failed', message: 'invalid bearer token' }, 401)

    await next()
  }
}
