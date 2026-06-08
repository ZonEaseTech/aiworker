import type { Context } from 'hono'
import { SECRET_FORMAT_ALTERNATION } from '@zonease/aiworker-engine-bridge'
import { AppError } from '@zonease/aiworker-soul-descriptor'
import consola from 'consola'

const SECRET_ASSIGNMENT_RE = /(["']?[\w-]*(?:api[_-]?key|authorization|password|secret|token)[\w-]*["']?\s*[:=]\s*["']?)([^"'\s]+)/gi
// Value-format coverage (PEM/JWT/ghp_/gho_/github_pat_/AKIA/AIza) is sourced from
// the shared engine-bridge alternation so diagnostic redaction and display
// redaction cannot drift; Bearer/sk- bare tokens are appended for diagnostics.
const SECRET_VALUE_RE = new RegExp(`${SECRET_FORMAT_ALTERNATION}|\\b(?:Bearer\\s+[\\w.~+/-]{12,}|sk-[\\w-]{8,})\\b`, 'gi')

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
