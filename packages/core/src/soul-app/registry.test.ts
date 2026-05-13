import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId } from '@zonease/aiworker-shared'
import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
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
