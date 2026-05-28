import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

describe('standalone release smoke script contract', () => {
  it('validates official Freeform descriptor refs from final standalone bundles', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-standalone-release.ts'), 'utf8')

    expect(source).toContain('assertStandaloneBundleOfficialFreeformDescriptor')
    expect(source).toContain('assertStandaloneBundleDescriptorRefs')
    expect(source).toContain('parseOfficialFreeformDescriptorJson')
    expect(source).toContain('release/${bundle}/official-apps/aiworker-freeform')
    expect(source).toContain('soul.descriptor.json')
    expect(source).toContain('descriptor refs')
    expect(source).toContain('descriptor reference escapes package root')
  })
})
