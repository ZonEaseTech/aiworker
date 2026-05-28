import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

describe('npm package smoke script contract', () => {
  it('validates the packaged Freeform descriptor protocol from the npm tarball', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-npm-package.ts'), 'utf8')

    expect(source).toContain('assertTarballDescriptorV1')
    expect(source).toContain('package/official-apps/aiworker-freeform/dist/soul.descriptor.json')
    expect(source).toContain('tar')
    expect(source).toContain('-xOzf')
    expect(source).toContain('protocol !== \'soul/v1\'')
  })
})
