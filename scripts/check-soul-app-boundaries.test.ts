import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('check-soul-app-boundaries', () => {
  test('allows completion audit once Host-embedded Soul renderers are removed', () => {
    const result = spawnSync('bun', ['scripts/check-soul-app-boundaries.ts', '--completion-audit'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain('Host-embedded renderer debt')
    expect(result.stderr).not.toContain('apps/web/src/worker/souls')
  })
})
