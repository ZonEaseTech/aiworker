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
    expect(hrSoulAppManifest.artifactTypes[0]?.schemaSha256).toBe('a'.repeat(64))
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
