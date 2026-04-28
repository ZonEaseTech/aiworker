// FEAT-030: side-effect-only entrypoint.
// CLI entry (apps/cli/src/aiworker.ts) imports this before business modules so
// commands that need worker/gateway secrets can load or mint `.env` first.
//
// PLAN-024 / BUG-021: derived scope must NOT be written back into
// `AIWORKER_HOME`. That env var means an operator explicitly pinned a home.
// Project scope remains cwd-detected by fs-layout for later calls.
//
// Diagnostic commands and `init` opt out. `scope` / help / version must be
// non-mutating, and `init` needs to choose the home after applying its own mode
// flags (`--global`, explicit env, existing project, or brand-new project).
import process from 'node:process'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { bootstrapDotenv } from './dotenv-bootstrap'

function shouldBootstrapDotenv(argv: string[]): boolean {
  const args = argv.slice(2)
  if (args.length === 0)
    return false

  if (args.some(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-v'))
    return false

  const command = args[0]
  if (command === 'scope' || command === 'init')
    return false

  return true
}

if (shouldBootstrapDotenv(process.argv)) {
  const scope = resolveAiworkerScope()
  bootstrapDotenv({ home: scope.home })
}
