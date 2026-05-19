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

  it('requires official reference manifests to declare engine assets', () => {
    expect(hrSoulAppManifest.engineAssets.workspace.source).toBe('./engine-assets/workspace')
    expect(hrSoulAppManifest.engineAssets.skills).toEqual({
      source: './engine-assets/skills',
      targets: ['codex', 'claude-code'],
    })
    expect(qaSoulAppManifest.engineAssets.workspace.source).toBe('./engine-assets/workspace')
    expect(qaSoulAppManifest.engineAssets.skills?.targets).toEqual(['codex', 'claude-code'])
  })

  it('rejects engine asset paths that escape the app root', () => {
    const manifest = cloneManifest(hrSoulAppManifest) as SoulAppManifest & { engineAssets?: unknown }
    manifest.engineAssets = {
      workspace: { source: '../outside' },
      skills: { source: './engine-assets/skills', targets: ['codex'] },
    }

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'unsafe_engine_asset_source',
      path: 'engineAssets.workspace.source',
    }))
  })

  it('accepts generic MCP client and server declarations', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.engineAssets = {
      ...manifest.engineAssets,
      mcpClients: [
        { source: './engine-assets/mcp-clients/codex', target: 'codex' },
        { source: './engine-assets/mcp-clients/claude-code', target: 'claude-code' },
      ],
      mcpServers: [{
        id: 'ats',
        package: '@zonease/aiworker-mcp-ats',
        requiredPermissions: ['connector:read:ats'],
        transport: 'stdio',
      }],
    }

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('valid')
    expect(result.issues).toHaveLength(0)
  })

  it('rejects workflow-private MCP server package names', () => {
    const manifest = cloneManifest(hrSoulAppManifest)
    manifest.engineAssets = {
      ...manifest.engineAssets,
      mcpServers: [{
        id: 'candidate-screening',
        package: '@zonease/aiworker-hr-candidate-screening-mcp',
        transport: 'stdio',
      }],
    }

    const result = validateSoulAppManifest(manifest, {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
    })

    expect(result.status).toBe('invalid')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'unsafe_mcp_server_package',
      path: 'engineAssets.mcpServers.candidate-screening.package',
    }))
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
    expect(hrSoulAppManifest.artifactTypes.map(type => type.id)).toEqual(expect.arrayContaining([
      'person-profile',
      'candidate-screen',
      'evidence-matrix',
      'interview-brief',
      'hiring-risk',
      'profile-update-proposal',
    ]))
    expect(hrSoulAppManifest.capabilities.map(capability => capability.outputKind)).toEqual(expect.arrayContaining([
      'person-profile',
      'candidate-screen',
      'evidence-matrix',
      'interview-brief',
      'hiring-risk',
      'profile-update-proposal',
    ]))
    expect(hrSoulAppManifest.capabilities.find(capability => capability.id === 'interview-brief')).toMatchObject({
      artifactTypes: ['interview-brief'],
      promptRef: './product/workflows/interview-brief/prompt.md',
      reviewRubricRef: './product/workflows/interview-brief/review.md',
    })
    const profileUpdateProposal = hrSoulAppManifest.capabilities.find(capability => capability.id === 'profile-update-proposal')
    expect(profileUpdateProposal).toMatchObject({
      artifactTypes: ['profile-update-proposal'],
      outputKind: 'profile-update-proposal',
    })
    expect(profileUpdateProposal?.workspaceTypes).toEqual(expect.arrayContaining(['people-profile', 'candidate']))
    expect(hrSoulAppManifest.capabilities[0]?.promptRef).toBe('./product/workflows/person-profile/prompt.md')
    expect(hrSoulAppManifest.capabilities[0]?.reviewRubricRef).toBe('./product/workflows/person-profile/review.md')
    expect(hrSoulAppManifest.artifactTypes[0]?.schemaRef).toBe('./product/artifacts/schemas/person-profile.schema.json')
    expect(hrSoulAppManifest.artifactTypes[0]?.previewRef).toBe('./product/web/artifact-previews/person-profile-preview.tsx')
    expect(hrSoulAppManifest.artifactTypes[0]?.reviewPolicyRef).toBe('./product/reviews/person-profile.md')
    expect(hrSoulAppManifest.pack.refs[0]?.ref).toBe('product/profiles/hr-recruiting/SOUL.md')
    expect(hrSoulAppManifest.workspaceTypes[0]?.defaultCapabilityIds).toEqual(['person-profile', 'profile-update-proposal'])
    expect(hrSoulAppManifest.connectors.required[0]?.scopes).toContain('candidates.read')
    expect(hrSoulAppManifest.permissions).toContainEqual(expect.objectContaining({
      kind: 'api',
      target: '/api/local/apps/aiworker-hr',
    }))
    expect(hrSoulAppManifest.permissions).toContainEqual(expect.objectContaining({
      action: 'read',
      kind: 'search',
      target: 'aiworker-hr',
    }))
    expect(hrSoulAppManifest.ui.workbench?.primaryAction).toEqual(expect.objectContaining({
      id: 'create-people-profile',
      requiredPermissions: ['storage:write:aiworker-hr', 'search:write:aiworker-hr'],
      role: 'primary',
    }))
    expect(hrSoulAppManifest.ui.workbench?.search).toEqual(expect.objectContaining({
      protocolProvider: 'peopleProfiles.search',
      requiredPermissions: ['search:read:aiworker-hr'],
    }))
    expect(hrSoulAppManifest.ui.workspaceContext?.terminal).toEqual(expect.objectContaining({
      cwd: { source: 'host-workspace-root' },
      id: 'hr-workspace-terminal',
    }))
    expect(hrSoulAppManifest.ui.artifactPreviews[0]).toEqual(expect.objectContaining({
      entry: './product/web/artifact-previews/person-profile-preview.tsx',
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
    expect(qaSoulAppManifest.capabilities[0]?.promptRef).toBe('./product/workflows/regression-matrix/prompt.md')
    expect(qaSoulAppManifest.capabilities[0]?.reviewRubricRef).toBe('./product/workflows/regression-matrix/review.md')
    expect(qaSoulAppManifest.artifactTypes[0]?.schemaRef).toBe('./product/artifacts/schemas/regression-matrix.schema.json')
    expect(qaSoulAppManifest.artifactTypes[0]?.reviewPolicyRef).toBe('./product/reviews/regression-matrix.md')
    expect(qaSoulAppManifest.pack.refs[0]?.ref).toBe('product/profiles/qa-reviewer/SOUL.md')
    expect(qaSoulAppManifest.ui.routes[0]?.entry).toBe('./product/web/routes/qa-route.tsx')
    expect(hrSoulAppManifest.api.entry).toBe('./host-adapter/api.ts')
    expect(hrSoulAppManifest.exports.runtime).toBe('./host-adapter/protocol/runtime.ts')
    expect(hrSoulAppManifest.modes.hostMounted.entry).toBe('./host-adapter/mounted/host-mounted.ts')
    expect(hrSoulAppManifest.modes.standalone.entry).toBe('./host-adapter/standalone/standalone.ts')
    expect(qaSoulAppManifest.api.entry).toBe('./host-adapter/api.ts')
    expect(qaSoulAppManifest.exports.runtime).toBe('./host-adapter/protocol/runtime.ts')
    expect(qaSoulAppManifest.modes.hostMounted.entry).toBe('./host-adapter/mounted/host-mounted.ts')
    expect(qaSoulAppManifest.modes.standalone.entry).toBe('./host-adapter/standalone/standalone.ts')
  })

  it('accepts app-declared workbench actions and search descriptors', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        workbench: {
          actions: [
            {
              id: 'refresh-profiles',
              label: 'Refresh',
              protocolAction: 'profiles.refresh',
              requiredPermissions: ['storage:read:aiworker-hr'],
              role: 'action',
            },
          ],
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            protocolAction: 'profiles.create',
            requiredPermissions: ['storage:write:aiworker-hr'],
            role: 'primary',
          },
          search: {
            id: 'people-profile-search',
            label: 'Search people profiles',
            placeholder: 'Search people profiles',
            protocolProvider: 'peopleProfiles.search',
            requiredPermissions: ['search:read:aiworker-hr'],
          },
          configuration: {
            id: 'configure-hr',
            label: 'Configure HR',
            protocolAction: 'configuration.open',
            requiredPermissions: ['api:serve:/api/local/apps/aiworker-hr'],
          },
        },
      },
    })

    expect(result.status).toBe('valid')
  })

  it('accepts app-declared workspace terminal context descriptors', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        workspaceContext: {
          terminal: {
            cwd: {
              protocolProvider: 'workspaces.cwd.resolve',
              source: 'protocol-resolver',
            },
            id: 'hr-workspace-terminal',
            label: 'People workspace terminal',
            requiredPermissions: ['api:serve:/api/local/apps/aiworker-hr'],
          },
        },
      },
    })

    expect(result.status).toBe('valid')
  })

  it('rejects deprecated Host header shell descriptors', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        shell: {
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            protocolAction: 'profiles.create',
            slot: 'primary',
          },
        },
      },
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.some(issue => issue.path === 'ui' && issue.message.includes('shell'))).toBe(true)
  })

  it('rejects workbench descriptors without protocol actions', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        workbench: {
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            role: 'primary',
          },
        },
      },
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.some(issue => issue.message.includes('protocolAction'))).toBe(true)
  })

  it('rejects malformed workbench descriptor required permissions', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        workbench: {
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            protocolAction: 'profiles.create',
            requiredPermissions: ['storage.write.aiworker-hr'],
            role: 'primary',
          },
        },
      },
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.some(issue => issue.message.includes('kind:action:target'))).toBe(true)
  })

  it('rejects workspace terminal context without a resolver for protocol cwd', () => {
    const result = validateSoulAppManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        workspaceContext: {
          terminal: {
            cwd: {
              source: 'protocol-resolver',
            },
            id: 'hr-workspace-terminal',
            label: 'People workspace terminal',
          },
        },
      },
    })

    expect(result.status).toBe('invalid')
    expect(result.issues.some(issue => issue.message.includes('protocolProvider'))).toBe(true)
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
      expect(result.manifest.exports.runtime).toBe('./host-adapter/protocol/runtime.ts')
      expect(result.manifest.modes.hostMounted.entry).toBe('./host-adapter/mounted/host-mounted.ts')
      expect(result.manifest.artifactTypes[0]?.schemaRef).toBe('./product/artifacts/schemas/person-profile.schema.json')
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
