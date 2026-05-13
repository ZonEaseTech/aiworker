import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId } from '@zonease/aiworker-shared'
import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

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
    expect(listHostSoulCatalog().souls.some(soul => soul.id === 'hr')).toBe(true)

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
