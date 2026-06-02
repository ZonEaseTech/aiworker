/**
 * F8 parity guard: soul-app-boundary 漂移守卫
 *
 * worker-cli 的 `apps/worker-cli/src/soul-app-boundary.ts` 与
 * `scripts/check-soul-app-boundaries.ts` **各自独立实现**了相同的
 * forbidden package prefix 列表 + rawWebStorage 检测逻辑。
 * 本测试对同一组 fixture import 断言两者产出**一致**，防止漂移。
 *
 * 守卫范围（共性子集）：
 *   - 7 个 worker-private host packages
 *   - 4 个 forbidden-legacy packages
 *   - rawWebStorage 符号检测（localStorage/sessionStorage）
 *   - allowed shared packages（不应被标记）
 *
 * 刻意排除两者已知设计差异的区域（不用 fixture 触发）：
 *   - 相对路径 sibling soul 解析（script 用文件系统解析，worker-cli 用命名启发）
 *   - 第三方 @scope 包路径子串启发（worker-cli 特有保护）
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

import { scanPrivateImports, scanRawWebStorageUsage } from '../../apps/worker-cli/src/soul-app-boundary'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 在临时目录中制造一个最小 Soul App，并用脚本检查它 */
function scriptDetects(importLine: string): boolean {
  const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-parity-'))
  try {
    const appDir = join(tempRoot, 'souls/demo-soul')
    mkdirSync(join(appDir, 'src'), { recursive: true })
    writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: '@demo/soul' }))
    writeFileSync(join(appDir, 'src/bad.ts'), `${importLine}\nexport const y = 1\n`)
    const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
      cwd: tempRoot,
      encoding: 'utf8',
    })
    return result.status !== 0
  }
  finally {
    rmSync(tempRoot, { force: true, recursive: true })
  }
}

/** 制造含某 import 的 app，看 worker-cli 的 scanPrivateImports 是否检出 */
function workerCliDetects(importLine: string): boolean {
  const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-parity-wc-'))
  try {
    mkdirSync(join(tempRoot, 'src'), { recursive: true })
    // 无 package.json（让 readOwnPackageName 回退到 @zonease/<dirname>，不影响禁包检测）
    writeFileSync(join(tempRoot, 'src/bad.ts'), `${importLine}\nexport const y = 1\n`)
    const issues = scanPrivateImports(tempRoot)
    return issues.length > 0
  }
  finally {
    rmSync(tempRoot, { force: true, recursive: true })
  }
}

// ── 禁止 import 列表（两文件 byte-duplicate，漂移最高风险）──────────────────
const WORKER_PRIVATE_HOST_PACKAGES = [
  '@zonease/aiworker-cli',
  '@zonease/aiworker-worker-runtime',
  '@zonease/aiworker-fs-layout',
  '@zonease/aiworker-worker-daemon',
  '@zonease/aiworker-soul-descriptor',
  '@zonease/aiworker-storage-sqlite',
  '@zonease/aiworker-worker-web',
]

const FORBIDDEN_LEGACY_PACKAGES = [
  '@zonease/aiworker-api',
  '@zonease/aiworker-core',
  '@zonease/aiworker-shared',
  '@zonease/aiworker-soul-app-workbench',
]

const ALLOWED_SHARED_PACKAGES = [
  '@zonease/aiworker-soul-sdk',
  '@zonease/aiworker-soul-app-runtime',
  '@zonease/aiworker-soul-workbench',
  '@zonease/aiworker-ui',
]

describe('soul-app-boundary parity: forbidden package detection must agree', () => {
  for (const pkg of WORKER_PRIVATE_HOST_PACKAGES) {
    test(`worker-private: both scanners flag "${pkg}"`, () => {
      const importLine = `import { x } from '${pkg}'`
      const scriptSays = scriptDetects(importLine)
      const cliSays = workerCliDetects(importLine)
      expect(scriptSays).toBe(true)
      expect(cliSays).toBe(true)
      // parity 核心断言：两者结果必须相同
      expect(scriptSays).toBe(cliSays)
    })
  }

  for (const pkg of FORBIDDEN_LEGACY_PACKAGES) {
    test(`legacy-forbidden: both scanners flag "${pkg}"`, () => {
      const importLine = `import { x } from '${pkg}'`
      const scriptSays = scriptDetects(importLine)
      const cliSays = workerCliDetects(importLine)
      expect(scriptSays).toBe(true)
      expect(cliSays).toBe(true)
      expect(scriptSays).toBe(cliSays)
    })
  }

  for (const pkg of ALLOWED_SHARED_PACKAGES) {
    test(`allowed-shared: both scanners do NOT flag "${pkg}"`, () => {
      const importLine = `import { x } from '${pkg}'`
      const scriptSays = scriptDetects(importLine)
      const cliSays = workerCliDetects(importLine)
      expect(scriptSays).toBe(false)
      expect(cliSays).toBe(false)
      expect(scriptSays).toBe(cliSays)
    })
  }
})

// ── rawWebStorage 检测一致性 ────────────────────────────────────────────────

/** 用 script 检测 soul app 源码中的 rawWebStorage 使用 */
function scriptDetectsStorage(sourceLine: string): boolean {
  const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-parity-storage-'))
  try {
    const appDir = join(tempRoot, 'souls/demo-soul')
    mkdirSync(join(appDir, 'src'), { recursive: true })
    writeFileSync(join(appDir, 'soul.config.ts'), 'export default {}\n')
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: '@demo/soul' }))
    writeFileSync(join(appDir, 'src/storage.ts'), `${sourceLine}\nexport const y = 1\n`)
    const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
      cwd: tempRoot,
      encoding: 'utf8',
    })
    return result.status !== 0 && result.stderr.includes('Web Storage')
  }
  finally {
    rmSync(tempRoot, { force: true, recursive: true })
  }
}

/** worker-cli 的 scanRawWebStorageUsage */
function workerCliDetectsStorage(sourceLine: string): boolean {
  const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-parity-wc-storage-'))
  try {
    mkdirSync(join(tempRoot, 'src'), { recursive: true })
    writeFileSync(join(tempRoot, 'src/storage.ts'), `${sourceLine}\nexport const y = 1\n`)
    const issues = scanRawWebStorageUsage(tempRoot)
    return issues.length > 0
  }
  finally {
    rmSync(tempRoot, { force: true, recursive: true })
  }
}

describe('soul-app-boundary parity: rawWebStorage detection must agree', () => {
  const RAW_STORAGE_CASES: Array<{ label: string, line: string, shouldFlag: boolean }> = [
    { label: 'localStorage read', line: 'const v = localStorage.getItem("k")', shouldFlag: true },
    { label: 'sessionStorage write', line: 'sessionStorage.setItem("k","v")', shouldFlag: true },
    { label: 'window.localStorage', line: 'const x = window.localStorage.getItem("k")', shouldFlag: true },
    { label: 'localStorage.clear() is flagged by script side', line: 'localStorage.clear()', shouldFlag: true },
    { label: 'createSoulAppWebStorage (allowed)', line: 'const s = createSoulAppWebStorage("scope")', shouldFlag: false },
  ]

  for (const { label, line, shouldFlag } of RAW_STORAGE_CASES) {
    test(`rawWebStorage parity: ${label}`, () => {
      const scriptSays = scriptDetectsStorage(line)
      const cliSays = workerCliDetectsStorage(line)
      if (shouldFlag) {
        expect(scriptSays).toBe(true)
        expect(cliSays).toBe(true)
      }
      else {
        expect(scriptSays).toBe(false)
        expect(cliSays).toBe(false)
      }
      // parity 核心断言
      expect(scriptSays).toBe(cliSays)
    })
  }
})
