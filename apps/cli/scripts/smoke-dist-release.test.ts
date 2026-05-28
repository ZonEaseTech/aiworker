import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

import { assertDistOpenApiFreshness } from './smoke-dist-release-contract'

describe('dist release smoke script contract', () => {
  it('validates the packaged official Freeform descriptor refs from dist official apps', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-dist-release.ts'), 'utf8')

    expect(source).toContain('assertDistOfficialFreeformDescriptor')
    expect(source).toContain('assertDistDescriptorRefs')
    expect(source).toContain('parseOfficialFreeformDescriptorJson')
    expect(source).toContain('official-apps')
    expect(source).toContain('aiworker-freeform')
    expect(source).toContain('soul.descriptor.json')
    expect(source).toContain('descriptor refs')
    expect(source).toContain('dist Freeform descriptor reference escapes package root')
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
