import { mkdtempSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  closeWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

mock.module('../../context', () => ({
  buildRuntime: () => {
    throw new Error('brain brief tests must not build a worker runtime')
  },
  loadWorkerContext: async () => ({
    workerId: 'w_brief_test',
    token: 'tok',
    configVersion: 1,
    hydrated: {
      brains: [],
      brainWriteTarget: '',
      brainRetrieval: 'first-match',
      executor: { engine: 'codex', variant: 'default' },
      channels: [],
      evolution: { enabled: false, observationRetentionDays: 7 },
    },
  }),
}))

const { resolveBrainHome } = await import('@zonease/aiworker-fs-layout')
const { runBrainBrief } = await import('./brain')

interface BriefOutput {
  workerId: string
  brief: {
    soulId: string
    sections: Array<{ id: string, source: string, protected: boolean, body: string }>
    droppedSections: Array<{ id: string }>
    warnings: string[]
    tokensUsed: number
    tokensBudget: number
  }
  note: string
}

describe('aiworker brain brief command (PLAN-102)', () => {
  let dir: string
  let savedAiworkerHome: string | undefined
  let brainHome: string

  beforeEach(async () => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-cli-brief-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    savedAiworkerHome = process.env.AIWORKER_HOME
    process.env.AIWORKER_HOME = dir
    brainHome = resolveBrainHome('w_brief_test')
    await mkdir(brainHome, { recursive: true })
  })

  afterEach(async () => {
    closeWorkerDb()
    if (savedAiworkerHome === undefined)
      delete process.env.AIWORKER_HOME
    else
      process.env.AIWORKER_HOME = savedAiworkerHome
    await rm(dir, { recursive: true, force: true })
  })

  function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T, output: string }> {
    const captured: string[] = []
    const original = console.log
    console.log = ((...args: unknown[]) => {
      captured.push(args.map(arg => String(arg)).join(' '))
    }) as typeof console.log
    return fn()
      .then(result => ({ result, output: captured.join('\n') }))
      .finally(() => {
        console.log = original
      })
  }

  it('returns 2 when --task is missing', async () => {
    expect(await runBrainBrief({ task: '' })).toBe(2)
  })

  it('compiles a developer brief from canonical brain files and synthesises risk-policy', async () => {
    await writeFile(join(brainHome, 'AGENT.md'), '# dev worker\n', 'utf8')
    await writeFile(join(brainHome, 'SOUL.md'), '# voice\n', 'utf8')
    await writeFile(join(brainHome, 'MEMORY.md'), '# memory\n- prefer dry-run\n', 'utf8')

    const { result, output } = await captureConsole(() =>
      runBrainBrief({ soulId: 'developer', task: 'review orchestrator service' }),
    )
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as BriefOutput
    expect(parsed.note).toContain('projection')
    expect(parsed.brief.soulId).toBe('developer')
    const sectionIds = parsed.brief.sections.map(s => s.id)
    expect(sectionIds).toContain('agent')
    expect(sectionIds).toContain('memory')
    expect(sectionIds).toContain('risk-policy')
    const riskPolicy = parsed.brief.sections.find(s => s.id === 'risk-policy')
    expect(riskPolicy?.protected).toBe(true)
    expect(riskPolicy?.body).toContain('Soul: developer')
  })

  it('includes artifact-summary when --artifact ids are passed and resolvable', async () => {
    const { BrainArtifactRegistry } = await import('@zonease/aiworker-core')
    const registry = new BrainArtifactRegistry()
    registry.register({
      id: 'src-bus',
      ref: 'packages/core/src/worker/events/bus.ts',
      sensitivity: 'internal',
      source: 'operator',
      summary: 'Internal event bus',
      type: 'code-module',
    })

    const { output } = await captureConsole(() =>
      runBrainBrief({
        artifactRefs: ['src-bus', 'unknown-id'],
        soulId: 'developer',
        task: 'inspect referenced artifacts',
      }),
    )
    const parsed = JSON.parse(output) as BriefOutput
    const summary = parsed.brief.sections.find(s => s.id === 'artifact-summary')
    expect(summary).toBeDefined()
    expect(summary?.body).toContain('src-bus')
    expect(summary?.body).toContain('not found in brain artifact registry')
  })

  it('drops non-protected sections when --token-budget is tight; keeps risk-policy', async () => {
    const longLine = 'x'.repeat(2000)
    await writeFile(join(brainHome, 'AGENT.md'), longLine, 'utf8')
    await writeFile(join(brainHome, 'MEMORY.md'), longLine, 'utf8')

    const { output } = await captureConsole(() =>
      runBrainBrief({
        soulId: 'developer',
        task: 'tight budget probe',
        tokenBudget: 250,
      }),
    )
    const parsed = JSON.parse(output) as BriefOutput
    expect(parsed.brief.droppedSections.length).toBeGreaterThan(0)
    const ids = parsed.brief.sections.map(s => s.id)
    expect(ids).toContain('risk-policy')
  })

  it('records executor when --executor is provided', async () => {
    const { output } = await captureConsole(() =>
      runBrainBrief({ executor: 'claude-code', soulId: 'developer', task: 'preview executor wiring' }),
    )
    const parsed = JSON.parse(output) as BriefOutput & { brief: { executor?: string } }
    expect(parsed.brief.executor).toBe('claude-code')
  })

  it('returns 1 when soulId is unknown', async () => {
    const { result } = await captureConsole(() =>
      runBrainBrief({ soulId: 'not-real', task: 'x' }),
    )
    expect(result).toBe(1)
  })
})
