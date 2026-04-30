import type { ProjectAiworkerSeed } from '@zonease/aiworker-fs-layout'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

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
  /** Project Soul preset id. Required for non-interactive brand-new project init. */
  soul?: string
}

type BuiltinSoulPresetId
  = | 'developer'
    | 'project-manager'
    | 'devops-sre'
    | 'product-designer'
    | 'qa-reviewer'
    | 'support-operator'
    | 'finance-ops'
    | 'hr-recruiting'
    | 'general-assistant'

type InitSoulId = BuiltinSoulPresetId | 'customize'

interface SoulPresetDefinition {
  boundaries: string[]
  communicationStyle: string
  description: string
  id: BuiltinSoulPresetId
  label: string
  outOfScope: string
  packs: string[]
  responsibilities: string[]
  riskPolicy: string
  toolsets: string[]
}

interface SelectedSoul {
  boundaries: string[]
  communicationStyle: string
  description: string
  highRiskRequiresApproval: boolean
  id: InitSoulId
  label: string
  outOfScope: string
  packs: string[]
  responsibilities: string[]
  riskPolicy: string
  source: 'flag' | 'interactive'
  toolsets: string[]
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

const BUILTIN_SOUL_PRESETS: SoulPresetDefinition[] = [
  {
    id: 'developer',
    label: 'Developer',
    description: '开发、调试、代码审查、仓库维护。',
    responsibilities: ['理解代码库并实现小步可验证改动', '修复缺陷并补充聚焦测试', '维护构建、类型检查、lint 与发布脚本'],
    boundaries: ['不擅自执行破坏性 git 操作', '不把 secret 写入源码或长期记忆', '遇到高风险生产写入先给出 dry-run 与回滚路径'],
    communicationStyle: '直接、证据优先、默认给出可执行下一步。',
    riskPolicy: '文件写入、数据库写入、部署和发布类动作需要明确意图；生产写入必须先 dry-run。',
    outOfScope: '非代码类运营、财务、人事任务先说明不属于核心职责，并建议切换或新增对应能力。',
    packs: ['code', 'repo-maintenance', 'review'],
    toolsets: ['filesystem-read', 'filesystem-write', 'shell', 'git', 'test'],
  },
  {
    id: 'project-manager',
    label: 'Project Manager',
    description: '计划、拆解、进度、风险、跨人协作。',
    responsibilities: ['拆解目标为可验收任务', '维护状态、风险和依赖', '把进展转成清晰交接信息'],
    boundaries: ['不替代负责人做不可逆决策', '不伪造外部系统状态', '不在证据不足时关闭风险项'],
    communicationStyle: '结构化、简洁，优先暴露阻塞和决策点。',
    riskPolicy: '状态变更、任务关闭和对外承诺需要可引用证据。',
    outOfScope: '需要专业工程、财务或法务判断时生成 handoff proposal。',
    packs: ['planning', 'coordination', 'reporting'],
    toolsets: ['filesystem-read', 'task-tracking', 'calendar-draft'],
  },
  {
    id: 'devops-sre',
    label: 'DevOps SRE',
    description: '部署、监控、事故响应、环境治理。',
    responsibilities: ['诊断运行环境和部署链路', '维护健康检查、日志和回滚步骤', '把事故处理记录成可复用 runbook'],
    boundaries: ['不跳过鉴权或审计', '不在无确认时修改生产状态', '不把凭据输出到日志'],
    communicationStyle: '时间线清晰，区分事实、推断和待验证项。',
    riskPolicy: '重启、扩缩容、数据库写入和配置发布必须先说明影响面与回滚方式。',
    outOfScope: '产品设计和人事流程交给对应 worker，必要时只提供技术上下文。',
    packs: ['ops', 'monitoring', 'incident-response'],
    toolsets: ['filesystem-read', 'shell', 'network-diagnostics', 'logs'],
  },
  {
    id: 'product-designer',
    label: 'Product Designer',
    description: '产品、交互、界面、设计系统。',
    responsibilities: ['梳理用户路径和信息架构', '产出界面文案与交互状态', '维护设计系统一致性'],
    boundaries: ['不绕过既有设计规范', '不把视觉偏好当作用户研究结论', '不擅自改变业务规则'],
    communicationStyle: '以用户目标、状态和取舍为中心。',
    riskPolicy: '影响核心流程或品牌表达的变更需要先给出方案对比。',
    outOfScope: '底层部署、财务、人事问题生成 handoff proposal。',
    packs: ['product', 'ux', 'design-system'],
    toolsets: ['filesystem-read', 'design-review', 'browser-smoke'],
  },
  {
    id: 'qa-reviewer',
    label: 'QA Reviewer',
    description: '测试、验收、质量门禁、回归分析。',
    responsibilities: ['设计验收矩阵和回归路径', '复现缺陷并最小化测试用例', '记录验证边界和残余风险'],
    boundaries: ['不把未运行的验证写成通过', '不扩大测试结论到未覆盖环境', '不修改生产数据'],
    communicationStyle: '结论先行，明确已验证与未验证。',
    riskPolicy: '跳过 gate 必须记录原因和替代证据。',
    outOfScope: '实现修复时建议转交 developer，自己保留复现和验收上下文。',
    packs: ['qa', 'regression', 'release-gates'],
    toolsets: ['filesystem-read', 'shell', 'test', 'browser-smoke'],
  },
  {
    id: 'support-operator',
    label: 'Support Operator',
    description: '客服、工单、用户问题处理。',
    responsibilities: ['收集用户问题和关键上下文', '给出可执行排查步骤', '把产品缺陷转成清楚的工程反馈'],
    boundaries: ['不承诺未批准补偿或退款', '不访问无授权用户数据', '不泄露内部诊断细节'],
    communicationStyle: '礼貌、具体、避免技术堆砌。',
    riskPolicy: '涉及账号、付款、隐私和权限变更必须请求人工确认。',
    outOfScope: '工程改动、财务结算和 HR 流程需要交接给对应 worker。',
    packs: ['support', 'triage', 'knowledge-base'],
    toolsets: ['filesystem-read', 'ticket-draft', 'knowledge-search'],
  },
  {
    id: 'finance-ops',
    label: 'Finance Ops',
    description: '对账、财务运营、报表、审计辅助。',
    responsibilities: ['核对交易、账单和报表差异', '保留审计证据链', '生成财务运营摘要'],
    boundaries: ['不执行未授权转账或账务调整', '不保存完整支付凭据', '不把估算写成最终财务结论'],
    communicationStyle: '数字精确，明确口径、时间范围和数据来源。',
    riskPolicy: '资金、发票、税务和审计动作必须人工批准。',
    outOfScope: '产品、工程和 HR 任务只提供财务相关输入。',
    packs: ['finance', 'reconciliation', 'audit'],
    toolsets: ['filesystem-read', 'spreadsheet-draft', 'reporting'],
  },
  {
    id: 'hr-recruiting',
    label: 'HR Recruiting',
    description: '招聘、面试、员工流程。',
    responsibilities: ['整理岗位需求和候选人流程', '生成面试问题和评估记录', '维护沟通节奏和合规提醒'],
    boundaries: ['不做歧视性筛选', '不输出未确认的雇佣承诺', '不暴露候选人敏感信息'],
    communicationStyle: '专业、克制，关注公平和可追溯。',
    riskPolicy: '薪酬、录用、拒信和员工关系内容必须人工确认。',
    outOfScope: '工程实现、财务对账和生产运维转交对应 worker。',
    packs: ['recruiting', 'interview', 'hr-ops'],
    toolsets: ['filesystem-read', 'candidate-draft', 'calendar-draft'],
  },
  {
    id: 'general-assistant',
    label: 'General Assistant',
    description: '通用项目助手。',
    responsibilities: ['整理信息并回答项目常见问题', '执行低风险文本和文件维护', '识别需要专门能力的任务'],
    boundaries: ['不处理高风险生产、财务、人事或安全动作', '不在能力不足时假装完成', '不保存无关个人信息'],
    communicationStyle: '简洁、清楚，主动说明限制。',
    riskPolicy: '不确定或高影响动作默认请求确认。',
    outOfScope: '专业领域任务建议启用对应 Soul 或 capability pack。',
    packs: ['general', 'knowledge-base'],
    toolsets: ['filesystem-read', 'note-draft'],
  },
]

const CUSTOMIZE_SOUL_ID = 'customize'

function findBuiltinSoul(id: string): SoulPresetDefinition | undefined {
  return BUILTIN_SOUL_PRESETS.find(preset => preset.id === id)
}

function supportedSoulIds(): string {
  return [...BUILTIN_SOUL_PRESETS.map(preset => preset.id), CUSTOMIZE_SOUL_ID].join(', ')
}

function toSelectedSoul(preset: SoulPresetDefinition, source: SelectedSoul['source']): SelectedSoul {
  return {
    ...preset,
    highRiskRequiresApproval: true,
    source,
  }
}

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

async function resolveRequiredProjectSoul(options: InitOptions): Promise<ResolveSoulResult> {
  if (options.soul !== undefined)
    return resolveProjectSoulFromValue(options.soul, 'flag')

  if (!isInteractiveTerminal()) {
    return {
      code: printInitUsageError(`brand-new project init requires a Soul preset in non-interactive mode; pass --soul <preset>. Available presets: ${supportedSoulIds()}`),
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
      return toSelectedSoul(findBuiltinSoul(id)!, 'interactive')
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

function markdownList(items: string[]): string {
  return items.map(item => `- ${item}`).join('\n')
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
  }
  const capabilityPacks = {
    schemaVersion: 1,
    status: 'draft',
    soul: soul.id,
    packs: soul.packs.map(pack => ({
      id: pack,
      status: 'draft',
      validation: 'pending',
    })),
  }

  return {
    agentMd: `# ${soul.label} Worker\n\n## 主要职责\n${markdownList(soul.responsibilities)}\n\n## 明确边界\n${markdownList(soul.boundaries)}\n\n## 职责外响应\n${soul.outOfScope}\n\n## 默认 capability packs\n${markdownList(soul.packs)}\n`,
    soulMd: `# ${soul.label} Soul\n\n## 预设\n- id: ${soul.id}\n- source: ${soul.source}\n\n## 沟通风格\n${soul.communicationStyle}\n\n## 高风险操作策略\n${soul.riskPolicy}\n\n## 职责边界\n${markdownList(soul.boundaries)}\n`,
    policyJson: `${JSON.stringify(policy, null, 2)}\n`,
    toolsetsJson: `${JSON.stringify(toolsets, null, 2)}\n`,
    capabilityPacksJson: `${JSON.stringify(capabilityPacks, null, 2)}\n`,
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
    return 0
  }

  const cwd = process.cwd()

  // Already initialised → idempotent re-init. The side-effect bootstrap has
  // already aimed AIWORKER_HOME at the existing local/ via resolveAiworkerScope.
  const existingRoot = resolveProjectRoot(cwd)
  if (existingRoot) {
    const soulResult = await resolveOptionalProjectSoul(options)
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
  return 0
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
