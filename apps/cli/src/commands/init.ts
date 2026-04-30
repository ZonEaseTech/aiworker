import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { ensureProjectAiworker, resolveAiworkerScope, resolveProjectRoot } from '@zonease/aiworker-fs-layout'
import consola from 'consola'

import { loadWorkerContext } from '../context'
import { bootstrapDotenv } from '../lib/dotenv-bootstrap'

export interface InitOptions {
  /** Force user-scope at `~/.aiworker/`. Skips cwd project detection. */
  global?: boolean
  /** Backward-compatible flag. Project init is allowed outside git by default. */
  force?: boolean
  /** Preview planned writes without creating or modifying any file. */
  dryRun?: boolean
}

interface PreflightReport {
  applyLabel: string
  create: string[]
  notes: string[]
  preserve: string[]
  requiresAction: string[]
  scope: 'explicit' | 'project' | 'user'
  targetHome: string
  targetProject?: string
}

const PROJECT_TEMPLATE_PATHS = [
  '.aiworker/',
  '.aiworker/AGENT.md',
  '.aiworker/SOUL.md',
  '.aiworker/USER.md',
  '.aiworker/MEMORY.md',
  '.aiworker/ROLLUP.md',
  '.aiworker/mcp.json',
  '.aiworker/.gitignore',
  '.aiworker/skills/',
  '.aiworker/memories/',
  '.aiworker/local/',
  '.aiworker/local/.gitignore',
  '.aiworker/local/workspaces/',
] as const

const PROJECT_BOOTSTRAP_STATE_PATHS = [
  '.aiworker/local/.env',
  '.aiworker/local/worker.db',
] as const

const PROJECT_EXISTING_LOCAL_STATE_PATHS = [
  '.aiworker/local/identity.json',
] as const

const EXTERNAL_AGENT_PATHS: Array<{ path: string, type: 'directory' | 'file' }> = [
  { path: 'AGENTS.md', type: 'file' },
  { path: 'CLAUDE.md', type: 'file' },
  { path: '.agents/', type: 'directory' },
  { path: '.claude/', type: 'directory' },
]

/**
 * `aiworker init` — bootstrap worker.db, mint identity + token on first
 * boot, seed default config.
 *
 * Project-scope (default, PLAN-023): create `<cwd>/.aiworker/` without
 * requiring git, then materialise the worker under `<cwd>/.aiworker/local/`.
 * The bootstrap runs idempotently — re-running on an already-initialised vault
 * keeps the same identity and prints no extra token.
 *
 * `--global` falls back to the user-scope `~/.aiworker/` layout (legacy
 * single-host single-worker form). `--force` is retained for older scripts but
 * does not overwrite existing files.
 */
export async function runInit(options: InitOptions = {}): Promise<void> {
  if (options.global === true) {
    const home = path.join(homedir(), '.aiworker')
    const report = buildUserScopePreflight(home, options)
    printPreflightReport(report)
    if (options.dryRun === true)
      return

    process.env.AIWORKER_HOME = home
    bootstrapDotenv({ home })
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] user-scope worker ${ctx.workerId} ready (config v${ctx.configVersion})`)
    return
  }

  // Honour an explicit operator override (CLI flag / env). When the operator
  // has pinned AIWORKER_HOME we don't second-guess them — drop straight into
  // the legacy bootstrap.
  const scope = resolveAiworkerScope()
  if (scope.scope === 'explicit') {
    const report = buildUserScopePreflight(scope.home, { ...options, scope: 'explicit' })
    printPreflightReport(report)
    if (options.dryRun === true)
      return

    bootstrapDotenv({ home: scope.home })
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] explicit-scope worker ${ctx.workerId} ready (${scope.home})`)
    return
  }

  const cwd = process.cwd()

  // Already initialised → idempotent re-init. The side-effect bootstrap has
  // already aimed AIWORKER_HOME at the existing local/ via resolveAiworkerScope.
  const existingRoot = resolveProjectRoot(cwd)
  if (existingRoot) {
    const report = buildProjectPreflight(existingRoot, options)
    printPreflightReport(report)
    if (options.dryRun === true)
      return

    await ensureProjectAiworker(existingRoot)
    bootstrapDotenv({ home: path.join(existingRoot, '.aiworker', 'local') })
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${existingRoot})`)
    return
  }

  const report = buildProjectPreflight(cwd, { ...options, gitRepoDetected: isGitRepo(cwd) })
  printPreflightReport(report)
  if (options.dryRun === true)
    return

  await ensureProjectAiworker(cwd)
  // `init` owns dotenv bootstrap, so a brand-new project mints or persists
  // exactly one project-local secret set and never creates a user-scope
  // fallback first. Preserve operator-provided master/shared secrets: later
  // commands also let explicit env override `.env`, so changing the value here
  // would make the freshly written worker_identity row undecryptable.
  const projectLocal = path.join(cwd, '.aiworker', 'local')
  delete process.env.AIWORKER_HOME
  bootstrapDotenv({ home: projectLocal })
  const ctx = await loadWorkerContext()
  consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${cwd})`)
}

function isGitRepo(cwd: string): boolean {
  let cur = path.resolve(cwd)
  while (true) {
    if (existsSync(path.join(cur, '.git')))
      return true
    const parent = path.dirname(cur)
    if (parent === cur)
      return false
    cur = parent
  }
}

function buildProjectPreflight(
  projectRoot: string,
  options: InitOptions & { gitRepoDetected?: boolean },
): PreflightReport {
  const root = path.resolve(projectRoot)
  const create: string[] = []
  const notes: string[] = []
  const preserve: string[] = []
  const requiresAction: string[] = []

  for (const relative of PROJECT_TEMPLATE_PATHS) {
    const display = `${relative}${existsSync(path.join(root, relative)) ? ' (existing aiworker layout)' : ''}`
    if (existsSync(path.join(root, relative)))
      preserve.push(display)
    else
      create.push(relative)
  }

  for (const relative of PROJECT_BOOTSTRAP_STATE_PATHS) {
    if (existsSync(path.join(root, relative)))
      preserve.push(`${relative} (existing local state)`)
    else
      create.push(`${relative} (worker bootstrap)`)
  }

  for (const relative of PROJECT_EXISTING_LOCAL_STATE_PATHS) {
    if (existsSync(path.join(root, relative)))
      preserve.push(`${relative} (existing local state)`)
  }

  for (const item of EXTERNAL_AGENT_PATHS) {
    const relative = item.path
    const absolute = path.join(root, relative)
    if (existsSync(absolute)) {
      requiresAction.push(
        `${relative} (external agent ${item.type}; not modified, future adopt/merge candidate)`,
      )
    }
  }

  if (options.gitRepoDetected === false) {
    notes.push('No git repository detected; aiworker will still create project-local state in the current directory.')
    notes.push('Run from the directory that should own this worker, or use --global for a host-wide worker.')
  }

  if (options.force === true)
    notes.push('--force is accepted for compatibility; init remains idempotent and does not overwrite existing files.')

  return {
    applyLabel: options.dryRun === true ? 'dry-run (no files will be written)' : 'apply',
    create,
    notes,
    preserve,
    requiresAction,
    scope: 'project',
    targetHome: path.join(root, '.aiworker', 'local'),
    targetProject: root,
  }
}

function buildUserScopePreflight(
  home: string,
  options: InitOptions & { scope?: 'explicit' | 'user' },
): PreflightReport {
  const root = path.resolve(home)
  const create: string[] = []
  const preserve: string[] = []
  const paths = [
    '.env',
    'worker.db',
    'workers/',
  ] as const

  for (const relative of paths) {
    if (existsSync(path.join(root, relative)))
      preserve.push(`${relative} (existing user-scope state)`)
    else
      create.push(`${relative} (worker bootstrap)`)
  }

  return {
    applyLabel: options.dryRun === true ? 'dry-run (no files will be written)' : 'apply',
    create,
    notes: [],
    preserve,
    requiresAction: [],
    scope: options.scope ?? 'user',
    targetHome: root,
  }
}

function printPreflightReport(report: PreflightReport): void {
  const header = [
    `[aiworker init] preflight (${report.scope}-scope)`,
    report.targetProject ? `Project root : ${report.targetProject}` : null,
    `Home         : ${report.targetHome}`,
    `Mode         : ${report.applyLabel}`,
  ].filter((line): line is string => line !== null)

  process.stdout.write(`${header.join('\n')}\n`)
  printPreflightSection('Will create', report.create)
  printPreflightSection('Will preserve', report.preserve)
  printPreflightSection('Notes', report.notes)
  printPreflightSection('Needs explicit action', report.requiresAction)
}

function printPreflightSection(title: string, items: string[]): void {
  process.stdout.write(`${title}:\n`)
  if (items.length === 0) {
    process.stdout.write('  - none\n')
    return
  }
  for (const item of items)
    process.stdout.write(`  - ${item}\n`)
}
