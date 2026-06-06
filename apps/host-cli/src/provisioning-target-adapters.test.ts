import { describe, expect, it } from 'bun:test'

import { deliverProvisioningTarget } from './provisioning-target-adapters'

const baseInput = {
  adapterRuntimeControlBaseUrl: 'http://127.0.0.1:9117',
  assignedEmail: 'bob@zonease.org',
  assignmentId: 'asn_1',
  hostBrowserBaseUrl: 'http://127.0.0.1:5050',
  hostControlBaseUrl: 'http://127.0.0.1:9117',
  provisionToken: 'awp_secret',
  soulReleaseRef: 'aiworker-freeform@dev',
}

describe('provisioning target adapters', () => {
  it('builds verified-shape aissh command with reason', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterRuntimeControlBaseUrl: 'https://dev-host.example.com',
      adapterType: 'aissh',
      maturity: 'production',
      targetRef: 'srv-1',
    })

    expect(delivery.deliveryStatus).toBe('delivered')
    expect(delivery.deliveryReceipt.command).toContain('aissh exec srv-1')
    expect(delivery.deliveryReceipt.command).toContain('--reason=')
    expect(delivery.provisionCommand).toContain('--host https://dev-host.example.com')
    expect(JSON.stringify(delivery)).not.toContain('awp_secret')
  })

  it('rejects remote aissh loopback callback URL', () => {
    expect(() => deliverProvisioningTarget({
      ...baseInput,
      adapterType: 'aissh',
      maturity: 'production',
      targetRef: 'srv-1',
    })).toThrow('Remote aissh target cannot use a loopback Host callback URL')
  })

  it('builds docker delivery command with isolated volume', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterRuntimeControlBaseUrl: 'http://host.docker.internal:9117',
      adapterType: 'docker',
      maturity: 'preview',
      targetRef: 'docker://local/default',
    })

    expect(delivery.deliveryReceipt.command).toContain('docker run')
    expect(delivery.deliveryReceipt.command).toContain('AIWORKER_HOME=/home/aiworker/.aiworker')
    expect(delivery.deliveryReceipt.command).toContain('aiworker-worker-asn_1')
  })

  it('builds local delivery command with isolated AIWORKER_HOME', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterType: 'local',
      maturity: 'dev',
      targetRef: 'local://default',
    })

    expect(delivery.deliveryReceipt.command).toContain('AIWORKER_HOME=')
    expect(delivery.deliveryReceipt.command).toContain('apps/worker-cli/src/aiworker.ts provision')
  })
})
