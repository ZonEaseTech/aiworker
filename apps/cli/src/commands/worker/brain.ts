import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { BrainMemory, BrainSkill } from '@zonease/aiworker-shared'
import type { WorkerContext } from '../../context'

import { existsSync } from 'node:fs'
import path from 'node:path'

import { describeBrainSource } from '@zonease/aiworker-core'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import consola from 'consola'

import { buildRuntime, loadWorkerContext } from '../../context'

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
