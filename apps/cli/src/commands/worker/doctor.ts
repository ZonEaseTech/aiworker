import path from 'node:path'
import process from 'node:process'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'

import { validateCapabilityProject } from '../../capabilities/validation'

export async function runDoctor(): Promise<number> {
  const scope = resolveAiworkerScope()
  const root = scope.scope === 'project' && scope.projectRoot
    ? path.join(scope.projectRoot, '.aiworker')
    : scope.home

  const report = await validateCapabilityProject(root)

  process.stdout.write('[aiworker doctor] capability validation\n')
  process.stdout.write(`Scope : ${scope.scope}\n`)
  process.stdout.write(`Root  : ${report.root}\n`)
  process.stdout.write(`Status: ${formatStatus(report.status)}\n`)

  for (const check of report.checks) {
    process.stdout.write(`  ${formatStatus(check.status).padEnd(7)} ${check.label}\n`)
    for (const item of check.issues) {
      const location = item.path ? ` ${item.path}` : ''
      process.stdout.write(`    - [${item.severity}] ${item.code}${location}: ${item.message}\n`)
    }
  }

  return report.status === 'fail' ? 1 : 0
}

function formatStatus(status: string): string {
  return status.toUpperCase()
}
