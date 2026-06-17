import { $ } from 'bun'
import { describe, expect, test } from 'bun:test'

describe('thin-layer boundary check', () => {
  test('legacy Worker runtime paths stay deleted', async () => {
    const result = await $`bun scripts/check-soul-app-boundaries.ts`.text()
    expect(result).toContain('no AIWorker-owned Worker runtime surfaces')
  })
})
