import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

describe('npm package smoke script contract', () => {
  it('validates the packaged official Freeform descriptor refs from the npm tarball', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-npm-package.ts'), 'utf8')

    expect(source).toContain('assertTarballOfficialFreeformDescriptor')
    expect(source).toContain('assertTarballDescriptorRefs')
    expect(source).toContain('parseOfficialFreeformDescriptorJson')
    expect(source).toContain('package/official-apps/aiworker-freeform/dist/soul.descriptor.json')
    expect(source).toContain('package/official-apps/aiworker-freeform')
    expect(source).toContain('descriptor refs')
    expect(source).toContain('tar')
    expect(source).toContain('-xOzf')
  })
})
