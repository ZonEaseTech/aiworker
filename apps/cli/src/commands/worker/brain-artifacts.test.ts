import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
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
    throw new Error('brain artifacts tests must not build a worker runtime')
  },
  loadWorkerContext: async () => ({
    workerId: 'w_artifacts_test',
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

const { BrainArtifactRegistry } = await import('@zonease/aiworker-core')
const { runBrainArtifactsList, runBrainArtifactsShow } = await import('./brain')

interface ArtifactsListOutput {
  workerId: string
  count: number
  redacted: boolean
  artifacts: Array<{
    id: string
    type: string
    sensitivity: string
    ref: string
    hash?: string
    summary?: string
    metadata?: Record<string, unknown>
    scopeId?: string
  }>
}

interface ArtifactsShowOutput {
  workerId: string
  redacted: boolean
  artifact: {
    id: string
    ref: string
    sensitivity: string
    hash?: string
    summary?: string
    metadata?: Record<string, unknown>
  }
}

describe('aiworker brain artifacts commands (PLAN-099)', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-cli-artifacts-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
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

  it('list defaults to redacting confidential / secret artifacts', async () => {
    const registry = new BrainArtifactRegistry()
    registry.register({
      id: 'src-bus',
      ref: 'packages/core/src/worker/events/bus.ts',
      sensitivity: 'internal',
      source: 'operator',
      summary: 'Internal event bus',
      type: 'code-module',
    })
    registry.register({
      hash: 'a'.repeat(64),
      id: 'candidate-c-001',
      ref: 'candidates/resumes/c-001.pdf',
      sensitivity: 'confidential',
      source: 'channel-import',
      summary: 'Backend candidate, 6y exp',
      type: 'candidate-resume',
    })

    const { result, output } = await captureConsole(() => runBrainArtifactsList())
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as ArtifactsListOutput
    expect(parsed.count).toBe(2)
    expect(parsed.redacted).toBe(true)
    const candidate = parsed.artifacts.find(a => a.id === 'candidate-c-001')
    const code = parsed.artifacts.find(a => a.id === 'src-bus')
    expect(candidate?.ref).toBe('<redacted>')
    expect(candidate?.hash).toBe('<redacted>')
    expect(candidate?.summary).toBe('Backend candidate, 6y exp')
    expect(code?.ref).toBe('packages/core/src/worker/events/bus.ts')
  })

  it('list --show-sensitive returns ref + hash for confidential', async () => {
    const registry = new BrainArtifactRegistry()
    registry.register({
      hash: 'b'.repeat(64),
      id: 'r1',
      ref: 'private/path',
      sensitivity: 'confidential',
      source: 'operator',
      type: 'note',
    })
    const { result, output } = await captureConsole(() => runBrainArtifactsList({ showSensitive: true }))
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as ArtifactsListOutput
    expect(parsed.redacted).toBe(false)
    expect(parsed.artifacts[0]?.ref).toBe('private/path')
    expect(parsed.artifacts[0]?.hash).toBe('b'.repeat(64))
  })

  it('list filters by scope and type', async () => {
    const registry = new BrainArtifactRegistry()
    registry.register({ id: 'a', ref: 'a', scopeId: 's1', source: 'operator', type: 'candidate-resume' })
    registry.register({ id: 'b', ref: 'b', scopeId: 's1', source: 'operator', type: 'screening-decision' })
    registry.register({ id: 'c', ref: 'c', scopeId: 's2', source: 'operator', type: 'candidate-resume' })

    const { output } = await captureConsole(() => runBrainArtifactsList({ scopeId: 's1', type: 'candidate-resume' }))
    const parsed = JSON.parse(output) as ArtifactsListOutput
    expect(parsed.count).toBe(1)
    expect(parsed.artifacts[0]?.id).toBe('a')
  })

  it('list rejects an out-of-range limit with exit code 2', async () => {
    const result = await runBrainArtifactsList({ limit: 9999 })
    expect(result).toBe(2)
  })

  it('show redacts confidential ref by default and unlocks with showSensitive', async () => {
    const registry = new BrainArtifactRegistry()
    registry.register({
      id: 'rec-1',
      ref: 'audit/rec-1.csv',
      sensitivity: 'confidential',
      source: 'operator',
      summary: 'Q3 reconciliation',
      type: 'audit-trail',
    })

    const redacted = await captureConsole(() => runBrainArtifactsShow('rec-1'))
    expect(redacted.result).toBe(0)
    const redactedParsed = JSON.parse(redacted.output) as ArtifactsShowOutput
    expect(redactedParsed.artifact.ref).toBe('<redacted>')
    expect(redactedParsed.artifact.summary).toBe('Q3 reconciliation')

    const unlocked = await captureConsole(() => runBrainArtifactsShow('rec-1', { showSensitive: true }))
    const unlockedParsed = JSON.parse(unlocked.output) as ArtifactsShowOutput
    expect(unlockedParsed.artifact.ref).toBe('audit/rec-1.csv')
  })

  it('show returns 1 for unknown id', async () => {
    const result = await runBrainArtifactsShow('not-there')
    expect(result).toBe(1)
  })

  it('show requires a non-empty id', async () => {
    const result = await runBrainArtifactsShow('')
    expect(result).toBe(2)
  })
})
