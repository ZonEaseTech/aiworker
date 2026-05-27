import type { Context } from 'hono'
import consola from 'consola'
import { describe, expect, test } from 'bun:test'

import { errorHandler } from './error-handler'

describe('host daemon error handler', () => {
  test('redacts secret-like values before logging unhandled errors', () => {
    const originalError = consola.error
    const logs: unknown[][] = []
    consola.error = ((...args: unknown[]) => {
      logs.push(args)
    }) as typeof consola.error

    try {
      const response = errorHandler(new Error('token=sk-error-handler-secret'), fakeContext())

      expect(response.status).toBe(500)
      const serialized = serializeLogArgs(logs)
      expect(serialized).not.toContain('sk-error-handler-secret')
      expect(serialized).toContain('[REDACTED]')
    }
    finally {
      consola.error = originalError
    }
  })
})

function fakeContext(): Context {
  return {
    json(body: unknown, status?: number) {
      return Response.json(body, { status })
    },
  } as unknown as Context
}

function serializeLogArgs(logs: unknown[][]): string {
  return logs
    .flat()
    .map((item) => {
      if (item instanceof Error)
        return `${item.message}\n${item.stack ?? ''}`
      return typeof item === 'string' ? item : JSON.stringify(item)
    })
    .join('\n')
}
