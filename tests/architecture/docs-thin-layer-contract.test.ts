import { $ } from 'bun'
import { describe, expect, test } from 'bun:test'

describe('canonical docs thin-layer contract', () => {
  test('docs contract script passes', async () => {
    const out = await $`bun scripts/check-doc-contract.ts`.text()
    expect(out).toContain('thin Paseo distribution layer')
  })
})
