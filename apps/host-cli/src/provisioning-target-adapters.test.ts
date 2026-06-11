import { spawnSync } from 'node:child_process'
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

    // 诚实状态：Host 只生成了投递命令、尚未确认 Worker 落地，绝不谎报 'delivered'（false-green）。
    // 真执行（executed/failed）随切片 2 Phase 2 的 first-provision 引导落地。
    expect(delivery.deliveryStatus).toBe('command_generated')
    expect(delivery.deliveryReceipt.command).toContain('aissh exec srv-1')
    expect(delivery.deliveryReceipt.command).toContain('--reason=')
    expect(delivery.provisionCommand).toContain('--host https://dev-host.example.com')
    expect(JSON.stringify(delivery)).not.toContain('awp_secret')
  })

  it('keeps nested aissh provision command separate from top-level reason argv', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterRuntimeControlBaseUrl: 'https://dev-host.example.com',
      adapterType: 'aissh',
      assignedEmail: 'bob.o\'connor@zonease.org',
      maturity: 'production',
      targetRef: 'srv-1',
    })

    const argv = parseAisshArgv(delivery.deliveryReceipt.command)
    const provisionArgv = parseShellArgv(requiredArg(argv, 2))

    expect(argv.slice(0, 2)).toEqual(['exec', 'srv-1'])
    expect(provisionArgv).toEqual([
      'bun',
      'apps/worker-cli/src/aiworker.ts',
      'provision',
      '--host',
      'https://dev-host.example.com',
      '--token',
      'awp_[REDACTED]',
    ])
    expect(argv[3]).toBe('--reason=Provision AIWorker for bob.o\'connor@zonease.org')
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
    expectShellSyntaxValid(delivery.deliveryReceipt.command)
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

  it('redacts non-awp provision token from all returned strings', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterType: 'local',
      maturity: 'dev',
      provisionToken: 'plain-secret-token',
      targetRef: 'local://default',
    })

    expect(JSON.stringify(delivery)).not.toContain('plain-secret-token')
  })

  it('redacts quoted non-awp token from nested aissh provision argv', () => {
    const provisionToken = 'plain secret\'token'
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterRuntimeControlBaseUrl: 'https://dev-host.example.com',
      adapterType: 'aissh',
      maturity: 'production',
      provisionToken,
      targetRef: 'srv-1',
    })

    const aisshArgv = parseAisshArgv(delivery.deliveryReceipt.command)
    const provisionArgv = parseShellArgv(requiredArg(aisshArgv, 2))

    expect(provisionArgv.at(-1)).toBe('[REDACTED]')
    expect(JSON.stringify(delivery)).not.toContain(provisionToken)
    expect(JSON.stringify(delivery)).not.toContain('plain secret')
  })

  it('redacts quoted non-awp token from docker receipt and target refs', () => {
    const provisionToken = 'plain secret\'token'
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterRuntimeControlBaseUrl: 'http://host.docker.internal:9117',
      adapterType: 'docker',
      maturity: 'preview',
      provisionToken,
      targetRef: `docker://local/${provisionToken}`,
    })

    const dockerArgv = parseDockerArgv(delivery.deliveryReceipt.command)
    const provisionArgv = parseShellArgv(dockerArgv.at(-1) ?? '')

    expect(provisionArgv.at(-1)).toBe('[REDACTED]')
    expect(delivery.deliveryReceipt.targetRef).toBe('docker://local/[REDACTED]')
    expect(JSON.stringify(delivery)).not.toContain(provisionToken)
    expect(JSON.stringify(delivery)).not.toContain('plain secret')
  })
})

function parseAisshArgv(command: string): string[] {
  const result = spawnSync('bash', ['-c', `aissh() { printf '%s\\0' "$@"; }\n${command}`], {
    encoding: 'buffer',
  })
  if (result.status !== 0) {
    throw new Error(`Failed to parse aissh command:\n${String(result.stderr)}`)
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean)
}

function expectShellSyntaxValid(command: string): void {
  const result = spawnSync('bash', ['-n', '-c', command], {
    encoding: 'utf8',
  })
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
}

function parseDockerArgv(command: string): string[] {
  const result = spawnSync('bash', ['-c', `docker() { printf '%s\\0' "$@"; }\n${command}`], {
    encoding: 'buffer',
  })
  if (result.status !== 0) {
    throw new Error(`Failed to parse docker command:\n${String(result.stderr)}`)
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean)
}

function parseShellArgv(command: string): string[] {
  const result = spawnSync('bash', ['-c', `printf '%s\\0' ${command}`], {
    encoding: 'buffer',
  })
  if (result.status !== 0) {
    throw new Error(`Failed to parse shell argv:\n${String(result.stderr)}`)
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean)
}

function requiredArg(argv: string[], index: number): string {
  const value = argv[index]
  if (value === undefined)
    throw new Error(`Missing argv[${index}] in ${JSON.stringify(argv)}`)
  return value
}
