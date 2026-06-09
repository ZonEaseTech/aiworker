import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  closeHostDb,
  initHostDb,
  publishSoulRelease,
  runHostMigrations,
} from '@zonease/aiworker-storage-sqlite/host'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  buildHostOptions,
  parseAisshServerListOutput,
} from './host-options'

describe('host options provider', () => {
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
      adapterType: 'aissh',
      capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
      description: 'aiwork项目平台服务器',
      displayName: 'aiwork',
      health: 'ready',
      id: 'aissh:693660ea-3c2a-4f15-8b50-7dd9e5651877',
      maturity: 'production',
      ref: '693660ea-3c2a-4f15-8b50-7dd9e5651877',
    }])
    expect(JSON.stringify(parsed)).not.toContain('secret')
  })

  it('throws for invalid aissh server list JSON', () => {
    expect(() => parseAisshServerListOutput('not-json')).toThrow('Invalid aissh server list JSON')
  })

  it('projects soul releases from the injected registry provider', async () => {
    const options = await buildHostOptions({
      aisshServerList: async () => JSON.stringify({ servers: [] }),
      soulReleasesProvider: () => [{
        id: 'aiworker-freeform',
        name: 'AIWorker Freeform',
        publishedAt: '2026-06-09T00:00:00.000Z',
        releaseRef: 'aiworker-freeform@1',
        source: 'official',
        version: 1,
      }],
    })

    expect(options.soulReleases).toEqual([{
      id: 'aiworker-freeform',
      name: 'AIWorker Freeform',
      publishedAt: '2026-06-09T00:00:00.000Z',
      releaseRef: 'aiworker-freeform@1',
      source: 'official',
      version: 1,
    }])
    expect(options.auth.status).toBe('deferred-logto')
    expect(options.access.status).toBe('deferred-worker-access-tunnel')
  })

  it('captures aissh failures without throwing from buildHostOptions', async () => {
    const options = await buildHostOptions({
      aisshServerList: async () => {
        throw new Error('AISSH_DOWN')
      },
      soulReleasesProvider: () => [],
    })

    expect(options.provisioningTargets.map(target => target.id)).toEqual([
      'docker:local-default',
      'local:default',
    ])
    expect(options.provisioningTargetSourceError).toContain('AISSH_DOWN')
  })

  it('maps aissh server list output into production provisioning targets', async () => {
    const options = await buildHostOptions({
      aisshServerList: async () => JSON.stringify({
        servers: [{ host: '172.105.219.50', id: 'srv-1', name: 'aiwork', notes: 'aiwork project' }],
      }),
      soulReleasesProvider: () => [],
    })

    expect(options.provisioningTargets).toContainEqual({
      adapterType: 'aissh',
      capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
      displayName: 'aiwork',
      health: 'ready',
      id: 'aissh:srv-1',
      maturity: 'production',
      ref: 'srv-1',
      description: 'aiwork project',
    })
    expect('servers' in options).toBe(false)
  })

  it('includes docker preview and local dev targets for development proof', async () => {
    const options = await buildHostOptions({
      aisshServerList: async () => JSON.stringify({ servers: [] }),
      soulReleasesProvider: () => [],
    })

    expect(options.provisioningTargets.map(target => target.id)).toEqual([
      'docker:local-default',
      'local:default',
    ])
  })
})

describe('host options default soul release source (registry)', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'host-options-registry-'))
    initHostDb(join(dir, 'host.db'))
    runHostMigrations()
  })

  afterEach(() => {
    closeHostDb()
    if (dir)
      rmSync(dir, { force: true, recursive: true })
    dir = ''
  })

  it('reads soul releases from the persisted Host registry by default', async () => {
    publishSoulRelease({
      soulId: 'aiworker-freeform',
      name: 'AIWorker Freeform',
      descriptor: {
        protocol: 'soul/v1',
        identity: { id: 'aiworker-freeform', name: 'AIWorker Freeform' },
        engine: {},
      },
      source: 'official',
      now: () => '2026-06-09T00:00:00.000Z',
    })

    const options = await buildHostOptions({
      aisshServerList: async () => JSON.stringify({ servers: [] }),
    })

    expect(options.soulReleases).toEqual([{
      id: 'aiworker-freeform',
      name: 'AIWorker Freeform',
      publishedAt: '2026-06-09T00:00:00.000Z',
      releaseRef: 'aiworker-freeform@1',
      source: 'official',
      version: 1,
    }])
  })

  it('returns an empty soul release list for a fresh Host with nothing published', async () => {
    const options = await buildHostOptions({
      aisshServerList: async () => JSON.stringify({ servers: [] }),
    })
    expect(options.soulReleases).toEqual([])
  })
})
