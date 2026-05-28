import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

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
  })

  it('validates packaged daemon OpenAPI worker config envelope examples', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-dist-release.ts'), 'utf8')

    expect(source).toContain('assertDaemonOpenApiWorkerConfigEnvelope')
    expect(source).toContain('/openapi.json')
    expect(source).toContain('/api/workers/{workerId}/config/{configKey}')
    expect(source).toContain('WorkerConfigValueInput')
    expect(source).toContain('configValueJson envelope')
    expect(source).toContain('literal-secret')
    expect(source).toContain('candidateId')
    expect(source).toContain('artifactContent')
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
