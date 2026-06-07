import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  compareEnvStructure,
  normalizeEnvStructure,
  runEnvStructureCheck,
  syncEnvStructure,
} from './check-env-structure'

describe('env structure checker', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aiworker-env-structure-'))
  })

  afterEach(async () => {
    await rm(root, { force: true, recursive: true })
  })

  it('ignores values but requires comments blanks keys and order to match', () => {
    const expected = [
      '# Shared comment',
      '',
      'FIRST=value',
      '# Second comment',
      'SECOND=',
      '',
    ].join('\n')
    const actual = [
      '# Shared comment',
      '',
      'FIRST=actual-secret',
      '# Second comment',
      'SECOND=local-value',
      '',
    ].join('\n')

    expect(compareEnvStructure(expected, actual).ok).toBe(true)
    expect(normalizeEnvStructure(actual).map(line => line.signature)).toEqual([
      'comment:# Shared comment',
      'blank:',
      'env:FIRST',
      'comment:# Second comment',
      'env:SECOND',
      'blank:',
    ])
  })

  it('reports mismatched comments and keys with line numbers', () => {
    const result = compareEnvStructure([
      '# Comment from example',
      'FIRST=',
      'SECOND=',
    ].join('\n'), [
      '# Different local comment',
      'SECOND=local',
      'FIRST=local',
    ].join('\n'))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      'line 1: expected comment:# Comment from example, got comment:# Different local comment',
      'line 2: expected env:FIRST, got env:SECOND',
      'line 3: expected env:SECOND, got env:FIRST',
    ])
  })

  it('keeps inline assignment comments while ignoring hashes inside quoted values', () => {
    expect(normalizeEnvStructure([
      'QUOTED="value # not a comment" # visible comment',
      'RAW=value#not-comment',
      'UNSUPPORTED line',
    ].join('\n')).map(line => line.signature)).toEqual([
      'env:QUOTED # visible comment',
      'env:RAW',
      'other:UNSUPPORTED line',
    ])
  })

  it('checks .env.example and .env files from a project root', async () => {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, '.env.example'), '# A\nA=\n')
    await writeFile(join(root, '.env'), '# A\nA=local\n')

    const result = runEnvStructureCheck({ cwd: root })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('env structure ok')
    expect(result.stderr).toBe('')
  })

  it('syncs local values into the example structure and drops extra fields', () => {
    const expected = [
      '# Header',
      'A=default',
      '',
      '# B',
      'B=',
      '',
    ].join('\n')
    const actual = [
      '# old header',
      'EXTRA=remove-me',
      'B=local-b',
      'A=local-a',
      '',
    ].join('\n')

    expect(syncEnvStructure(expected, actual)).toBe([
      '# Header',
      'A=local-a',
      '',
      '# B',
      'B=local-b',
      '',
    ].join('\n'))
  })

  it('fails when .env is missing', () => {
    const result = runEnvStructureCheck({ cwd: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing .env')
  })

  it('registers the checker for development commands without wiring it into build checks', async () => {
    const pkg = JSON.parse(await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts['dev:env:check']).toBe('bun scripts/check-env-structure.ts')
    expect(pkg.scripts['dev:env:sync']).toBe('bun scripts/check-env-structure.ts --write')
    for (const scriptName of [
      'dev:worker',
      'dev:worker:status',
      'dev:host',
      'dev:host:status',
      'dev:worker-daemon',
      'dev:web',
      'dev:apps',
      'dev:status',
      'dev:fleet',
      'dev:fleet:status',
      'dev:fleet-web',
      'dev:fleet-web:status',
    ]) {
      expect(pkg.scripts[scriptName]).toStartWith('bun run dev:env:check && ')
    }

    for (const scriptName of ['build', 'check', 'lint', 'release:check', 'typecheck']) {
      expect(pkg.scripts[scriptName]).not.toContain('dev:env:check')
    }
  })
})
