import type { ProjectAiworkerSeed } from '@zonease/aiworker-fs-layout'
import type { WorkerPack } from '@zonease/aiworker-shared'
import type { InitSoulId, SelectedSoul } from '../../soul/presets'

import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

import { markBootstrapShown } from '@zonease/aiworker-core'
import { ensureProjectAiworker, NATIVE_PROJECT_SKILL_TARGETS, resolveAiworkerScope, resolveProjectNativeSkillPath, resolveProjectRoot } from '@zonease/aiworker-fs-layout'
import {
  buildScopeManifest,
  createBuiltinSoulRegistry,
  findBuiltinWorkerPack,
  supportedWorkerPackIds,
} from '@zonease/aiworker-shared'
import consola from 'consola'

import { loadWorkerContext } from '../../context'
import { bootstrapDotenv } from '../../lib/dotenv-bootstrap'
import {
  BUILTIN_SOUL_PRESETS,
  CUSTOMIZE_SOUL_ID,
  DEFAULT_VAGUE_CONTEXT_STRATEGY,
  findBuiltinSoul,
  supportedSoulIds,
  toSelectedSoul,
} from '../../soul/presets'
import { buildNativeSkillProjectionSeedsForSoul } from './native-skill-projections'

const BUILTIN_SOUL_REGISTRY = createBuiltinSoulRegistry()

export interface InitOptions {
  /** Preview planned writes without creating or modifying any file. */
  dryRun?: boolean
  /** Project Soul preset id. Required for non-interactive brand-new project init. */
  soul?: string
  /** OD-style worker pack id. Defaults to a same-id pack when the selected Soul has one. */
  pack?: string
  /** Write the first-run bootstrap token to this chmod 0600 file. */
  tokenFile?: string
  /** Explicitly print the full bootstrap token in a warning block. */
  showToken?: boolean
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
  workerPack?: SelectedWorkerPack
}

const PROJECT_TEMPLATE_PATHS = [
  '.aiworker/',
  '.aiworker/SOUL.md',
  '.aiworker/USER.md',
  '.aiworker/MEMORY.md',
  '.aiworker/ROLLUP.md',
  '.aiworker/policy.json',
  '.aiworker/brain-capabilities.json',
  '.aiworker/executor-capabilities.json',
  '.aiworker/native-skill-projections.json',
  '.aiworker/scope.json',
  '.aiworker/.gitignore',
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

type WorkerPackSource = 'flag' | 'soul-default'

interface SelectedWorkerPack {
  pack: WorkerPack
  source: WorkerPackSource
}

interface ResolveWorkerPackResult {
  code?: number
  selection?: SelectedWorkerPack
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

function resolveProjectWorkerPack(options: InitOptions, soul?: SelectedSoul): ResolveWorkerPackResult {
  if (options.pack !== undefined) {
    const id = options.pack.trim()
    const pack = findBuiltinWorkerPack(id)
    if (!pack) {
      return {
        code: printInitUsageError(`unknown worker pack "${options.pack}". Available packs: ${supportedWorkerPackIds()}`),
      }
    }
    return { selection: { pack, source: 'flag' } }
  }

  if (soul === undefined)
    return {}

  const pack = findBuiltinWorkerPack(soul.id)
  return pack === undefined ? {} : { selection: { pack, source: 'soul-default' } }
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
      vagueContextStrategy: DEFAULT_VAGUE_CONTEXT_STRATEGY,
    }
  }
  finally {
    rl.close()
  }
}

function markdownList(items: readonly string[]): string {
  return items.map(item => `- ${item}`).join('\n')
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

const BRAIN_ADMISSION_GUIDANCE = [
  '## Durable lesson governance',
  '- Long-term memory, policy, brain skill, and other durable Project Brain mutations must come from reviewed lesson promotion.',
  '- Use `aiworker lessons promote <runId>` after reviewing run evidence; the result stays pending until operator approval/apply inside Project Brain.',
  '- Do not write executor-native memory and claim that AIWorker admission was submitted. Executor native memory is not canonical AIWorker Brain.',
  '- Domain meaning and next-step planning belong to the external executor; admission only owns evidence, approval, rollback, audit, and durable mutation boundaries.',
].join('\n')

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

function buildProjectAiworkerSeed(soul?: SelectedSoul, workerPack?: SelectedWorkerPack): ProjectAiworkerSeed {
  const packSeed = buildProjectWorkerPackSeed(workerPack)
  if (soul === undefined)
    return packSeed

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
    ...(workerPack === undefined
      ? {}
      : {
          workerPack: {
            id: workerPack.pack.id,
            label: workerPack.pack.label,
            source: workerPack.source,
          },
        }),
  }
  const brainCapabilities = {
    schemaVersion: 1,
    status: 'draft',
    soul: soul.id,
    defaultToolsets: soul.toolsets,
    packs: soul.packs.map(pack => ({
      id: pack,
      status: 'draft',
      validation: {
        status: 'pending',
        issues: [],
      },
    })),
    mcp: {
      servers: {},
    },
    validation: {
      status: 'pending',
      issues: [],
    },
  }
  const generatedSoulMd = `# ${soul.label} Soul\n\n## 预设\n- id: ${soul.id}\n- source: ${soul.source}\n\n## 主要职责\n${markdownList(soul.responsibilities)}\n\n## 沟通风格\n${soul.communicationStyle}\n\n## 高风险操作策略\n${soul.riskPolicy}\n\n## 职责边界\n${markdownList(soul.boundaries)}\n\n## 职责外响应\n${soul.outOfScope}\n\n${BRAIN_ADMISSION_GUIDANCE}\n\n## 默认 Brain capability packs\n${markdownList(soul.packs)}\n\n## 默认 toolsets\n${markdownList(soul.toolsets)}\n\n## 模糊或缺失上下文\n收到不完整 prompt（< 20 字 / 无可定位 artifact / 仅 "挂了 / 失败 / 不行" 等）时：先用一句话反问关键缺失信息，不要直接调 tool 探索，让用户先补齐上下文；不要为了避免反问而扩大搜索范围越过当前 scope。\n\n${soul.vagueContextStrategy}\n`

  return {
    brainCapabilitiesJson: `${JSON.stringify(brainCapabilities, null, 2)}\n`,
    nativeSkillProjections: buildNativeSkillProjectionSeedsForSoul(soul),
    policyJson: `${JSON.stringify(policy, null, 2)}\n`,
    scopeJson: buildScopeManifestSeed(soul),
    soulMd: ensureTrailingNewline(soul.soulMd ?? generatedSoulMd),
    ...packSeed,
  }
}

function buildProjectWorkerPackSeed(selection?: SelectedWorkerPack): ProjectAiworkerSeed {
  if (selection === undefined)
    return {}

  const { pack } = selection
  return {
    workerPackFiles: {
      [`domain-systems/${pack.id}/DOMAIN.md`]: ensureTrailingNewline(pack.domainMd),
      [`worker-packs/${pack.id}/SKILL.md`]: ensureTrailingNewline(pack.skillMd),
    },
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
 * Pre-1.0 user-scope/global init and force compatibility flags are intentionally
 * gone from the CLI. A worker is bound to the current workspace by default.
 */
export async function runInit(options: InitOptions = {}): Promise<number> {
  // Honour an explicit operator override (CLI flag / env). When the operator
  // has pinned AIWORKER_HOME we don't second-guess them, but the printed
  // product path is still the local worker loop instead of the retired gateway
  // and scope command tree.
  const scope = resolveAiworkerScope()
  if (scope.scope === 'explicit') {
    if (options.soul !== undefined)
      return printInitUsageError('--soul is only supported for project-scope init; unset AIWORKER_HOME or omit --soul')
    if (options.pack !== undefined)
      return printInitUsageError('--pack is only supported for project-scope init; unset AIWORKER_HOME or omit --pack')

    const report = buildUserScopePreflight(scope.home, { ...options, scope: 'explicit' })
    printPreflightReport(report)
    if (options.dryRun === true)
      return 0

    const dotenv = bootstrapDotenv({ home: scope.home, printOnMint: false })
    const ctx = await loadWorkerContext({ silent: true })
    printInitSecrets({ ctx, dotenv, options, tokenHome: scope.home })
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
    const packResult = resolveProjectWorkerPack(options, soulResult.soul)
    if (packResult.code !== undefined)
      return packResult.code

    const report = buildProjectPreflight(existingRoot, options, soulResult.soul, packResult.selection)
    printPreflightReport(report)
    if (options.dryRun === true)
      return 0

    await ensureProjectAiworker(
      existingRoot,
      buildProjectAiworkerSeed(soulResult.soul, packResult.selection),
    )
    const projectLocal = path.join(existingRoot, '.aiworker', 'local')
    const dotenv = bootstrapDotenv({ home: projectLocal, printOnMint: false })
    const ctx = await loadWorkerContext({ silent: true })
    printInitSecrets({ ctx, dotenv, options, tokenHome: projectLocal })
    consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${existingRoot})`)
    printProjectNextSteps(existingRoot, soulResult.soul, packResult.selection)
    return 0
  }

  const soulResult = await resolveRequiredProjectSoul(options)
  if (soulResult.code !== undefined)
    return soulResult.code
  const soul = soulResult.soul!
  const packResult = resolveProjectWorkerPack(options, soul)
  if (packResult.code !== undefined)
    return packResult.code

  const report = buildProjectPreflight(cwd, { ...options, gitRepoDetected: isGitRepo(cwd) }, soul, packResult.selection)
  printPreflightReport(report)
  if (options.dryRun === true)
    return 0

  await ensureProjectAiworker(cwd, buildProjectAiworkerSeed(soul, packResult.selection))
  // `init` owns dotenv bootstrap, so a brand-new project mints or persists
  // exactly one project-local secret set and never creates a user-scope
  // fallback first. Preserve operator-provided master/shared secrets: later
  // commands also let explicit env override `.env`, so changing the value here
  // would make the freshly written worker_identity row undecryptable.
  const projectLocal = path.join(cwd, '.aiworker', 'local')
  delete process.env.AIWORKER_HOME
  const dotenv = bootstrapDotenv({ home: projectLocal, printOnMint: false })
  const ctx = await loadWorkerContext({ silent: true })
  printInitSecrets({ ctx, dotenv, options, tokenHome: projectLocal })
  consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${cwd})`)
  printProjectNextSteps(cwd, soul, packResult.selection)
  return 0
}

interface InitSecretsInput {
  ctx: Awaited<ReturnType<typeof loadWorkerContext>>
  dotenv: ReturnType<typeof bootstrapDotenv>
  options: InitOptions
  tokenHome: string
}

function printInitSecrets({ ctx, dotenv, options, tokenHome }: InitSecretsInput): void {
  process.stdout.write('[aiworker init] secret material\n')
  process.stdout.write(`  Worker id       : ${ctx.workerId}\n`)
  process.stdout.write(`  Master key file : ${dotenv.envFile} (chmod 600; back this file up offline)\n`)
  if (!ctx.tokenJustMinted) {
    process.stdout.write('  Bootstrap token : already delivered on first init; re-run init will not reveal the raw token.\n')
    return
  }

  const tokenFile = resolveTokenFile(options.tokenFile, tokenHome)
  writeTokenFile(tokenFile, ctx.token)
  process.stdout.write(`  Bootstrap token : ${maskToken(ctx.token)} (full value written to ${tokenFile}, chmod 600)\n`)
  if (options.showToken === true)
    printFullTokenWarning(ctx.token)
  else
    process.stdout.write('  Raw token stdout: hidden by default; pass --show-token only in a private terminal.\n')
  markBootstrapShown(ctx.db)
}

function resolveTokenFile(input: string | undefined, tokenHome: string): string {
  if (input && input.trim().length > 0)
    return path.resolve(input.trim())
  return path.join(tokenHome, 'bootstrap-token.txt')
}

function writeTokenFile(file: string, token: string): void {
  const dir = path.dirname(file)
  if (!existsSync(dir))
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(file, `AIWORKER_BOOTSTRAP_TOKEN=${token}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
}

function maskToken(token: string): string {
  if (token.length <= 12)
    return '<hidden>'
  return `${token.slice(0, 4)}${'x'.repeat(8)}${token.slice(-4)}`
}

function printFullTokenWarning(token: string): void {
  process.stdout.write([
    '  ┌────────────────────────────────────────────────────────────┐',
    '  │ STORE THIS NOW - shown only because --show-token was used. │',
    '  │ Do not paste this block into issues, chat, or screenshots. │',
    `  │ AIWORKER_BOOTSTRAP_TOKEN=${token.padEnd(25)} │`,
    '  └────────────────────────────────────────────────────────────┘',
  ].join('\n'))
  process.stdout.write('\n')
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
    `     Suggested for ${soul ? `Soul \`${soul.id}\`` : 'general use'}: \`${recommendation.primary}\`${recommendation.alternates.length > 0 ? ` (also tested: ${recommendation.alternates.join(', ')})` : ''}.`,
    '     Advisory only: other listed engines are technically supported; this suggestion is not enforced by `executor select`.',
    `     Candidates: ${candidates}.`,
  ]
}

function printProjectNextSteps(projectRoot: string, soul?: SelectedSoul, workerPack?: SelectedWorkerPack): void {
  const packLine = workerPack
    ? `  2. Review worker pack assets: .aiworker/worker-packs/${workerPack.pack.id}/SKILL.md / .aiworker/domain-systems/${workerPack.pack.id}/DOMAIN.md; inspect with \`aiworker pack show ${workerPack.pack.id}\`.`
    : '  2. Pick a worker pack when you are ready to shape the workbench: `aiworker pack list`.'
  const recommendation = recommendedEnginesForSoul(soul?.id)
  process.stdout.write([
    '[aiworker init] next steps — local worker loop',
    `  1. Workspace root: ${projectRoot}.`,
    packLine,
    '  3. Validate worker state and pack assets: `aiworker doctor`.',
    '  4. (Optional) declare project executor overlay hints: `aiworker executor mcp add ... --engine <engine>` then `aiworker executor mcp sync --engine <engine> --dry-run`.',
    `  5. Select task executor when ready: \`aiworker executor select --engine <YOUR_ENGINE> --apply\`.`,
    ...executorChoicePreface(soul),
    `  6. Check executor readiness: \`aiworker executor doctor --engine <YOUR_ENGINE>\` (engine login/auth lives outside AIWorker; suggested: \`${recommendation.primary}\`).`,
    '  7. Start the local daemon and web workbench: `aiworker daemon start`.',
    '  8. Verify daemon readiness: `aiworker daemon check`.',
    '  9. Submit a work order: `aiworker run --message "hello"`.',
    ' 10. Inspect output: `aiworker runs list`, `aiworker artifacts list --run <runId>`, `aiworker review show <runId>`.',
    ' 11. Promote reusable learning when review evidence is good: `aiworker lessons promote <runId>`.',
  ].join('\n'))
  process.stdout.write('\n')
}

function printUserScopeNextSteps(): void {
  const recommendation = recommendedEnginesForSoul(undefined)
  process.stdout.write([
    '[aiworker init] next steps — local worker loop',
    '  1. Validate worker state and pack assets: `aiworker doctor`.',
    `  2. Select task executor when ready: \`aiworker executor select --engine <YOUR_ENGINE> --apply\`.`,
    ...executorChoicePreface(undefined),
    `  3. Check executor readiness: \`aiworker executor doctor --engine ${recommendation.primary}\`.`,
    '  4. Start the local daemon and web workbench: `aiworker daemon start`.',
    '  5. Submit a work order: `aiworker run --message "hello"`.',
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
  return existsSync(path.join(aiworker, 'SOUL.md'))
}

function buildProjectPreflight(
  projectRoot: string,
  options: InitOptions & { gitRepoDetected?: boolean },
  soul?: SelectedSoul,
  workerPack?: SelectedWorkerPack,
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

  if (soul) {
    for (const relative of buildNativeSkillPreflightPaths(root, soul)) {
      const displayPath = relative
      if (existsSync(path.join(root, displayPath)))
        preserve.push(`${displayPath} (existing executor-native skill)`)
      else
        create.push(displayPath)
    }
    notes.push(`Default Soul skills will be projected with aiworker-* managed names into native executor project skill directories: ${NATIVE_PROJECT_SKILL_TARGETS.map(target => target.directory).join(', ')}.`)
  }

  if (workerPack) {
    for (const relative of buildWorkerPackPreflightPaths(workerPack.pack)) {
      if (existsSync(path.join(root, '.aiworker', relative)))
        preserve.push(`.aiworker/${relative} (existing worker pack asset)`)
      else
        create.push(`.aiworker/${relative}`)
    }
    notes.push(`Worker pack ${workerPack.pack.id} will be materialized as OD-style workbench assets: SKILL.md + DOMAIN.md.`)
  }
  else if (soul && options.pack === undefined) {
    notes.push(`No same-id worker pack is available for Soul ${soul.id}; use --pack <id> to materialize a workbench pack explicitly.`)
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
    notes.push('Run from the directory that should own this worker.')
  }

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
    ...(workerPack === undefined ? {} : { workerPack }),
  }
}

function buildNativeSkillPreflightPaths(projectRoot: string, soul: SelectedSoul): string[] {
  const paths: string[] = []
  for (const seed of buildNativeSkillProjectionSeedsForSoul(soul)) {
    for (const target of NATIVE_PROJECT_SKILL_TARGETS) {
      const absolute = resolveProjectNativeSkillPath(projectRoot, target.engine, seed.logicalId)
      paths.push(path.relative(projectRoot, absolute).replace(/\\/g, '/'))
    }
  }
  return paths.sort()
}

function buildWorkerPackPreflightPaths(pack: WorkerPack): string[] {
  return [
    `domain-systems/${pack.id}/DOMAIN.md`,
    `worker-packs/${pack.id}/SKILL.md`,
  ]
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
    report.workerPack ? `Worker pack  : ${report.workerPack.pack.id} (${report.workerPack.pack.label}, ${report.workerPack.source})` : null,
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
