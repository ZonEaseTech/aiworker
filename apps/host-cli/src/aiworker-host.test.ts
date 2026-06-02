import { Buffer } from 'node:buffer'
import process from 'node:process'

import { createWorkerRegistry } from '@zonease/aiworker-host-control'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { runHostCli } from './aiworker-host'

describe('aiworker-host control CLI', () => {
  const originalWrite = process.stdout.write
  let output = ''

  beforeEach(() => {
    output = ''
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(() => {
    process.stdout.write = originalWrite
  })

  it('lists workers from the injected host-control registry', async () => {
    const registry = createWorkerRegistry()
    registry.register({ workerId: 'w1', id: 'aiworker-freeform', endpoint: 'http://127.0.0.1:9217', health: { ready: true } })
    const code = await runHostCli(['worker', 'list'], { registry })
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { workers: { workerId: string }[] }
    expect(parsed.workers.map(worker => worker.workerId)).toEqual(['w1'])
  })

  it('returns an empty worker list by default (in-memory registry, no persistence)', async () => {
    const code = await runHostCli(['worker', 'list'])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { workers: unknown[] }
    expect(parsed.workers).toEqual([])
  })

  it('returns exit code 1 on an unknown command', async () => {
    const code = await runHostCli(['nope'])
    expect(code).toBe(1)
  })
})
