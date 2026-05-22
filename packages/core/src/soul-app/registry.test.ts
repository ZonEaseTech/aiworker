import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId, qaSoulAppManifest } from '@zonease/aiworker-shared'
import { closeWorkerDb, initWorkerDb, runWorkerMigrations, upsertSoulApp } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapOfficialSoulApps } from './official'
import {
  disableSoulApp,
  enableSoulApp,
  findHostCapabilityTemplate,
  findHostSoul,
  installSoulAppFromPath,
  listHostCapabilityTemplatesForSoul,
  listHostedSoulApps,
  listHostSoulCatalog,
  runSoulAppHealthcheck,
} from './registry'

describe('Host Soul App registry', () => {
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
    expect(listHostSoulCatalog().souls).toEqual([])
    expect(listHostSoulCatalog().templates).toEqual([])
    expect(findHostSoul('hr')).toBeUndefined()
    expect(findHostCapabilityTemplate('candidate-screen')).toBeUndefined()
    expect(listHostCapabilityTemplatesForSoul('hr')).toEqual([])
  })

  it('installs, enables, projects, healthchecks, and disables a static manifest', async () => {
    const manifestPath = path.join(dir, 'soul-app.manifest.json')
    writeFileSync(manifestPath, JSON.stringify(hrSoulAppManifest))

    const installed = await installSoulAppFromPath(manifestPath, {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
      now: () => '2026-05-12T22:22:00.000Z',
    })
    expect(installed.status).toBe('installed')
    expect(installed.appId).toBe('aiworker-hr')
    expect(listHostedSoulApps()).toHaveLength(1)
    expect(findHostSoul('aiworker-hr')?.status).toBe('coming_soon')

    const enabled = enableSoulApp('aiworker-hr', {
      availableConnectorIds: ['ats', 'calendar'],
      enabledConnectorIds: ['ats'],
      hostVersion: '0.12.1',
      now: () => '2026-05-12T22:23:00.000Z',
    })
    expect(enabled.status).toBe('enabled')
    expect(enabled.healthStatus).toBe('pass')

    const capabilityId = namespaceSoulAppCapabilityId('aiworker-hr', 'candidate-screen')
    expect(findHostSoul('aiworker-hr')?.status).toBe('available')
    expect(findHostCapabilityTemplate(capabilityId)?.soulId).toBe('aiworker-hr')
    expect(listHostCapabilityTemplatesForSoul('aiworker-hr').map(template => template.id)).toContain(capabilityId)
    expect(listHostCapabilityTemplatesForSoul('aiworker-hr').map(template => template.id)).toEqual(expect.arrayContaining([
      namespaceSoulAppCapabilityId('aiworker-hr', 'evidence-matrix'),
      namespaceSoulAppCapabilityId('aiworker-hr', 'interview-brief'),
      namespaceSoulAppCapabilityId('aiworker-hr', 'hiring-risk'),
      namespaceSoulAppCapabilityId('aiworker-hr', 'profile-update-draft'),
    ]))
    expect(listHostSoulCatalog().souls.some(soul => soul.id === 'hr')).toBe(false)

    const checked = runSoulAppHealthcheck('aiworker-hr', {
      availableConnectorIds: ['ats', 'calendar'],
      enabledConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })
    expect(checked.healthMessage).toContain('No Soul App code was executed')

    const disabled = disableSoulApp('aiworker-hr', { now: () => '2026-05-12T22:24:00.000Z' })
    expect(disabled.status).toBe('disabled')
    expect(findHostCapabilityTemplate(capabilityId)).toBeUndefined()
    expect(findHostSoul('aiworker-hr')?.status).toBe('coming_soon')

    const reinstalled = await installSoulAppFromPath(manifestPath, {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
      now: () => '2026-05-12T22:25:00.000Z',
    })
    expect(reinstalled.status).toBe('installed')
    expect(reinstalled.manifestDigest).toBe(installed.manifestDigest)
  })

  it('bootstraps official HR and QA apps without re-enabling disabled apps', async () => {
    const first = await bootstrapOfficialSoulApps({
      availableConnectorIds: ['ats', 'calendar', 'ci', 'issue-tracker'],
      hostVersion: '0.12.1',
      now: () => '2026-05-13T12:25:00.000Z',
    })
    expect(first.map(result => [result.appId, result.action])).toEqual([
      ['aiworker-hr', 'installed_enabled'],
      ['aiworker-qa', 'installed_enabled'],
    ])
    expect(findHostSoul('aiworker-hr')?.status).toBe('available')
    expect(findHostSoul('aiworker-qa')?.status).toBe('available')
    expect(findHostSoul('hr')).toBeUndefined()
    expect(findHostSoul('aiworker-hr')?.defaultTemplates).toEqual([
      namespaceSoulAppCapabilityId('aiworker-hr', 'person-profile'),
      namespaceSoulAppCapabilityId('aiworker-hr', 'profile-update-draft'),
      namespaceSoulAppCapabilityId('aiworker-hr', 'candidate-screen'),
    ])
    expect(findHostSoul('aiworker-qa')?.defaultTemplates).toEqual([
      namespaceSoulAppCapabilityId('aiworker-qa', 'regression-matrix'),
      namespaceSoulAppCapabilityId('aiworker-qa', 'release-gate'),
    ])
    expect(listHostSoulCatalog().templates.some(template => template.soulId === 'aiworker-hr')).toBe(true)

    const second = await bootstrapOfficialSoulApps({
      availableConnectorIds: ['ats', 'calendar', 'ci', 'issue-tracker'],
      hostVersion: '0.12.1',
      now: () => '2026-05-13T12:26:00.000Z',
    })
    expect(second.map(result => [result.appId, result.action])).toEqual([
      ['aiworker-hr', 'refreshed'],
      ['aiworker-qa', 'refreshed'],
    ])

    disableSoulApp('aiworker-hr', { now: () => '2026-05-13T12:27:00.000Z' })
    const third = await bootstrapOfficialSoulApps({
      availableConnectorIds: ['ats', 'calendar', 'ci', 'issue-tracker'],
      hostVersion: '0.12.1',
      now: () => '2026-05-13T12:28:00.000Z',
    })
    expect(third.map(result => [result.appId, result.action])).toEqual([
      ['aiworker-hr', 'preserved_disabled'],
      ['aiworker-qa', 'refreshed'],
    ])
    expect(findHostSoul('aiworker-hr')?.status).toBe('coming_soon')
    expect(listHostCapabilityTemplatesForSoul('aiworker-hr')).toEqual([])
    expect(findHostSoul('aiworker-qa')?.status).toBe('available')
  })

  it('refreshes stale official app rows before parsing legacy mounted surface renderers', async () => {
    const legacyManifest = structuredClone(hrSoulAppManifest) as typeof hrSoulAppManifest & Record<string, unknown>
    legacyManifest.ui.routes![0]!.surface = {
      entry: '/frames/routes/hr-home',
      renderer: 'sandboxed-frame' as never,
      requiredPermissions: ['ui:mount:hr-workbench'],
      scope: 'app',
    }
    legacyManifest.ui.workspaceWidgets![0]!.surface = {
      entry: '/frames/widgets/hr-people-widget',
      renderer: 'sandboxed-frame' as never,
      scope: 'workspace',
    }
    upsertSoulApp({
      id: legacyManifest.id,
      name: legacyManifest.name,
      version: legacyManifest.version,
      protocol: legacyManifest.protocol,
      soulId: legacyManifest.soul.id,
      status: 'enabled',
      sourceKind: 'manifest-path',
      sourceRef: 'legacy-installed-row',
      manifestDigest: 'legacy-sandboxed-frame',
      manifestJson: legacyManifest as never,
      validationIssuesJson: [],
      healthStatus: 'pass',
      healthMessage: 'Legacy row installed before micro-app migration.',
      at: '2026-05-20T10:40:00.000Z',
    })

    const results = await bootstrapOfficialSoulApps({
      availableConnectorIds: ['ats', 'calendar', 'ci', 'issue-tracker'],
      hostVersion: '0.19.0',
      now: () => '2026-05-20T10:41:00.000Z',
    })

    expect(results.find(result => result.appId === 'aiworker-hr')?.action).toBe('refreshed')
    expect(results.find(result => result.appId === 'aiworker-hr')?.app?.manifest.ui.routes?.[0]?.surface?.renderer).toBe('micro-app')
    expect(results.find(result => result.appId === 'aiworker-hr')?.app?.mountedContribution.microAppSurfaceIds).toContain('hr-home')
    expect(results.find(result => result.appId === 'aiworker-hr')?.app).not.toHaveProperty('frameSurfaceIds')
    expect(findHostSoul('aiworker-hr')?.status).toBe('available')
  })

  it('bootstraps official apps from an explicit packaged app root', async () => {
    const packagedRoot = path.join(dir, 'official-apps')
    const hrRoot = path.join(packagedRoot, 'aiworker-hr')
    const qaRoot = path.join(packagedRoot, 'aiworker-qa')
    mkdirSync(hrRoot, { recursive: true })
    mkdirSync(qaRoot, { recursive: true })
    writeFileSync(path.join(hrRoot, 'soul-app.manifest.json'), JSON.stringify(hrSoulAppManifest))
    writeFileSync(path.join(qaRoot, 'soul-app.manifest.json'), JSON.stringify(qaSoulAppManifest))

    const results = await bootstrapOfficialSoulApps({
      availableConnectorIds: ['ats', 'calendar', 'ci', 'issue-tracker'],
      hostVersion: '0.12.1',
      now: () => '2026-05-14T14:12:00.000Z',
      officialAppsRoot: packagedRoot,
    })

    expect(results.map(result => [result.appId, result.action])).toEqual([
      ['aiworker-hr', 'installed_enabled'],
      ['aiworker-qa', 'installed_enabled'],
    ])
    expect(results.every(result => result.manifestPath.startsWith(packagedRoot))).toBe(true)
    expect(findHostSoul('aiworker-hr')?.status).toBe('available')
    expect(findHostSoul('aiworker-qa')?.status).toBe('available')
  })

  it('stores path manifest validation failures as registry error state', async () => {
    const manifestPath = path.join(dir, 'soul-app.manifest.json')
    writeFileSync(manifestPath, JSON.stringify(hrSoulAppManifest))

    const app = await installSoulAppFromPath(manifestPath, {
      availableConnectorIds: ['calendar'],
      hostVersion: '0.12.1',
      now: () => '2026-05-12T22:26:00.000Z',
    })

    expect(app.status).toBe('error')
    expect(app.healthStatus).toBe('fail')
    expect(app.validationIssues.map(issue => issue.code)).toContain('missing_required_connector')
    expect(listHostedSoulApps()).toHaveLength(1)
  })
})
