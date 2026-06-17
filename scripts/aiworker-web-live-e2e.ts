import type { ControlPlaneSnapshot, WorkspaceAssignment } from '../packages/aiworker-control/src/control-plane'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { createDefaultPaseoDaemonEndpointRef, LocalFileControlPlaneStore } from '../packages/aiworker-control/src/index'

type LiveE2eConfig
  = | { kind: 'skip', reason: string }
    | {
      adminToken: string
      assignmentId: string
      baseUrl?: string
      controlPlaneDir: string
      dedicatedTarget: true
      kind: 'run'
      projectSmoke: boolean
    }

interface ApplyJobPayload {
  error?: string
  job?: {
    remediation?: { code?: string, title?: string }
    status?: string
    steps?: Array<{ id: string, label: string, status: string }>
  }
  remediation?: { code?: string, title?: string }
}

interface PairJobPayload {
  error?: string
  pair?: {
    assignmentId?: string
    pairingOutput?: string
    status?: string
  }
  remediation?: { code?: string, title?: string }
}

const adminActionHeader = 'x-aiworker-admin-action'
const unsafePersistedOutputRe = new RegExp([
  'offer=',
  'paseo://pair',
  'data:image/',
  'base64:',
  `s${'k'}-[\\w-]{8,}`,
  'Bearer\\s+[\\w.~+/-]{12,}',
].join('|'), 'i')

export function liveE2eConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LiveE2eConfig {
  if (env.AIWORKER_WEB_LIVE_E2E !== '1') {
    return {
      kind: 'skip',
      reason: 'set AIWORKER_WEB_LIVE_E2E=1 to run the real Web approval/apply/pair E2E gate',
    }
  }

  const controlPlaneDir = requiredEnv(env, 'AIWORKER_CONTROL_PLANE_DIR')
  const adminToken = requiredEnv(env, 'AIWORKER_WEB_ADMIN_TOKEN')
  const assignmentId = requiredEnv(env, 'AIWORKER_WEB_E2E_ASSIGNMENT_ID')
  requiredEnv(env, 'AISSH_TOKEN')
  requireDedicatedTarget(env)

  return {
    adminToken,
    assignmentId,
    baseUrl: env.AIWORKER_WEB_E2E_BASE_URL?.trim() || undefined,
    controlPlaneDir: resolve(controlPlaneDir),
    dedicatedTarget: true,
    kind: 'run',
    projectSmoke: env.AIWORKER_WEB_LIVE_E2E_PROJECT_SMOKE === '1',
  }
}

export async function assertPersistedControlPlaneHasNoTransientPairing(root: string): Promise<void> {
  for (const file of ['snapshot.json', 'approvals.jsonl', 'receipts.jsonl', 'audit-events.jsonl', 'projection-manifests.jsonl']) {
    const path = join(root, file)
    if (!existsSync(path))
      continue
    const content = await readFile(path, 'utf8')
    if (unsafePersistedOutputRe.test(content))
      throw new Error(`${file} contains transient pairing output or literal provider secret material`)
  }
}

export async function runLiveE2e(config: LiveE2eConfig): Promise<void> {
  if (config.kind === 'skip') {
    console.log(`SKIP aiworker-web live E2E: ${config.reason}`)
    return
  }

  const snapshotBefore = await loadAndValidateInputs(config)
  const server = config.baseUrl ? null : await startWebServer()
  const baseUrl = config.baseUrl ?? server!.baseUrl

  try {
    await waitForHealthz(baseUrl)
    const data = await getJson<{ source?: string, snapshot?: ControlPlaneSnapshot }>(`${baseUrl}/api/admin-data`, config.adminToken)
    if (data.source !== 'control-plane')
      throw new Error(`expected control-plane source from /api/admin-data, got ${String(data.source)}`)
    if (!data.snapshot?.assignments.some(assignment => assignment.assignmentId === config.assignmentId))
      throw new Error(`assignment ${config.assignmentId} was not returned by /api/admin-data`)

    await postJson(`${baseUrl}/api/approvals/${encodeURIComponent(config.assignmentId)}`, config.adminToken, {
      note: 'live E2E approval from AIWorker Web gate',
      reviewer: 'aiworker-web-live-e2e',
      status: 'approved',
    })

    const apply = await postJson<ApplyJobPayload>(`${baseUrl}/api/assignments/${encodeURIComponent(config.assignmentId)}/apply`, config.adminToken, {})
    assertApplyCompleted(apply)

    const snapshotAfterApply = await new LocalFileControlPlaneStore(config.controlPlaneDir).loadSnapshot()
    if (!hasAppliedReceipt(snapshotAfterApply, snapshotBefore.assignment))
      throw new Error(`assignment ${config.assignmentId} did not produce an applied receipt in the control-plane store`)

    const pair = await postJson<PairJobPayload>(`${baseUrl}/api/assignments/${encodeURIComponent(config.assignmentId)}/pair`, config.adminToken, {})
    assertPairCompleted(pair, config.assignmentId)
    if (config.projectSmoke)
      await assertPaseoRunCwdSmoke(snapshotAfterApply, snapshotBefore.assignment)
    await assertPersistedControlPlaneHasNoTransientPairing(config.controlPlaneDir)

    console.log(`PASS aiworker-web live E2E: ${config.assignmentId} approved, applied, and produced a transient daemon pair response through Web API${config.projectSmoke ? '; paseo run --host --cwd accepted the Project workdir' : ''}`)
  }
  finally {
    server?.process.kill()
  }
}

async function loadAndValidateInputs(config: Extract<LiveE2eConfig, { kind: 'run' }>): Promise<{
  assignment: WorkspaceAssignment
  snapshot: ControlPlaneSnapshot
}> {
  const store = new LocalFileControlPlaneStore(config.controlPlaneDir)
  const snapshot = await store.loadSnapshot()
  const assignment = snapshot.assignments.find(item => item.assignmentId === config.assignmentId)
  if (!assignment)
    throw new Error(`assignment ${config.assignmentId} is missing from ${config.controlPlaneDir}/snapshot.json`)
  const environment = snapshot.environments.find(item => item.environmentId === assignment.environmentId)
  if (!environment)
    throw new Error(`assignment ${config.assignmentId} references missing environment ${assignment.environmentId}`)
  if (!environment.targetRef.startsWith('aissh:'))
    throw new Error(`live E2E requires an aissh targetRef, got ${environment.targetRef}`)
  const userSlug = assignedUserSlug(assignment.assignedEmail)
  const expectedPaseoHome = `$HOME/.aiworker/${userSlug}/.paseo`
  const expectedProjectPrefix = `$HOME/.aiworker/${userSlug}/projects/`
  const expectedEndpoint = createDefaultPaseoDaemonEndpointRef(userSlug)
  if (environment.topologyKind !== 'owner-scoped-paseo-home-v1')
    throw new Error(`live E2E requires owner-scoped topology, got ${environment.topologyKind ?? 'missing'}`)
  if (environment.paseoHome !== expectedPaseoHome)
    throw new Error(`live E2E requires owner-scoped Paseo home ${expectedPaseoHome}, got ${environment.paseoHome}`)
  if (environment.endpointKind !== 'tcp' || (environment.daemonHostRef ?? environment.daemonEndpoint) !== expectedEndpoint)
    throw new Error(`live E2E requires owner-scoped loopback TCP endpoint ${expectedEndpoint}, got ${environment.daemonHostRef ?? environment.daemonEndpoint}`)
  if (!assignment.workspaceRef.startsWith(expectedProjectPrefix))
    throw new Error(`live E2E requires owner-scoped Project workdir under ${expectedProjectPrefix}, got ${assignment.workspaceRef}`)
  const soul = snapshot.soulReleases.find(item => `${item.id}@${item.version}` === assignment.soulReleaseRef || item.id === assignment.soulReleaseRef)
  if (!soul)
    throw new Error(`assignment ${config.assignmentId} references missing Soul release ${assignment.soulReleaseRef}`)
  const descriptorPath = soul.descriptorRef ? resolve(soul.descriptorRef) : join(process.cwd(), 'souls', soul.id, 'dist', 'soul.descriptor.json')
  if (!existsSync(descriptorPath))
    throw new Error(`live E2E requires a real built Soul descriptor at ${descriptorPath}`)
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as { protocol?: unknown, schemaVersion?: unknown }
  if (descriptor.protocol !== 'soul/v1' && descriptor.schemaVersion !== 'soul/v1')
    throw new Error(`live E2E requires a soul/v1 descriptor at ${descriptorPath}`)
  return { assignment, snapshot }
}

function hasAppliedReceipt(snapshot: ControlPlaneSnapshot, assignment: WorkspaceAssignment): boolean {
  return snapshot.receipts.some(receipt =>
    receipt.status === 'applied'
    && receipt.environmentId === assignment.environmentId
    && receipt.providerProfileId === assignment.providerProfileId
    && receipt.soulReleaseRef === assignment.soulReleaseRef
    && receipt.workspaceRef === assignment.workspaceRef,
  )
}

export function assertApplyCompleted(payload: ApplyJobPayload): void {
  if (payload.job?.status !== 'completed')
    throw new Error(`apply failed with remediation ${payload.job?.remediation?.code ?? payload.remediation?.code ?? payload.error ?? 'unknown'}`)
  const notDone = payload.job.steps?.filter(step => step.status !== 'done' && !(step.id === 'provider' && step.status === 'needs_attention')) ?? []
  if (notDone.length)
    throw new Error(`apply completed with unresolved steps: ${notDone.map(step => `${step.id}:${step.status}`).join(', ')}`)
}

function assertPairCompleted(payload: PairJobPayload, assignmentId: string): void {
  if (payload.pair?.status !== 'paired' || payload.pair.assignmentId !== assignmentId)
    throw new Error(`pair failed with remediation ${payload.remediation?.code ?? payload.error ?? 'unknown'}`)
  if (!payload.pair.pairingOutput?.trim())
    throw new Error('pair completed without a transient pairing output')
}

async function assertPaseoRunCwdSmoke(snapshot: ControlPlaneSnapshot, assignment: WorkspaceAssignment): Promise<void> {
  const environment = snapshot.environments.find(item => item.environmentId === assignment.environmentId)
  if (!environment)
    throw new Error(`project smoke requires environment ${assignment.environmentId}`)
  const provider = snapshot.providerProfiles.find(item => item.id === assignment.providerProfileId)
  if (!provider)
    throw new Error(`project smoke requires provider profile ${assignment.providerProfileId}`)
  const serverRef = environment.targetRef.startsWith('aissh:') ? environment.targetRef.slice('aissh:'.length) : environment.targetRef
  const workspaceRef = assignment.workspaceRef.replace(/^\$HOME\//, '')
  const hostRef = environment.daemonHostRef ?? environment.daemonEndpoint
  const hostAssignment = hostRef.startsWith('$HOME/')
    ? `AIWORKER_PASEO_HOST="$AIWORKER_REMOTE_HOME/${hostRef.replace(/^\$HOME\//, '').replace(/"/g, '\\"')}"`
    : `AIWORKER_PASEO_HOST=${shellQuote(hostRef)}`
  const paseoProvider = provider.paseoProviderId ?? provider.provider
  const script = [
    'set -euo pipefail',
    'AIWORKER_REMOTE_HOME="$(cd "$HOME" && pwd -P)"',
    `AIWORKER_WORKSPACE_REF="$AIWORKER_REMOTE_HOME/${workspaceRef.replace(/"/g, '\\"')}"`,
    hostAssignment,
    'test -d "$AIWORKER_WORKSPACE_REF"',
    'case "$AIWORKER_PASEO_HOST" in /*) test -S "$AIWORKER_PASEO_HOST" || { printf \'%s\\n\' "AIWORKER_PROJECT_SMOKE_SOCKET_MISSING: $AIWORKER_PASEO_HOST" >&2; exit 68; } ;; esac',
    `AIWORKER_PASEO_RUN_JSON="$(paseo run --host "$AIWORKER_PASEO_HOST" --cwd "$AIWORKER_WORKSPACE_REF" --provider ${shellQuote(paseoProvider)} --wait-timeout 30s --json --title "AIWorker live E2E project smoke" "Respond exactly AIWORKER_PROJECT_SMOKE_OK and do not modify files.")"`,
    'AIWORKER_PASEO_RUN_JSON="$AIWORKER_PASEO_RUN_JSON" AIWORKER_WORKSPACE_REF="$AIWORKER_WORKSPACE_REF" AIWORKER_PASEO_HOST="$AIWORKER_PASEO_HOST" node -e \'const payload = JSON.parse(process.env.AIWORKER_PASEO_RUN_JSON || "{}"); const cwd = payload.cwd ?? payload.Cwd; if (cwd !== process.env.AIWORKER_WORKSPACE_REF) { console.error("paseo run --host --cwd returned cwd=" + String(cwd)); process.exit(67); } console.log("AIWORKER_PROJECT_SMOKE_OK: paseo run --host " + process.env.AIWORKER_PASEO_HOST + " --cwd accepted " + cwd + " status=" + String(payload.status ?? payload.Status ?? "unknown"));\'',
  ].join(' && ')
  const proc = Bun.spawn(['aissh', 'exec', serverRef, script, '--reason=AIWorker Web live E2E project smoke'], {
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0)
    throw new Error(`paseo run --host --cwd project smoke failed with exit ${exitCode}`)
  if (!stdout.includes('AIWORKER_PROJECT_SMOKE_OK') && stderr.includes('AIWORKER_PROJECT_SMOKE_OK'))
    return
  if (!stdout.includes('AIWORKER_PROJECT_SMOKE_OK'))
    throw new Error('paseo run --host --cwd project smoke did not report success')
}

function assignedUserSlug(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function startWebServer(): Promise<{ baseUrl: string, process: Bun.Subprocess }> {
  const port = await freePort()
  const proc = Bun.spawn(['bun', 'run', '--filter', '@zonease/aiworker-web', 'start'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
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
  const deadline = Date.now() + 10_000
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

async function getJson<T>(url: string, adminToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${adminToken}` },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(`GET ${url} failed with ${response.status}: ${JSON.stringify(payload)}`)
  return payload as T
}

async function postJson<T = unknown>(url: string, adminToken: string, body: unknown): Promise<T> {
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

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value)
    throw new Error(`${name} is required when AIWORKER_WEB_LIVE_E2E=1`)
  return value
}

function requireDedicatedTarget(env: NodeJS.ProcessEnv): void {
  if (env.AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET !== '1') {
    throw new Error('AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET=1 is required before live E2E can mutate a real target')
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    ;(server as unknown as { once: (event: 'error', listener: (error: Error) => void) => void }).once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('could not allocate a TCP port for aiworker-web live E2E'))
        return
      }
      server.close(() => resolvePort(address.port))
    })
  })
}

if (import.meta.main) {
  try {
    await runLiveE2e(liveE2eConfigFromEnv())
  }
  catch (error) {
    console.error(`FAIL aiworker-web live E2E: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
