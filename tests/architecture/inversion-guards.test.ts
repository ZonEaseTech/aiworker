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

// 递归枚举某目录下的非 test 源文件（.ts/.tsx），排除 node_modules/dist/.d.ts/.test。
function sourceFilesUnder(dir: string): string[] {
  const root = join(repoRoot, dir)
  if (!existsSync(root))
    return []
  const out: string[] = []
  const walk = (absDir: string, relDir: string): void => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist')
        continue
      const childRel = `${relDir}/${entry.name}`
      if (entry.isDirectory())
        walk(join(absDir, entry.name), childRel)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
        out.push(childRel)
    }
  }
  walk(root, dir)
  return out
}

// 剥离 // 行注释与 /* */ 块注释——避免合法边界注释（如 host-web「Soul owns domain UI」）误判。
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
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

// G4 ↔ C3：host-control 仅控制面——deps 不含 engine/worker 运行时包；且所有 host-* 控制面源
// （host-control + 壳 host-cli/host-web）剥注释后不出现 session/invocation/projection/engine/
// domain/secret 归属。子串匹配（非 \b）以抓 camelCase（createSession/EngineInvocation/startEngine），
// 全文件递归（非仅 index.ts），含 domain（C3 领域归属）。
test('G4: host-control deps + all host-* source carry no session/invocation/projection/engine/domain/secret ownership', () => {
  const deps = zonaseDependencyNames('packages/host-control')
  for (const forbiddenDep of [
    '@zonease/aiworker-engine-bridge',
    '@zonease/aiworker-engine-projection',
    '@zonease/aiworker-worker-runtime',
    '@zonease/aiworker-worker-daemon',
  ])
    expect(deps, `host-control must not depend on ${forbiddenDep}`).not.toContain(forbiddenDep)

  const forbiddenTokens = ['session', 'invocation', 'projection', 'engine', 'domain', 'secret']
  const ownershipDirs = ['packages/host-control/src', 'apps/host-cli/src', 'apps/host-web/src']
  for (const dir of ownershipDirs) {
    for (const file of sourceFilesUnder(dir)) {
      const code = stripComments(read(file)).toLowerCase()
      for (const token of forbiddenTokens)
        expect(code.includes(token), `${file} must not carry '${token}' ownership (host-* control plane)`).toBe(false)
    }
  }
})

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

// G1 ↔ C1：worker standalone 金路径行为证据存在、host-free、且被 release:check 执行（经 test:cli）。
// 与 G3（包依赖方向）区分：锚定「自治行为证据存在且 host-free 且真的跑」。
test('G1: worker standalone golden path passes with Host absent', () => {
  const goldenPath = 'apps/worker-cli/src/freeform-golden-path.test.ts'
  // (1) 行为自治证据存在
  expect(existsSync(join(repoRoot, goldenPath)), `${goldenPath} must exist`).toBe(true)
  // (2) 金路径 host-free：不引用任何 host-* 控制面包 / host-control / aiworker-host 二进制
  const source = read(goldenPath)
  for (const hostRef of ['@zonease/aiworker-host-', 'host-control', 'aiworker-host '])
    expect(source, `golden path must not reference Host plane via ${hostRef}`).not.toContain(hostRef)
  // (3) wired 进 test:cli（release:check 真的会跑这条自治证据）
  const rootPkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
  expect(rootPkg.scripts?.['test:cli'] ?? '', 'test:cli must run the standalone golden path').toContain('freeform-golden-path.test.ts')
})
