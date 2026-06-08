import type { SpawnFn } from './probes'

import { describe, expect, it } from 'bun:test'

import { envPresence, httpProbe, inspectCommand } from './probes'

function fakeSpawn(map: Record<string, { status: number, stdout: string }>): SpawnFn {
  return ((command: string, args: readonly string[]) => {
    const key = `${command} ${args.join(' ')}`
    const hit = map[key]
    return hit ? { status: hit.status, stdout: hit.stdout } : { status: 1, stdout: '' }
  }) as unknown as SpawnFn
}

describe('inspectCommand', () => {
  it('reports found path + first version line', () => {
    const spawn = fakeSpawn({
      '/root/.bun/bin/bun --version': { status: 0, stdout: '1.3.14\nextra' },
      'sh -c command -v bun': { status: 0, stdout: '/root/.bun/bin/bun\n' },
    })
    expect(inspectCommand('bun', { spawn })).toEqual({ found: true, path: '/root/.bun/bin/bun', version: '1.3.14' })
  })

  it('reports not found when command -v fails', () => {
    expect(inspectCommand('aissh', { spawn: fakeSpawn({}) }).found).toBe(false)
  })

  it('found but version unavailable yields null version', () => {
    const spawn = fakeSpawn({ 'sh -c command -v docker': { status: 0, stdout: '/usr/bin/docker\n' } })
    const result = inspectCommand('docker', { spawn })
    expect(result.found).toBe(true)
    expect(result.version).toBeNull()
  })
})

describe('envPresence', () => {
  it('splits present vs missing, treating blank as missing', () => {
    const result = envPresence(['A', 'B', 'C'], { A: 'x', B: '  ', C: undefined })
    expect(result.present).toEqual(['A'])
    expect(result.missing).toEqual(['B', 'C'])
  })
})

describe('httpProbe', () => {
  it('is ok on a 2xx response', async () => {
    const result = await httpProbe('http://x', { fetch: (async () => new Response('', { status: 200 })) as unknown as typeof fetch })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
  })

  it('captures a fetch error instead of throwing', async () => {
    const result = await httpProbe('http://x', {
      fetch: (async () => {
        throw new Error('connection refused')
      }) as unknown as typeof fetch,
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBeNull()
    expect(result.error).toContain('connection refused')
  })
})
