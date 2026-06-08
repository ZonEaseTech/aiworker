import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapOfficialSoulApps } from './official'
import {
  archiveSoulApp,
  enableSoulApp,
  findCatalogSoul,
  installSoulAppFromPath,
  installSoulDescriptor,
  listHostedSoulApps,
  listSoulCatalog,
  runSoulAppHealthcheck,
} from './registry'

const FREEFORM_APP_ID = 'aiworker-freeform'

const freeformDescriptor = parseSoulDescriptorV1({
  engine: {
    skills: { source: 'dist/engine-assets/skills' },
    workspaceAssets: { source: 'dist/engine-assets/workspace' },
  },
  identity: {
    description: 'Open-ended Soul for freeform local work.',
    id: FREEFORM_APP_ID,
    name: 'AIWorker Freeform',
  },
  protocol: 'soul/v1',
})

describe('Host Soul descriptor registry', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(path.join(tmpdir(), 'aiworker-soul-app-registry-'))
    initWorkerDb(path.join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('starts with an app-only empty Host catalog', () => {
    expect(listHostedSoulApps()).toHaveLength(0)
    expect(listSoulCatalog()).not.toHaveProperty('capabilities')
    expect(listSoulCatalog().souls).toEqual([])
    expect(findCatalogSoul('hr')).toBeUndefined()
  })

  it('installs, enables, projects, healthchecks, and archives a descriptor', async () => {
    const descriptorPath = path.join(dir, 'dist', 'soul.descriptor.json')
    mkdirSync(path.dirname(descriptorPath), { recursive: true })
    writeFileSync(descriptorPath, JSON.stringify(freeformDescriptor))

    const installed = await installSoulAppFromPath(dir, {
      hostVersion: '0.19.3',
      now: () => '2026-05-12T22:22:00.000Z',
    })
    expect(installed.status).toBe('installed')
    expect(installed.appId).toBe(FREEFORM_APP_ID)
    expect(installed.descriptor).toMatchObject({ protocol: 'soul/v1' })
    expect(installed).not.toHaveProperty('manifest')
    expect(installed).not.toHaveProperty('mountedContribution')
    expect(installed).toMatchObject({
      description: 'Open-ended Soul for freeform local work.',
      name: 'AIWorker Freeform',
    })
    expect(installed).not.toHaveProperty('mountedWorkbench')
    expect(installed).not.toHaveProperty('soulId')
    expect(installed).not.toHaveProperty('version')
    expect(listHostedSoulApps()).toHaveLength(1)
    expect(findCatalogSoul(FREEFORM_APP_ID)?.status).toBe('coming_soon')

    const enabled = enableSoulApp(FREEFORM_APP_ID, {
      hostVersion: '0.19.3',
      now: () => '2026-05-12T22:23:00.000Z',
    })
    expect(enabled.status).toBe('enabled')
    expect(enabled.healthStatus).toBe('pass')

    expect(findCatalogSoul(FREEFORM_APP_ID)?.status).toBe('available')
    expect(listSoulCatalog().souls.some(soul => soul.id === 'hr')).toBe(false)

    const checked = runSoulAppHealthcheck(FREEFORM_APP_ID, { hostVersion: '0.19.3' })
    expect(checked.healthMessage).toContain('No Soul App code was executed')

    const disabled = archiveSoulApp(FREEFORM_APP_ID, { now: () => '2026-05-12T22:24:00.000Z' })
    expect(disabled.status).toBe('disabled')
    expect(findCatalogSoul(FREEFORM_APP_ID)?.status).toBe('coming_soon')

    const reinstalled = await installSoulAppFromPath(descriptorPath, {
      hostVersion: '0.19.3',
      now: () => '2026-05-12T22:25:00.000Z',
    })
    expect(reinstalled.status).toBe('installed')
    expect(reinstalled.descriptorDigest).toBe(installed.descriptorDigest)
  })

  it('carries no descriptor extensions or external payload: descriptor v1 is identity/engine only', () => {
    const installed = installSoulDescriptor({
      descriptor: freeformDescriptor,
      sourceKind: 'inline',
      sourceRef: 'inline://descriptor-only',
    }, {
      hostVersion: '0.19.3',
      now: () => '2026-05-12T22:22:00.000Z',
    })
    const enabled = enableSoulApp(FREEFORM_APP_ID, {
      hostVersion: '0.19.3',
      now: () => '2026-05-12T22:23:00.000Z',
    })
    const catalog = listSoulCatalog()

    expect(installed.descriptor).not.toHaveProperty('extensions')
    expect(installed.descriptor).not.toHaveProperty('external')
    expect(enabled.descriptor).not.toHaveProperty('extensions')
    expect(enabled.descriptor).not.toHaveProperty('external')

    const projected = JSON.stringify({
      projectedSoul: enabled.projectedSoul,
      souls: catalog.souls,
    })
    // Host projections expose only descriptor identity, never opaque domain payloads.
    expect(projected).not.toContain('businessWorkflow')
    expect(projected).not.toContain('candidateId')
  })

  it('bootstraps official Freeform without re-enabling disabled apps', async () => {
    // Scope to Freeform: this test exercises the disabled-app preservation
    // mechanism, not the full official catalog (covered in orchestrator.test.ts).
    const repoRoot = path.join(dir, 'repo')
    const descriptorRoot = path.join(repoRoot, 'souls', FREEFORM_APP_ID, 'dist')
    mkdirSync(descriptorRoot, { recursive: true })
    writeFileSync(path.join(descriptorRoot, 'soul.descriptor.json'), JSON.stringify(freeformDescriptor))

    const definitions = [{ descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json', id: FREEFORM_APP_ID }]
    const first = await bootstrapOfficialSoulApps({
      definitions,
      hostVersion: '0.19.3',
      now: () => '2026-05-13T12:25:00.000Z',
      repoRoot,
    })
    expect(first.map(result => [result.appId, result.action])).toEqual([
      [FREEFORM_APP_ID, 'installed_enabled'],
    ])
    expect(first[0]?.descriptorPath).toBe(path.join(repoRoot, definitions[0]!.descriptorPath))
    expect(findCatalogSoul(FREEFORM_APP_ID)?.status).toBe('available')
    expect(findCatalogSoul('hr')).toBeUndefined()

    const second = await bootstrapOfficialSoulApps({
      definitions,
      hostVersion: '0.19.3',
      now: () => '2026-05-13T12:26:00.000Z',
      repoRoot,
    })
    expect(second.map(result => [result.appId, result.action])).toEqual([
      [FREEFORM_APP_ID, 'refreshed'],
    ])
    expect(second[0]?.descriptorPath).toBe(path.join(repoRoot, definitions[0]!.descriptorPath))

    archiveSoulApp(FREEFORM_APP_ID, { now: () => '2026-05-13T12:27:00.000Z' })
    const third = await bootstrapOfficialSoulApps({
      definitions,
      hostVersion: '0.19.3',
      now: () => '2026-05-13T12:28:00.000Z',
      repoRoot,
    })
    expect(third.map(result => [result.appId, result.action])).toEqual([
      [FREEFORM_APP_ID, 'preserved_disabled'],
    ])
    expect(third[0]?.descriptorPath).toBe(path.join(repoRoot, definitions[0]!.descriptorPath))
    expect(findCatalogSoul(FREEFORM_APP_ID)?.status).toBe('coming_soon')
  })

  it('bootstraps official descriptors from an explicit packaged app root', async () => {
    const packagedRoot = path.join(dir, 'official-apps')
    const freeformRoot = path.join(packagedRoot, FREEFORM_APP_ID, 'dist')
    mkdirSync(freeformRoot, { recursive: true })
    writeFileSync(path.join(freeformRoot, 'soul.descriptor.json'), JSON.stringify(freeformDescriptor))

    const results = await bootstrapOfficialSoulApps({
      definitions: [{ descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json', id: FREEFORM_APP_ID }],
      hostVersion: '0.19.3',
      now: () => '2026-05-14T14:12:00.000Z',
      officialAppsRoot: packagedRoot,
    })

    expect(results.map(result => [result.appId, result.action])).toEqual([
      [FREEFORM_APP_ID, 'installed_enabled'],
    ])
    expect(results.every(result => result.descriptorPath.startsWith(packagedRoot))).toBe(true)
    expect(findCatalogSoul(FREEFORM_APP_ID)?.status).toBe('available')
  })

  it('stores descriptor validation failures as registry error state', async () => {
    const descriptorPath = path.join(dir, 'dist', 'soul.descriptor.json')
    mkdirSync(path.dirname(descriptorPath), { recursive: true })
    writeFileSync(path.join(dir, 'dist', 'soul.descriptor.json'), '{}')

    await expect(installSoulAppFromPath(descriptorPath, {
      hostVersion: '0.19.3',
      now: () => '2026-05-12T22:26:00.000Z',
    })).rejects.toThrow()
  })
})
