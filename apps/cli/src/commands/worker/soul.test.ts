import { describe, expect, it } from 'bun:test'

import { runSoulShow } from './soul'

function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T, output: string }> {
  const captured: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }) as typeof process.stdout.write
  return fn()
    .then(result => ({ result, output: captured.join('') }))
    .finally(() => {
      process.stdout.write = original
    })
}

function captureStderr<T>(fn: () => Promise<T>): Promise<{ result: T, output: string }> {
  const captured: string[] = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }) as typeof process.stderr.write
  return fn()
    .then(result => ({ result, output: captured.join('') }))
    .finally(() => {
      process.stderr.write = original
    })
}

describe('aiworker soul show (PLAN-100 schema pack output)', () => {
  it('prints developer schema pack with primary scope kind, artifact types, workflow states', async () => {
    const { result, output } = await captureStdout(() => runSoulShow('developer'))
    expect(result).toBe(0)
    expect(output).toContain('[aiworker soul] developer (Developer)')
    expect(output).toContain('Schema pack (PLAN-100')
    expect(output).toContain('Primary scope kind : developer-repo')
    expect(output).toContain('Supported scopes   : developer-repo, general')
    expect(output).toContain('Artifact types     : code-module, adr, design-doc, test-suite, release-note, changelog-entry')
    expect(output).toContain('Workflow states    : draft, review, merged, released, rolled-back')
    expect(output).toContain('Proposal types     : memory-add, brain-skill-add, policy-update')
  })

  it('prints hr-recruiting schema pack with hiring-pool scope and candidate workflow', async () => {
    const { output } = await captureStdout(() => runSoulShow('hr-recruiting'))
    expect(output).toContain('Primary scope kind : hiring-pool')
    expect(output).toContain('Artifact types     : candidate-resume, screening-decision, interview-note, offer-letter, reference-check')
    expect(output).toContain('Entity types       : role, candidate, hiring-pipeline-stage')
    expect(output).toContain('Workflow states    : applied, screening, interview, offer, hired, rejected, archived')
  })

  it('prints general-assistant schema pack and renders empty entity types as <none>', async () => {
    const { output } = await captureStdout(() => runSoulShow('general-assistant'))
    expect(output).toContain('Primary scope kind : general')
    expect(output).toContain('Artifact types     : note')
    expect(output).toContain('Entity types       : <none>')
    expect(output).toContain('Workflow states    : active, archived')
  })

  it('returns exit code 2 for an unknown Soul id', async () => {
    const { result, output } = await captureStderr(() => runSoulShow('not-a-real-soul'))
    expect(result).toBe(2)
    expect(output).toContain('unknown Soul preset')
  })
})
