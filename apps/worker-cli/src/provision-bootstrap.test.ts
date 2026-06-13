import type { WorkerCheckInResponse } from '@zonease/aiworker-worker-control-protocol'

import { Buffer } from 'node:buffer'
import { readdirSync, readFileSync, statSync } from 'node:fs'
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
    // name-policy: the first-provision path derives the display name from the descriptor's
    // identity.name (not the minted w_ workerId), matching `worker create`'s default.
    expect(workers[0]!.name).toBe('AIWorker Freeform')

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

  // AC#5 哨兵脱敏:用一个已知哨兵 access token 跑 first-provision 引导,然后扫
  // <worker-home> 下除 `access-token` 外的所有文件(递归,按字节读以覆盖 SQLite worker.db)
  // + 捕获的全部日志输出,断言哨兵子串零命中。坐实 token 真值不泄进 descriptor.json /
  // worker.db / fleet index / 日志,token-file 自身仍 0600 单列。
  it('AC#5: a sentinel access token never leaks outside the 0600 access-token file', async () => {
    // access token 的哨兵,刻意区别于 provision token('awp_secret')——本测试坐实的是 access
    // token(落盘到 access-token、走重连 hello 帧)不泄,而非 provision token。
    const sentinelAccessToken = 'aiwsentinel_DEADBEEF_access_token'
    const descriptorJson = freeformDescriptorJson()
    __setProvisionCheckInForTest(async () => ({
      access: { mode: 'worker_access', token: sentinelAccessToken },
      assignment: {
        assignedEmail: 'employee@example.com',
        assignmentId: 'asn_sentinel',
        soulDescriptor: descriptorJson,
        soulReleaseRef: 'soul-release-1',
        workerId: 'placeholder-host-worker-id',
      },
    }))
    __setDaemonForegroundForTest(async () => {})

    // 额外捕获 console.warn/error(撤销/消费-token 诚实降级走 console.warn,不走 consola 的 stderr stub)。
    const consoleLog: string[] = []
    const captured = ((...args: unknown[]) => {
      consoleLog.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    }) as typeof globalThis.console.warn
    const originalWarn = globalThis.console.warn
    const originalError = globalThis.console.error
    globalThis.console.warn = captured
    globalThis.console.error = captured

    try {
      const code = await runCli(argv('provision', '--host', 'https://host.example', '--token', 'awp_secret'))
      expect(code).toBe(0)
    }
    finally {
      globalThis.console.warn = originalWarn
      globalThis.console.error = originalError
    }

    const paths = resolveCliLocalPaths()
    closeWorkerDb()

    // 先证「牙齿」:access-token 文件本身确实含哨兵(token 真落盘了),且 0600。
    // 这同时证明:若递归扫描未排除 access-token,它本会命中哨兵——即扫描确实读了文件内容,
    // 而非因走错目录/空目录而假绿。
    const tokenFile = path.join(paths.home, 'access-token')
    const tokenInfo = await stat(tokenFile)
    expect(tokenInfo.mode & 0o777).toBe(0o600)
    expect(readFileSync(tokenFile).includes(Buffer.from(sentinelAccessToken))).toBe(true)

    // 递归扫 <worker-home> 下除 access-token 外的所有文件,按字节读(覆盖 SQLite worker.db)。
    function walk(dir: string): string[] {
      const out: string[] = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory())
          out.push(...walk(full))
        else if (entry.isFile())
          out.push(full)
      }
      return out
    }
    const sentinelBytes = Buffer.from(sentinelAccessToken)
    const scannedFiles = walk(paths.home).filter(file => path.resolve(file) !== path.resolve(tokenFile))

    // worker.db 必须在被扫范围内,否则「token 不泄进 worker.db」未被实证(命中目标确认)。
    expect(scannedFiles.some(file => statSync(file).isFile() && file.endsWith('aiworker.db'))).toBe(true)

    const hits = scannedFiles.filter(file => readFileSync(file).includes(sentinelBytes))
    // 任一命中 = 该路径(descriptor.json / worker.db / fleet index / …)泄了 access token 真值,
    // 证 redactWorkerAccessToken 在该接线处未接 → 测试失败,附泄漏路径。
    expect(hits).toEqual([])

    // 捕获的全部日志(consola→stderr/stdout + console.*)零哨兵命中。
    expect(stdout).not.toContain(sentinelAccessToken)
    expect(stderr).not.toContain(sentinelAccessToken)
    expect(consoleLog.join('\n')).not.toContain(sentinelAccessToken)

    closeWorkerDb()
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
