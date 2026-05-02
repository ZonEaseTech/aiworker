import process from 'node:process'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { bootstrapDotenv } from './dotenv-bootstrap'

// FEAT-030 dotenv bootstrap wrapper.
//
// PLAN-024 / BUG-021: derived scope must NOT be written back into
// `AIWORKER_HOME`. That env var means an operator explicitly pinned a home.
// Project scope remains cwd-detected by fs-layout for later calls.
//
// Diagnostic/setup commands opt out. `scope` / `doctor` / help / version must be
// non-mutating, `init` chooses home after applying its own mode flags, and
// `gateway install systemd` only renders installer artifacts.
export function shouldBootstrapDotenv(argv: string[]): boolean {
  const args = argv.slice(2)
  if (args.length === 0)
    return false

  if (args.some(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-v'))
    return false

  const command = args[0] ?? ''
  if (
    command === 'scope'
    || command === 'worker scope'
    || command === 'doctor'
    || command === 'worker doctor'
    || command === 'init'
    || command === 'worker init'
    || command === 'gateway install systemd'
  ) {
    return false
  }

  if (command.startsWith('executor ') || command.startsWith('worker executor '))
    return false

  if (
    command === 'soul list'
    || command === 'soul show'
    || command === 'worker soul list'
    || command === 'worker soul show'
  ) {
    return false
  }

  return true
}

export function bootstrapCliDotenv(argv: string[] = process.argv): void {
  if (!shouldBootstrapDotenv(argv))
    return
  const scope = resolveAiworkerScope()
  bootstrapDotenv({ home: scope.home })
}
