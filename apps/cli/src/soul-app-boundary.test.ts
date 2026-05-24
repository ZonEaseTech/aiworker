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
})
