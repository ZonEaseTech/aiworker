import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

describe('standalone runtime smoke script contract', () => {
  it('validates the unpacked official Freeform descriptor refs from standalone official apps', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-standalone-runtime.ts'), 'utf8')

    expect(source).toContain('readDistPackageVersion')
    expect(source).toContain('assertStandaloneBinaryVersion')
    expect(source).toContain('--version')
    expect(source).toContain('standalone binary must report dist package version')
    expect(source).toContain('assertStandaloneOfficialFreeformDescriptor')
    expect(source).toContain('assertStandaloneDescriptorRefs')
    expect(source).toContain('parseOfficialFreeformDescriptorJson')
    expect(source).toContain('official-apps')
    expect(source).toContain('aiworker-freeform')
    expect(source).toContain('soul.descriptor.json')
    expect(source).toContain('descriptor refs')
    expect(source).toContain('descriptor reference escapes package root')
  })
})
