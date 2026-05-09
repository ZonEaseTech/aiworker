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

  const commandLine = args.join(' ')
  const startsWithCommand = (...parts: string[]) => {
    const prefix = parts.join(' ')
    return commandLine === prefix || commandLine.startsWith(`${prefix} `)
  }
  if (
    startsWithCommand('scope')
    || startsWithCommand('worker', 'scope')
    || startsWithCommand('doctor')
    || startsWithCommand('worker', 'doctor')
    || startsWithCommand('commands')
    || startsWithCommand('env', 'gateway-url')
    || startsWithCommand('env', 'display-name')
    || startsWithCommand('worker', 'env', 'gateway-url')
    || startsWithCommand('worker', 'env', 'display-name')
    || startsWithCommand('init')
    || startsWithCommand('worker', 'init')
    || startsWithCommand('up')
    || startsWithCommand('worker', 'up')
    || startsWithCommand('gateway', 'install', 'systemd')
  ) {
    return false
  }

  if (startsWithCommand('executor') || startsWithCommand('worker', 'executor'))
    return false

  if (
    startsWithCommand('soul', 'list')
    || startsWithCommand('soul', 'show')
    || startsWithCommand('worker', 'soul', 'list')
    || startsWithCommand('worker', 'soul', 'show')
    || startsWithCommand('pack', 'list')
    || startsWithCommand('pack', 'show')
    || startsWithCommand('worker', 'pack', 'list')
    || startsWithCommand('worker', 'pack', 'show')
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
