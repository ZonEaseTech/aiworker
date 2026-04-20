import type { Context } from 'hono'
import consola from 'consola'
import { AppError } from '../lib/app-error'

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.status as 400)
  }

  consola.error('Unhandled error:', err)
  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  }, 500)
}
