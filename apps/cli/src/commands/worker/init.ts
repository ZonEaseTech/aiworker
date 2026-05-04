import type { ProjectAiworkerSeed } from '@zonease/aiworker-fs-layout'
import type { InitSoulId, SelectedSoul } from '../../soul/presets'

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

import { ensureProjectAiworker, resolveAiworkerScope, resolveProjectRoot } from '@zonease/aiworker-fs-layout'
import { buildScopeManifest, createBuiltinSoulRegistry } from '@zonease/aiworker-shared'
import consola from 'consola'

import { loadWorkerContext } from '../../context'
import { bootstrapDotenv } from '../../lib/dotenv-bootstrap'
import {
  BUILTIN_SOUL_PRESETS,
  CUSTOMIZE_SOUL_ID,
  findBuiltinSoul,
  supportedSoulIds,
  toSelectedSoul,
} from '../../soul/presets'

const BUILTIN_SOUL_REGISTRY = createBuiltinSoulRegistry()

export interface InitOptions {
  /** Force user-scope at `~/.aiworker/`. Skips cwd project detection. */
  global?: boolean
  /** Backward-compatible flag. Project init is allowed outside git by default. */
  force?: boolean
  /** Preview planned writes without creating or modifying any file. */
  dryRun?: boolean
  /** Project Soul preset id. Required for non-interactive brand-new project init. */
  soul?: string
}

interface PreflightReport {
  applyLabel: string
  create: string[]
  notes: string[]
  preserve: string[]
  requiresAction: string[]
  scope: 'explicit' | 'project' | 'user'
  soul?: SelectedSoul
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
  '.aiworker/policy.json',
  '.aiworker/toolsets.json',
  '.aiworker/capability-packs.json',
  '.aiworker/executor-capabilities.json',
  '.aiworker/scope.json',
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

function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function printInitUsageError(message: string): number {
  consola.error(`[aiworker init] ${message}`)
  return 2
}

interface ResolveSoulResult {
  code?: number
  soul?: SelectedSoul
}

async function resolveOptionalProjectSoul(options: InitOptions): Promise<ResolveSoulResult> {
  if (options.soul === undefined)
    return {}
  return resolveProjectSoulFromValue(options.soul, 'flag')
}

async function resolveRequiredProjectSoul(
  options: InitOptions,
  context = 'brand-new project init',
): Promise<ResolveSoulResult> {
  if (options.soul !== undefined)
    return resolveProjectSoulFromValue(options.soul, 'flag')

  if (!isInteractiveTerminal()) {
    return {
      code: printInitUsageError(`${context} requires a Soul preset in non-interactive mode; pass --soul <preset>. Available presets: ${supportedSoulIds()}`),
    }
  }

  const soul = await promptForSoul()
  if (!soul)
    return { code: printInitUsageError('Soul selection was cancelled') }
  return { soul }
}

async function resolveProjectSoulFromValue(value: string, source: SelectedSoul['source']): Promise<ResolveSoulResult> {
  const normalized = value.trim()
  if (normalized === CUSTOMIZE_SOUL_ID) {
    if (!isInteractiveTerminal()) {
      return {
        code: printInitUsageError('customize requires an interactive terminal; use a built-in preset such as --soul developer in non-interactive mode'),
      }
    }
    const soul = await promptForCustomSoul(source)
    if (!soul)
      return { code: printInitUsageError('customize flow was cancelled') }
    return { soul }
  }

  const preset = findBuiltinSoul(normalized)
  if (!preset) {
    return {
      code: printInitUsageError(`unknown Soul preset "${value}". Available presets: ${supportedSoulIds()}`),
    }
  }
  return { soul: toSelectedSoul(preset, source) }
}

function parseSoulAnswer(answer: string): InitSoulId | null {
  const normalized = answer.trim()
  if (normalized.length === 0)
    return 'developer'

  const asNumber = Number.parseInt(normalized, 10)
  if (Number.isInteger(asNumber) && String(asNumber) === normalized) {
    const ids: InitSoulId[] = [...BUILTIN_SOUL_PRESETS.map(preset => preset.id), CUSTOMIZE_SOUL_ID]
    return ids[asNumber - 1] ?? null
  }

  if (normalized === CUSTOMIZE_SOUL_ID)
    return CUSTOMIZE_SOUL_ID
  return findBuiltinSoul(normalized)?.id ?? null
}

async function promptForSoul(): Promise<SelectedSoul | null> {
  process.stdout.write('[aiworker init] Select a Soul preset before worker identity is created:\n')
  BUILTIN_SOUL_PRESETS.forEach((preset, index) => {
    process.stdout.write(`  ${index + 1}. ${preset.id} - ${preset.description}\n`)
  })
  process.stdout.write(`  ${BUILTIN_SOUL_PRESETS.length + 1}. ${CUSTOMIZE_SOUL_ID} - 自定义职责、边界、沟通风格和风险策略。\n`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = parseSoulAnswer(await rl.question('Soul preset [developer]: '))
      if (id === null) {
        process.stdout.write(`Unsupported preset. Available presets: ${supportedSoulIds()}\n`)
        continue
      }
      if (id === CUSTOMIZE_SOUL_ID) {
        rl.close()
        return promptForCustomSoul('interactive')
      }
      const preset = findBuiltinSoul(id)
      if (preset)
        return toSelectedSoul(preset, 'interactive')
    }
    return null
  }
  finally {
    rl.close()
  }
}

function splitList(input: string, fallback: string[]): string[] {
  const values = input
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0)
  return values.length > 0 ? values : fallback
}

function yesByDefault(input: string): boolean {
  const normalized = input.trim().toLowerCase()
  return normalized === '' || normalized === 'y' || normalized === 'yes' || normalized === '1' || normalized === 'true'
}

async function promptForCustomSoul(source: SelectedSoul['source']): Promise<SelectedSoul | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const responsibility = (await rl.question('主要职责是什么？')).trim()
    if (responsibility.length === 0)
      return null

    const boundaries = splitList(
      await rl.question('明确不该做什么？用逗号分隔 [不执行未授权高风险操作, 不保存无关个人信息]: '),
      ['不执行未授权高风险操作', '不保存无关个人信息'],
    )
    const outOfScope = (await rl.question('遇到职责外任务时如何处理？[说明边界并给出 handoff proposal]: ')).trim()
      || '说明边界并给出 handoff proposal'
    const communicationStyle = (await rl.question('默认沟通风格是什么？[简洁、直接、证据优先]: ')).trim()
      || '简洁、直接、证据优先'
    const highRiskRequiresApproval = yesByDefault(await rl.question('高风险操作是否必须 approval？[Y/n]: '))
    const packs = splitList(await rl.question('默认 capability packs？用逗号分隔 [general]: '), ['general'])
    const toolsets = splitList(await rl.question('默认 toolsets？用逗号分隔 [filesystem-read,note-draft]: '), ['filesystem-read', 'note-draft'])

    return {
      id: CUSTOMIZE_SOUL_ID,
      label: 'Custom',
      description: responsibility,
      responsibilities: [responsibility],
      boundaries,
      communicationStyle,
      highRiskRequiresApproval,
      riskPolicy: highRiskRequiresApproval ? '高风险操作必须先获得明确 approval。' : '低风险动作可直接执行，高风险动作仍需说明影响面。',
      outOfScope,
      packs,
      source,
      toolsets,
    }
  }
  finally {
    rl.close()
  }
}

function markdownList(items: readonly string[]): string {
  return items.map(item => `- ${item}`).join('\n')
}

function resolveSoulPrimaryScopeKind(soulId: InitSoulId): string {
  const module = soulId === CUSTOMIZE_SOUL_ID ? undefined : BUILTIN_SOUL_REGISTRY.get(soulId)
  return module?.primaryScopeKind ?? 'general'
}

function buildScopeManifestSeed(soul: SelectedSoul): string {
  const manifest = buildScopeManifest({
    approval: soul.highRiskRequiresApproval ? 'manual-approval' : 'auto-low-risk',
    kind: resolveSoulPrimaryScopeKind(soul.id),
    primarySoul: soul.id === CUSTOMIZE_SOUL_ID ? 'general-assistant' : soul.id,
    privacy: 'private',
  })
  return `${JSON.stringify(manifest, null, 2)}\n`
}

function buildProjectAiworkerSeed(soul: SelectedSoul): ProjectAiworkerSeed {
  const policy = {
    schemaVersion: 1,
    status: 'draft',
    soul: {
      preset: soul.id,
      label: soul.label,
      source: soul.source,
    },
    risk: {
      highRiskRequiresApproval: soul.highRiskRequiresApproval,
      policy: soul.riskPolicy,
    },
    outOfScope: {
      strategy: soul.outOfScope,
    },
    toolPolicy: {
      default: 'ask',
      rules: [
        { pattern: 'read.*', action: 'auto' },
        { pattern: 'inspect.*', action: 'auto' },
        { pattern: 'write.*', action: 'ask' },
        { pattern: 'deploy.*', action: 'ask' },
      ],
    },
  }
  const toolsets = {
    schemaVersion: 1,
    status: 'draft',
    soul: soul.id,
    defaultToolsets: soul.toolsets,
    validation: {
      status: 'pending',
      issues: [],
    },
  }
  const capabilityPacks = {
    schemaVersion: 1,
    status: 'draft',
    soul: soul.id,
    packs: soul.packs.map(pack => ({
      id: pack,
      status: 'draft',
      validation: {
        status: 'pending',
        issues: [],
      },
    })),
  }

  return {
    agentMd: `# ${soul.label} Worker\n\n## 主要职责\n${markdownList(soul.responsibilities)}\n\n## 明确边界\n${markdownList(soul.boundaries)}\n\n## 职责外响应\n${soul.outOfScope}\n\n## 默认 capability packs\n${markdownList(soul.packs)}\n`,
    capabilityPacksJson: `${JSON.stringify(capabilityPacks, null, 2)}\n`,
    policyJson: `${JSON.stringify(policy, null, 2)}\n`,
    scopeJson: buildScopeManifestSeed(soul),
    soulMd: `# ${soul.label} Soul\n\n## 预设\n- id: ${soul.id}\n- source: ${soul.source}\n\n## 沟通风格\n${soul.communicationStyle}\n\n## 高风险操作策略\n${soul.riskPolicy}\n\n## 职责边界\n${markdownList(soul.boundaries)}\n`,
    toolsetsJson: `${JSON.stringify(toolsets, null, 2)}\n`,
  }
}

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
export async function runInit(options: InitOptions = {}): Promise<number> {
  if (options.global === true && options.soul !== undefined)
    return printInitUsageError('--soul is only supported for project-scope init; remove --global or omit --soul')

  if (options.global === true) {
    const home = path.join(homedir(), '.aiworker')
    const report = buildUserScopePreflight(home, options)
    printPreflightReport(report)
    if (options.dryRun === true)
      return 0

    process.env.AIWORKER_HOME = home
    bootstrapDotenv({ home })
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] user-scope worker ${ctx.workerId} ready (config v${ctx.configVersion})`)
    printUserScopeNextSteps()
    return 0
  }

  // Honour an explicit operator override (CLI flag / env). When the operator
  // has pinned AIWORKER_HOME we don't second-guess them — drop straight into
  // the legacy bootstrap.
  const scope = resolveAiworkerScope()
  if (scope.scope === 'explicit') {
    if (options.soul !== undefined)
      return printInitUsageError('--soul is only supported for project-scope init; unset AIWORKER_HOME or omit --soul')

    const report = buildUserScopePreflight(scope.home, { ...options, scope: 'explicit' })
    printPreflightReport(report)
    if (options.dryRun === true)
      return 0

    bootstrapDotenv({ home: scope.home })
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] explicit-scope worker ${ctx.workerId} ready (${scope.home})`)
    printUserScopeNextSteps()
    return 0
  }

  const cwd = process.cwd()

  // Already initialised → idempotent re-init. The side-effect bootstrap has
  // already aimed AIWORKER_HOME at the existing local/ via resolveAiworkerScope.
  const existingRoot = resolveProjectRoot(cwd)
  if (existingRoot) {
    const soulResult = hasProjectSoulMaterial(existingRoot)
      ? await resolveOptionalProjectSoul(options)
      : await resolveRequiredProjectSoul(options, 'project init with missing Soul material')
    if (soulResult.code !== undefined)
      return soulResult.code

    const report = buildProjectPreflight(existingRoot, options, soulResult.soul)
    printPreflightReport(report)
    if (options.dryRun === true)
      return 0

    await ensureProjectAiworker(
      existingRoot,
      soulResult.soul === undefined ? {} : buildProjectAiworkerSeed(soulResult.soul),
    )
    bootstrapDotenv({ home: path.join(existingRoot, '.aiworker', 'local') })
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${existingRoot})`)
    printProjectNextSteps(existingRoot, soulResult.soul)
    return 0
  }

  const soulResult = await resolveRequiredProjectSoul(options)
  if (soulResult.code !== undefined)
    return soulResult.code
  const soul = soulResult.soul!

  const report = buildProjectPreflight(cwd, { ...options, gitRepoDetected: isGitRepo(cwd) }, soul)
  printPreflightReport(report)
  if (options.dryRun === true)
    return 0

  await ensureProjectAiworker(cwd, buildProjectAiworkerSeed(soul))
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
  printProjectNextSteps(cwd, soul)
  return 0
}

/**
 * TODO-011: pick a recommended bring-your-own engine per Soul. The hint is
 * informational only — operators can pick anything from the candidate list,
 * which always includes `claude-code` as the broadest baseline. Soul-specific
 * suggestions reflect FEAT-053 (Project scope = worker-bound business scope,
 * not just code).
 */
const ENGINE_CANDIDATES = ['claude-code', 'codex', 'acp', 'cursor', 'mcp', 'http'] as const

function recommendedEnginesForSoul(soulId: InitSoulId | undefined): { primary: string, alternates: readonly string[] } {
  switch (soulId) {
    case 'developer':
    case 'devops-sre':
      return { primary: 'claude-code', alternates: ['codex'] }
    case 'general-assistant':
    case undefined:
      return { primary: 'claude-code', alternates: ['cursor'] }
    case 'product-designer':
    case 'qa-reviewer':
    case 'project-manager':
    case 'hr-recruiting':
    case 'finance-ops':
    case 'support-operator':
      return { primary: 'claude-code', alternates: ['mcp'] }
    default:
      return { primary: 'claude-code', alternates: ['codex'] }
  }
}

function executorChoicePreface(soul?: SelectedSoul): string[] {
  const recommendation = recommendedEnginesForSoul(soul?.id)
  const candidates = ENGINE_CANDIDATES.join(' | ')
  return [
    `     Default executor is the safe \`http://localhost:9999\` stub; pick a real engine before running tasks.`,
    `     Recommended for ${soul ? `Soul \`${soul.id}\`` : 'general use'}: \`${recommendation.primary}\`${recommendation.alternates.length > 0 ? ` (alternates: ${recommendation.alternates.join(', ')})` : ''}.`,
    `     Candidates: ${candidates}.`,
  ]
}

function printProjectNextSteps(projectRoot: string, soul?: SelectedSoul): void {
  const soulLine = soul
    ? `  2. Review brain identity: .aiworker/SOUL.md / AGENT.md / USER.md (preset \`${soul.id}\`); inspect capabilities with \`aiworker soul show ${soul.id}\`.`
    : '  2. Review brain identity: .aiworker/SOUL.md / AGENT.md / USER.md; list presets with `aiworker soul list`.'
  const recommendation = recommendedEnginesForSoul(soul?.id)
  process.stdout.write([
    '[aiworker init] next steps — Project Brain comes first; executor is bring-your-own',
    `  1. Confirm scope: \`aiworker scope\` (project root: ${projectRoot}).`,
    soulLine,
    '  3. Inspect brain runtime: `aiworker brain status` (then `aiworker brain skills` / `aiworker brain memories`).',
    '  4. Validate brain capability drafts: `aiworker doctor`.',
    '  5. (Optional) declare project executor overlay hints: `aiworker executor mcp add ... --engine <engine>` then `aiworker executor mcp sync --engine <engine> --dry-run`.',
    `  6. Select task executor when ready: \`aiworker executor select --engine <YOUR_ENGINE> --apply\`.`,
    ...executorChoicePreface(soul),
    `  7. Check executor readiness: \`aiworker executor doctor --engine <YOUR_ENGINE>\` (engine login/auth lives outside AIWorker; suggested: \`${recommendation.primary}\`).`,
    '  8. Smoke bootstrap: `aiworker run --message "hello" --dry-run`.',
    '  9. After configuring executor secrets/model: `aiworker run --message "hello"`.',
    ' 10. Need HTTP/admin UI: `aiworker up --port 9217` (or explicit `aiworker serve --port 9217`).',
    ' 11. Need fleet control: start/connect a gateway, then use self-enroll or OTP from `aiworker serve`.',
  ].join('\n'))
  process.stdout.write('\n')
}

function printUserScopeNextSteps(): void {
  const recommendation = recommendedEnginesForSoul(undefined)
  process.stdout.write([
    '[aiworker init] next steps — Project Brain comes first; executor is bring-your-own',
    '  1. Confirm scope: `aiworker scope`.',
    '  2. Inspect brain runtime: `aiworker brain status` (then `aiworker brain skills` / `aiworker brain memories`).',
    '  3. Inspect config: `aiworker config show`.',
    `  4. Select task executor when ready: \`aiworker executor select --engine <YOUR_ENGINE> --apply\`.`,
    ...executorChoicePreface(undefined),
    `     Tip: \`aiworker executor doctor --engine ${recommendation.primary}\` checks readiness without running a turn.`,
    '  5. Smoke bootstrap: `aiworker run --message "hello" --dry-run`.',
    '  6. After configuring executor secrets/model: `aiworker run --message "hello"`.',
    '  7. Need HTTP/admin UI: `aiworker up --port 9217` (or explicit `aiworker serve --port 9217`).',
  ].join('\n'))
  process.stdout.write('\n')
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

function hasProjectSoulMaterial(projectRoot: string): boolean {
  const aiworker = path.join(projectRoot, '.aiworker')
  return existsSync(path.join(aiworker, 'AGENT.md'))
    && existsSync(path.join(aiworker, 'SOUL.md'))
}

function buildProjectPreflight(
  projectRoot: string,
  options: InitOptions & { gitRepoDetected?: boolean },
  soul?: SelectedSoul,
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
    ...(soul === undefined ? {} : { soul }),
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
    report.soul ? `Soul         : ${report.soul.id} (${report.soul.label}, ${report.soul.source})` : null,
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
