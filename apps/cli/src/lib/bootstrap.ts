import process from 'node:process'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { bootstrapDotenv } from './dotenv-bootstrap'

// FEAT-030 dotenv bootstrap wrapper.
//
// PLAN-024 / BUG-021: derived scope must NOT be written back into
// `AIWORKER_HOME`. That env var means an operator explicitly pinned a home.
// Project scope remains cwd-detected by fs-layout for later calls.
//
// Diagnostic/setup commands opt out. `doctor` / help / version must be
// non-mutating, and `init` chooses home before applying its own writes.
export function shouldBootstrapDotenv(argv: string[]): boolean {
  const args = argv.slice(2)
  if (args.length === 0)
    return false

  if (args.some(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-v'))
    return false

  const commandLine = args.join(' ')
  const startsWithCommand = (...parts: string[]) => {
    const prefix = parts.join(' ')
    return commandLine === prefix || commandLine.startsWith(`${prefix} `)
  }
  if (
    startsWithCommand('doctor')
    || startsWithCommand('commands')
    || startsWithCommand('init')
    || startsWithCommand('daemon')
  ) {
    return false
  }

  if (startsWithCommand('executor'))
    return false

  if (
    startsWithCommand('pack', 'list')
    || startsWithCommand('pack', 'show')
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
