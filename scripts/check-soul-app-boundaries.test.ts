import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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
    expect(result.stderr).not.toContain('apps/worker-web/src/worker/souls')
  })

  test('blocks Worker Web imports of the retired shared workbench package', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const sourceDir = join(tempRoot, 'apps/worker-web/src/worker')
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
      expect(result.stderr).toContain('apps/worker-web/src/worker/bad.tsx')
      expect(result.stderr).toContain('@zonease/aiworker-soul-app-workbench')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('discovers the Freeform v1 Soul from souls/', () => {
    const names = discoverSoulApps().map(app => app.name)
    expect(names).toContain('aiworker-freeform')
    expect(names).not.toContain('aiworker-custom')
  })

  test('tripwire fires when manifests exist but nothing is discovered', () => {
    expect(discoveryTripwireError(2, 0)).toContain('scan nothing')
    expect(discoveryTripwireError(2, 2)).toBeNull()
    expect(discoveryTripwireError(0, 0)).toBeNull()
  })

  test('requires internal dev-sampling catalog env for first-party dev-only worker create scripts', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const scriptsDir = join(tempRoot, 'scripts')
      mkdirSync(scriptsDir, { recursive: true })
      writeFileSync(join(scriptsDir, 'bad-dev-create.ts'), [
        'export const args = ["worker", "create", "w-hr", "--app", "hr-manager"]',
        '',
      ].join('\n'))

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('bad-dev-create.ts')
      expect(result.stderr).toContain('internal dev-sampling catalog env')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('allows public Freeform worker create scripts without the dev-sampling selector', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const scriptsDir = join(tempRoot, 'scripts')
      mkdirSync(scriptsDir, { recursive: true })
      writeFileSync(join(scriptsDir, 'freeform-create.ts'), [
        'export const args = ["worker", "create", "w-freeform", "--app", "aiworker-freeform"]',
        '',
      ].join('\n'))

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      expect(result.stderr).not.toContain('worker create --app')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('allows first-party dev-only worker create scripts that inject the internal dev-sampling env', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const scriptsDir = join(tempRoot, 'scripts')
      mkdirSync(scriptsDir, { recursive: true })
      writeFileSync(join(scriptsDir, 'dev-create.ts'), [
        'import { withDevSamplingCatalogEnv } from "./worker-create-catalog-view"',
        'runCli(["worker", "create", "w-hr", "--app", "hr-manager"], withDevSamplingCatalogEnv())',
        '',
      ].join('\n'))

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      expect(result.stderr).not.toContain('dev-create.ts')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('catches mixed protected and unprotected first-party dev-only worker create paths in one file', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const scriptsDir = join(tempRoot, 'scripts')
      mkdirSync(scriptsDir, { recursive: true })
      writeFileSync(join(scriptsDir, 'mixed-dev-create.ts'), [
        'import { withDevSamplingCatalogEnv } from "./worker-create-catalog-view"',
        'runCli(["worker", "create", "w-google", "--app", "google-ads"], withDevSamplingCatalogEnv())',
        'runCli(["worker", "create", "w-hr", "--app", "hr-manager"])',
        '',
      ].join('\n'))

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('mixed-dev-create.ts')
      expect(result.stderr).toContain('internal dev-sampling catalog env')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('catches a Soul App Host-private import located outside src/', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'souls/demo-soul')
      mkdirSync(join(appDir, 'product/capabilities/default'), { recursive: true })
      writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
      writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: '@demo/soul' }))
      writeFileSync(
        join(appDir, 'product/capabilities/default/bad.ts'),
        'import { thing } from "@zonease/aiworker-worker-runtime"\nexport const y = thing\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('souls/demo-soul/product/capabilities/default/bad.ts')
      expect(result.stderr).toContain('@zonease/aiworker-worker-runtime')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('catches Host code importing Soul internals outside src/', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'souls/demo-soul')
      mkdirSync(join(appDir, 'product/api'), { recursive: true })
      writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
      writeFileSync(join(appDir, 'product/api/index.ts'), 'export const api = 1\n')

      const webDir = join(tempRoot, 'apps/worker-web/src')
      mkdirSync(webDir, { recursive: true })
      writeFileSync(
        join(webDir, 'bad.ts'),
        'import { api } from "../../../souls/demo-soul/product/api"\nexport const z = api\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/worker-web/src/bad.ts')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('exempts Soul App test files from the import boundary', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'souls/demo-soul')
      mkdirSync(join(appDir, 'product/api'), { recursive: true })
      writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
      writeFileSync(
        join(appDir, 'product/api/index.test.ts'),
        'import { thing } from "@zonease/aiworker-worker-runtime"\nexport const y = thing\n',
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

  test('catches host-cli importing Soul internals (C-HS coverage guard)', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'souls/demo-soul')
      mkdirSync(join(appDir, 'product/api'), { recursive: true })
      writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
      writeFileSync(join(appDir, 'product/api/index.ts'), 'export const api = 1\n')

      const hostCliDir = join(tempRoot, 'apps/host-cli/src')
      mkdirSync(hostCliDir, { recursive: true })
      writeFileSync(
        join(hostCliDir, 'bad.ts'),
        'import { api } from "../../../souls/demo-soul/product/api"\nexport const z = api\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/host-cli/src/bad.ts')
      expect(result.stderr).toContain('Host code must not import Soul App internals')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('catches host-web importing Soul internals (C-HS coverage guard)', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'souls/demo-soul')
      mkdirSync(join(appDir, 'product/api'), { recursive: true })
      writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
      writeFileSync(join(appDir, 'product/api/index.ts'), 'export const api = 1\n')

      const hostWebDir = join(tempRoot, 'apps/host-web/src')
      mkdirSync(hostWebDir, { recursive: true })
      writeFileSync(
        join(hostWebDir, 'bad.ts'),
        'import { api } from "../../../souls/demo-soul/product/api"\nexport const z = api\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/host-web/src/bad.ts')
      expect(result.stderr).toContain('Host code must not import Soul App internals')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('blocks Soul App imports of the Host fs-layout package', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'souls/demo-soul')
      mkdirSync(join(appDir, 'product/api'), { recursive: true })
      writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
      writeFileSync(
        join(appDir, 'product/api/bad.ts'),
        'import { home } from "@zonease/aiworker-fs-layout"\nexport const y = home\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('@zonease/aiworker-fs-layout')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
})
