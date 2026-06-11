import type { WorkerCheckInResponse } from '@zonease/aiworker-worker-control-protocol'

import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import {
  closeWorkerDb,
  initWorkerDb,
  listWorkers,
  resolveSingleActiveWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { createWorkerOrchestrator } from '@zonease/aiworker-worker-runtime'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  __setDaemonForegroundForTest,
  __setProvisionCheckInForTest,
  resolveCliLocalPaths,
  runCli,
} from './aiworker'

// first-provision 引导集成测试:裸机(无预存 worker)走 `aiworker provision` →
// check-in → 装 descriptor(descriptor-path)→ enable → 建并绑 worker → 持久 access token →
// daemonForeground。注 fake check-in(不真 HTTP)+ 注 daemonForeground stub(不真起 daemon)。
describe('aiworker provision first-provision bootstrap', () => {
  const originalEnv = { ...process.env }
  const originalStderrWrite = process.stderr.write
  const originalStdoutWrite = process.stdout.write
  let root = ''
  let stderr = ''
  let stdout = ''

  function freeformDescriptorJson(): string {
    const file = path.resolve(import.meta.dir, '..', '..', '..', 'souls', 'aiworker-freeform', 'dist', 'soul.descriptor.json')
    return readFileSync(file, 'utf8')
  }

  function fakeCheckInResponse(soulDescriptor: string): WorkerCheckInResponse {
    return {
      access: { mode: 'worker_access', token: 'awt_provisioned_secret' },
      assignment: {
        assignedEmail: 'employee@example.com',
        assignmentId: 'asn_provisioned',
        soulDescriptor,
        soulReleaseRef: 'soul-release-1',
        // Host first-provision 时还不知道真实 worker id,回 placeholder;真 workerId 由 worker 自己 mint。
        workerId: 'placeholder-host-worker-id',
      },
    }
  }

  beforeEach(async () => {
    closeWorkerDb()
    stderr = ''
    stdout = ''
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-provision-boot-'))
    process.env.AIWORKER_HOME = path.join(root, 'home')
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'aiworker.db')
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(async () => {
    __setDaemonForegroundForTest(null)
    __setProvisionCheckInForTest(null)
    closeWorkerDb()
    process.exitCode = 0
    for (const key of Object.keys(process.env))
      delete process.env[key]
    Object.assign(process.env, originalEnv)
    process.stderr.write = originalStderrWrite
    process.stdout.write = originalStdoutWrite
    await rm(root, { force: true, recursive: true })
  })

  function argv(...args: string[]): string[] {
    return ['/usr/bin/bun', '/repo/apps/worker-cli/src/aiworker.ts', ...args]
  }

  it('bootstraps a fresh box: check-in → descriptor-path install → enable → bind worker → persist 0600 token', async () => {
    const descriptorJson = freeformDescriptorJson()
    const checkInCalls: Array<{ host: string, provisionToken: string, workerId: string }> = []
    __setProvisionCheckInForTest(async (input) => {
      checkInCalls.push({ host: input.host, provisionToken: input.provisionToken, workerId: input.workerId })
      return fakeCheckInResponse(descriptorJson)
    })
    const foregroundCalls: Array<{ host?: string, port?: number }> = []
    __setDaemonForegroundForTest(async (opts = {}) => {
      foregroundCalls.push(opts)
    })

    const code = await runCli(argv('provision', '--host', 'https://host.example', '--token', 'awp_secret'))
    expect(code).toBe(0)

    // provision env was set for the daemon (consumed by maybeProvisionCheckIn's env fallback path).
    expect(process.env.AIWORKER_HOST_URL).toBe('https://host.example')
    expect(process.env.AIWORKER_PROVISION_TOKEN).toBe('awp_secret')

    // check-in happened exactly once, with the provision token + a minted worker id.
    expect(checkInCalls).toHaveLength(1)
    expect(checkInCalls[0]!.host).toBe('https://host.example')
    expect(checkInCalls[0]!.provisionToken).toBe('awp_secret')
    expect(checkInCalls[0]!.workerId.length).toBeGreaterThan(0)

    // daemonForeground ran after the bootstrap.
    expect(foregroundCalls).toEqual([{}])

    // The worker exists in the home DB the daemon will boot, bound to the descriptor's identity.id.
    const paths = resolveCliLocalPaths()
    closeWorkerDb()
    initWorkerDb(paths.dbPath)
    const workers = listWorkers()
    expect(workers).toHaveLength(1)
    expect(workers[0]!.appId).toBe('aiworker-freeform')
    expect(workers[0]!.id).toBe(checkInCalls[0]!.workerId)

    // The resolver the daemon actually uses (resolveSingleActiveWorker) sees kind === 'single'.
    const resolution = resolveSingleActiveWorker()
    expect(resolution.kind).toBe('single')

    // The soul app installed via descriptor-path and is enabled → engine asset source is non-null
    // (captures both failure modes: missing enable + inline-not-descriptor-path).
    const host = createWorkerOrchestrator({ workersRoot: paths.workersRoot })
    const app = host.getApp('aiworker-freeform')
    expect(app?.status).toBe('enabled')
    expect(app?.sourceKind).toBe('descriptor-path')
    const engineSource = host.engineAssetSourceForWorker(workers[0]!)
    expect(engineSource).not.toBeNull()
    expect(engineSource?.appId).toBe('aiworker-freeform')
    closeWorkerDb()

    // The descriptor was written to <worker-home>/soul.descriptor.json.
    const descriptorFile = path.join(paths.home, 'soul.descriptor.json')
    const writtenDescriptor = await readFile(descriptorFile, 'utf8')
    expect(JSON.parse(writtenDescriptor)).toEqual(JSON.parse(descriptorJson))

    // The access token was persisted at <worker-home>/access-token with 0600.
    const tokenFile = path.join(paths.home, 'access-token')
    const tokenInfo = await stat(tokenFile)
    expect(tokenInfo.mode & 0o777).toBe(0o600)
    const persisted = JSON.parse(await readFile(tokenFile, 'utf8')) as {
      access: { mode: string, token: string }
      assignment: { assignmentId: string, workerId: string }
    }
    expect(persisted.access).toEqual({ mode: 'worker_access', token: 'awt_provisioned_secret' })
    expect(persisted.assignment.assignmentId).toBe('asn_provisioned')
    expect(persisted.assignment.workerId).toBe(workers[0]!.id)

    // The provision token must not leak to stdout/stderr.
    expect(stdout).not.toContain('awp_secret')
    expect(stderr).not.toContain('awp_secret')
  })

  it('is idempotent: a re-run with a worker already present does not check-in again', async () => {
    const descriptorJson = freeformDescriptorJson()
    let checkInCount = 0
    __setProvisionCheckInForTest(async () => {
      checkInCount += 1
      return fakeCheckInResponse(descriptorJson)
    })
    __setDaemonForegroundForTest(async () => {})

    // First provision builds the worker.
    expect(await runCli(argv('provision', '--host', 'https://host.example', '--token', 'awp_secret'))).toBe(0)
    expect(checkInCount).toBe(1)

    // Second provision: worker already exists → bootstrap skipped, no second check-in
    // (the provision token is single-use and would 401). Daemon restart self-heal reads the
    // persisted token instead.
    expect(await runCli(argv('provision', '--host', 'https://host.example', '--token', 'awp_secret'))).toBe(0)
    expect(checkInCount).toBe(1)
  })

  it('fails honestly (non-zero exit) when check-in throws, without silently starting the daemon', async () => {
    __setProvisionCheckInForTest(async () => {
      throw new Error('Worker check-in failed: 401')
    })
    let foregroundRan = false
    __setDaemonForegroundForTest(async () => {
      foregroundRan = true
    })

    const code = await runCli(argv('provision', '--host', 'https://host.example', '--token', 'awp_secret'))
    expect(code).not.toBe(0)
    expect(foregroundRan).toBe(false)
    // No worker and no token file were left behind by the failed bootstrap.
    const paths = resolveCliLocalPaths()
    closeWorkerDb()
    initWorkerDb(paths.dbPath)
    expect(listWorkers()).toHaveLength(0)
    closeWorkerDb()
  })
})
