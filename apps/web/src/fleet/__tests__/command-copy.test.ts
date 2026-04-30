import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(testDir, '..', '..', relativePath), 'utf8')
}

const staleEnrollCommand = ['aiworker', 'enroll', 'otp'].join(' ')
const staleWorkerCommand = ['aiworker', 'worker', 'start'].join(' ')

describe('fleet admin command copy', () => {
  it('keeps enrollment empty-state copy aligned with current CLI commands', () => {
    const source = readWebSource('fleet/features/enroll/components/enroll-list.tsx')

    expect(source).not.toContain(staleEnrollCommand)
    expect(source).toContain('aiworker serve')
    expect(source).toContain('AIWORKER_GATEWAY_URL')
    expect(source).toContain('aiworker enroll list')
    expect(source).toContain('aiworker enroll approve')
  })

  it('keeps worker self-management copy aligned with the current worker command', () => {
    const source = readWebSource('fleet/routes/workers.$workerId.tsx')

    expect(source).not.toContain(staleWorkerCommand)
    expect(source).toContain('return `/w/')
    expect(source).toContain('workerId}/`')
  })
})
