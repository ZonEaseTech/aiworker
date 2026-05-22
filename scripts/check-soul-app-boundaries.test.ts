import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
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

  test('blocks Host Web imports of the shared workbench package', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const sourceDir = join(tempRoot, 'apps/web/src/worker')
      mkdirSync(sourceDir, { recursive: true })
      writeFileSync(join(sourceDir, 'bad.tsx'), [
        'import { UniversalWorkbenchApp } from "@zonease/aiworker-soul-app-workbench"',
        'export function Bad() {',
        '  return UniversalWorkbenchApp',
        '}',
      ].join('\n'))

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts'), '--completion-audit'], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/web/src/worker/bad.tsx')
      expect(result.stderr).toContain('@zonease/aiworker-soul-app-workbench')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
})
