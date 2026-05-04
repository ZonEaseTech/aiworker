import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { BrainArtifact, BrainArtifactSensitivity, BrainArtifactStatus, BrainMemory, BrainSkill, ScopeManifest } from '@zonease/aiworker-shared'
import type { WorkerContext } from '../../context'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { BrainArtifactRegistry, describeBrainSource } from '@zonease/aiworker-core'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { parseScopeManifestJson } from '@zonease/aiworker-shared'
import consola from 'consola'

import { buildRuntime, loadWorkerContext } from '../../context'

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
      const memoryCount = memories.length
      const identity = inspectBrainIdentity()
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
        assets: {
          identity,
          skillCount: skills.length,
          memoryCount,
          hint: skills.length === 0 && memoryCount === 0
            ? 'No brain skills or memories yet. Add `.aiworker/skills/<name>/SKILL.md` or `.aiworker/memories/<topic>.md` directly; brain runtime does not write them automatically.'
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
  agent: boolean
  soul: boolean
  user: boolean
  root?: string
}

function inspectBrainIdentity(): BrainIdentitySummary {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot)
    return { agent: false, soul: false, user: false }
  const root = path.join(scope.projectRoot, '.aiworker')
  return {
    root,
    agent: existsSync(path.join(root, 'AGENT.md')),
    soul: existsSync(path.join(root, 'SOUL.md')),
    user: existsSync(path.join(root, 'USER.md')),
  }
}

export async function runBrainSkills(): Promise<number> {
  try {
    return await withBrainRuntime(async (ctx, runtime) => {
      const skills = await runtime.brain.listSkills()
      console.log(JSON.stringify({
        workerId: ctx.workerId,
        count: skills.length,
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
