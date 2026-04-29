import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

import { IntegrationTimeoutError, withIntegrationCleanup } from './integration-cleanup'

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  }
  catch {
    return false
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return code === 'EPERM'
  }
}

describe('integration cleanup helper', () => {
  it('removes credential-bearing temp dirs on success', async () => {
    let dir = ''

    const result = await withIntegrationCleanup(async (cleanup) => {
      dir = await cleanup.makeTempDir('aiworker-cleanup-success-')
      await writeFile(path.join(dir, 'aim.json'), '{"deviceToken":"secret"}')
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(await exists(dir)).toBe(false)
  })

  it('removes credential-bearing temp dirs on failure', async () => {
    let dir = ''

    await expect(withIntegrationCleanup(async (cleanup) => {
      dir = await cleanup.makeTempDir('aiworker-cleanup-failure-')
      await writeFile(path.join(dir, '.env'), 'AIWORKER_MASTER_KEY=secret')
      throw new Error('intentional integration failure')
    })).rejects.toThrow('intentional integration failure')

    expect(await exists(dir)).toBe(false)
  })

  it('kills managed processes and removes temp dirs on timeout', async () => {
    let dir = ''
    let pid = 0

    await expect(withIntegrationCleanup({ timeoutMs: 50, killGraceMs: 20 }, async (cleanup) => {
      dir = await cleanup.makeTempDir('aiworker-cleanup-timeout-')
      await writeFile(path.join(dir, '.env'), 'AIWORKER_MASTER_KEY=secret')
      const proc = cleanup.trackProcess(Bun.spawn([
        process.execPath,
        '-e',
        'setInterval(() => {}, 1000)',
      ], {
        cwd: dir,
        stderr: 'ignore',
        stdout: 'ignore',
      }))
      pid = proc.pid
      await new Promise<never>(() => {})
    })).rejects.toBeInstanceOf(IntegrationTimeoutError)

    expect(pid).toBeGreaterThan(0)
    expect(isPidAlive(pid)).toBe(false)
    expect(await exists(dir)).toBe(false)
  })
})
