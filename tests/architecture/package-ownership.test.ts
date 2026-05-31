import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')

function walkTsFiles(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walkTsFiles(p))
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

interface PackageJson {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const targetPackages = [
  ['packages/worker-runtime', '@zonease/aiworker-worker-runtime'],
  ['packages/worker-daemon', '@zonease/aiworker-worker-daemon'],
  ['packages/worker-control-protocol', '@zonease/aiworker-worker-control-protocol'],
  ['packages/host-control', '@zonease/aiworker-host-control'],
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
    expect(packages['packages/soul-protocol']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-worker-runtime')
    expect(packages['packages/worker-runtime']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-soul-workbench')
    expect(packages['packages/worker-runtime']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-soul-app-sdk')
    expect(packages['packages/soul-app-sdk']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-worker-runtime')

    // 控制契约方向：host-control 经 worker-control-protocol 单向消费契约，
    // 不得依赖任何 worker-* 运行时包；契约包本身保持纯净（不回指 host-*）。
    expect(packages['packages/host-control']?.dependencies ?? {}).toHaveProperty('@zonease/aiworker-worker-control-protocol')
    expect(packages['packages/host-control']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-worker-runtime')
    expect(packages['packages/host-control']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-worker-daemon')
    expect(packages['packages/worker-control-protocol']?.dependencies ?? {}).not.toHaveProperty('@zonease/aiworker-host-control')
  })

  test('broad replacement buckets are not introduced', () => {
    expect(existsSync(join(repoRoot, 'packages/core-v2'))).toBe(false)
    expect(existsSync(join(repoRoot, 'packages/shared-v2'))).toBe(false)
  })

  test('retired package buckets and old source adapters are gone', () => {
    for (const path of [
      'apps/api',
      'apps/aiworker-hr',
      'apps/aiworker-qa',
      'packages/core',
      'packages/shared',
      'packages/soul-app-workbench',
    ]) {
      expect(existsSync(join(repoRoot, path)), `${path} should be removed in the destructive refactor`).toBe(false)
    }

    for (const path of [
      'apps/aiworker-hr/host-adapter',
      'apps/aiworker-qa/host-adapter',
      'apps/aiworker-custom',
    ]) {
      expect(existsSync(join(repoRoot, path)), `${path} should not remain as Host adapter/source export authority`).toBe(false)
    }
  })

  test('local daemon lives in the final host-daemon package', () => {
    expect(existsSync(join(repoRoot, 'apps/api'))).toBe(false)

    const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as PackageJson
    const cliPackage = JSON.parse(readFileSync(join(repoRoot, 'apps/worker-cli/package.json'), 'utf8')) as PackageJson

    expect(rootPackage.scripts?.build).toContain('@zonease/aiworker-worker-daemon')
    expect(rootPackage.scripts?.build).not.toContain('@zonease/aiworker-api')
    expect(cliPackage.devDependencies ?? {}).toHaveProperty('@zonease/aiworker-worker-daemon')
    expect(cliPackage.devDependencies ?? {}).not.toHaveProperty('@zonease/aiworker-api')
  })

  test('host runtime delegates engine asset projection to the engine-projection package', () => {
    const hostRuntimeEntrypoint = readFileSync(join(repoRoot, 'packages/worker-runtime/src/index.ts'), 'utf8')
    const hostRuntimeSource = readFileSync(join(repoRoot, 'packages/worker-runtime/src/worker/runtime.ts'), 'utf8')
    const hostDaemonPackage = JSON.parse(readFileSync(join(repoRoot, 'packages/worker-daemon/package.json'), 'utf8')) as PackageJson

    expect(existsSync(join(repoRoot, 'packages/worker-runtime/src/worker/engine-assets.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'packages/worker-runtime/src/worker/engine-assets.test.ts'))).toBe(false)
    expect(hostRuntimeEntrypoint).not.toContain('projectEngineAssetsToWorkspace')
    expect(hostRuntimeEntrypoint).not.toContain('listBaselineAssets')
    expect(hostRuntimeSource).toContain('@zonease/aiworker-engine-projection')
    expect(hostRuntimeSource).toContain('cleanupWorkspaceProjectionReceipt')
    expect(hostRuntimeSource).not.toContain('resolveWorkspaceProjectionTarget')
    expect(hostDaemonPackage.dependencies ?? {}).toHaveProperty('@zonease/aiworker-engine-projection')
  })

  test('host runtime does not retain a local native engine bridge implementation', () => {
    const hostRuntimeEntrypoint = readFileSync(join(repoRoot, 'packages/worker-runtime/src/index.ts'), 'utf8')

    expect(existsSync(join(repoRoot, 'packages/worker-runtime/src/worker/engine-bridge.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'packages/worker-runtime/src/worker/engine-bridge.test.ts'))).toBe(false)
    expect(hostRuntimeEntrypoint).not.toContain('invokeNativeEngine')
    expect(hostRuntimeEntrypoint).not.toContain('NativeEngineBridge')
  })

  test('worker-cli declares soul-app-sdk and uses no deep sibling-source imports', () => {
    const cliPkg = JSON.parse(readFileSync(join(repoRoot, 'apps/worker-cli/package.json'), 'utf8')) as PackageJson
    const allDeps = { ...(cliPkg.dependencies ?? {}), ...(cliPkg.devDependencies ?? {}) }
    expect(allDeps, 'worker-cli must declare its soul-app-sdk usage').toHaveProperty('@zonease/aiworker-soul-app-sdk')

    const deepImports: string[] = []
    for (const root of ['apps/worker-cli/src', 'apps/worker-web/src', 'packages']) {
      for (const file of walkTsFiles(join(repoRoot, root))) {
        if (/from\s+['"][^'"]*\.\.\/[^'"]*packages\/[^'"]+\/src\//.test(readFileSync(file, 'utf8')))
          deepImports.push(relative(repoRoot, file))
      }
    }
    expect(deepImports, 'no module may deep-import a sibling package /src').toEqual([])
  })

  test('engine-projection and worker-daemon declare no unused internal deps', () => {
    // cases 数组后续 Task 5 会扩展(加 soul-workbench)
    const cases = ['packages/engine-projection', 'packages/worker-daemon', 'packages/soul-app-runtime']
    const offenders: string[] = []
    for (const pkgDir of cases) {
      const pkg = JSON.parse(readFileSync(join(repoRoot, pkgDir, 'package.json'), 'utf8')) as PackageJson
      const declared = Object.keys({ ...(pkg.dependencies ?? {}) }).filter(d => d.startsWith('@zonease/aiworker'))
      const srcText = walkTsFiles(join(repoRoot, pkgDir, 'src'))
        .filter(f => !/\.(test|spec)\.[cm]?tsx?$/.test(f))
        .map(f => readFileSync(f, 'utf8')).join('\n')
      for (const dep of declared) {
        if (!srcText.includes(dep))
          offenders.push(`${pkgDir} -> ${dep}`)
      }
    }
    expect(offenders, 'declared runtime deps must be referenced in src').toEqual([])
  })

  test('soul-protocol/soul-app modules have no VALUE import of the package root barrel (runtime acyclic)', () => {
    const dir = join(repoRoot, 'packages/soul-protocol/src/soul-app')
    const offenders: string[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts'))
        continue
      const src = readFileSync(join(dir, file), 'utf8')
      // 匹配 value import（排除 `import type ...`）from '..' / '../index'
      if (/^\s*import\s+(?!type[\s{])[^;\n]*\sfrom\s+['"]\.\.(?:\/index)?['"]/m.test(src))
        offenders.push(`packages/soul-protocol/src/soul-app/${file}`)
    }
    expect(offenders, 'soul-app modules must not VALUE-import the root barrel (would create a runtime cycle)').toEqual([])
  })
})
