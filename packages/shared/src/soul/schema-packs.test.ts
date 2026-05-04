import type { BrainArtifact } from '../brain'

import { describe, expect, it } from 'bun:test'

import { brainArtifactSchema } from '../brain'
import { createBuiltinSoulRegistry } from './index'

const NOW = '2026-05-04T15:45:00.000Z'

function artifact(overrides: Partial<BrainArtifact> & Pick<BrainArtifact, 'id' | 'type' | 'ref'>): BrainArtifact {
  return {
    createdAt: NOW,
    evidenceRefs: [],
    sensitivity: 'internal',
    source: 'operator',
    status: 'active',
    updatedAt: NOW,
    ...overrides,
  }
}

const REGISTRY = createBuiltinSoulRegistry()

describe('Soul schema packs (PLAN-100)', () => {
  it('developer schema pack covers code/architecture lifecycle', () => {
    const pack = REGISTRY.getSchemaPack('developer')
    expect(pack.artifactTypes).toEqual(expect.arrayContaining([
      'code-module',
      'adr',
      'design-doc',
      'test-suite',
      'release-note',
      'changelog-entry',
    ]))
    expect(pack.workflowStates).toEqual(expect.arrayContaining([
      'draft',
      'review',
      'merged',
      'released',
      'rolled-back',
    ]))
    expect(pack.proposalTypes).toEqual(expect.arrayContaining([
      'memory-add',
      'brain-skill-add',
      'policy-update',
    ]))
  })

  it('hr-recruiting schema pack covers hiring pipeline lifecycle', () => {
    const pack = REGISTRY.getSchemaPack('hr-recruiting')
    expect(pack.artifactTypes).toEqual(expect.arrayContaining([
      'candidate-resume',
      'screening-decision',
      'interview-note',
      'offer-letter',
      'reference-check',
    ]))
    expect(pack.workflowStates).toEqual(expect.arrayContaining([
      'applied',
      'screening',
      'interview',
      'offer',
      'hired',
      'rejected',
    ]))
    expect(pack.entityTypes).toEqual(expect.arrayContaining(['role', 'candidate']))
  })

  it('every built-in Soul declares non-empty schema pack arrays for artifactTypes / proposalTypes / workflowStates', () => {
    for (const module of REGISTRY.list()) {
      expect(module.schemaPack.artifactTypes.length).toBeGreaterThan(0)
      expect(module.schemaPack.proposalTypes.length).toBeGreaterThan(0)
      expect(module.schemaPack.workflowStates.length).toBeGreaterThan(0)
    }
  })

  it('every built-in Soul declares "memory-add" as a baseline admission proposal type', () => {
    for (const module of REGISTRY.list())
      expect(module.schemaPack.proposalTypes).toContain('memory-add')
  })

  it('artifact type identifiers stay kebab-case across all schema packs', () => {
    for (const module of REGISTRY.list()) {
      for (const type of module.schemaPack.artifactTypes)
        expect(type).toMatch(/^[a-z][a-z0-9-]*$/)
      for (const proposal of module.schemaPack.proposalTypes)
        expect(proposal).toMatch(/^[a-z][a-z0-9-]*$/)
      for (const state of module.schemaPack.workflowStates)
        expect(state).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })
})

describe('synthetic developer fixture (PLAN-100)', () => {
  it('a code-module artifact validates against the BrainArtifact schema and matches a registered Soul', () => {
    const code = artifact({
      hash: 'a'.repeat(64),
      id: 'src-orchestrator-service',
      metadata: { workflowState: 'merged', commitSha: 'abcdef0123456789' },
      ref: 'packages/core/src/worker/orchestrator/service.ts',
      summary: 'Worker orchestrator service entry point',
      type: 'code-module',
    })
    expect(brainArtifactSchema.safeParse(code).success).toBe(true)
    expect(REGISTRY.findByArtifactType('code-module').map(m => m.manifest.id)).toContain('developer')
    expect(REGISTRY.getSchemaPack('developer').workflowStates).toContain('merged')
  })

  it('an ADR artifact moves through draft → review → merged in metadata.workflowState', () => {
    const states = ['draft', 'review', 'merged'] as const
    const pack = REGISTRY.getSchemaPack('developer')
    for (const state of states) {
      const adr = artifact({
        id: `adr-${state}`,
        metadata: { workflowState: state },
        ref: `docs/adr/000${state.length}.md`,
        type: 'adr',
      })
      expect(brainArtifactSchema.safeParse(adr).success).toBe(true)
      expect(pack.workflowStates).toContain(state)
    }
  })
})

describe('synthetic hr-recruiting fixture (PLAN-100)', () => {
  // Synthetic only — no PII.
  it('a candidate-resume artifact at confidential sensitivity validates and matches HR Soul', () => {
    const resume = artifact({
      hash: 'c'.repeat(64),
      id: 'candidate-c-001',
      metadata: { workflowState: 'screening', candidateId: 'c-001', roleId: 'role-be-q3' },
      ref: 'candidates/resumes/c-001.pdf',
      scopeId: 'backend-hire-q3',
      sensitivity: 'confidential',
      source: 'channel-import',
      summary: 'Backend candidate, 6y exp (synthetic, no PII)',
      type: 'candidate-resume',
    })
    expect(brainArtifactSchema.safeParse(resume).success).toBe(true)

    const owners = REGISTRY.findByArtifactType('candidate-resume').map(m => m.manifest.id)
    expect(owners).toEqual(['hr-recruiting'])

    const pack = REGISTRY.getSchemaPack('hr-recruiting')
    expect(pack.workflowStates).toContain('screening')
    expect(pack.entityTypes).toContain('candidate')
  })

  it('a screening-decision artifact passes schema validation with Soul-specific workflow state', () => {
    const decision = artifact({
      evidenceRefs: ['interview-2026-05-04.md', 'reference-check-1.md'],
      id: 'screening-c-001',
      metadata: { workflowState: 'interview', decisionAuthorId: 'user-1' },
      ref: 'candidates/screening/c-001.md',
      scopeId: 'backend-hire-q3',
      sensitivity: 'confidential',
      summary: 'Synthetic screening decision — proceed to interview',
      type: 'screening-decision',
    })
    expect(brainArtifactSchema.safeParse(decision).success).toBe(true)
    expect(REGISTRY.getSchemaPack('hr-recruiting').workflowStates).toContain('interview')
  })

  it('hr-recruiting workflow allows hired and rejected as terminal states', () => {
    const pack = REGISTRY.getSchemaPack('hr-recruiting')
    expect(pack.workflowStates).toContain('hired')
    expect(pack.workflowStates).toContain('rejected')
  })
})

describe('cross-Soul invariants (PLAN-100)', () => {
  it('Brain Kernel does NOT require an artifact type to belong to exactly one Soul', () => {
    // `design-doc` is shared between developer and product-designer.
    const dev = REGISTRY.getSchemaPack('developer').artifactTypes
    const designer = REGISTRY.getSchemaPack('product-designer').artifactTypes
    const shared = dev.filter(type => designer.includes(type))
    expect(shared).toContain('design-doc')

    // Validating an artifact with a shared type still succeeds — Kernel only
    // checks shape, not "type ∈ exactly one Soul.schemaPack".
    const designDoc = artifact({
      id: 'shared-design-doc',
      ref: 'docs/design/auth-flow.md',
      type: 'design-doc',
    })
    expect(brainArtifactSchema.safeParse(designDoc).success).toBe(true)
  })
})
