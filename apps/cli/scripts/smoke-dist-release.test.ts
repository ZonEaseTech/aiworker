import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { assertDistDescriptorRefsForRoot, assertOpenApiBrokerRouteDocument, assertProjectionReceiptMissingResponseText } from './smoke-dist-release'
import { assertDistOpenApiFreshness } from './smoke-dist-release-contract'

describe('dist release smoke script contract', () => {
  it('validates the packaged official Freeform descriptor refs from dist official apps', async () => {
    const descriptor = parseOfficialFreeformDescriptorJson(JSON.stringify({
      protocol: 'soul/v1',
      identity: {
        appId: 'aiworker-freeform',
        description: 'Open-ended Soul for freeform local work.',
        name: 'AIWorker Freeform',
        soulId: 'freeform',
        version: '0.1.0',
      },
      compatibility: {
        engines: ['codex', 'claude-code'],
        host: '>=1.0.0',
        sdk: '>=1.0.0',
      },
      capabilities: [
        {
          id: 'default',
          name: 'Freeform Session',
          prompt: {
            ref: 'dist/product/capabilities/default/prompt.md',
            type: 'packaged-file',
          },
          purpose: 'Start an open-ended engine-backed AIWorker session inside a workspace locator.',
        },
      ],
      configuration: {
        defaults: { engine: 'codex' },
        features: {
          engine: true,
          mcp: true,
          skills: true,
          workbench: true,
          workspaceAssets: true,
        },
        scope: 'worker',
        version: '1',
      },
      workbench: {
        entry: 'dist/web/workbench/index.html',
        mode: 'sdk-common',
        router: { mode: 'search' },
        type: 'micro-app',
      },
      api: null,
      engine: {
        workspaceAssets: { source: 'dist/engine-assets/workspace' },
        skills: { source: 'dist/engine-assets/skills' },
        mcp: {
          targets: {
            'claude-code': { file: 'dist/engine-assets/mcp/claude-code/.mcp.json' },
            codex: { file: 'dist/engine-assets/mcp/codex/config.toml' },
          },
        },
      },
      health: {
        ready: true,
        type: 'static',
      },
      extensions: {},
      external: {},
    }))
    const root = await mkdtemp(join(tmpdir(), 'aiworker-dist-ref-test-'))
    try {
      await mkdir(join(root, 'dist/web/workbench'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/workspace'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/skills/freeform'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/mcp/claude-code'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/mcp/codex'), { recursive: true })
      await writeFile(join(root, 'dist/web/workbench/index.html'), '<!doctype html>')
      await writeFile(join(root, 'dist/engine-assets/workspace/README.md'), 'workspace')
      await writeFile(join(root, 'dist/engine-assets/skills/freeform/SKILL.md'), 'skill')
      await writeFile(join(root, 'dist/engine-assets/mcp/claude-code/.mcp.json'), '{}')
      await writeFile(join(root, 'dist/engine-assets/mcp/codex/config.toml'), '')

      expect(() => assertDistDescriptorRefsForRoot(root, [
        { kind: 'file', ref: descriptor.workbench.entry },
        { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
        { kind: 'dir', ref: descriptor.engine.skills?.source },
        ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
      ])).not.toThrow()

      expect(() => assertDistDescriptorRefsForRoot(root, [
        { kind: 'file', ref: '../outside.txt' },
      ])).toThrow('dist Freeform descriptor reference escapes package root: ../outside.txt')

      expect(() => assertDistDescriptorRefsForRoot(root, [
        { kind: 'file', ref: 'dist/web/workbench/missing.html' },
      ])).toThrow('dist Freeform descriptor references missing file:')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('validates packaged daemon OpenAPI worker config envelope examples', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-dist-release.ts'), 'utf8')
    const contract = await readFile(join(import.meta.dirname, 'smoke-dist-release-contract.ts'), 'utf8')

    expect(source).toContain('assertDaemonOpenApiWorkerConfigEnvelope')
    expect(source).toContain('assertDistOpenApiFreshness')
    expect(source).toContain('/openapi.json')
    expect(source).toContain('/api/workers/{workerId}/config/{configKey}')
    expect(source).toContain('WorkerConfigValueInput')
    expect(source).toContain('configValueJson envelope')
    expect(contract).toContain('dist OpenAPI is stale')
    expect(contract).toContain('Run bun run build before smoke:dist-release')
    expect(source).toContain('literal-secret')
    expect(source).toContain('candidateId')
    expect(source).toContain('artifactContent')
  })

  it('validates packaged daemon OpenAPI canonical broker routes from the document', () => {
    const document = {
      paths: routesToOpenApiPaths([
        'POST /api/app-installation/install',
        'GET /api/app-installation/apps',
        'GET /api/app-installation/apps/{appId}',
        'POST /api/app-installation/apps/{appId}/enable',
        'POST /api/app-installation/apps/{appId}/archive',
        'DELETE /api/app-installation/apps/{appId}',
        'GET /api/info',
        'GET /api/settings',
        'PATCH /api/settings',
        'GET /api/capabilities',
        'POST /api/workers',
        'GET /api/workers',
        'GET /api/workers/{workerId}',
        'PATCH /api/workers/{workerId}',
        'POST /api/workers/{workerId}/archive',
        'DELETE /api/workers/{workerId}',
        'GET /api/workers/{workerId}/config',
        'PUT /api/workers/{workerId}/config/{configKey}',
        'PATCH /api/workers/{workerId}/config/{configKey}',
        'POST /api/workers/{workerId}/config/{configKey}/archive',
        'POST /api/workspace-locators',
        'GET /api/workspace-locators',
        'GET /api/workspace-locators/{workspaceId}',
        'PATCH /api/workspace-locators/{workspaceId}',
        'POST /api/workspace-locators/{workspaceId}/archive',
        'DELETE /api/workspace-locators/{workspaceId}',
        'POST /api/sessions',
        'GET /api/sessions',
        'GET /api/sessions/{sessionId}',
        'PATCH /api/sessions/{sessionId}',
        'POST /api/sessions/{sessionId}/archive',
        'DELETE /api/sessions/{sessionId}',
        'POST /api/sessions/{sessionId}/invocations',
        'GET /api/engine/targets',
        'GET /api/engine/targets/{target}/readiness',
        'POST /api/engine/targets/rescan',
        'POST /api/engine/targets/{target}/test',
        'POST /api/engine/invocations',
        'GET /api/engine/invocations/{invocationId}',
        'GET /api/engine/invocations/{invocationId}/events',
        'POST /api/engine/invocations/{invocationId}/cancel',
        'POST /api/engine/invocations/{invocationId}/reconcile',
        'POST /api/projections/{target}/refresh',
        'GET /api/projections/receipts/{receiptId}',
        'POST /api/projections/receipts/{receiptId}/cleanup',
        'GET /api/mount/workbench',
        'GET /api/apps/{appId}',
        'OPTIONS /api/apps/{appId}',
        'POST /api/apps/{appId}',
        'PUT /api/apps/{appId}',
        'PATCH /api/apps/{appId}',
        'DELETE /api/apps/{appId}',
        'GET /api/apps/{appId}/{path}',
        'OPTIONS /api/apps/{appId}/{path}',
        'POST /api/apps/{appId}/{path}',
        'PUT /api/apps/{appId}/{path}',
        'PATCH /api/apps/{appId}/{path}',
        'DELETE /api/apps/{appId}/{path}',
      ]),
    }

    expect(() => assertOpenApiBrokerRouteDocument(document)).not.toThrow()

    delete document.paths['/api/sessions/{sessionId}/invocations']?.post
    expect(() => assertOpenApiBrokerRouteDocument(document)).toThrow(
      'dist daemon OpenAPI is missing canonical broker routes: POST /api/sessions/{sessionId}/invocations',
    )

    document.paths['/api/sessions/{sessionId}/invocations'] = { post: {} }
    document.paths['/api/local/apps/{appId}/actions/{actionId}'] = { post: {} }
    expect(() => assertOpenApiBrokerRouteDocument(document)).toThrow(
      'dist daemon OpenAPI exposed retired local broker route: /api/local/apps/{appId}/actions/{actionId}',
    )
  })

  it('reports stale dist OpenAPI when packaged worker config request bodies are missing', () => {
    expect(() => assertDistOpenApiFreshness(undefined)).toThrow('dist OpenAPI is stale')
    expect(() => assertDistOpenApiFreshness({ put: {}, patch: { requestBody: {} } })).toThrow(
      'worker config PUT/PATCH request bodies are missing',
    )
    expect(() =>
      assertDistOpenApiFreshness({
        patch: { requestBody: { schema: 'WorkerConfigValueInput' } },
        put: { requestBody: { schema: 'WorkerConfigValueInput' } },
      }),
    ).not.toThrow()
  })

  it('validates packaged daemon projection receipt missing responses without leaking request secrets', () => {
    expect(() => assertProjectionReceiptMissingResponseText({
      body: '{"code":"PROJECTION_RECEIPT_MISSING","message":"receipt-owned projection receipt not found"}',
      label: 'read missing receipt-owned projection receipt',
      secretCanary: 'sk-smoke-projection-secret',
      status: 404,
    })).not.toThrow()

    expect(() => assertProjectionReceiptMissingResponseText({
      body: '{"code":"PROJECTION_RECEIPT_MISSING","debug":"sk-smoke-projection-secret"}',
      label: 'read missing receipt-owned projection receipt',
      secretCanary: 'sk-smoke-projection-secret',
      status: 404,
    })).toThrow('dist daemon projection receipt read missing receipt-owned projection receipt leaked secret-like request data')

    expect(() => assertProjectionReceiptMissingResponseText({
      body: '{"code":"NOT_FOUND"}',
      label: 'cleanup missing receipt-owned projection receipt',
      secretCanary: 'sk-smoke-projection-secret',
      status: 404,
    })).toThrow('dist daemon projection receipt cleanup missing receipt-owned projection receipt must return PROJECTION_RECEIPT_MISSING')
  })
})

function routesToOpenApiPaths(routes: string[]): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const route of routes) {
    const [method, routePath] = route.split(' ', 2)
    paths[routePath] ??= {}
    paths[routePath][method.toLowerCase()] = {}
  }
  return paths
}
