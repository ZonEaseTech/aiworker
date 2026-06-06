import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import {
  buildHostOptions,
  parseAisshServerListOutput,
} from './host-options'

describe('host options provider', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir)
      rmSync(tempDir, { force: true, recursive: true })
    tempDir = ''
  })

  it('parses aissh server list JSON into safe server options', () => {
    const parsed = parseAisshServerListOutput(JSON.stringify({
      limits: { download_max_mb: 200 },
      servers: [{
        host: '172.105.219.50',
        id: '693660ea-3c2a-4f15-8b50-7dd9e5651877',
        name: 'aiwork',
        notes: 'aiwork项目平台服务器',
        token: 'secret',
      }],
    }))

    expect(parsed).toEqual([{
      host: '172.105.219.50',
      id: '693660ea-3c2a-4f15-8b50-7dd9e5651877',
      name: 'aiwork',
      notes: 'aiwork项目平台服务器',
      source: 'aissh',
    }])
    expect(JSON.stringify(parsed)).not.toContain('secret')
  })

  it('throws for invalid aissh server list JSON', () => {
    expect(() => parseAisshServerListOutput('not-json')).toThrow('Invalid aissh server list JSON')
  })

  it('discovers official Soul descriptors from a repo root', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'host-options-'))
    const soulDir = join(tempDir, 'souls', 'aiworker-freeform', 'dist')
    await mkdir(soulDir, { recursive: true })
    writeFileSync(join(soulDir, 'soul.descriptor.json'), JSON.stringify({
      engine: {},
      identity: {
        description: 'Open-ended Soul for freeform local work.',
        id: 'aiworker-freeform',
        name: 'AIWorker Freeform',
      },
      protocol: 'soul/v1',
    }))

    const options = await buildHostOptions({
      aisshServerList: async () => JSON.stringify({ servers: [] }),
      repoRoot: tempDir,
    })

    expect(options.soulReleases).toEqual([{
      descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
      id: 'aiworker-freeform',
      name: 'AIWorker Freeform',
      releaseRef: 'aiworker-freeform@dev',
      source: 'official',
    }])
    expect(options.auth.status).toBe('deferred-logto')
    expect(options.access.status).toBe('deferred-worker-access-tunnel')
  })

  it('captures aissh failures without throwing from buildHostOptions', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'host-options-empty-'))

    const options = await buildHostOptions({
      aisshServerList: async () => {
        throw new Error('AISSH_DOWN')
      },
      repoRoot: tempDir,
    })

    expect(options.servers).toEqual([])
    expect(options.serverSourceError).toContain('AISSH_DOWN')
  })
})
