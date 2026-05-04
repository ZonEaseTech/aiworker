import type { BrainArtifact } from './artifact'

import { describe, expect, it } from 'bun:test'

import {
  brainArtifactRegisterInputSchema,
  brainArtifactSchema,
  isSensitiveBrainArtifact,
  redactBrainArtifact,
} from './artifact'

const NOW = '2026-05-04T15:00:00.000Z'

function devArtifact(overrides: Partial<BrainArtifact> = {}): BrainArtifact {
  return {
    createdAt: NOW,
    evidenceRefs: [],
    hash: 'a'.repeat(64),
    id: 'src-orchestrator',
    ref: 'packages/core/src/worker/orchestrator/service.ts',
    sensitivity: 'internal',
    source: 'operator',
    status: 'active',
    summary: 'Worker orchestrator service entry point',
    type: 'code-module',
    updatedAt: NOW,
    ...overrides,
  }
}

function hrArtifact(overrides: Partial<BrainArtifact> = {}): BrainArtifact {
  return {
    createdAt: NOW,
    evidenceRefs: ['screening-decision-2026-05-04.md'],
    id: 'candidate-c-001',
    ref: 'candidates/resumes/c-001.pdf',
    scopeId: 'backend-hire-q3',
    sensitivity: 'confidential',
    source: 'channel-import',
    status: 'active',
    summary: 'Backend candidate, 6y exp, available 2026-06',
    type: 'candidate-resume',
    updatedAt: NOW,
    ...overrides,
  }
}

describe('brain artifact schema', () => {
  it('parses developer + HR fixtures with the same contract', () => {
    expect(brainArtifactSchema.safeParse(devArtifact()).success).toBe(true)
    expect(brainArtifactSchema.safeParse(hrArtifact()).success).toBe(true)
  })

  it('rejects malformed id / type / sensitivity', () => {
    expect(brainArtifactSchema.safeParse(devArtifact({ id: 'BAD ID' })).success).toBe(false)
    expect(brainArtifactSchema.safeParse(devArtifact({ type: 'Code Module' })).success).toBe(false)
    expect(brainArtifactSchema.safeParse({ ...devArtifact(), sensitivity: 'classified' as never }).success).toBe(false)
  })

  it('rejects malformed hash (not 64-char hex)', () => {
    expect(brainArtifactSchema.safeParse(devArtifact({ hash: 'abc' })).success).toBe(false)
  })

  it('allows hash to be omitted', () => {
    const artifact = devArtifact()
    delete (artifact as { hash?: string }).hash
    expect(brainArtifactSchema.safeParse(artifact).success).toBe(true)
  })

  it('rejects oversize summary', () => {
    expect(brainArtifactSchema.safeParse(devArtifact({ summary: 'x'.repeat(2001) })).success).toBe(false)
  })
})

describe('brainArtifactRegisterInputSchema defaults', () => {
  it('fills in default sensitivity and status', () => {
    const result = brainArtifactRegisterInputSchema.safeParse({
      id: 'foo',
      ref: 'bar',
      source: 'operator',
      type: 'note',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sensitivity).toBe('internal')
      expect(result.data.status).toBe('active')
    }
  })
})

describe('redactBrainArtifact', () => {
  it('passes through public / internal artifacts unchanged', () => {
    const dev = devArtifact()
    expect(redactBrainArtifact(dev)).toBe(dev)
    expect(redactBrainArtifact(devArtifact({ sensitivity: 'public' }))).toEqual(
      devArtifact({ sensitivity: 'public' }),
    )
  })

  it('redacts ref + hash for confidential / secret artifacts but keeps summary', () => {
    const hr = hrArtifact()
    const redacted = redactBrainArtifact(hr)
    expect(redacted.ref).toBe('<redacted>')
    expect(redacted.summary).toBe(hr.summary)
    expect(redacted).not.toBe(hr)

    const secret = redactBrainArtifact(devArtifact({ sensitivity: 'secret', hash: 'b'.repeat(64) }))
    expect(secret.ref).toBe('<redacted>')
    expect(secret.hash).toBe('<redacted>')
  })

  it('redacts confidential artifacts even when hash is absent', () => {
    const noHash = hrArtifact()
    delete (noHash as { hash?: string }).hash
    const redacted = redactBrainArtifact(noHash)
    expect(redacted.ref).toBe('<redacted>')
    expect(redacted.hash).toBeUndefined()
  })
})

describe('isSensitiveBrainArtifact', () => {
  it.each([
    ['public', false],
    ['internal', false],
    ['confidential', true],
    ['secret', true],
  ] as const)('reports %s as sensitive=%s', (sensitivity, expected) => {
    expect(isSensitiveBrainArtifact(devArtifact({ sensitivity }))).toBe(expected)
  })
})
