import { describe, expect, test } from 'bun:test'

import { parseSoulDescriptorV1 } from '../index'
import { buildHostedSoulApp } from './registry'

const descriptor = parseSoulDescriptorV1({
  protocol: 'soul/v1',
  identity: {
    id: 'aiworker-freeform',
    name: 'AIWorker Freeform',
    description: 'Open-ended Soul for freeform local work.',
  },
  engine: {},
})

describe('buildHostedSoulApp', () => {
  test('projects descriptor identity into a hosted soul app', () => {
    const app = buildHostedSoulApp({
      descriptor,
      descriptorDigest: 'digest',
      sourceKind: 'descriptor-path',
      sourceRef: '/tmp/aiworker-freeform/dist/soul.descriptor.json',
      status: 'enabled',
    })

    expect(app.appId).toBe('aiworker-freeform')
    expect(app.name).toBe('AIWorker Freeform')
    expect(app.projectedSoul.status).toBe('available')
  })

  test('does not project the retired v1-empty api/permissions fields', () => {
    const app = buildHostedSoulApp({
      descriptor,
      descriptorDigest: 'digest',
      sourceKind: 'descriptor-path',
      sourceRef: '/tmp/aiworker-freeform/dist/soul.descriptor.json',
      status: 'enabled',
    })

    expect(app).not.toHaveProperty('api')
    expect(app).not.toHaveProperty('permissions')
  })
})
