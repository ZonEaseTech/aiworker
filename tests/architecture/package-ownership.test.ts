import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')

interface PackageJson {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const targetPackages = [
  ['packages/host-runtime', '@zonease/aiworker-host-runtime'],
  ['packages/host-daemon', '@zonease/aiworker-host-daemon'],
  ['packages/soul-protocol', '@zonease/aiworker-soul-protocol'],
  ['packages/engine-bridge', '@zonease/aiworker-engine-bridge'],
  ['packages/engine-projection', '@zonease/aiworker-engine-projection'],
  ['packages/soul-workbench', '@zonease/aiworker-soul-workbench'],
] as const

describe('target package ownership', () => {
  test('target packages exist with final package names and common scripts', () => {
    for (const [path, packageName] of targetPackages) {
      expect(existsSync(join(repoRoot, path, 'package.json')), `${path}/package.json`).toBe(true)
      expect(existsSync(join(repoRoot, path, 'src/index.ts')), `${path}/src/index.ts`).toBe(true)
      expect(existsSync(join(repoRoot, path, 'tsconfig.json')), `${path}/tsconfig.json`).toBe(true)

      const pkg = JSON.parse(readFileSync(join(repoRoot, path, 'package.json'), 'utf8')) as PackageJson
      expect(pkg.name).toBe(packageName)
    }
  })

  test('target package dependencies follow the accepted import direction', () => {
    const packages = Object.fromEntries(
      targetPackages.map(([path]) => [
        path,
        JSON.parse(readFileSync(join(repoRoot, path, 'package.json'), 'utf8')) as PackageJson,
      ]),
    )

    expect(packages['packages/soul-protocol']?.dependencies ?? {}).not.toHaveProperty('react')
    expect(packages['packages/soul-protocol']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-host-runtime')
    expect(packages['packages/host-runtime']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-soul-workbench')
    expect(packages['packages/host-runtime']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-soul-app-sdk')
    expect(packages['packages/soul-app-sdk']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-host-runtime')
  })

  test('broad replacement buckets are not introduced', () => {
    expect(existsSync(join(repoRoot, 'packages/core-v2'))).toBe(false)
    expect(existsSync(join(repoRoot, 'packages/shared-v2'))).toBe(false)
  })

  test('local daemon lives in the final host-daemon package', () => {
    expect(existsSync(join(repoRoot, 'apps/api'))).toBe(false)

    const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as PackageJson
    const cliPackage = JSON.parse(readFileSync(join(repoRoot, 'apps/cli/package.json'), 'utf8')) as PackageJson

    expect(rootPackage.scripts?.build).toContain('@zonease/aiworker-host-daemon')
    expect(rootPackage.scripts?.build).not.toContain('@zonease/aiworker-api')
    expect(cliPackage.devDependencies ?? {}).toHaveProperty('@zonease/aiworker-host-daemon')
    expect(cliPackage.devDependencies ?? {}).not.toHaveProperty('@zonease/aiworker-api')
  })
})
