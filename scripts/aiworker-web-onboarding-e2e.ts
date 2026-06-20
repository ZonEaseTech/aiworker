import type { ControlPlaneSnapshot } from '../packages/aiworker-control/src/control-plane'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { assertPersistedControlPlaneHasNoTransientPairing } from './aiworker-web-live-e2e'

// US-011 接线门（可重复，不依赖真实远程目标）：
// 经 HTTP 顺序 environment -> provider -> soul-release -> plan(preview 只读) -> assignment -> approval，
// 每步断言 2xx 且 /api/admin-data 反映新实体；断言 preview 不写盘、无 literal secret、provider 拒绝非 secret:// 值。
//
// 运行方式：
//   bun scripts/aiworker-web-onboarding-e2e.ts
//   或 bun run e2e:aiworker-web:onboarding
//
// 该脚本不需要 AISSH 真连，不调用真 apply/pair（那两步需远程目标，由 gated live e2e 覆盖）。

const adminActionHeader = 'x-aiworker-admin-action'
const adminToken = 'aiworker-onboarding-e2e-token'
const ownerEmail = 'onboarding-owner@example.com'
const assignedEmail = 'onboarding-employee@example.com'
const environmentId = 'env-onboarding'
const providerId = 'claude-onboarding'
const providerSecretRef = 'secret://provider/claude-onboarding'

// 扫 HTTP 响应体的明文 secret/凭据样式（不扫请求头，避免 Bearer admin token 误报）。
const unsafeResponseBodyRe = new RegExp([
  `s${'k'}-[\\w-]{8,}`,
  'Bearer\\s+[\\w.~+/-]{12,}',
  'paseo://pair',
  'offer=',
].join('|'), 'i')

interface SoulCatalogEntry {
  descriptorRef: string
  displayName: string
  id: string
  soulReleaseRef: string
  version: string
}

interface AdminDataPayload {
  snapshot: ControlPlaneSnapshot | null
  source: 'control-plane' | 'fixture'
}

export async function runOnboardingE2e(): Promise<void> {
  const tempRoot = await mkdtempControlPlane()
  const soulsDir = resolve(import.meta.dirname, '..', 'souls')
  const server = await startWebServer({ controlPlaneDir: tempRoot, soulsDir })
  const baseUrl = server.baseUrl
  const snapshotPath = join(tempRoot, 'snapshot.json')

  try {
    await waitForHealthz(baseUrl)

    // 0. 初始 admin-data：control-plane 源，空 snapshot。
    const initial = await getJson<AdminDataPayload>(`${baseUrl}/api/admin-data`)
    assertResponseSafe('admin-data:initial', initial)
    if (initial.source !== 'control-plane')
      throw new Error(`expected control-plane source from /api/admin-data, got ${String(initial.source)}`)

    // 1. environment：owner-scoped Paseo home，fake/local target ref（aissh:server-onboarding，不真连）。
    const environment = await postJson<{ environment?: { environmentId?: string } }>(`${baseUrl}/api/environments`, {
      environment: environmentId,
      provider: providerId,
      target: 'aissh:server-onboarding',
      user: ownerEmail,
    })
    assertResponseSafe('environments', environment)
    if (environment.environment?.environmentId !== environmentId)
      throw new Error(`POST /api/environments did not return the created environment id`)
    await assertSnapshotHas(baseUrl, snapshot => snapshot.environments.some(item => item.environmentId === environmentId), 'environment')

    // 2. provider：secretRef 必须为 secret:// 引用，绝不存 literal secret。
    const provider = await postJson<{ provider?: { id?: string, secretRef?: string } }>(`${baseUrl}/api/providers`, {
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-onboarding-model',
      provider: providerId,
      providerKind: 'claude',
      secretRef: providerSecretRef,
    })
    assertResponseSafe('providers', provider)
    if (provider.provider?.id !== providerId)
      throw new Error(`POST /api/providers did not return the created provider id`)
    if (provider.provider?.secretRef !== providerSecretRef)
      throw new Error(`POST /api/providers persisted an unexpected secretRef ${String(provider.provider?.secretRef)}`)
    await assertSnapshotHas(baseUrl, snapshot => snapshot.providerProfiles.some(item => item.id === providerId), 'provider')

    // 2b. provider 端点对非 secret:// 值返回 4xx（接线门必须证明 guard 生效）。
    await assertRawProviderSecretRejected(baseUrl)

    // 3. soul-release：从 /api/soul-catalog 选一个真实 souls/*/dist 的 descriptorRef 注册。
    const catalog = await getJson<{ souls?: SoulCatalogEntry[] }>(`${baseUrl}/api/soul-catalog`)
    assertResponseSafe('soul-catalog', catalog)
    const catalogEntry = catalog.souls?.[0]
    if (!catalogEntry)
      throw new Error(`/api/soul-catalog returned no built souls; run bun run build:official-souls first (looked under ${soulsDir})`)
    const soulRelease = await postJson<{ soulRelease?: { id?: string } }>(`${baseUrl}/api/soul-releases`, {
      soul: catalogEntry.descriptorRef,
    })
    assertResponseSafe('soul-releases', soulRelease)
    const soulReleaseRef = soulRelease.soulRelease?.id
    if (typeof soulReleaseRef !== 'string' || !soulReleaseRef.includes('@'))
      throw new Error(`POST /api/soul-releases did not return a name@version id, got ${String(soulReleaseRef)}`)
    await assertSnapshotHas(baseUrl, snapshot => snapshot.soulReleases.some(item => `${item.id}@${item.version}` === soulReleaseRef || item.id === soulReleaseRef), 'soul-release')

    // 4. plan 预览只读：调用前后 snapshot.json 字节不变。
    const bytesBeforePlan = snapshotBytes(snapshotPath)
    const plan = await postJson<{ plan?: { assignment?: unknown } }>(`${baseUrl}/api/plan`, {
      environment: environmentId,
      provider: providerId,
      providerKind: 'claude',
      soul: catalogEntry.descriptorRef,
      target: 'aissh:server-onboarding',
      targetOwner: ownerEmail,
      user: assignedEmail,
    })
    assertResponseSafe('plan', plan)
    if (!plan.plan?.assignment)
      throw new Error(`POST /api/plan did not return a provisioning plan`)
    const bytesAfterPlan = snapshotBytes(snapshotPath)
    if (bytesBeforePlan !== bytesAfterPlan)
      throw new Error(`POST /api/plan mutated snapshot.json (preview must be read-only): ${bytesBeforePlan} -> ${bytesAfterPlan} bytes`)

    // 5. assignment：引用已注册实体（soulReleaseRef 用 soul-release 返回的 name@version id）。
    const assignment = await postJson<{ assignment?: { assignmentId?: string } }>(`${baseUrl}/api/assignments`, {
      environment: environmentId,
      provider: providerId,
      soulReleaseRef,
      user: assignedEmail,
    })
    assertResponseSafe('assignments', assignment)
    const assignmentId = assignment.assignment?.assignmentId
    if (typeof assignmentId !== 'string' || !assignmentId)
      throw new Error(`POST /api/assignments did not return an assignmentId`)
    await assertSnapshotHas(baseUrl, snapshot => snapshot.assignments.some(item => item.assignmentId === assignmentId), 'assignment')

    // 6. approval：审批通过，admin-data 反映批准记录。
    const approval = await postJson<{ approval?: { status?: string, assignmentId?: string } }>(`${baseUrl}/api/approvals/${encodeURIComponent(assignmentId)}`, {
      note: 'US-011 onboarding wiring gate approval',
      reviewer: 'aiworker-web-onboarding-e2e',
      status: 'approved',
    })
    assertResponseSafe('approvals', approval)
    if (approval.approval?.status !== 'approved' || approval.approval.assignmentId !== assignmentId)
      throw new Error(`POST /api/approvals did not record an approved decision for ${assignmentId}`)

    // 7. control-plane 落盘文件不含 transient pairing 或 literal secret。
    await assertPersistedControlPlaneHasNoTransientPairing(tempRoot)

    console.log(`PASS aiworker-web onboarding wiring gate: environment -> provider -> soul-release(${soulReleaseRef}) -> plan(read-only) -> assignment(${assignmentId}) -> approval, no literal secret in control-plane or responses`)
  }
  finally {
    server.process.kill()
  }
}

async function assertRawProviderSecretRejected(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/providers`, {
    body: JSON.stringify({ provider: 'rawtoken-provider', providerKind: 'claude', secretRef: 'rawtoken12345' }),
    headers: {
      'authorization': `Bearer ${adminToken}`,
      'content-type': 'application/json',
      [adminActionHeader]: '1',
    },
    method: 'POST',
  })
  const payload = await response.json().catch(() => ({})) as unknown
  if (response.status < 400 || response.status >= 500)
    throw new Error(`POST /api/providers with a raw non-secret value must return 4xx, got ${response.status}`)
  assertResponseSafe('providers:raw-secret-rejected', payload)
}

async function assertSnapshotHas(baseUrl: string, predicate: (snapshot: ControlPlaneSnapshot) => boolean, label: string): Promise<void> {
  const data = await getJson<AdminDataPayload>(`${baseUrl}/api/admin-data`)
  assertResponseSafe(`admin-data:${label}`, data)
  if (data.source !== 'control-plane')
    throw new Error(`expected control-plane source from /api/admin-data after ${label}, got ${String(data.source)}`)
  if (!data.snapshot || !predicate(data.snapshot))
    throw new Error(`/api/admin-data snapshot did not reflect the new ${label}`)
}

function assertResponseSafe(label: string, payload: unknown): void {
  const serialized = JSON.stringify(payload)
  if (serialized && unsafeResponseBodyRe.test(serialized))
    throw new Error(`response body for ${label} contained literal provider secret or transient pairing material`)
}

function snapshotBytes(snapshotPath: string): number {
  try {
    return readFileSync(snapshotPath).byteLength
  }
  catch {
    return 0
  }
}

async function mkdtempControlPlane(): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const dir = await mkdtemp(join(tmpdir(), 'aiworker-onboarding-e2e-'))
  return join(dir, 'control-plane')
}

async function startWebServer(options: { controlPlaneDir: string, soulsDir: string }): Promise<{ baseUrl: string, process: Bun.Subprocess }> {
  const port = await freePort()
  const proc = Bun.spawn(['bun', 'run', '--filter', '@zonease/aiworker-web', 'start'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AIWORKER_CONTROL_PLANE_DIR: options.controlPlaneDir,
      AIWORKER_SOULS_DIR: options.soulsDir,
      AIWORKER_WEB_ADMIN_TOKEN: adminToken,
      AIWORKER_WEB_HOST: '127.0.0.1',
      PORT: String(port),
    },
    stderr: 'inherit',
    stdout: 'inherit',
  })
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    process: proc,
  }
}

async function waitForHealthz(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`)
      if (response.ok)
        return
    }
    catch {
      // Server is still starting.
    }
    await Bun.sleep(200)
  }
  throw new Error(`aiworker-web did not become healthy at ${baseUrl}/healthz`)
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${adminToken}` },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(`GET ${url} failed with ${response.status}: ${JSON.stringify(payload)}`)
  return payload as T
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      'authorization': `Bearer ${adminToken}`,
      'content-type': 'application/json',
      [adminActionHeader]: '1',
    },
    method: 'POST',
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(`POST ${url} failed with ${response.status}: ${JSON.stringify(payload)}`)
  return payload as T
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    ;(server as unknown as { once: (event: 'error', listener: (error: Error) => void) => void }).once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('could not allocate a TCP port for aiworker-web onboarding E2E'))
        return
      }
      server.close(() => resolvePort(address.port))
    })
  })
}

if (import.meta.main) {
  try {
    await runOnboardingE2e()
  }
  catch (error) {
    console.error(`FAIL aiworker-web onboarding wiring gate: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
