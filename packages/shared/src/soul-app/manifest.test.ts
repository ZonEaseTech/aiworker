import type { SoulAppManifest } from './manifest'

import { describe, expect, it } from 'bun:test'

import {
  hrSoulAppManifest,
  qaSoulAppManifest,
  referenceSoulAppManifests,
} from './fixtures'
import {
  parseSoulAppManifestJson,
  soulAppManifestSchema,
  validateSoulAppManifest,
} from './manifest'

function cloneManifest(manifest: SoulAppManifest): SoulAppManifest {
  return JSON.parse(JSON.stringify(manifest)) as SoulAppManifest
}

describe('Soul App manifest schema', () => {
  it('parses the HR and QA reference manifests', () => {
    expect(referenceSoulAppManifests).toHaveLength(2)
    for (const manifest of referenceSoulAppManifests) {
      expect(soulAppManifestSchema.safeParse(manifest).success).toBe(true)
      expect(manifest.protocol).toBe('soul-app/v1')
      expect(manifest.modes.standalone.supported).toBe(true)
      expect(manifest.modes.hostMounted.supported).toBe(true)
      expect(manifest.storage.namespace).toBe(manifest.id)
      expect(manifest.pack.refs.length).toBeGreaterThan(0)
    }
  })

  it('validates reference manifests against host discovery inputs', () => {
    const hrResult = validateSoulAppManifest(hrSoulAppManifest, {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
    })
    expect(hrResult.status).toBe('valid')
    expect(hrResult.issues).toHaveLength(0)

    const qaResult = validateSoulAppManifest(qaSoulAppManifest, {
      availableConnectorIds: ['ci', 'issue-tracker'],
      hostVersion: '0.12.1',
    })
    expect(qaResult.status).toBe('valid')
    expect(qaResult.issues).toHaveLength(0)
  })

  it('keeps fixture contributions explicit enough for Host discovery', () => {
    expect(hrSoulAppManifest.artifactTypes[0]?.schemaSha256).toBe('35c14e3d4c0fe9fd95c87e9bc47a210e21f99bcb1b079aa99a95bb93e820c8ab')
    expect(hrSoulAppManifest.capabilities[0]?.promptRef).toBe('./capabilities/person-profile/prompt.md')
    expect(hrSoulAppManifest.workspaceTypes[0]?.defaultCapabilityIds).toEqual(['person-profile'])
    expect(hrSoulAppManifest.connectors.required[0]?.scopes).toContain('candidates.read')
    expect(hrSoulAppManifest.permissions).toContainEqual(expect.objectContaining({
      kind: 'api',
      target: '/api/local/apps/aiworker-hr',
    }))
    expect(hrSoulAppManifest.ui.artifactPreviews[0]).toEqual(expect.objectContaining({
      slot: 'artifact-preview',
      target: 'person-profile',
    }))
    expect(hrSoulAppManifest.ui.routes[0]?.surface).toMatchObject({
      entry: '/surfaces/routes/hr-home',
      renderer: 'host-descriptor',
      scope: 'app',
    })
    expect(hrSoulAppManifest.ui.workspaceWidgets?.[0]?.surface).toMatchObject({
      entry: '/frames/widgets/hr-people-widget',
      renderer: 'sandboxed-frame',
      scope: 'workspace',
    })
  })

  it('accepts app-declared shell toolbar and search descriptors', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        shell: {
          actions: [
            {
              id: 'refresh-profiles',
              label: 'Refresh',
              protocolAction: 'profiles.refresh',
              slot: 'action',
            },
          ],
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            protocolAction: 'profiles.create',
            slot: 'primary',
          },
          search: {
            id: 'people-profile-search',
            label: 'Search people profiles',
            placeholder: 'Search people profiles',
            protocolProvider: 'peopleProfiles.search',
          },
          settings: {
            id: 'hr-settings',
            label: 'HR settings',
            protocolAction: 'settings.open',
          },
        },
      },
    })

    expect(result.status).toBe('valid')
  })

  it('rejects shell descriptors without protocol actions', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        shell: {
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            slot: 'primary',
          },
        },
      },
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.some(issue => issue.message.includes('protocolAction'))).toBe(true)
  })

  it('reports unsupported protocol before Host imports app code', () => {
    const manifest = { ...hrSoulAppManifest, protocol: 'soul-app/v2' }
    const result = validateSoulAppManifest(manifest)

    expect(result.status).toBe('invalid')
    expect(result.issues.map(issue => issue.code)).toContain('unsupported_protocol')
    expect(result.manifest).toBeUndefined()
  })

  it('reports incompatible host version deterministically', () => {
    const result = validateSoulAppManifest(hrSoulAppManifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.11.9',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.map(issue => issue.code)).toContain('incompatible_host_version')
  })

  it('reports missing required connectors when Host inventory is known', () => {
    const result = validateSoulAppManifest(hrSoulAppManifest, {
      availableConnectorIds: ['calendar'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'missing_required_connector',
      path: 'connectors.required.ats',
    }))
  })

  it('rejects storage namespaces outside the app id', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.storage.namespace = 'hr-data'

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.map(issue => issue.code)).toContain('invalid_storage_namespace')
  })

  it('rejects mounted local service URLs outside loopback HTTP', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.api.localService = {
      baseUrl: 'https://example.com:8443',
      healthPath: '/health',
    }

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'unsafe_local_service_url',
      path: 'api.localService.baseUrl',
    }))
  })

  it('allows mounted local service URLs on loopback HTTP', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.api.localService = {
      baseUrl: 'http://127.0.0.1:3000',
      healthPath: '/health',
    }

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('valid')
  })

  it('rejects unsafe permission requests', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.permissions = [
      ...manifest.permissions,
      {
        action: 'read',
        kind: 'storage',
        reason: 'Invalid fixture should be rejected.',
        target: '*',
      },
    ]

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.map(issue => issue.code)).toContain('unsafe_permission_request')
  })

  it('requires host-mounted apps to declare UI or API contributions', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.api = {}
    manifest.ui = {
      artifactPreviews: [],
      panels: [],
      reviewPanels: [],
      routes: [],
      workspaceWidgets: [],
    }

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.map(issue => issue.code)).toContain('missing_ui_api_entry')
  })

  it('rejects unsafe mounted surface declarations', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.ui.routes[0]!.surface = {
      entry: '/modules/hr-home.js',
      renderer: 'trusted-module',
      scope: 'app',
    }

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'unsafe_ui_surface',
      path: 'ui.routes.0.surface',
    }))
  })

  it('requires descriptor and frame surfaces to use their declared endpoint families', () => {
    const descriptorManifest = cloneManifest(hrSoulAppManifest)
    descriptorManifest.ui.routes[0]!.surface = {
      entry: '/frames/routes/hr-home',
      renderer: 'host-descriptor',
      scope: 'app',
    }

    const frameManifest = cloneManifest(hrSoulAppManifest)
    frameManifest.ui.workspaceWidgets![0]!.surface = {
      entry: '/surfaces/widgets/hr-people-widget',
      renderer: 'sandboxed-frame',
      scope: 'workspace',
    }

    expect(validateSoulAppManifest(descriptorManifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    }).issues).toContainEqual(expect.objectContaining({ code: 'unsafe_ui_surface' }))
    expect(validateSoulAppManifest(frameManifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    }).issues).toContainEqual(expect.objectContaining({ code: 'unsafe_ui_surface' }))
  })

  it('classifies missing artifact schema refs as artifact schema errors', () => {
    const manifest = cloneManifest(hrSoulAppManifest) as unknown as {
      artifactTypes: Array<Record<string, unknown>>
    }
    delete manifest.artifactTypes[0]?.schemaRef

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.map(issue => issue.code)).toContain('invalid_artifact_schema')
  })

  it('parses JSON without executing app entrypoints', () => {
    const result = parseSoulAppManifestJson(JSON.stringify(hrSoulAppManifest), {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.manifest.exports.runtime).toBe('./src/protocol/runtime.ts')
      expect(result.manifest.modes.hostMounted.entry).toBe('./src/host-mounted.ts')
    }
  })

  it('returns malformed with manifest issues for invalid JSON or invalid shape', () => {
    expect(parseSoulAppManifestJson('{ not json').status).toBe('malformed')

    const result = parseSoulAppManifestJson(JSON.stringify({
      ...hrSoulAppManifest,
      id: 'AIWorker HR',
    }))
    expect(result.status).toBe('malformed')
    if (result.status === 'malformed')
      expect(result.issues.map(issue => issue.code)).toContain('invalid_manifest')
  })
})
