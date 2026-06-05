import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

export type FindingKind = 'agents' | 'skill' | 'knowledge-template' | 'platform'

export interface SamplingCase {
  id: string
  prompt: string
  expectedEvidence: string
}

export interface SamplingSkill {
  id: string
  sourcePath: string
  cases: SamplingCase[]
}

export interface SamplingSoul {
  appId: string
  displayName: string
  agentsCases: SamplingCase[]
  skills: SamplingSkill[]
}

export interface ScoreDimension {
  id: string
  label: string
  evidence: string
}

export interface SamplingManifest {
  commit: string
  evidenceRoot: string
  home: string
  runId: string
  totals: {
    minAgentsCasesPerSoul: number
    minSkillCasesPerSkill: number
    skills: number
    souls: number
  }
  souls: SamplingSoul[]
  scoreDimensions: ScoreDimension[]
}

export interface BuildSamplingManifestInput {
  commit: string
  home: string
  runId: string
}

export interface SamplingCliScope {
  appId: string
  workerId: string
}

export interface SamplingCliResult {
  invocationId: string
  sessionId: string
  workspaceId: string
}

export type RunCli = (args: string[], env?: Record<string, string | undefined>) => Promise<string>

interface RunSamplingCaseWithCliInput {
  caseId: string
  env?: Record<string, string | undefined>
  prompt: string
  reasoning?: string
  runCli: RunCli
  scope: SamplingCliScope
}

interface CliPlanInput {
  caseId: string
  engine: 'codex'
  prompt: string
  reasoning: string
  scope: SamplingCliScope
  workspaceId: string
  workspaceName: string
}

export interface ScorecardInput {
  caseId: string
  dimensions: Array<{
    id: string
    score: 0 | 1 | 2
  }>
  findingKinds: FindingKind[]
  outputSnippet: string
  prompt: string
  root: string
  status: 'fail' | 'pass'
}

interface SamplingRunCase {
  case: SamplingCase
  scope: SamplingCliScope
}

interface SamplingRunSelection {
  scope?: 'pilot' | 'pilot-retest'
  soul?: string
}

function makeCase(id: string, prompt: string, expectedEvidence: string): SamplingCase {
  return { id, prompt, expectedEvidence }
}

function makeSkill(appId: string, skillId: string, promptName: string): SamplingSkill {
  return {
    id: skillId,
    sourcePath: `souls/${appId}/engine/skills/${skillId}/SKILL.md`,
    cases: [
      makeCase(
        `${skillId}-happy-path`,
        `Use ${promptName} for a standard business request and produce the deliverable.`,
        'skill follows its own workflow and produces a concrete deliverable',
      ),
      makeCase(
        `${skillId}-clarify-boundary`,
        `Use ${promptName} for an incomplete request with boundary risk.`,
        'skill asks targeted clarifying questions and states safe assumptions',
      ),
    ],
  }
}

function makeAgentsCases(appId: string, domain: string): SamplingCase[] {
  return [
    makeCase(
      `${appId}-agents-routing`,
      `For the ${domain} Soul, route the user request to the right workflow and explain why.`,
      'AGENTS instructions route the task to the right skill or base workflow',
    ),
    makeCase(
      `${appId}-agents-assets`,
      `For the ${domain} Soul, list the knowledge, templates, and limits needed to finish the task.`,
      'AGENTS instructions surface assets, boundaries, and self-check points',
    ),
  ]
}

export const SCORE_DIMENSIONS: ScoreDimension[] = [
  {
    id: 'agents-direction',
    label: 'AGENTS direction',
    evidence: 'AGENTS.md gives clear role, routing, and boundary guidance',
  },
  {
    id: 'workflow-routing',
    label: 'Workflow routing',
    evidence: 'The Soul selects the appropriate skill or base workflow',
  },
  {
    id: 'clarification-and-assumptions',
    label: 'Clarification and assumptions',
    evidence: 'The response asks for missing critical inputs or states assumptions',
  },
  {
    id: 'asset-use',
    label: 'Asset use',
    evidence: 'Knowledge, playbooks, and templates are used when relevant',
  },
  {
    id: 'deliverable-completeness',
    label: 'Deliverable completeness',
    evidence: 'The final artifact is usable without hidden follow-up work',
  },
  {
    id: 'domain-depth',
    label: 'Domain depth',
    evidence: 'The answer reflects the Soul domain instead of generic advice',
  },
  {
    id: 'actionability',
    label: 'Actionability',
    evidence: 'The output contains concrete next steps, decisions, or artifacts',
  },
  {
    id: 'boundary-and-compliance',
    label: 'Boundary and compliance',
    evidence: 'The answer respects platform, domain, and safety constraints',
  },
  {
    id: 'self-check',
    label: 'Self-check',
    evidence: 'The response includes an appropriate review or validation pass',
  },
  {
    id: 'language-and-readability',
    label: 'Language and readability',
    evidence: 'The language is clear, concise, and suitable for the target user',
  },
]

export const OFFICIAL_SAMPLING_SOULS: SamplingSoul[] = [
  {
    appId: 'aiworker-freeform',
    displayName: 'AIWorker Freeform',
    agentsCases: makeAgentsCases('aiworker-freeform', 'general AI worker'),
    skills: [
      makeSkill('aiworker-freeform', 'freeform-session', 'freeform session'),
    ],
  },
  {
    appId: 'google-ads',
    displayName: 'Google Ads',
    agentsCases: makeAgentsCases('google-ads', 'local restaurant Google Ads'),
    skills: [
      makeSkill('google-ads', 'local-campaign-setup', 'local campaign setup'),
      makeSkill('google-ads', 'conversion-tracking', 'conversion tracking'),
      makeSkill('google-ads', 'client-onboarding', 'client onboarding'),
      makeSkill('google-ads', 'gbp-optimization', 'Google Business Profile optimization'),
      makeSkill('google-ads', 'ad-copy-local', 'local ad copy'),
      makeSkill('google-ads', 'client-performance-review', 'client performance review'),
    ],
  },
  {
    appId: 'hr-manager',
    displayName: 'HR Manager',
    agentsCases: makeAgentsCases('hr-manager', 'HR management'),
    skills: [
      makeSkill('hr-manager', 'compensation-offer', 'compensation offer'),
      makeSkill('hr-manager', 'onboarding-90day', '90-day onboarding'),
      makeSkill('hr-manager', 'competency-jd', 'competency-based JD'),
      makeSkill('hr-manager', 'structured-interview-kit', 'structured interview kit'),
      makeSkill('hr-manager', 'okr-goal-setting', 'OKR goal setting'),
    ],
  },
  {
    appId: 'product-manager',
    displayName: 'Product Manager',
    agentsCases: makeAgentsCases('product-manager', 'product management'),
    skills: [
      makeSkill('product-manager', 'metrics-framework', 'metrics framework'),
      makeSkill('product-manager', 'prd-writer', 'PRD writing'),
      makeSkill('product-manager', 'experiment-design', 'experiment design'),
      makeSkill('product-manager', 'backlog-prioritization', 'backlog prioritization'),
      makeSkill('product-manager', 'opportunity-assessment', 'opportunity assessment'),
    ],
  },
  {
    appId: 'software-support',
    displayName: 'Software Support',
    agentsCases: makeAgentsCases('software-support', 'software support'),
    skills: [
      makeSkill('software-support', 'ticket-triage', 'ticket triage'),
      makeSkill('software-support', 'troubleshooting-runbook', 'troubleshooting runbook'),
      makeSkill('software-support', 'incident-comms', 'incident communications'),
      makeSkill('software-support', 'kb-article', 'knowledge base article'),
    ],
  },
]

export function classifyFinding(text: string): FindingKind {
  if (/\bAGENTS\.md\b/i.test(text)) {
    return 'agents'
  }

  if (/\bSKILL\.md\b/i.test(text)) {
    return 'skill'
  }

  if (/\b(?:knowledge|playbook|templates?)\b/i.test(text)) {
    return 'knowledge-template'
  }

  if (/\b(?:descriptor|projection|cli|session|engine\s+bridge)\b/i.test(text)) {
    return 'platform'
  }

  return 'platform'
}

export function redactSamplingText(text: string): string {
  return text
    .replace(/\b(token=)\S+/gi, '$1[REDACTED]')
    .replace(/\b(phone=)\+?\d[\d -]{6,}\d/gi, '$1[REDACTED]')
    .replace(/\b(merchantId=)\S+/gi, '$1[REDACTED]')
    .replace(/\bsk-[\w-]+/g, '[REDACTED]')
}

function assertSafeSamplingId(value: string, label: 'caseId' | 'runId'): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`Unsafe sampling ${label}: ${value}`)
  }
}

function assertSafeRunId(runId: string): void {
  assertSafeSamplingId(runId, 'runId')
}

function assertSafeCaseId(caseId: string): void {
  assertSafeSamplingId(caseId, 'caseId')
}

export function buildSamplingManifest(input: BuildSamplingManifestInput): SamplingManifest {
  assertSafeRunId(input.runId)

  const skills = OFFICIAL_SAMPLING_SOULS.reduce((count, soul) => count + soul.skills.length, 0)
  const minAgentsCasesPerSoul = Math.min(
    ...OFFICIAL_SAMPLING_SOULS.map(soul => soul.agentsCases.length),
  )
  const minSkillCasesPerSkill = Math.min(
    ...OFFICIAL_SAMPLING_SOULS.flatMap(soul => soul.skills.map(skill => skill.cases.length)),
  )

  return {
    commit: input.commit,
    evidenceRoot: `tmp/e2e-soul-sampling/${input.runId}`,
    home: input.home,
    runId: input.runId,
    totals: {
      minAgentsCasesPerSoul,
      minSkillCasesPerSkill,
      skills,
      souls: OFFICIAL_SAMPLING_SOULS.length,
    },
    souls: OFFICIAL_SAMPLING_SOULS,
    scoreDimensions: SCORE_DIMENSIONS,
  }
}

export function buildCliPlan(input: CliPlanInput): string[][] {
  return [
    ['worker', 'create', input.scope.workerId, '--app', input.scope.appId],
    ['workspace', 'create', '--worker', input.scope.workerId, '--name', input.workspaceName],
    [
      'session',
      'start',
      '--worker',
      input.scope.workerId,
      '--workspace',
      input.workspaceId,
      '--title',
      input.caseId,
      '--input',
      input.prompt,
      '--engine',
      input.engine,
      '--reasoning',
      input.reasoning,
    ],
  ]
}

export function parseJsonObject(stdout: string): Record<string, unknown> {
  for (let index = 0; index < stdout.length; index++) {
    if (stdout[index] !== '{')
      continue

    const end = findJsonObjectEnd(stdout, index)
    if (end === -1)
      continue

    try {
      const parsed: unknown = JSON.parse(stdout.slice(index, end))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    }
    catch {
      // Keep scanning: CLI stdout can contain non-JSON logs before the payload.
    }
  }

  throw new Error('CLI stdout did not contain a JSON object')
}

function findJsonObjectEnd(text: string, start: number): number {
  let depth = 0
  let escaped = false
  let inString = false

  for (let index = start; index < text.length; index++) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"')
        inString = false
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      depth++
      continue
    }
    if (char === '}') {
      depth--
      if (depth === 0)
        return index + 1
    }
  }

  return -1
}

export function readNestedId(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Missing ${key}.id in CLI output`)

  const nested = (value as Record<string, unknown>)[key]
  if (!nested || typeof nested !== 'object' || Array.isArray(nested))
    throw new Error(`Missing ${key}.id in CLI output`)

  const id = (nested as Record<string, unknown>).id
  if (typeof id !== 'string' || id.trim().length === 0)
    throw new Error(`Missing ${key}.id in CLI output`)

  return id
}

export async function runSamplingCaseWithCli(input: RunSamplingCaseWithCliInput): Promise<SamplingCliResult> {
  const reasoning = input.reasoning
    ?? input.env?.AIWORKER_E2E_REASONING
    ?? process.env.AIWORKER_E2E_REASONING
    ?? 'high'
  const workspaceName = slugSamplingName(`${input.scope.appId}-${input.caseId}`)
  const workerCreateArgs = ['worker', 'create', input.scope.workerId, '--app', input.scope.appId]

  try {
    await input.runCli(workerCreateArgs, input.env)
  }
  catch (error) {
    if (!isWorkerAlreadyExistsError(error))
      throw error
  }

  const workspaceOutput = parseJsonObject(await input.runCli([
    'workspace',
    'create',
    '--worker',
    input.scope.workerId,
    '--name',
    workspaceName,
  ], input.env))
  const workspaceId = readNestedId(workspaceOutput, 'workspace')

  const plan = buildCliPlan({
    caseId: input.caseId,
    engine: 'codex',
    prompt: input.prompt,
    reasoning,
    scope: input.scope,
    workspaceId,
    workspaceName,
  })
  const sessionOutput = parseJsonObject(await input.runCli(plan[2]!, input.env))
  const sessionId = readNestedId(sessionOutput, 'session')
  const invocationId = readNestedId(sessionOutput, 'invocation')

  parseJsonObject(await input.runCli(['session', 'events', invocationId], input.env))

  return { invocationId, sessionId, workspaceId }
}

function isWorkerAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('fleet worker already exists:') || message.includes('worker already exists')
}

function slugSamplingName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return slug || 'sampling-case'
}

export async function runAiworkerCli(
  args: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const child = Bun.spawn(['bun', 'apps/worker-cli/src/aiworker.ts', ...args], {
    cwd: process.cwd(),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout ? new Response(child.stdout).text() : '',
    child.stderr ? new Response(child.stderr).text() : '',
    child.exited,
  ])

  if (exitCode !== 0) {
    throw new Error([
      `AIWorker CLI failed (${args.join(' ')}) with exit code ${exitCode}`,
      'stdout:',
      stdout.trim(),
      'stderr:',
      stderr.trim(),
    ].join('\n'))
  }

  return stdout
}

export function writeScorecard(input: ScorecardInput): void {
  assertSafeCaseId(input.caseId)

  const scorecardsDir = join(input.root, 'scorecards')
  mkdirSync(scorecardsDir, { recursive: true })

  writeFileSync(join(scorecardsDir, `${input.caseId}.json`), `${JSON.stringify({
    caseId: input.caseId,
    dimensions: input.dimensions,
    findingKinds: input.findingKinds,
    outputSnippet: redactSamplingText(input.outputSnippet),
    prompt: redactSamplingText(input.prompt),
    status: input.status,
  }, null, 2)}\n`)
}

export async function writeDryRunEvidence(manifest: SamplingManifest): Promise<{ manifestPath: string }> {
  mkdirSync(manifest.evidenceRoot, { recursive: true })

  const manifestPath = `${manifest.evidenceRoot}/manifest.json`
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return { manifestPath }
}

function defaultRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function currentCommit(): string {
  const result = Bun.spawnSync(['git', 'rev-parse', '--short=12', 'HEAD'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (!result.success) {
    return 'unknown'
  }

  return result.stdout.toString().trim() || 'unknown'
}

function parseRunSelection(args: string[]): SamplingRunSelection {
  let scope: SamplingRunSelection['scope']
  let soul: string | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--scope') {
      const value = args[++index]
      if (value !== 'pilot' && value !== 'pilot-retest')
        throw new Error('Expected --scope pilot or --scope pilot-retest')
      scope = value
      continue
    }
    if (arg === '--soul') {
      const value = args[++index]
      if (!value || value.startsWith('--'))
        throw new Error('Expected --soul <appId>')
      soul = value
      continue
    }
    throw new Error(`Unknown sampling option: ${arg}`)
  }

  if (scope && soul)
    throw new Error('Use either --scope or --soul, not both')
  if (!scope && !soul)
    throw new Error('Run requires --scope pilot|pilot-retest or --soul <appId>; dry-run writes only the manifest')

  return { scope, soul }
}

function selectSamplingRunCases(selection: SamplingRunSelection): SamplingRunCase[] {
  if (selection.soul) {
    const soul = requireSamplingSoul(selection.soul)
    return [
      ...soul.agentsCases,
      ...soul.skills.flatMap(skill => skill.cases),
    ].map(item => ({
      case: item,
      scope: samplingCliScope(soul.appId),
    }))
  }

  const freeform = requireSamplingSoul('aiworker-freeform')
  const softwareSupport = requireSamplingSoul('software-support')
  const softwareAgentsCase = requireSamplingCase(
    softwareSupport.agentsCases,
    'software-support-agents-routing',
  )
  const ticketTriage = softwareSupport.skills.find(skill => skill.id === 'ticket-triage')
  if (!ticketTriage)
    throw new Error('Sampling pilot case not found: ticket-triage')
  const ticketTriageCase = requireSamplingCase(ticketTriage.cases, 'ticket-triage-happy-path')

  return [
    ...freeform.agentsCases.map(item => ({
      case: item,
      scope: samplingCliScope(freeform.appId),
    })),
    {
      case: softwareAgentsCase,
      scope: samplingCliScope(softwareSupport.appId),
    },
    {
      case: ticketTriageCase,
      scope: samplingCliScope(softwareSupport.appId),
    },
  ]
}

function requireSamplingSoul(appId: string): SamplingSoul {
  const soul = OFFICIAL_SAMPLING_SOULS.find(item => item.appId === appId)
  if (!soul)
    throw new Error(`Unknown sampling Soul: ${appId}`)
  return soul
}

function requireSamplingCase(cases: SamplingCase[], caseId: string): SamplingCase {
  const item = cases.find(candidate => candidate.id === caseId)
  if (!item)
    throw new Error(`Sampling case not found: ${caseId}`)
  return item
}

function samplingCliScope(appId: string): SamplingCliScope {
  return {
    appId,
    workerId: `e2e-${appId}`,
  }
}

function buildCliEnv(manifest: SamplingManifest): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, AIWORKER_HOME: manifest.home }
  delete env.WORKER_DB_PATH
  return env
}

function samplingOutputSnippet(result: SamplingCliResult): string {
  return [
    `workspaceId=${result.workspaceId}`,
    `sessionId=${result.sessionId}`,
    `invocationId=${result.invocationId}`,
    'events=fetched',
  ].join(' ')
}

async function main(): Promise<void> {
  const command = process.argv[2]

  if (command !== 'dry-run' && command !== 'run') {
    console.error('Usage: bun scripts/e2e-soul-sampling.ts <dry-run|run> [--scope pilot|pilot-retest | --soul <appId>]')
    process.exitCode = 1
    return
  }

  const runId = process.env.AIWORKER_E2E_RUN_ID ?? defaultRunId()
  const manifest = buildSamplingManifest({
    commit: process.env.AIWORKER_E2E_COMMIT ?? currentCommit(),
    home: process.env.AIWORKER_E2E_HOME ?? `tmp/e2e-soul-sampling-home/${runId}`,
    runId,
  })
  const evidence = await writeDryRunEvidence(manifest)

  if (command === 'dry-run') {
    console.log(JSON.stringify({
      command,
      dryRun: true,
      evidenceRoot: manifest.evidenceRoot,
      manifestPath: evidence.manifestPath,
      manifest,
    }, null, 2))
    return
  }

  let selection: SamplingRunSelection
  try {
    selection = parseRunSelection(process.argv.slice(3))
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }
  const cases = selectSamplingRunCases(selection)
  const cliEnv = buildCliEnv(manifest)
  const results = []

  for (const item of cases) {
    try {
      const result = await runSamplingCaseWithCli({
        caseId: item.case.id,
        env: cliEnv,
        prompt: item.case.prompt,
        runCli: runAiworkerCli,
        scope: item.scope,
      })
      writeScorecard({
        caseId: item.case.id,
        dimensions: [],
        findingKinds: [],
        outputSnippet: samplingOutputSnippet(result),
        prompt: item.case.prompt,
        root: manifest.evidenceRoot,
        status: 'pass',
      })
      results.push({ caseId: item.case.id, ...result, status: 'pass' })
    }
    catch (error) {
      writeScorecard({
        caseId: item.case.id,
        dimensions: [],
        findingKinds: ['platform'],
        outputSnippet: error instanceof Error ? error.message : String(error),
        prompt: item.case.prompt,
        root: manifest.evidenceRoot,
        status: 'fail',
      })
      throw error
    }
  }

  console.log(JSON.stringify({
    command,
    dryRun: false,
    evidenceRoot: manifest.evidenceRoot,
    manifestPath: evidence.manifestPath,
    results,
    selection,
  }, null, 2))
}

if (import.meta.main) {
  await main()
}
