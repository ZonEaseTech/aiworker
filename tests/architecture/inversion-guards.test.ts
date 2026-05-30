import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')
function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

// 枚举 packages/ 与 apps/ 下以 prefix 开头的顶层包目录（新增同前缀包自动纳入守卫）。
function packageDirsWithPrefix(prefix: string): string[] {
  const dirs: string[] = []
  for (const base of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repoRoot, base))) {
      if (entry.startsWith(prefix) && existsSync(join(repoRoot, base, entry, 'package.json')))
        dirs.push(`${base}/${entry}`)
    }
  }
  return dirs
}

function zonaseDependencyNames(dir: string): string[] {
  const pkg = JSON.parse(read(`${dir}/package.json`)) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].filter(name => name.startsWith('@zonease/'))
}

describe('worker-autonomy inversion guards (Plan 1)', () => {
  test('G0: inversion vocabulary is no longer forbidden in active docs', () => {
    const checker = read('scripts/check-doc-contract.ts')
    const forbiddenBlock = checker.slice(
      checker.indexOf('const forbiddenActiveDocPhrases'),
      checker.indexOf('for (const file of activeDocs)'),
    )
    for (const allowed of ['gateway', 'control-plane', 'fleet'])
      expect(forbiddenBlock).not.toContain(`'${allowed}'`)
    // 仍保留的禁字
    for (const stillForbidden of ['Host auth is provider-backed', 'grant enforcement'])
      expect(forbiddenBlock).toContain(`'${stillForbidden}'`)
  })
})

// G6 ↔ C6：secret 边界文档双面覆盖（现在可证：文档已写）
test('G6: docs forbid engine-secret persistence on both planes', () => {
  const runtime = read('docs/runtime.md')
  expect(runtime).toContain('any engine-secret persistence on either plane')
})

// G2 ↔ C2：engine 启动机制（engine-bridge）只被 worker-* 包依赖；host-* 不得引用 engine 启动。
// （包级断言，与 worker-runtime 内目录名无关——故 rename 与本守卫可分离。）
test('G2: engine launch symbols are imported only by worker-* packages', () => {
  const hostDirs = packageDirsWithPrefix('host-')
  expect(hostDirs.length, 'expected at least one host-* package directory').toBeGreaterThan(0)
  for (const dir of hostDirs) {
    const deps = zonaseDependencyNames(dir)
    expect(deps, `${dir} must not depend on the engine-launch package`).not.toContain('@zonease/aiworker-engine-bridge')
  }
})

// G3 ↔ D6：worker-* 不得依赖 host-*（Worker 必须能脱离 Host 独立运行）。Plan 3 起可证。
test('G3: worker-* packages never depend on host-* packages', () => {
  const workerDirs = packageDirsWithPrefix('worker-')
  expect(workerDirs.length, 'expected at least one worker-* package directory').toBeGreaterThan(0)
  for (const dir of workerDirs) {
    const hostDeps = zonaseDependencyNames(dir).filter(name => name.startsWith('@zonease/aiworker-host-'))
    expect(hostDeps, `${dir} must not depend on host-* packages`).toEqual([])
  }
})

// G4 ↔ C3：host-control 无 runtime/domain/secret 归属。host-control 建包后（Plan 3）可证。
test.todo('G4: host-control exposes no session/invocation/projection/engine/domain/secret ownership')

// G5 ↔ C5：唯一 Host→Worker 契约是 worker-control-protocol——host-* 包除该契约外
// 不得依赖任何 worker-* 运行时包（worker-runtime/worker-daemon 等）。Plan 3 起可证。
test('G5: the only Host->Worker contract is worker-control-protocol', () => {
  const hostDirs = packageDirsWithPrefix('host-')
  expect(hostDirs.length, 'expected at least one host-* package directory').toBeGreaterThan(0)
  for (const dir of hostDirs) {
    const workerDeps = zonaseDependencyNames(dir).filter(name => name.startsWith('@zonease/aiworker-worker-'))
    for (const dep of workerDeps)
      expect(dep, `${dir} may only cross to worker-* via the control protocol`).toBe('@zonease/aiworker-worker-control-protocol')
  }
})

// G1 ↔ C1：worker standalone 金路径，Host 缺席全通。Plan 5 真证；此处先文档锚点。
test.todo('G1: worker standalone golden path passes with Host absent')
