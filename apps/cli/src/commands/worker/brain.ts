import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { BrainAdmissionProposal, BrainAdmissionStatus, BrainArtifact, BrainArtifactSensitivity, BrainArtifactStatus, BrainMemory, BrainSkill, ScopeManifest } from '@zonease/aiworker-shared'
import type { WorkerContext } from '../../context'

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { BrainAdmissionService, BrainArtifactRegistry, BrainBriefCompiler, BrainInboxService, BrainJournalService, describeBrainSource, getDecisionPipelineSnapshot } from '@zonease/aiworker-core'
import { NATIVE_PROJECT_SKILL_TARGETS, projectScopeManifestPath, resolveAiworkerScope, resolveBrainHome } from '@zonease/aiworker-fs-layout'
import { createBuiltinSoulRegistry, parseScopeManifestJson } from '@zonease/aiworker-shared'
import consola from 'consola'

import { buildRuntime, loadWorkerContext } from '../../context'
import {
  applyNativeSkillProjectionSync,
  planNativeSkillProjectionSync,
  publicNativeSkillProjectionPlan,
} from './native-skill-projections'

const SOUL_REGISTRY = createBuiltinSoulRegistry()

async function withWorkerContext<T>(fn: (ctx: WorkerContext) => Promise<T>): Promise<T> {
  const ctx = await loadWorkerContext({ silent: true })
  return await fn(ctx)
}

export interface BrainMemoriesOptions {
  limit?: number
  query?: string
}

async function withBrainRuntime<T>(
  fn: (ctx: WorkerContext, runtime: WorkerRuntime) => Promise<T>,
): Promise<T> {
  const ctx = await loadWorkerContext({ silent: true })
  const runtime = buildRuntime(ctx)
  try {
    return await fn(ctx, runtime)
  }
  finally {
    runtime.dispose()
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined)
    return 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new InvalidBrainLimitError('limit must be an integer between 1 and 200')
  return limit
}

/**
 * BUG-061 read-path redact gate.
 *
 * Two doors must be open before plaintext leaves the worker process:
 *   - the operator passes `--show-sensitive=true` (intent),
 *   - the worker process env carries `AIWORKER_ADMIN_REVEAL=1` (capability).
 *
 * Either missing falls back to the default redacted view and emits a stderr
 * hint explaining what would be needed. This keeps the existing CLI flag
 * usable for trusted local debug while making admin-UI / fleet relays
 * incapable of accidentally surfacing plaintext.
 */
export function resolveAdmissionRedactPolicy(input: { showSensitive: boolean | undefined, env?: NodeJS.ProcessEnv }): {
  redactSensitive: boolean
  showSensitiveDeniedReason?: 'missing-env-gate'
} {
  const env = input.env ?? process.env
  const wantsReveal = input.showSensitive === true
  const envOpened = env.AIWORKER_ADMIN_REVEAL === '1'
  if (wantsReveal && envOpened)
    return { redactSensitive: false }
  if (wantsReveal && !envOpened)
    return { redactSensitive: true, showSensitiveDeniedReason: 'missing-env-gate' }
  return { redactSensitive: true }
}

function memorySummary(memory: BrainMemory): Record<string, unknown> {
  return {
    id: memory.id,
    content: memory.content,
    metadata: memory.metadata,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    ...(memory.score === undefined ? {} : { score: memory.score }),
  }
}

function skillSummary(skill: BrainSkill): Record<string, unknown> {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    ...(skill.tags === undefined ? {} : { tags: skill.tags }),
  }
}

export async function runBrainStatus(): Promise<number> {
  try {
    return await withBrainRuntime(async (ctx, runtime) => {
      const health = await runtime.brain.health()
      const skills = await runtime.brain.listSkills().catch(() => [])
      const memories = await runtime.brain.listMemories({ limit: 200 }).catch(() => [])
      const nativeExecutorSkills = await inspectNativeProjectSkillTargets()
      const nativeSkillProjection = await inspectNativeSkillProjectionLifecycle()
      const memoryCount = memories.length
      const identity = inspectBrainIdentity()
      const decisionPipeline = ctx.hydrated.orchestrator?.decisionPipeline
      const decisionPipelineConfig = {
        intentEvaluator: decisionPipeline?.intentClassifier?.evaluator ?? 'heuristic' as const,
        qualityEvaluator: decisionPipeline?.qualityGate?.evaluator ?? 'heuristic' as const,
        qualityMode: decisionPipeline?.qualityGate?.mode ?? 'observe' as const,
        ...(decisionPipeline?.qualityGate?.threshold === undefined
          ? {}
          : { qualityThreshold: decisionPipeline.qualityGate.threshold }),
        conversationClassifierEnabled: decisionPipeline?.executor !== undefined,
      }
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        configVersion: ctx.configVersion,
        status: health.status,
        brainRetrieval: ctx.hydrated.brainRetrieval,
        brainWriteTarget: ctx.hydrated.brainWriteTarget,
        brains: ctx.hydrated.brains.map(source => describeBrainSource(
          ctx.workerId,
          source,
          ctx.hydrated.brainWriteTarget,
        )),
        scope: inspectScopeSummary(),
        decisionPipeline: getDecisionPipelineSnapshot(decisionPipelineConfig),
        assets: {
          identity,
          fallbackBrainSkillCount: skills.length,
          skillCount: skills.length,
          memoryCount,
          nativeExecutorSkills,
          nativeSkillProjection,
          hint: skills.length === 0 && memoryCount === 0 && nativeExecutorSkills.every(target => target.count === 0)
            ? 'No native executor skills, fallback brain skills, or memories yet. Project init normally writes Codex/Claude Code skills to native project skill directories; Brain memories live under `.aiworker/memories/`.'
            : undefined,
        },
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain status] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface BrainJournalShowOptions {
  showSensitive?: boolean
}

export async function runBrainJournalShow(taskId: string, options: BrainJournalShowOptions = {}): Promise<number> {
  try {
    return await withWorkerContext(async (ctx) => {
      const journal = new BrainJournalService({
        config: ctx.hydrated,
        workerId: ctx.workerId,
      }).getTaskTrace(taskId, { redactSensitive: options.showSensitive !== true })
      if (journal === null) {
        consola.error(`[aiworker brain journal show] task not found: ${taskId}`)
        return 1
      }
      console.log(JSON.stringify({ journal }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain journal show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface BrainInboxProposeOptions {
  scopeId?: string
  soulId?: string
}

export async function runBrainInboxPropose(taskId: string, options: BrainInboxProposeOptions = {}): Promise<number> {
  if (taskId === undefined || taskId === '') {
    consola.error('[aiworker brain inbox propose] task id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const result = new BrainInboxService().proposeFromTask(taskId, {
        ...(options.scopeId === undefined ? {} : { scopeId: options.scopeId }),
        ...(options.soulId === undefined ? {} : { soulId: options.soulId }),
      })
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        ...result,
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain inbox propose] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

interface ScopeSummary {
  status: 'ok' | 'missing' | 'malformed' | 'not-applicable'
  manifest?: {
    kind: ScopeManifest['kind']
    primarySoul: ScopeManifest['primarySoul']
    privacy?: ScopeManifest['privacy']
    retention?: ScopeManifest['retention']
    approval?: ScopeManifest['approval']
    artifactRootCount: number
    labels: readonly string[]
  }
  error?: string
}

function inspectScopeSummary(): ScopeSummary {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot)
    return { status: 'not-applicable' }
  const scopePath = path.join(scope.projectRoot, '.aiworker', 'scope.json')
  if (!existsSync(scopePath))
    return { status: 'missing' }
  let raw: string
  try {
    raw = readFileSync(scopePath, 'utf8')
  }
  catch (err) {
    return { error: err instanceof Error ? err.message : String(err), status: 'malformed' }
  }
  const parsed = parseScopeManifestJson(raw)
  if (parsed.status === 'malformed')
    return { error: parsed.error, status: 'malformed' }
  const m = parsed.manifest
  return {
    manifest: {
      ...(m.approval === undefined ? {} : { approval: m.approval }),
      artifactRootCount: m.artifactRoots?.length ?? 0,
      kind: m.kind,
      labels: m.labels ?? [],
      primarySoul: m.primarySoul,
      ...(m.privacy === undefined ? {} : { privacy: m.privacy }),
      ...(m.retention === undefined ? {} : { retention: m.retention }),
    },
    status: 'ok',
  }
}

interface BrainIdentitySummary {
  soul: boolean
  user: boolean
  root?: string
}

function inspectBrainIdentity(): BrainIdentitySummary {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot)
    return { soul: false, user: false }
  const root = path.join(scope.projectRoot, '.aiworker')
  return {
    root,
    soul: existsSync(path.join(root, 'SOUL.md')),
    user: existsSync(path.join(root, 'USER.md')),
  }
}

export async function runBrainSkills(): Promise<number> {
  try {
    return await withBrainRuntime(async (ctx, runtime) => {
      const skills = await runtime.brain.listSkills()
      const nativeExecutorSkills = await inspectNativeProjectSkillTargets()
      const nativeSkillProjection = await inspectNativeSkillProjectionLifecycle()
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        fallbackBrainSkillCount: skills.length,
        count: skills.length,
        nativeExecutorSkills,
        nativeSkillProjection,
        skills: skills.map(skillSummary),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain skills] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface BrainSkillsSyncNativeOptions {
  apply?: boolean
  dryRun?: boolean
}

export async function runBrainSkillsSyncNative(options: BrainSkillsSyncNativeOptions = {}): Promise<number> {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot) {
    consola.error('[aiworker brain skills sync-native] native skill projection is only available in project scope')
    return 2
  }

  try {
    const shouldApply = options.apply === true
    const plan = shouldApply
      ? await applyNativeSkillProjectionSync(scope.projectRoot)
      : await planNativeSkillProjectionSync({ mode: 'dry-run', projectRoot: scope.projectRoot })

    console.log(JSON.stringify(publicNativeSkillProjectionPlan(plan), null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker brain skills sync-native] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runBrainMemories(options: BrainMemoriesOptions = {}): Promise<number> {
  try {
    const limit = clampLimit(options.limit)
    return await withBrainRuntime(async (ctx, runtime) => {
      const query = options.query?.trim()
      const memories = query
        ? (await runtime.brain.searchMemories(query)).slice(0, limit)
        : await runtime.brain.listMemories({ limit })
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        ...(query ? { query } : {}),
        count: memories.length,
        memories: memories.map(memorySummary),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain memories] failed: ${err instanceof Error ? err.message : String(err)}`)
    return err instanceof InvalidBrainLimitError ? 2 : 1
  }
}

class InvalidBrainLimitError extends Error {}

interface NativeProjectSkillTargetSummary {
  count: number
  directory: string
  engine: string
  exists: boolean
  path: string
}

async function inspectNativeSkillProjectionLifecycle(): Promise<Record<string, unknown> | null> {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot)
    return null
  const plan = await planNativeSkillProjectionSync({ mode: 'dry-run', projectRoot: scope.projectRoot })
  return {
    desiredCount: plan.desiredCount,
    manifestExists: plan.manifestExists,
    manifestPath: plan.manifestPath,
    summary: plan.summary,
    attention: plan.operations
      .filter(operation => operation.status !== 'active')
      .map(({ writeContent: _writeContent, ...operation }) => operation),
  }
}

async function inspectNativeProjectSkillTargets(): Promise<NativeProjectSkillTargetSummary[]> {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot)
    return []

  const summaries: NativeProjectSkillTargetSummary[] = []
  for (const target of NATIVE_PROJECT_SKILL_TARGETS) {
    const dir = path.join(scope.projectRoot, ...target.directory.split('/'))
    const exists = existsSync(dir)
    summaries.push({
      count: exists ? await countSkillEntrypoints(dir) : 0,
      directory: target.directory,
      engine: target.engine,
      exists,
      path: dir,
    })
  }
  return summaries
}

async function countSkillEntrypoints(dir: string): Promise<number> {
  const glob = new Bun.Glob('**/SKILL.md')
  let count = 0
  for await (const _relative of glob.scan({ cwd: dir }))
    count += 1
  return count
}

export interface BrainArtifactsListOptions {
  scopeId?: string
  type?: string
  status?: BrainArtifactStatus
  minSensitivity?: BrainArtifactSensitivity
  limit?: number
  showSensitive?: boolean
}

export interface BrainArtifactsShowOptions {
  showSensitive?: boolean
}

function clampArtifactLimit(limit: number | undefined): number {
  if (limit === undefined)
    return 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new InvalidBrainLimitError('limit must be an integer between 1 and 200')
  return limit
}

function artifactSummary(artifact: BrainArtifact): Record<string, unknown> {
  return {
    id: artifact.id,
    type: artifact.type,
    sensitivity: artifact.sensitivity,
    source: artifact.source,
    status: artifact.status,
    ref: artifact.ref,
    ...(artifact.scopeId === undefined ? {} : { scopeId: artifact.scopeId }),
    ...(artifact.hash === undefined ? {} : { hash: artifact.hash }),
    ...(artifact.retention === undefined ? {} : { retention: artifact.retention }),
    ...(artifact.summary === undefined ? {} : { summary: artifact.summary }),
    evidenceRefs: artifact.evidenceRefs,
    ...(artifact.metadata === undefined ? {} : { metadata: artifact.metadata }),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  }
}

export async function runBrainArtifactsList(options: BrainArtifactsListOptions = {}): Promise<number> {
  try {
    const limit = clampArtifactLimit(options.limit)
    return await withWorkerContext(async (ctx) => {
      const registry = new BrainArtifactRegistry()
      const filterOptions: Parameters<BrainArtifactRegistry['list']>[0] = { limit }
      if (options.scopeId !== undefined)
        filterOptions.scopeId = options.scopeId
      if (options.type !== undefined)
        filterOptions.type = options.type
      if (options.status !== undefined)
        filterOptions.status = options.status
      if (options.minSensitivity !== undefined)
        filterOptions.minSensitivity = options.minSensitivity
      const artifacts = registry.list(filterOptions, { redactSensitive: options.showSensitive !== true })
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        count: artifacts.length,
        redacted: options.showSensitive !== true,
        artifacts: artifacts.map(artifactSummary),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain artifacts list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return err instanceof InvalidBrainLimitError ? 2 : 1
  }
}

export async function runBrainArtifactsShow(id: string, options: BrainArtifactsShowOptions = {}): Promise<number> {
  if (id === undefined || id === '') {
    consola.error('[aiworker brain artifacts show] id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const registry = new BrainArtifactRegistry()
      const artifact = registry.get(id, { redactSensitive: options.showSensitive !== true })
      if (artifact === null) {
        consola.error(`[aiworker brain artifacts show] artifact "${id}" not found`)
        return 1
      }
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        redacted: options.showSensitive !== true,
        artifact: artifactSummary(artifact),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain artifacts show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface BrainAdmissionListOptions {
  status?: BrainAdmissionStatus
  kind?: string
  scopeId?: string
  soulId?: string
  limit?: number
  showSensitive?: boolean
}

export interface BrainAdmissionShowOptions {
  showSensitive?: boolean
}

export interface BrainAdmissionApprovalOptions {
  decidedBy: string
  reason?: string
}

export interface BrainAdmissionApplyOptions {
  decidedBy: string
  /** Default `false` (dry-run). */
  commit?: boolean
  /** BUG-055 secret-body policy. Default `'block'`. */
  allowSecretBody?: 'block' | 'redact' | 'raw'
}

function admissionSummary(p: BrainAdmissionProposal): Record<string, unknown> {
  return {
    id: p.id,
    soulId: p.soulId,
    kind: p.kind,
    status: p.status,
    risk: p.risk,
    confidence: p.confidence,
    target: p.target,
    summary: p.summary,
    rollback: p.rollback,
    ...(p.scopeId === undefined ? {} : { scopeId: p.scopeId }),
    evidenceCount: p.evidence.length,
    ...(p.payload === undefined ? {} : { payload: p.payload }),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

function admissionFullView(p: BrainAdmissionProposal): Record<string, unknown> {
  return {
    ...admissionSummary(p),
    evidence: p.evidence,
  }
}

export async function runBrainAdmissionList(options: BrainAdmissionListOptions = {}): Promise<number> {
  try {
    const limit = clampArtifactLimit(options.limit)
    return await withWorkerContext(async (ctx) => {
      const service = new BrainAdmissionService()
      const filterOptions: Parameters<BrainAdmissionService['list']>[0] = { limit }
      if (options.status !== undefined)
        filterOptions.status = options.status
      if (options.kind !== undefined)
        filterOptions.kind = options.kind
      if (options.scopeId !== undefined)
        filterOptions.scopeId = options.scopeId
      if (options.soulId !== undefined)
        filterOptions.soulId = options.soulId
      const policy = resolveAdmissionRedactPolicy({ showSensitive: options.showSensitive })
      if (policy.showSensitiveDeniedReason === 'missing-env-gate')
        consola.warn('[aiworker brain admission list] --show-sensitive ignored: set AIWORKER_ADMIN_REVEAL=1 in the worker process env to unlock plaintext')
      const result = service.list(filterOptions, { redactSensitive: policy.redactSensitive })
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        count: result.proposals.length,
        redacted: policy.redactSensitive,
        proposals: result.proposals.map(admissionSummary),
        skipped: result.skipped,
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain admission list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return err instanceof InvalidBrainLimitError ? 2 : 1
  }
}

export async function runBrainAdmissionShow(id: string, options: BrainAdmissionShowOptions = {}): Promise<number> {
  if (id === undefined || id === '') {
    consola.error('[aiworker brain admission show] id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const service = new BrainAdmissionService()
      const policy = resolveAdmissionRedactPolicy({ showSensitive: options.showSensitive })
      if (policy.showSensitiveDeniedReason === 'missing-env-gate')
        consola.warn('[aiworker brain admission show] --show-sensitive ignored: set AIWORKER_ADMIN_REVEAL=1 in the worker process env to unlock plaintext')
      const proposal = service.get(id, { redactSensitive: policy.redactSensitive })
      if (proposal === null) {
        consola.error(`[aiworker brain admission show] proposal "${id}" not found`)
        return 1
      }
      const decisions = service.listDecisions(id)
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        redacted: policy.redactSensitive,
        proposal: admissionFullView(proposal),
        decisions,
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain admission show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runBrainAdmissionApprove(id: string, options: BrainAdmissionApprovalOptions): Promise<number> {
  if (id === undefined || id === '') {
    consola.error('[aiworker brain admission approve] id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const service = new BrainAdmissionService()
      const updated = service.approve(id, { decidedBy: options.decidedBy, ...(options.reason === undefined ? {} : { reason: options.reason }) })
      console.log(JSON.stringify({ workerId: ctx.workerId, decision: 'approved', proposal: admissionSummary(updated) }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain admission approve] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runBrainAdmissionReject(id: string, options: BrainAdmissionApprovalOptions): Promise<number> {
  if (id === undefined || id === '') {
    consola.error('[aiworker brain admission reject] id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const service = new BrainAdmissionService()
      const updated = service.reject(id, { decidedBy: options.decidedBy, ...(options.reason === undefined ? {} : { reason: options.reason }) })
      console.log(JSON.stringify({ workerId: ctx.workerId, decision: 'rejected', proposal: admissionSummary(updated) }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain admission reject] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface BrainBriefOptions {
  task: string
  scopeId?: string
  soulId?: string
  /**
   * Raw value from cac: `undefined` (flag missing), a single string (flag
   * passed once), or an array (flag repeated). The runner normalizes this
   * via `normalizeRepeatableStringOption` before forwarding to the compiler.
   */
  artifactRefs?: readonly string[] | string
  executor?: string
  tokenBudget?: number
}

function normalizeRepeatableStringOption(value: readonly string[] | string | undefined): string[] {
  if (value === undefined)
    return []
  const arr = Array.isArray(value) ? [...value] : [value]
  return arr
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}

export async function runBrainBrief(options: BrainBriefOptions): Promise<number> {
  if (options.task === undefined || options.task.trim() === '') {
    consola.error('[aiworker brain brief] --task is required')
    return 2
  }
  // BUG-054: cac normalizes `--artifact <id>` to undefined when missing, a
  // single string when passed once, or an array when passed multiple times.
  // Normalize all three into a clean array of non-empty strings so callers
  // never accidentally produce `artifactRefs: [undefined]` (which used to
  // surface as a literal "undefined" line in the brief artifact-summary).
  const artifactRefs = normalizeRepeatableStringOption(options.artifactRefs)
  try {
    return await withWorkerContext(async (ctx) => {
      const brainHome = resolveBrainHome(ctx.workerId)
      const scope = resolveAiworkerScope()
      const compiler = new BrainBriefCompiler({
        artifactRegistry: new BrainArtifactRegistry(),
        brainHome,
        scopeManifestReader: async () => {
          if (scope.scope !== 'project' || !scope.projectRoot)
            return null
          try {
            const raw = await readFile(projectScopeManifestPath(scope.projectRoot), 'utf8')
            const parsed = parseScopeManifestJson(raw)
            return parsed.status === 'ok' ? parsed.manifest : null
          }
          catch {
            return null
          }
        },
        soulRegistry: SOUL_REGISTRY,
      })
      const brief = await compiler.compile({
        task: options.task,
        ...(options.scopeId === undefined ? {} : { scopeId: options.scopeId }),
        ...(options.soulId === undefined ? {} : { soulId: options.soulId }),
        ...(artifactRefs.length === 0 ? {} : { artifactRefs }),
        ...(options.executor === undefined ? {} : { executor: options.executor }),
        ...(options.tokenBudget === undefined ? {} : { tokenBudget: options.tokenBudget }),
      })
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        brief,
        note: 'Brief is a projection of canonical brain (<brainHome>); orchestrator system prompt is unchanged.',
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain brief] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface BrainAdmissionProposeOptions {
  id?: string
  kind?: string
  target?: string
  summary?: string
  rollback?: string
  soulId?: string
  scopeId?: string
  risk?: string
  confidence?: number
  evidencePath?: string
  payloadPath?: string
}

/**
 * Formal operator / LLM-facing admission proposal entry point. It only writes
 * a pending worker.db row; operator approval + apply remain separate steps.
 */
export async function runBrainAdmissionPropose(options: BrainAdmissionProposeOptions): Promise<number> {
  const required: Array<[keyof BrainAdmissionProposeOptions, string]> = [
    ['id', '--id'],
    ['target', '--target'],
    ['summary', '--summary'],
    ['rollback', '--rollback'],
    ['soulId', '--soul'],
  ]
  for (const [key, flag] of required) {
    const value = options[key]
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
      consola.error(`[aiworker brain admission propose] ${flag} is required`)
      return 2
    }
  }
  const risk = options.risk
  if (risk !== undefined && risk !== 'low' && risk !== 'medium' && risk !== 'high') {
    consola.error(`[aiworker brain admission propose] --risk must be one of low | medium | high, got "${risk}"`)
    return 2
  }
  let evidence: unknown
  let payload: unknown
  try {
    if (options.evidencePath !== undefined)
      evidence = JSON.parse(await readFile(options.evidencePath, 'utf8'))
    if (options.payloadPath !== undefined)
      payload = JSON.parse(await readFile(options.payloadPath, 'utf8'))
  }
  catch (err) {
    consola.error(`[aiworker brain admission propose] failed to read fixture file: ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }
  if (evidence !== undefined && !Array.isArray(evidence)) {
    consola.error('[aiworker brain admission propose] --evidence file must contain a JSON array')
    return 2
  }
  if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) {
    consola.error('[aiworker brain admission propose] --payload file must contain a JSON object')
    return 2
  }

  try {
    return await withWorkerContext(async (ctx) => {
      const service = new BrainAdmissionService()
      const input = {
        confidence: options.confidence ?? 0.5,
        id: options.id!,
        kind: options.kind ?? 'memory-add',
        rollback: options.rollback!,
        soulId: options.soulId!,
        summary: options.summary!,
        target: options.target!,
        ...(risk === undefined ? {} : { risk: risk as 'low' | 'medium' | 'high' }),
        ...(options.scopeId === undefined ? {} : { scopeId: options.scopeId }),
        ...(evidence === undefined ? {} : { evidence: evidence as never }),
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      }
      const proposal = service.propose(input)
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        proposal: admissionFullView(proposal),
      }, null, 2))
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain admission propose] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runBrainAdmissionApply(id: string, options: BrainAdmissionApplyOptions): Promise<number> {
  if (id === undefined || id === '') {
    consola.error('[aiworker brain admission apply] id is required')
    return 2
  }
  try {
    return await withWorkerContext(async (ctx) => {
      const service = new BrainAdmissionService()
      const brainHome = resolveBrainHome(ctx.workerId)
      const result = await service.apply(id, {
        brainHome,
        commit: options.commit === true,
        decidedBy: options.decidedBy,
        ...(options.allowSecretBody === undefined ? {} : { allowSecretBody: options.allowSecretBody }),
      })
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        outcome: result,
      }, null, 2))
      if (result.kind === 'failed' || result.kind === 'blocked-by-secret-scan')
        return 1
      return 0
    })
  }
  catch (err) {
    consola.error(`[aiworker brain admission apply] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
