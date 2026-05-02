import type { AiworkerScopeResult } from '@zonease/aiworker-fs-layout'
import type { CapabilityDoctorReport } from '../../capabilities/validation'
import type { ExecutorReadinessReport } from './executor'
import type { InitOptions } from './init'
import type { ServeOptions } from './serve'

import path from 'node:path'
import process from 'node:process'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import consola from 'consola'

import { validateCapabilityProject } from '../../capabilities/validation'
import { inspectExecutorReadiness } from './executor'
import { runInit } from './init'
import { runServe } from './serve'

export interface UpOptions {
  dryRun?: boolean
  gateway?: string
  gatewayReconnect?: boolean
  gatewayToken?: string
  host?: string
  open?: boolean
  port?: number
  runtimeVersion?: string
  serveWeb?: boolean
  soul?: string
}

interface UpDeps {
  cwd?: () => string
  inspectExecutorReadiness?: () => Promise<
    | { code: number, ok: false }
    | { ok: true, report: ExecutorReadinessReport }
  >
  resolveScope?: () => AiworkerScopeResult
  runInit?: (options?: InitOptions) => Promise<number>
  runServe?: (options?: ServeOptions) => Promise<void>
  validateCapabilityProject?: (root: string) => Promise<CapabilityDoctorReport>
  write?: (text: string) => void
}

interface UpPlan {
  initialScope: AiworkerScopeResult
  kind: 'brand-new-project' | 'explicit' | 'project'
  projectRoot?: string
}

/**
 * `aiworker up` is the local worker quick start path: initialize if needed,
 * validate project capability drafts, report executor-native readiness, then
 * hand off to the existing foreground `serve` lifecycle.
 */
export async function runUp(options: UpOptions = {}, deps: UpDeps = {}): Promise<number> {
  const write = deps.write ?? ((text: string) => process.stdout.write(text))
  const resolveScope = deps.resolveScope ?? resolveAiworkerScope
  const runInitStep = deps.runInit ?? runInit
  const runServeStep = deps.runServe ?? runServe
  const validateProject = deps.validateCapabilityProject ?? validateCapabilityProject
  const inspectExecutor = deps.inspectExecutorReadiness ?? inspectExecutorReadiness

  const initialScope = resolveScope()
  const plan = buildUpPlan(initialScope, deps.cwd?.() ?? process.cwd())
  printScopeStage(write, plan)

  if (options.soul !== undefined && plan.kind !== 'brand-new-project') {
    consola.error('[aiworker up] --soul is only used when creating a brand-new project; omit it for initialized project or explicit scope')
    return 2
  }

  const initCode = await runInitStage(write, plan, options, runInitStep)
  if (initCode !== 0)
    return initCode

  if (options.dryRun === true && plan.kind === 'brand-new-project') {
    write('[aiworker up] stage 3/5 worker validation\n')
    write('  skipped: brand-new project dry-run did not materialize `.aiworker/`.\n')
    write('[aiworker up] stage 4/5 executor readiness\n')
    write('  skipped: brand-new project dry-run did not materialize executor-capabilities.json.\n')
    printServeStage(write, options, true)
    return 0
  }

  const activeScope = resolveScope()
  const validationCode = await runValidationStage(write, activeScope, validateProject)
  if (validationCode !== 0)
    return validationCode

  await runExecutorReadinessStage(write, activeScope, inspectExecutor)
  printServeStage(write, options, options.dryRun === true)
  if (options.dryRun === true)
    return 0

  await runServeStep(buildServeOptions(options))
  return 0
}

function buildUpPlan(initialScope: AiworkerScopeResult, cwd: string): UpPlan {
  if (initialScope.scope === 'project' && initialScope.projectRoot) {
    return {
      initialScope,
      kind: 'project',
      projectRoot: initialScope.projectRoot,
    }
  }
  if (initialScope.scope === 'explicit') {
    return {
      initialScope,
      kind: 'explicit',
    }
  }
  return {
    initialScope,
    kind: 'brand-new-project',
    projectRoot: path.resolve(cwd),
  }
}

function printScopeStage(write: (text: string) => void, plan: UpPlan): void {
  write('[aiworker up] stage 1/5 resolve scope\n')
  if (plan.kind === 'brand-new-project') {
    write('Scope        : brand-new-project\n')
    write(`Project root : ${plan.projectRoot}\n`)
    write('Source       : cwd (no existing project `.aiworker/` and no AIWORKER_HOME override)\n')
    return
  }

  write(`Scope        : ${plan.initialScope.scope}\n`)
  write(`Home         : ${plan.initialScope.home}\n`)
  write(`Source       : ${plan.initialScope.source}\n`)
  if (plan.projectRoot)
    write(`Project root : ${plan.projectRoot}\n`)
}

async function runInitStage(
  write: (text: string) => void,
  plan: UpPlan,
  options: UpOptions,
  runInitStep: (options?: InitOptions) => Promise<number>,
): Promise<number> {
  write('[aiworker up] stage 2/5 init if needed\n')
  if (plan.kind === 'brand-new-project')
    write('Mode         : create project-scope worker layout if preflight passes\n')
  else
    write('Mode         : preserve existing worker layout and bootstrap missing local state\n')

  const initOptions: InitOptions = {}
  if (options.dryRun === true)
    initOptions.dryRun = true
  if (options.soul !== undefined)
    initOptions.soul = options.soul
  return runInitStep(initOptions)
}

async function runValidationStage(
  write: (text: string) => void,
  scope: AiworkerScopeResult,
  validateProject: (root: string) => Promise<CapabilityDoctorReport>,
): Promise<number> {
  write('[aiworker up] stage 3/5 worker validation\n')
  if (scope.scope !== 'project' || !scope.projectRoot) {
    write(`  skipped: ${scope.scope} scope has no project capability drafts.\n`)
    return 0
  }

  const report = await validateProject(path.join(scope.projectRoot, '.aiworker'))
  printCapabilityReport(write, report)
  if (report.status === 'fail') {
    consola.error('[aiworker up] worker validation failed; fix `aiworker doctor` errors before starting the worker')
    return 1
  }
  return 0
}

async function runExecutorReadinessStage(
  write: (text: string) => void,
  scope: AiworkerScopeResult,
  inspectExecutor: () => Promise<
    | { code: number, ok: false }
    | { ok: true, report: ExecutorReadinessReport }
  >,
): Promise<void> {
  write('[aiworker up] stage 4/5 executor readiness\n')
  if (scope.scope !== 'project' || !scope.projectRoot) {
    write(`  skipped: ${scope.scope} scope has no project executor capability manifest.\n`)
    return
  }

  const readiness = await inspectExecutor()
  if (!readiness.ok) {
    write('  WARN    executor readiness is only available in project scope\n')
    return
  }
  printExecutorReport(write, readiness.report)
  if (readiness.report.status !== 'pass')
    write('  Next    : run `aiworker executor doctor` for strict executor-native diagnostics.\n')
}

function printServeStage(write: (text: string) => void, options: UpOptions, dryRun: boolean): void {
  write('[aiworker up] stage 5/5 serve\n')
  if (!dryRun) {
    write('  starting worker HTTP/admin via existing `aiworker serve` lifecycle\n')
    return
  }

  write('  dry-run: server not started and browser not opened\n')
  write(`  port         : ${options.port ?? '(env/default)'}\n`)
  write(`  host         : ${options.host ?? '(env/default)'}\n`)
  write(`  gateway      : ${options.gateway ?? '(none/env)'}\n`)
  write(`  serve web    : ${options.serveWeb === false ? 'false' : 'true/env'}\n`)
  write(`  open browser : ${options.open === undefined ? '(tty/default)' : String(options.open)}\n`)
}

function printCapabilityReport(write: (text: string) => void, report: CapabilityDoctorReport): void {
  write(`Root  : ${report.root}\n`)
  write(`Status: ${formatStatus(report.status)}\n`)
  for (const check of report.checks) {
    write(`  ${formatStatus(check.status).padEnd(7)} ${check.label}\n`)
    for (const item of check.issues) {
      const location = item.path ? ` ${item.path}` : ''
      write(`    - [${item.severity}] ${item.code}${location}: ${item.message}\n`)
    }
  }
}

function printExecutorReport(write: (text: string) => void, report: ExecutorReadinessReport): void {
  write(`Root  : ${report.root}\n`)
  write(`File  : ${report.file}\n`)
  write(`Status: ${formatStatus(report.status)} (non-blocking)\n`)
  if (report.engines.length === 0)
    write('  PASS    no executor capabilities declared\n')
  for (const item of report.engines) {
    const status = item.binaryFound ? 'PASS' : 'WARN'
    write(`  ${status.padEnd(7)} ${item.engine} (binary: ${item.binary}, mcp: ${item.mcpCount})\n`)
  }
  for (const issue of report.issues)
    write(`    - [${issue.severity}] ${issue.code} ${issue.path}: ${issue.message}\n`)
}

function buildServeOptions(options: UpOptions): ServeOptions {
  const serveOptions: ServeOptions = {}
  if (options.port !== undefined)
    serveOptions.port = options.port
  if (options.host !== undefined)
    serveOptions.host = options.host
  if (options.gateway !== undefined)
    serveOptions.gateway = options.gateway
  if (options.gatewayToken !== undefined)
    serveOptions.gatewayToken = options.gatewayToken
  if (options.gatewayReconnect !== undefined)
    serveOptions.gatewayReconnect = options.gatewayReconnect
  if (options.serveWeb !== undefined)
    serveOptions.serveWeb = options.serveWeb
  if (options.open !== undefined)
    serveOptions.open = options.open
  if (options.runtimeVersion !== undefined)
    serveOptions.runtimeVersion = options.runtimeVersion
  return serveOptions
}

function formatStatus(status: string): string {
  return status.toUpperCase()
}
