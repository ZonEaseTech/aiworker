import type { Context } from 'hono'
import { AppError } from '@zonease/aiworker-soul-protocol'
import consola from 'consola'

const SECRET_ASSIGNMENT_RE = /(["']?[\w-]*(?:api[_-]?key|authorization|password|secret|token)[\w-]*["']?\s*[:=]\s*["']?)([^"'\s]+)/gi
const SECRET_VALUE_RE = /-----BEGIN[A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----)?|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:Bearer\s+[\w.~+/-]{12,}|sk-[\w-]{8,}|ghp_\w{20,}|gho_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{35,})\b/gi

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.status as 400)
  }

  consola.error('Unhandled error:', redactUnhandledError(err))
  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  }, 500)
}

function redactUnhandledError(err: Error): string {
  return redactDiagnosticMessage(`${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ''}`)
}

function redactDiagnosticMessage(message: string): string {
  return message
    .replace(SECRET_ASSIGNMENT_RE, '$1[REDACTED]')
    .replace(SECRET_VALUE_RE, '[REDACTED]')
}
