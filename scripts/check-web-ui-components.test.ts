import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('check-web-ui-components audit output', () => {
  test('classifies framed shadcn surfaces and separates scoped layout from raw native classes', () => {
    const result = spawnSync('bun', ['scripts/check-web-ui-components.ts', '--all', '--audit'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('web UI framed surface classification (accepted, enforced):')
    expect(result.stdout).toContain('apps/web/src/worker/worker-studio.tsx: alert x3')
    expect(result.stdout).toContain('apps/web/src/worker/worker-configuration-dialog.tsx: slotless-native-class x18')
    expect(result.stdout).toContain('apps/web/src/worker/worker-workbench-tree.tsx: scoped-native-layout x1')
    expect(result.stdout).toContain('apps/aiworker-hr/product/web/people-workbench/app.tsx: input-frame x3')
    expect(result.stdout).toContain('apps/aiworker-hr/product/web/people-workbench/surface.tsx: scoped-native-layout x1')
    expect(result.stdout).toContain('web UI raw native control classification (accepted, enforced):')
    expect(result.stdout).toContain('apps/web/src/worker/worker-configuration-dialog.tsx: raw-button x2')
    expect(result.stdout).not.toContain('apps/web/src/features/session/')
    expect(result.stdout).not.toContain('apps/web/src/worker/session-detail.tsx')
    expect(result.stdout).not.toContain('apps/web/src/worker/session-turn-composer.tsx')
    expect(result.stdout).not.toContain('web UI Host-embedded Soul renderer debt')
    expect(result.stdout).toContain('slotlessNativeClassName=0')
    expect(result.stdout).not.toContain('rawNativeClassName=2')
    expect(result.stdout).toContain('web UI component governance ok (full tree)')
    expect(result.stdout).not.toContain('legacy migration entries')
  })

  test('allows completion audit after Host-embedded Soul renderers are removed', () => {
    const result = spawnSync('bun', ['scripts/check-web-ui-components.ts', '--completion-audit'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain('web UI Host-embedded Soul renderer debt')
    expect(result.stderr).not.toContain('apps/web/src/worker/souls')
  })

  test('blocks reintroducing the retired component package', () => {
    const tempFile = resolve(repoRoot, 'apps/web/src/__retired-component-import.guard.tsx')
    writeFileSync(tempFile, [
      'import { Button } from \'@zonease/aiworker-component\'',
      '',
      'export function RetiredComponentImportGuard() {',
      '  return <Button>retired</Button>',
      '}',
      '',
    ].join('\n'))

    try {
      const result = spawnSync('bun', ['scripts/check-web-ui-components.ts'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('imports retired @zonease/aiworker-component')
      expect(result.stderr).toContain('@zonease/aiworker-component has been retired')
    }
    finally {
      rmSync(tempFile, { force: true })
    }
  })
})
