import type { ScopeManifest } from '@zonease/aiworker-shared'

import { mkdtempSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createBuiltinSoulRegistry } from '@zonease/aiworker-shared'
import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BrainArtifactRegistry } from '../artifacts'
import { BrainBriefCompiler } from './compiler'

interface FreshContext {
  brainHome: string
  cleanup: () => Promise<void>
}

async function freshBrainHome(): Promise<FreshContext> {
  const root = mkdtempSync(join(tmpdir(), 'aiworker-brief-'))
  const brainHome = join(root, '.aiworker')
  await mkdir(brainHome, { recursive: true })
  return {
    brainHome,
    cleanup: () => rm(root, { force: true, recursive: true }),
  }
}

const REGISTRY = createBuiltinSoulRegistry()

const NOW = new Date('2026-05-04T17:10:00.000Z')

describe('BrainBriefCompiler (PLAN-102)', () => {
  let ctx: FreshContext

  beforeEach(async () => {
    ctx = await freshBrainHome()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  it('compiles a developer brief from canonical brain files + risk-policy synth', async () => {
    await writeFile(join(ctx.brainHome, 'AGENT.md'), '# Developer worker\nResponsible for code review\n', 'utf8')
    await writeFile(join(ctx.brainHome, 'SOUL.md'), '# Voice\n直接、证据优先\n', 'utf8')
    await writeFile(join(ctx.brainHome, 'MEMORY.md'), '# memory\nprefer dry-run for shell\n', 'utf8')
    await writeFile(join(ctx.brainHome, 'ROLLUP.md'), '# rollup\nRecent decisions: PLAN-099 shipped\n', 'utf8')

    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      soulId: 'developer',
      task: 'review the new orchestrator service',
    })

    const sectionIds = brief.sections.map(section => section.id)
    expect(sectionIds).toContain('agent')
    expect(sectionIds).toContain('soul')
    expect(sectionIds).toContain('memory')
    expect(sectionIds).toContain('rollup')
    expect(sectionIds).toContain('risk-policy')
    expect(sectionIds).toContain('recent-changes')

    const riskPolicy = brief.sections.find(s => s.id === 'risk-policy')
    expect(riskPolicy?.protected).toBe(true)
    expect(riskPolicy?.body).toContain('Soul: developer')
    expect(riskPolicy?.body).toContain('High-risk approval required: true')

    expect(brief.compiledAt).toBe('2026-05-04T17:10:00.000Z')
    expect(brief.tokensUsed).toBeGreaterThan(0)
  })

  it('falls back to scope manifest primarySoul when request omits soulId', async () => {
    await writeFile(join(ctx.brainHome, 'AGENT.md'), 'agent\n', 'utf8')
    const manifest: ScopeManifest = {
      id: 'backend-hire-q3',
      kind: 'hiring-pool',
      primarySoul: 'hr-recruiting',
      privacy: 'private',
      schemaVersion: 1,
    }

    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      scopeManifestReader: async () => manifest,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({ task: 'screen candidate c-001' })
    expect(brief.soulId).toBe('hr-recruiting')
    expect(brief.scopeId).toBe('backend-hire-q3')
    const compliance = brief.sections.find(s => s.id === 'compliance')
    expect(compliance?.protected).toBe(true)
    expect(compliance?.body).toContain('Compliance reminders')
  })

  it('drops non-protected sections when budget is tight but always retains protected sections', async () => {
    const longLine = 'x'.repeat(2000)
    await writeFile(join(ctx.brainHome, 'AGENT.md'), longLine, 'utf8')
    await writeFile(join(ctx.brainHome, 'SOUL.md'), longLine, 'utf8')
    await writeFile(join(ctx.brainHome, 'MEMORY.md'), longLine, 'utf8')
    await writeFile(join(ctx.brainHome, 'ROLLUP.md'), longLine, 'utf8')

    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      soulId: 'developer',
      task: 'tight budget probe',
      tokenBudget: 200,
    })
    const ids = brief.sections.map(section => section.id)
    expect(ids).toContain('risk-policy')
    expect(brief.droppedSections.length).toBeGreaterThan(0)
    const riskPolicy = brief.sections.find(s => s.id === 'risk-policy')
    expect(riskPolicy?.protected).toBe(true)
  })

  it('includes an artifact-summary extra section when artifactRegistry is wired and refs are provided', async () => {
    closeWorkerDb()
    initWorkerDb(join(ctx.brainHome, 'worker.db'))
    runWorkerMigrations()
    const registry = new BrainArtifactRegistry()
    registry.register({
      id: 'src-bus',
      ref: 'packages/core/src/worker/events/bus.ts',
      sensitivity: 'internal',
      source: 'operator',
      summary: 'Internal event bus',
      type: 'code-module',
    })

    const compiler = new BrainBriefCompiler({
      artifactRegistry: registry,
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      artifactRefs: ['src-bus', 'missing-id'],
      soulId: 'developer',
      task: 'inspect referenced artifacts',
    })
    closeWorkerDb()
    const summary = brief.sections.find(s => s.id === 'artifact-summary')
    expect(summary).toBeDefined()
    expect(summary?.body).toContain('src-bus')
    expect(summary?.body).toContain('not found in brain artifact registry')
  })

  it('warns when artifactRefs supplied but no registry configured', async () => {
    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      artifactRefs: ['anything'],
      soulId: 'developer',
      task: 'no registry',
    })
    expect(brief.warnings.some(w => w.includes('artifact-summary'))).toBe(true)
  })

  it('handles missing canonical files gracefully (drops section instead of throwing)', async () => {
    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      soulId: 'developer',
      task: 'no files',
    })
    const ids = brief.sections.map(section => section.id)
    expect(ids).not.toContain('agent')
    expect(ids).not.toContain('soul')
    expect(ids).toContain('risk-policy')
  })

  it('throws on unknown soulId', async () => {
    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    await expect(compiler.compile({ soulId: 'not-real', task: 'x' })).rejects.toThrow(/unknown Soul id/)
  })

  it('records executor when provided in the request', async () => {
    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      executor: 'codex',
      soulId: 'developer',
      task: 'preview executor wiring',
    })
    expect(brief.executor).toBe('codex')
  })

  it('BUG-060: injects task-matched memory body files alongside the MEMORY.md index', async () => {
    await writeFile(join(ctx.brainHome, 'MEMORY.md'), [
      '# Long-term memory',
      '> Durable facts.',
      '- [QA fixture](qa-fixture.md) — admission MVP smoke',
      '- [Cron schedule](cron-schedule.md) — background jobs',
    ].join('\n'), 'utf8')
    await mkdir(join(ctx.brainHome, 'memories'), { recursive: true })
    await writeFile(join(ctx.brainHome, 'memories', 'qa-fixture.md'), '# QA fixture\n\nadmission MVP 验证通过.', 'utf8')
    await writeFile(join(ctx.brainHome, 'memories', 'cron-schedule.md'), '# Cron schedule\n\nrollup runs daily.', 'utf8')

    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      soulId: 'developer',
      task: 'admission MVP qa fixture status',
    })

    const memorySection = brief.sections.find(s => s.id === 'memory')
    expect(memorySection).toBeDefined()
    expect(memorySection?.body).toContain('QA fixture')
    expect(memorySection?.body).toContain('admission MVP 验证通过')
    expect(memorySection?.body).toContain('memories/qa-fixture.md')
    // Unmatched memory bodies should not be eagerly included
    expect(memorySection?.body).not.toContain('rollup runs daily')
  })

  it('BUG-060: falls back to index-only memory section when no body matches the task', async () => {
    await writeFile(join(ctx.brainHome, 'MEMORY.md'), [
      '# Long-term memory',
      '- [Cron schedule](cron-schedule.md) — background jobs',
    ].join('\n'), 'utf8')
    await mkdir(join(ctx.brainHome, 'memories'), { recursive: true })
    await writeFile(join(ctx.brainHome, 'memories', 'cron-schedule.md'), '# Cron schedule\n\nrollup runs daily.', 'utf8')

    const compiler = new BrainBriefCompiler({
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const brief = await compiler.compile({
      soulId: 'developer',
      task: 'completely unrelated topic xyz',
    })
    const memorySection = brief.sections.find(s => s.id === 'memory')
    expect(memorySection).toBeDefined()
    expect(memorySection?.body).not.toContain('rollup runs daily')
    expect(memorySection?.body).toContain('Long-term memory')
  })

  it('BUG-062: never emits an artifact-summary section when artifactRefs are empty / falsy', async () => {
    closeWorkerDb()
    initWorkerDb(join(ctx.brainHome, 'worker.db'))
    runWorkerMigrations()
    const registry = new BrainArtifactRegistry()

    const compiler = new BrainBriefCompiler({
      artifactRegistry: registry,
      brainHome: ctx.brainHome,
      now: () => NOW,
      soulRegistry: REGISTRY,
    })
    const briefNoRefs = await compiler.compile({
      soulId: 'developer',
      task: 'no artifacts please',
    })
    closeWorkerDb()
    expect(briefNoRefs.sections.find(s => s.id === 'artifact-summary')).toBeUndefined()

    closeWorkerDb()
    initWorkerDb(join(ctx.brainHome, 'worker.db'))
    runWorkerMigrations()
    const briefRogueRefs = await compiler.compile({
      // Simulates downstream caller that forwarded a degenerate cac value.
      artifactRefs: ['', '   ', undefined as unknown as string],
      soulId: 'developer',
      task: 'no artifacts please',
    })
    closeWorkerDb()
    expect(briefRogueRefs.sections.find(s => s.id === 'artifact-summary')).toBeUndefined()
    // The 'undefined: not found' literal must not show up regardless.
    for (const section of briefRogueRefs.sections)
      expect(section.body).not.toContain('undefined: not found')
  })
})
