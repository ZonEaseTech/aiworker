import { describe, expect, it } from 'bun:test'

import { runPackList, runPackShow } from './pack'

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

describe('aiworker pack commands', () => {
  it('lists built-in worker packs as workbench assets', async () => {
    const { result, output } = await captureStdout(() => runPackList())

    expect(result).toBe(0)
    expect(output).toContain('[aiworker pack] built-in worker packs')
    expect(output).toContain('developer')
    expect(output).toContain('hr-recruiting')
    expect(output).toContain('project-manager')
    expect(output).toContain('qa-reviewer')
    expect(output).toContain('SKILL.md + DOMAIN.md')
  })

  it('shows skill and domain markdown for one worker pack', async () => {
    const { result, output } = await captureStdout(() => runPackShow('developer'))

    expect(result).toBe(0)
    expect(output).toContain('[aiworker pack] developer (Developer)')
    expect(output).toContain('Work order templates:')
    expect(output).toContain('SKILL.md:')
    expect(output).toContain('# Developer Worker Skill')
    expect(output).toContain('DOMAIN.md:')
    expect(output).toContain('# Developer Domain')
  })

  it('returns exit code 2 for an unknown worker pack id', async () => {
    const { result, output } = await captureStderr(() => runPackShow('missing-pack'))

    expect(result).toBe(2)
    expect(output).toContain('unknown worker pack')
    expect(output).toContain('developer')
  })
})
