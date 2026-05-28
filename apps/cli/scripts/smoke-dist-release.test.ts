import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { assertDistDescriptorRefsForRoot } from './smoke-dist-release'
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

  it('validates packaged daemon OpenAPI canonical broker routes', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-dist-release.ts'), 'utf8')

    expect(source).toContain('assertDaemonOpenApiBrokerRoutes')
    expect(source).toContain('OPTIONS /api/apps/{appId}')
    expect(source).toContain('OPTIONS /api/apps/{appId}/{path}')
    expect(source).toContain('/api/sessions/{sessionId}/invocations')
    expect(source).toContain('/api/engine/invocations/{invocationId}/reconcile')
    expect(source).toContain('/api/projections/receipts/{receiptId}/cleanup')
    expect(source).toContain('retiredBrokerRouteSegments')
    expect(source).toContain('actions')
    expect(source).toContain('{actionId}')
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

  it('validates packaged daemon projection receipt broker boundary', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-dist-release.ts'), 'utf8')

    expect(source).toContain('assertDaemonProjectionReceiptBoundary')
    expect(source).toContain('/api/projections/receipts/')
    expect(source).toContain('smoke-missing-receipt')
    expect(source).toContain('/cleanup')
    expect(source).toContain('PROJECTION_RECEIPT_MISSING')
    expect(source).toContain('sk-smoke-projection-secret')
    expect(source).toContain('receipt-owned projection')
  })
})
