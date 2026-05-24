import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'
import { scanPrivateImports } from './soul-app-boundary'

function makeApp(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'soulapp-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  return root
}

describe('scanPrivateImports', () => {
  it('detects Host-private import in a directory outside the legacy 4-dir allowlist', () => {
    const root = makeApp({
      'soul-app.manifest.json': '{}',
      'lib/api.ts': `import { createRuntimeForWorker } from '@zonease/aiworker-core'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-core')).toBe(true)
  })

  it('does not false-positive on unrelated packages whose name contains a host root substring', () => {
    const root = makeApp({
      'soul-app.manifest.json': '{}',
      'src/x.ts': `import foo from '@scope/apps/api-client'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  it('flags sibling import to @zonease/aiworker-custom', () => {
    const root = makeApp({
      'soul-app.manifest.json': '{}',
      'src/x.ts': `import { thing } from '@zonease/aiworker-custom'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-custom')).toBe(true)
  })

  it('does not flag allowed shared packages (sdk/runtime/ui/workbench)', () => {
    const root = makeApp({
      'soul-app.manifest.json': '{}',
      'src/x.ts': `import { defineSoulApp } from '@zonease/aiworker-soul-app-sdk'\nimport { Foo } from '@zonease/aiworker-ui'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  // #3: ownPackageName は package.json の name を読む(ディレクトリ名ではなく)
  it('does not flag self-imports when package.json name differs from directory name', () => {
    // ディレクトリ名は mkdtempSync が生成するランダム名だが package.json に @zonease/aiworker-hr を宣言
    const root = makeApp({
      'package.json': JSON.stringify({ name: '@zonease/aiworker-hr' }),
      'src/x.ts': `import { x } from '@zonease/aiworker-hr'\n`,
    })
    // 自身パッケージの import → 誤検知しないこと
    expect(scanPrivateImports(root)).toEqual([])
  })

  // #4: @scope パッケージは path-root 部分文字列ヒューリスティックを通さない
  it('does not flag third-party scoped packages whose path contains a host root substring', () => {
    const root = makeApp({
      'src/x.ts': `import x from '@acme/packages/shared/types'\n`,
    })
    // @acme/packages/shared/types は packages/shared/ を含むが scoped なので誤検知しない
    expect(scanPrivateImports(root)).toEqual([])
  })

  // #6: scanPrivateImports はテストファイルをスキップする
  it('does not flag Host-private imports in test source files', () => {
    const root = makeApp({
      'src/x.test.ts': `import { createRuntimeForWorker } from '@zonease/aiworker-core'\n`,
    })
    // テストファイルはスキップ → 報告なし
    expect(scanPrivateImports(root)).toEqual([])
  })

  it('still flags Host-private imports in non-test source files (regression)', () => {
    const root = makeApp({
      'src/x.ts': `import { createRuntimeForWorker } from '@zonease/aiworker-core'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-core')).toBe(true)
  })
})
