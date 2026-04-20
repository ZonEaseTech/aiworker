import type { MiddlewareHandler } from 'hono'
import consola from 'consola'

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now()
  await next()
  const duration = Math.round(performance.now() - start)
  consola.info(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`)
}
