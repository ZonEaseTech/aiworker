import type { Context } from 'hono'
import { describe, expect, test } from 'bun:test'
import consola from 'consola'

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

  test('redacts extended provider token shapes before logging unhandled errors', () => {
    const originalError = consola.error

    // Each leakSubstrings entry must be absent from the redacted log. For the PEM
    // block, the base64 key body itself is the secret, so the whole multiline
    // block (not just the header) must be masked.
    const pemBlock = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAabcdef0123456789\n-----END RSA PRIVATE KEY-----'
    const cases: Array<{ label: string, secret: string, leakSubstrings: string[] }> = [
      { label: 'github-pat', secret: 'ghp_0123456789abcdefghijklmnopqrstuvwxyz', leakSubstrings: ['ghp_0123456789abcdefghijklmnopqrstuvwxyz'] },
      { label: 'github-oauth', secret: 'gho_0123456789abcdefghijklmnopqrstuvwxyz', leakSubstrings: ['gho_0123456789abcdefghijklmnopqrstuvwxyz'] },
      { label: 'github-fine-grained', secret: 'github_pat_0123456789abcdefghijklmnopqrstuvwxyz', leakSubstrings: ['github_pat_0123456789abcdefghijklmnopqrstuvwxyz'] },
      { label: 'aws-access-key', secret: 'AKIAIOSFODNN7EXAMPLE', leakSubstrings: ['AKIAIOSFODNN7EXAMPLE'] },
      { label: 'google-api-key', secret: 'AIzaSyA1234567890abcdefghijklmnopqrstuvw', leakSubstrings: ['AIzaSyA1234567890abcdefghijklmnopqrstuvw'] },
      { label: 'jwt', secret: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', leakSubstrings: ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'] },
      { label: 'pem-multiline', secret: pemBlock, leakSubstrings: ['MIIEpAIBAAKCAQEAabcdef0123456789'] },
    ]

    for (const { label, secret, leakSubstrings } of cases) {
      const logs: unknown[][] = []
      consola.error = ((...args: unknown[]) => {
        logs.push(args)
      }) as typeof consola.error
      try {
        const response = errorHandler(new Error(`engine boot failed: ${secret}`), fakeContext())
        expect(response.status).toBe(500)
        const serialized = serializeLogArgs(logs)
        for (const leak of leakSubstrings)
          expect(serialized, label).not.toContain(leak)
        expect(serialized, label).toContain('[REDACTED]')
      }
      finally {
        consola.error = originalError
      }
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
