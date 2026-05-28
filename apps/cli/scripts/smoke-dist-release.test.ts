import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

describe('dist release smoke script contract', () => {
  it('validates the packaged Freeform descriptor protocol from dist official apps', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-dist-release.ts'), 'utf8')

    expect(source).toContain('assertDistDescriptorV1')
    expect(source).toContain('official-apps')
    expect(source).toContain('aiworker-freeform')
    expect(source).toContain('soul.descriptor.json')
    expect(source).toContain('protocol !== \'soul/v1\'')
  })
})
