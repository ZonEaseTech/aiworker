import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'
import { discoverSoulApps, discoveryTripwireError } from './check-soul-app-boundaries'

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

  test('discovers official Soul apps that live outside src/', () => {
    const names = discoverSoulApps().map(app => app.name)
    expect(names).toContain('aiworker-hr')
    expect(names).toContain('aiworker-qa')
    expect(names).toContain('aiworker-custom')
  })

  test('tripwire fires when manifests exist but nothing is discovered', () => {
    expect(discoveryTripwireError(2, 0)).toContain('scan nothing')
    expect(discoveryTripwireError(2, 2)).toBeNull()
    expect(discoveryTripwireError(0, 0)).toBeNull()
  })

  test('catches a Soul App Host-private import located outside src/', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'apps/demo-soul')
      mkdirSync(join(appDir, 'host-adapter'), { recursive: true })
      writeFileSync(join(appDir, 'soul-app.manifest.json'), JSON.stringify({ id: 'demo-soul' }))
      writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: '@demo/soul' }))
      writeFileSync(
        join(appDir, 'host-adapter/bad.ts'),
        'import { thing } from "@zonease/aiworker-core"\nexport const y = thing\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/demo-soul/host-adapter/bad.ts')
      expect(result.stderr).toContain('@zonease/aiworker-core')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('catches Host code importing Soul internals outside src/', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'apps/demo-soul')
      mkdirSync(join(appDir, 'host-adapter'), { recursive: true })
      writeFileSync(join(appDir, 'soul-app.manifest.json'), JSON.stringify({ id: 'demo-soul' }))
      writeFileSync(join(appDir, 'host-adapter/api.ts'), 'export const api = 1\n')

      const webDir = join(tempRoot, 'apps/web/src')
      mkdirSync(webDir, { recursive: true })
      writeFileSync(
        join(webDir, 'bad.ts'),
        'import { api } from "../../demo-soul/host-adapter/api"\nexport const z = api\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/web/src/bad.ts')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('exempts Soul App test files from the import boundary', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'apps/demo-soul')
      mkdirSync(join(appDir, 'host-adapter'), { recursive: true })
      writeFileSync(join(appDir, 'soul-app.manifest.json'), JSON.stringify({ id: 'demo-soul' }))
      writeFileSync(
        join(appDir, 'host-adapter/api.test.ts'),
        'import { thing } from "@zonease/aiworker-core"\nexport const y = thing\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
})
