import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')
function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
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
