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
      'soul.config.ts': 'export default {}\n',
      'lib/api.ts': `import { createRuntimeForWorker } from '@zonease/aiworker-host-runtime'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-host-runtime')).toBe(true)
  })

  it('does not false-positive on unrelated packages whose name contains a host root substring', () => {
    const root = makeApp({
      'soul.config.ts': 'export default {}\n',
      'src/x.ts': `import foo from '@scope/apps/api-client'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  it('flags sibling import to the Freeform Soul package', () => {
    const root = makeApp({
      'soul.config.ts': 'export default {}\n',
      'src/x.ts': `import { thing } from '@zonease/aiworker-freeform'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-freeform')).toBe(true)
  })

  it('does not flag allowed shared packages (sdk/runtime/ui/current workbench)', () => {
    const root = makeApp({
      'soul.config.ts': 'export default {}\n',
      'src/x.ts': `import { defineSoul } from '@zonease/aiworker-soul-app-sdk'\nimport { Foo } from '@zonease/aiworker-ui'\nimport { Workbench } from '@zonease/aiworker-soul-workbench'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  it('flags retired legacy Soul App workbench imports', () => {
    const root = makeApp({
      'soul.config.ts': 'export default {}\n',
      'src/x.ts': `import { Workbench } from '@zonease/aiworker-soul-app-workbench'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-soul-app-workbench')).toBe(true)
  })

  // #3: ownPackageName reads package.json name, not directory name.
  it('does not flag self-imports when package.json name differs from directory name', () => {
    const root = makeApp({
      'package.json': JSON.stringify({ name: '@zonease/demo-soul' }),
      'src/x.ts': `import { x } from '@zonease/demo-soul'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  // #4: third-party scoped packages should skip path-root substring heuristics.
  it('does not flag third-party scoped packages whose path contains a host root substring', () => {
    const root = makeApp({
      'src/x.ts': `import x from '@acme/packages/shared/types'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  // #6: scanPrivateImports skips test source files.
  it('does not flag Host-private imports in test source files', () => {
    const root = makeApp({
      'src/x.test.ts': `import { createRuntimeForWorker } from '@zonease/aiworker-host-runtime'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  it('still flags Host-private imports in non-test source files (regression)', () => {
    const root = makeApp({
      'src/x.ts': `import { createRuntimeForWorker } from '@zonease/aiworker-host-runtime'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-host-runtime')).toBe(true)
  })
})
