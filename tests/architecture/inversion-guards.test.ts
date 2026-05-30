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

// G6 ↔ C6：secret 边界文档双面覆盖（现在可证：文档已写）
test('G6: docs forbid engine-secret persistence on both planes', () => {
  const runtime = read('docs/runtime.md')
  expect(runtime).toContain('any engine-secret persistence on either plane')
})

// G2 ↔ C2：engine 启动只在 worker-*。rename 落地前（Plan 2/4）目录还是 host-*，故 todo。
test.todo('G2: engine launch symbols are imported only by worker-* packages')

// G3 ↔ D6：worker-* 不得 import host-*。新包/rename 落地后可证（Plan 2/4）。
test.todo('G3: worker-* packages never depend on host-* packages')

// G4 ↔ C3：host-control 无 runtime/domain/secret 归属。host-control 建包后（Plan 3）可证。
test.todo('G4: host-control exposes no session/invocation/projection/engine/domain/secret ownership')

// G5 ↔ C5：唯一 Host→Worker 面是 worker-control-protocol（今经 micro-app 载体）。Plan 3 可证。
test.todo('G5: the only Host->Worker contract is worker-control-protocol')

// G1 ↔ C1：worker standalone 金路径，Host 缺席全通。Plan 5 真证；此处先文档锚点。
test.todo('G1: worker standalone golden path passes with Host absent')
