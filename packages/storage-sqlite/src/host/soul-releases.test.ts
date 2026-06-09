import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  closeHostDb,
  getSoulRelease,
  initHostDb,
  listSoulReleases,
  publishSoulRelease,
  runHostMigrations,
} from './index'

const sampleDescriptor = {
  protocol: 'soul/v1',
  identity: { id: 'ops-copilot', name: 'Ops Copilot' },
  engine: { skills: { source: 'dist/engine-assets/skills' } },
}

describe('host sqlite soul release registry', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiworker-host-soul-db-'))
    initHostDb(join(dir, 'host.db'))
    runHostMigrations()
  })

  afterEach(async () => {
    closeHostDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('publishes a release with an auto-assigned version 1 and derived releaseRef', () => {
    const release = publishSoulRelease({
      soulId: 'ops-copilot',
      name: 'Ops Copilot',
      descriptor: sampleDescriptor,
      publishedBy: 'cli',
      now: () => '2026-06-09T00:00:00.000Z',
    })

    expect(release.soulId).toBe('ops-copilot')
    expect(release.version).toBe(1)
    expect(release.releaseRef).toBe('ops-copilot@1')
    expect(release.name).toBe('Ops Copilot')
    expect(release.source).toBe('custom')
    expect(release.publishedBy).toBe('cli')
    expect(release.publishedAt).toBe('2026-06-09T00:00:00.000Z')
    expect(JSON.parse(release.descriptorJson)).toEqual(sampleDescriptor)
  })

  it('auto-increments version per soulId on subsequent publishes', () => {
    publishSoulRelease({ soulId: 'ops-copilot', name: 'Ops Copilot', descriptor: sampleDescriptor })
    const second = publishSoulRelease({ soulId: 'ops-copilot', name: 'Ops Copilot', descriptor: sampleDescriptor })
    const otherSoul = publishSoulRelease({
      soulId: 'hr-manager',
      name: 'HR Manager',
      descriptor: { ...sampleDescriptor, identity: { id: 'hr-manager', name: 'HR Manager' } },
    })

    expect(second.version).toBe(2)
    expect(second.releaseRef).toBe('ops-copilot@2')
    expect(otherSoul.version).toBe(1)
    expect(otherSoul.releaseRef).toBe('hr-manager@1')
  })

  it('honors an explicit version', () => {
    const release = publishSoulRelease({
      soulId: 'ops-copilot',
      name: 'Ops Copilot',
      descriptor: sampleDescriptor,
      version: 7,
    })
    expect(release.version).toBe(7)
    expect(release.releaseRef).toBe('ops-copilot@7')
  })

  it('rejects re-publishing an existing releaseRef (same soulId@version)', () => {
    publishSoulRelease({ soulId: 'ops-copilot', name: 'Ops Copilot', descriptor: sampleDescriptor, version: 1 })
    expect(() => publishSoulRelease({
      soulId: 'ops-copilot',
      name: 'Ops Copilot',
      descriptor: sampleDescriptor,
      version: 1,
    })).toThrow()
  })

  it('rejects a descriptor carrying a literal secret', () => {
    expect(() => publishSoulRelease({
      soulId: 'ops-copilot',
      name: 'Ops Copilot',
      descriptor: { ...sampleDescriptor, leaked: 'token=supersecretvalue1234567' },
    })).toThrow(/Literal secrets/)
    expect(listSoulReleases()).toHaveLength(0)
  })

  it('lists and fetches published releases', () => {
    publishSoulRelease({ soulId: 'ops-copilot', name: 'Ops Copilot', descriptor: sampleDescriptor })
    publishSoulRelease({
      soulId: 'hr-manager',
      name: 'HR Manager',
      descriptor: { ...sampleDescriptor, identity: { id: 'hr-manager', name: 'HR Manager' } },
    })

    const all = listSoulReleases()
    expect(all).toHaveLength(2)
    expect(all.map(row => row.releaseRef).sort()).toEqual(['hr-manager@1', 'ops-copilot@1'])

    const fetched = getSoulRelease('ops-copilot@1')
    expect(fetched?.name).toBe('Ops Copilot')
    expect(getSoulRelease('missing@9')).toBeNull()
  })

  it('keeps published releases across an idempotent re-run of migrations', () => {
    publishSoulRelease({ soulId: 'ops-copilot', name: 'Ops Copilot', descriptor: sampleDescriptor })
    expect(() => runHostMigrations()).not.toThrow()
    expect(listSoulReleases()).toHaveLength(1)
  })
})
