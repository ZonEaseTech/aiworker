import type { LocalExecutor, LocalWorkerRuntimeOptions } from '@zonease/aiworker-worker-runtime'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import {
  appendSessionEvent,
  bridgeEvents,
  closeWorkerDb,
  createEngineInvocation,
  createSession,
  createWorkspace,
  engineInvocations,
  getSession,
  getWorkerDb,
  initWorkerDb,
  listEngineInvocations,
  listSessionEvents,
  listSettings,
  runWorkerMigrations,
  upsertFile,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp, localApiExposureWarning } from './worker'

const FREEFORM_APP_ID = 'aiworker-freeform'

const freeformDescriptor = parseSoulDescriptorV1({
  engine: {
    mcp: {
      targets: {
        codex: { file: 'dist/engine-assets/mcp/codex/config.toml' },
      },
    },
    skills: { source: 'dist/engine-assets/skills' },
    workspaceAssets: { source: 'dist/engine-assets/workspace' },
  },
  identity: {
    description: 'Open-ended Soul for freeform local work.',
    id: FREEFORM_APP_ID,
    name: 'AIWorker Freeform',
  },
  protocol: 'soul/v1',
})

// Parse a text/event-stream body into frames, tolerant of field order and
// multi-line data. Each frame is separated by a blank line.
function parseSseFrames(body: string): Array<{ data: string, event?: string, id?: string }> {
  return body
    .split('\n\n')
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .map((block) => {
      const dataLines: string[] = []
      const frame: { data: string, event?: string, id?: string } = { data: '' }
      for (const line of block.split('\n')) {
        const idx = line.indexOf(':')
        if (idx < 0)
          continue
        const field = line.slice(0, idx)
        const value = line.slice(idx + 1).replace(/^ /, '')
        if (field === 'data')
          dataLines.push(value)
        else if (field === 'event')
          frame.event = value
        else if (field === 'id')
          frame.id = value
      }
      frame.data = dataLines.join('\n')
      return frame
    })
}

describe('local daemon API', () => {
  let dir: string
  let originalPath: string | undefined

  beforeEach(() => {
    closeWorkerDb()
    originalPath = process.env.PATH
    dir = mkdtempSync(join(tmpdir(), 'aiworker-workspace-api-'))
  })

  afterEach(async () => {
    closeWorkerDb()
    if (originalPath == null)
      delete process.env.PATH
    else
      process.env.PATH = originalPath
    await rm(dir, { recursive: true, force: true })
  })

  async function app(
    token?: string,
    webStaticDir?: string,
    officialAppsRoot?: string,
    engineBridge?: LocalWorkerRuntimeOptions['engineBridge'],
  ) {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
      engineBridge,
      executor: {
        async invoke(input) {
          input.onEvent?.({ kind: 'status', label: 'test-started', detail: input.engineId })
          input.onEvent?.({ id: 'tool-1', input: { command: 'test engine' }, kind: 'tool_use', name: 'Bash' })
          input.onEvent?.({ id: 'tool-1', content: 'ok', kind: 'tool_result', name: 'Bash' })
          input.onEvent?.({ kind: 'text', text: 'done' })
          return {
            artifacts: [{ content: `# ${input.prompt}\n`, path: `artifacts/${input.sessionId}/result.md`, title: 'Result' }],
            summary: 'done',
          }
        },
      },
      officialAppsRoot,
      runtimeVersion: 'test',
      token,
      webStaticDir,
      workersRoot: join(dir, 'workers'),
    })
    return boot.app
  }

  async function createFreeformWorker(target: Awaited<ReturnType<typeof app>>, id = 'freeform-worker') {
    const res = await target.request('/api/workers', {
      body: JSON.stringify({ id, name: 'Freeform', appId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(res.status).toBe(201)
    return (await res.json() as { worker: { id: string, appId: string } }).worker
  }

  async function createWorkspaceLocator(
    target: Awaited<ReturnType<typeof app>>,
    workerId: string,
    input: { name?: string, type?: string } = {},
  ) {
    const workspaceRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        name: input.name ?? 'Open Workspace',
        type: input.type ?? 'workspace',
        workerId,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    return (await workspaceRes.json() as { workspace: { id: string, rootPath: string, workerId: string } }).workspace
  }

  async function createWorkspaceAndSession(target: Awaited<ReturnType<typeof app>>, workerId: string) {
    const workspace = await createWorkspaceLocator(target, workerId)

    const sessionRes = await target.request('/api/sessions', {
      body: JSON.stringify({
        title: 'Freeform session',
        workerId,
        workspaceId: workspace.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(sessionRes.status).toBe(201)
    const session = (await sessionRes.json() as { session: { id: string, status: string, workspaceId: string } }).session
    return { session, workspace }
  }

  function writePackagedFreeform(root: string): void {
    const distRoot = join(root, FREEFORM_APP_ID, 'dist')
    mkdirSync(join(distRoot, 'engine-assets', 'workspace'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'skills', 'freeform-session'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'mcp', 'codex'), { recursive: true })
    writeFileSync(join(distRoot, 'soul.descriptor.json'), `${JSON.stringify(freeformDescriptor, null, 2)}\n`)
    writeFileSync(join(distRoot, 'engine-assets', 'workspace', 'AGENTS.md'), '# Packaged Freeform Workspace\n')
    writeFileSync(join(distRoot, 'engine-assets', 'skills', 'freeform-session', 'SKILL.md'), '# Packaged Freeform Session\n')
    writeFileSync(join(distRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex mcp\n')
  }

  function seedLegacyHrMetadata() {
    const seedNow = '2026-05-13T13:04:00.000Z'
    closeWorkerDb()
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    upsertWorker({
      at: seedNow,
      defaultEngineId: 'codex',
      id: 'legacy-hr-worker',
      name: 'Legacy HR',
      appId: 'hr',
    })
    createWorkspace({
      at: seedNow,
      id: 'legacy-hr-workspace',
      name: 'Legacy HR workspace',
      rootPath: join(dir, 'workers', 'legacy-hr-worker', 'workspaces', 'legacy-hr-workspace'),
      workerId: 'legacy-hr-worker',
    })
    createSession({
      at: seedNow,
      id: 'legacy-hr-session',
      metadataJson: { soulName: 'HR' },
      title: 'Legacy candidate screen',
      workerId: 'legacy-hr-worker',
      workspaceId: 'legacy-hr-workspace',
    })
    closeWorkerDb()
  }

  function writeFakeEngineCommand(command: string): string {
    const binDir = join(dir, 'bin')
    mkdirSync(binDir, { recursive: true })
    const commandPath = join(binDir, command)
    writeFileSync(commandPath, [
      '#!/usr/bin/env bash',
      'if [ "$1" = "--version" ]; then',
      `  echo "${command} test 1.0"`,
      '  exit 0',
      'fi',
      'cat >/dev/null',
      'printf \'%s\\n\' \'{"type":"assistant","message":{"id":"msg-1","content":[{"type":"text","text":"Done."}]}}\'',
      '',
    ].join('\n'))
    chmodSync(commandPath, 0o755)
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
    return commandPath
  }

  it('bootstraps official Freeform and rejects legacy built-in Soul ids', async () => {
    const target = await app()

    const appsBody = await (await target.request('/api/app-installation/apps')).json() as {
      apps: Array<{ appId: string, projectedSoul: { id: string, status: string }, status: string }>
    }
    expect(appsBody.apps).toEqual([expect.objectContaining({ appId: FREEFORM_APP_ID, status: 'enabled' })])
    expect(appsBody.apps[0]!.projectedSoul).toMatchObject({ id: FREEFORM_APP_ID, status: 'available' })
    expect((await target.request('/api/local/apps')).status).toBe(404)
    expect((await target.request('/api/local/souls')).status).toBe(404)

    expect((await target.request('/api/local/workers')).status).toBe(404)
    const legacyCollectionWriteRes = await target.request('/api/local/workers', {
      body: JSON.stringify({ id: 'legacy-collection-worker', name: 'Legacy Collection', appId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(legacyCollectionWriteRes.status).toBe(404)

    const legacyRes = await target.request('/api/workers', {
      body: JSON.stringify({ id: 'legacy-hr-worker', name: 'Legacy HR', appId: 'hr' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(legacyRes.status).toBe(400)
    expect(await legacyRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })

    const worker = await createFreeformWorker(target, 'official-freeform-worker')
    expect(worker.appId).toBe(FREEFORM_APP_ID)
    expect((await target.request(`/api/local/workers/${worker.id}`)).status).toBe(404)
    const legacyMemberWriteRes = await target.request(`/api/local/workers/${worker.id}`, {
      body: JSON.stringify({ name: 'Legacy Member' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(legacyMemberWriteRes.status).toBe(404)
  })

  it('does not expose a capability listing route', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'capability-route-worker')

    expect((await target.request('/api/capabilities')).status).toBe(404)
    expect((await target.request(`/api/capabilities?workerId=${worker.id}`)).status).toBe(404)
    expect((await target.request('/api/local/capabilities')).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/capabilities`)).status).toBe(404)
  })

  it('bootstraps official descriptors from an explicit packaged app root', async () => {
    const officialAppsRoot = join(dir, 'official-apps')
    writePackagedFreeform(officialAppsRoot)

    const target = await app(undefined, undefined, officialAppsRoot)
    const body = await (await target.request('/api/app-installation/apps')).json() as {
      apps: Array<{ appId: string, sourceKind: string, sourceRef: string, status: string }>
    }

    expect(body.apps).toEqual([expect.objectContaining({
      appId: FREEFORM_APP_ID,
      sourceKind: 'descriptor-path',
      status: 'enabled',
    })])
    expect(body.apps[0]!.sourceRef).toStartWith(officialAppsRoot)
  })

  it('does not re-enable disabled official apps on daemon restart', async () => {
    const target = await app()
    const disableAliasRes = await target.request(`/api/local/apps/${FREEFORM_APP_ID}/disable`, { method: 'POST' })
    expect(disableAliasRes.status).toBe(404)

    const archiveRes = await target.request(`/api/app-installation/apps/${FREEFORM_APP_ID}/archive`, { method: 'POST' })
    expect(archiveRes.status).toBe(200)

    const restarted = await app()
    const workerRes = await restarted.request('/api/workers', {
      body: JSON.stringify({ id: 'disabled-freeform-worker', name: 'Disabled Freeform', appId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerRes.status).toBe(400)
    expect(await workerRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })
  })

  it('discards legacy HR worker metadata during daemon bootstrap', async () => {
    seedLegacyHrMetadata()

    const target = await app()
    const workersBody = await (await target.request('/api/workers')).json() as { workers: Array<{ id: string }> }
    expect(workersBody.workers.some(worker => worker.id === 'legacy-hr-worker')).toBe(false)

    const worker = await createFreeformWorker(target, 'freeform-after-discard')
    expect(worker.appId).toBe(FREEFORM_APP_ID)
  })

  it('serves the workspace/session loop and session-level follow-up invocations', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)

    expect(session).toMatchObject({ status: 'active', workspaceId: workspace.id })
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('AIWorker Freeform Workspace')
    await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8')).resolves.toContain('AIWorker Freeform Session')

    const followUpRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue the Freeform session.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(followUpRes.status).toBe(201)
    const followUpBody = await followUpRes.json() as {
      events: unknown[]
      invocation: { processState: string, sessionId: string, status: string }
      session: { status: string }
    }
    expect(followUpBody.invocation).toMatchObject({
      sessionId: session.id,
      status: 'succeeded',
    })
    expect(followUpBody.invocation.processState).toBe('exited')
    expect(followUpBody.session.status).toBe('active')
    expect(followUpBody.events.length).toBeGreaterThan(0)

    const brokerRes = await target.request('/api/engine/invocations', {
      body: JSON.stringify({ input: 'Continue through the broker.', sessionId: session.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(brokerRes.status).toBe(201)
    const brokerBody = await brokerRes.json() as { invocation: { sessionId: string, status: string } }
    expect(brokerBody.invocation).toMatchObject({
      sessionId: session.id,
      status: 'succeeded',
    })

    const sessionRes = await target.request(`/api/sessions/${session.id}`)
    expect(sessionRes.status).toBe(200)
    const sessionBody = await sessionRes.json() as {
      invocations: Array<{ sessionId: string, status: string }>
      session: { id: string, status: string }
    }
    expect(sessionBody.session).toMatchObject({ id: session.id, status: 'active' })
    expect(sessionBody.invocations.map(invocation => invocation.sessionId)).toEqual([session.id, session.id])
    expect(sessionBody.invocations.map(invocation => invocation.status)).toEqual(['succeeded', 'succeeded'])

    expect((await target.request(`/api/local/sessions/${session.id}`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/sessions/${session.id}`)).status).toBe(404)
    expect('turns' in sessionBody).toBe(false)
  })

  it('surfaces missing projection receipt failures through the session invocation API', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'missing-receipt-invocation-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    await rm(join(workspace.rootPath, '.aiworker', 'projections.json'), { force: true })

    const followUpRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue without a projection receipt.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(followUpRes.status).toBe(201)
    const body = await followUpRes.json() as {
      events: Array<{ payloadJson: Record<string, unknown>, type: string }>
      invocation: { failureCode: string, processState: string, sessionId: string, status: string }
      session: { id: string, status: string }
    }
    expect(body.invocation).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_MISSING',
      processState: 'not_spawned',
      sessionId: session.id,
      status: 'failed',
    })
    expect(body.session).toMatchObject({ id: session.id, status: 'active' })
    expect(body.events.at(-1)).toMatchObject({
      payloadJson: {
        failureCode: 'PROJECTION_RECEIPT_MISSING',
        invocationId: expect.any(String),
      },
      type: 'error',
    })
  })

  it('surfaces stale projection receipt failures through the session invocation API', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'stale-receipt-invocation-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    const receiptPath = join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    await writeFile(receiptPath, `${JSON.stringify({ ...receipt, receiptId: 'stale-receipt' }, null, 2)}\n`)

    const followUpRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue with a stale projection receipt.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(followUpRes.status).toBe(201)
    const body = await followUpRes.json() as {
      events: Array<{ payloadJson: Record<string, unknown>, type: string }>
      invocation: { failureCode: string, processState: string, sessionId: string, status: string }
      session: { id: string, status: string }
    }
    expect(body.invocation).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_STALE',
      processState: 'not_spawned',
      sessionId: session.id,
      status: 'failed',
    })
    expect(body.session).toMatchObject({ id: session.id, status: 'active' })
    expect(body.events.at(-1)).toMatchObject({
      payloadJson: {
        failureCode: 'PROJECTION_RECEIPT_STALE',
        invocationId: expect.any(String),
      },
      type: 'error',
    })
  })

  it('surfaces missing projection receipt failures through the low-level engine invocation API', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'missing-receipt-engine-invocation-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    await rm(join(workspace.rootPath, '.aiworker', 'projections.json'), { force: true })

    const engineInvocationRes = await target.request('/api/engine/invocations', {
      body: JSON.stringify({
        input: 'Continue through low-level broker without a projection receipt.',
        sessionId: session.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(engineInvocationRes.status).toBe(201)
    const body = await engineInvocationRes.json() as {
      events: Array<{ payloadJson: Record<string, unknown>, type: string }>
      invocation: { failureCode: string, processState: string, sessionId: string, status: string }
      session: { id: string, status: string }
    }
    expect(body.invocation).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_MISSING',
      processState: 'not_spawned',
      sessionId: session.id,
      status: 'failed',
    })
    expect(body.session).toMatchObject({ id: session.id, status: 'active' })
    expect(body.events.at(-1)).toMatchObject({
      payloadJson: {
        failureCode: 'PROJECTION_RECEIPT_MISSING',
        invocationId: expect.any(String),
      },
      type: 'error',
    })
  })

  it('surfaces stale projection receipt failures through the low-level engine invocation API', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'stale-receipt-engine-invocation-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    const receiptPath = join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    await writeFile(receiptPath, `${JSON.stringify({ ...receipt, receiptId: 'stale-receipt' }, null, 2)}\n`)

    const engineInvocationRes = await target.request('/api/engine/invocations', {
      body: JSON.stringify({
        input: 'Continue through low-level broker with a stale projection receipt.',
        sessionId: session.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(engineInvocationRes.status).toBe(201)
    const body = await engineInvocationRes.json() as {
      events: Array<{ payloadJson: Record<string, unknown>, type: string }>
      invocation: { failureCode: string, processState: string, sessionId: string, status: string }
      session: { id: string, status: string }
    }
    expect(body.invocation).toMatchObject({
      failureCode: 'PROJECTION_RECEIPT_STALE',
      processState: 'not_spawned',
      sessionId: session.id,
      status: 'failed',
    })
    expect(body.session).toMatchObject({ id: session.id, status: 'active' })
    expect(body.events.at(-1)).toMatchObject({
      payloadJson: {
        failureCode: 'PROJECTION_RECEIPT_STALE',
        invocationId: expect.any(String),
      },
      type: 'error',
    })
  })

  it('records missing native resume refs through the session invocation broker route', async () => {
    const callOrder: string[] = []
    const target = await app(undefined, undefined, undefined, {
      adapters: [{
        target: 'codex',
        async cancel() {
          return {}
        },
        async discover() {
          callOrder.push('adapter.discover')
          return { callable: true, installed: true, supportsNativeResume: true, target: 'codex' }
        },
        async followUp() {
          callOrder.push('adapter.followUp')
          throw new Error('broker follow-up should not run without an external session ref')
        },
        normalize() {
          return []
        },
        async start() {
          callOrder.push('adapter.start')
          throw new Error('broker follow-up should not start a fresh native session')
        },
      }],
      projectionReceipts: {
        async assertUsable() {
          callOrder.push('projection.assert')
        },
      },
    })
    const worker = await createFreeformWorker(target, 'freeform-missing-native-ref-worker')
    const { session } = await createWorkspaceAndSession(target, worker.id)
    createEngineInvocation({
      engineCommand: null,
      engineId: 'codex',
      id: 'daemon-previous-missing-native-ref-invocation',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-previous-missing-native-ref-invocation/input`,
      processState: 'exited',
      seq: 1,
      sessionId: session.id,
      status: 'succeeded',
    })

    const followUpRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue through missing native resume ref.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(followUpRes.status).toBe(201)
    const followUpBody = await followUpRes.json() as {
      events: Array<{ invocationId: string, payloadJson: Record<string, unknown>, type: string }>
      invocation: {
        eventLogRef: string | null
        failureCode: string | null
        id: string
        inputRef: string
        processState: string
        sessionId: string
        status: string
      }
      session: { id: string, status: string }
      turn?: unknown
    }
    expect(callOrder).toEqual(['projection.assert', 'adapter.discover'])
    expect(followUpBody.turn).toBeUndefined()
    expect(followUpBody.session).toMatchObject({ id: session.id, status: 'active' })
    expect(followUpBody.invocation).toMatchObject({
      eventLogRef: `aiworker://sessions/${session.id}/invocations/${followUpBody.invocation.id}/events`,
      failureCode: 'ENGINE_SESSION_REF_MISSING',
      inputRef: `aiworker://sessions/${session.id}/invocations/${followUpBody.invocation.id}/input`,
      processState: 'not_spawned',
      sessionId: session.id,
      status: 'failed',
    })
    expect(followUpBody.events.at(-1)).toMatchObject({
      invocationId: followUpBody.invocation.id,
      payloadJson: {
        failureCode: 'ENGINE_SESSION_REF_MISSING',
        invocationId: followUpBody.invocation.id,
      },
      type: 'error',
    })
  })

  it('continues native resume refs through the session invocation broker route', async () => {
    const callOrder: string[] = []
    const target = await app(undefined, undefined, undefined, {
      adapters: [{
        target: 'codex',
        async cancel() {
          return {}
        },
        async discover() {
          callOrder.push('adapter.discover')
          return { callable: true, installed: true, supportsNativeResume: true, target: 'codex' }
        },
        async followUp(request: { externalSessionRef?: unknown, invocationId?: unknown }) {
          callOrder.push('adapter.followUp')
          expect(request.externalSessionRef).toEqual({ id: 'native-thread-1', target: 'codex' })
          return {
            externalSessionRef: { id: 'native-thread-2', target: 'codex' },
            metadata: { executionSource: 'engine-bridge' },
            processHandle: { invocationId: request.invocationId, pid: 4202 },
            summary: 'Daemon bridge follow-up summary.',
          }
        },
        normalize() {
          return []
        },
        async start() {
          callOrder.push('adapter.start')
          throw new Error('broker follow-up should not start a fresh native session')
        },
      }],
      projectionReceipts: {
        async assertUsable() {
          callOrder.push('projection.assert')
        },
      },
    })
    const worker = await createFreeformWorker(target, 'freeform-native-resume-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    createEngineInvocation({
      engineCommand: null,
      engineId: 'codex',
      externalSessionRef: JSON.stringify({ id: 'native-thread-1', target: 'codex' }),
      id: 'daemon-previous-native-resume-invocation',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-previous-native-resume-invocation/input`,
      metadataJson: {
        externalSessionRef: { id: 'native-thread-1', target: 'codex' },
      },
      processState: 'exited',
      seq: 1,
      sessionId: session.id,
      status: 'succeeded',
    })

    const followUpRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue through native resume ref.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(followUpRes.status).toBe(201)
    const followUpBody = await followUpRes.json() as {
      invocation: {
        externalSessionRef: string | null
        id: string
        metadataJson: Record<string, unknown>
        processState: string
        projectionReceiptId: string | null
        sessionId: string
        status: string
        summary: string | null
      }
      session: { id: string, status: string }
      turn?: unknown
    }
    expect(callOrder).toEqual(['projection.assert', 'adapter.discover', 'adapter.followUp'])
    expect(followUpBody.turn).toBeUndefined()
    expect(followUpBody.session).toMatchObject({ id: session.id, status: 'active' })
    expect(followUpBody.invocation).toMatchObject({
      externalSessionRef: expect.stringContaining('native-thread-2'),
      processState: 'exited',
      projectionReceiptId: workspace.id,
      sessionId: session.id,
      status: 'succeeded',
      summary: 'Daemon bridge follow-up summary.',
    })
    expect(followUpBody.invocation.metadataJson).toMatchObject({
      externalSessionRef: { id: 'native-thread-2', target: 'codex' },
      processHandle: { invocationId: followUpBody.invocation.id, pid: 4202 },
    })
  })

  it('creates session input as the first session-level invocation without transient turns', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'freeform-first-invocation')
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'First Invocation Workspace' })

    const sessionRes = await target.request('/api/sessions', {
      body: JSON.stringify({
        input: 'Start through the daemon session create route.',
        title: 'First invocation session',
        workerId: worker.id,
        workspaceId: workspace.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(sessionRes.status).toBe(201)
    const body = await sessionRes.json() as {
      invocation?: { id: string, inputRef: string, sessionId: string, status: string }
      session: { id: string, status: string, workspaceId: string }
      turn?: unknown
    }

    expect(body.session).toMatchObject({ status: 'active', workspaceId: workspace.id })
    expect(body.turn).toBeUndefined()
    expect(body.invocation).toMatchObject({ sessionId: body.session.id, status: 'succeeded' })
    expect(body.invocation?.inputRef).toBe(`aiworker://sessions/${body.session.id}/invocations/${body.invocation!.id}/input`)

    expect((await target.request(`/api/local/sessions/${body.session.id}`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/sessions/${body.session.id}`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions`)).status).toBe(404)
    expect((await target.request(`/api/local/workspaces/${workspace.id}/sessions`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        title: 'Legacy nested session create',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })).status).toBe(404)
    expect((await target.request(`/api/local/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        title: 'Legacy workspace session create',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })).status).toBe(404)
    const canonicalSessionRes = await target.request(`/api/sessions/${body.session.id}`)
    expect(canonicalSessionRes.status).toBe(200)
    const canonicalSessionBody = await canonicalSessionRes.json() as {
      invocations: Array<{ id: string, inputRef: string }>
    }
    expect('turns' in canonicalSessionBody).toBe(false)
    expect(canonicalSessionBody.invocations.map(invocation => invocation.id)).toEqual([body.invocation!.id])
    expect(canonicalSessionBody.invocations[0]?.inputRef).not.toContain('/turns/')

    const siblingWorkspace = await createWorkspaceLocator(target, worker.id, { name: 'Sibling Session Workspace' })
    const siblingSessionRes = await target.request('/api/sessions', {
      body: JSON.stringify({
        title: 'Sibling session',
        workerId: worker.id,
        workspaceId: siblingWorkspace.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(siblingSessionRes.status).toBe(201)

    const scopedSessionsRes = await target.request(`/api/sessions?workerId=${worker.id}&workspaceId=${workspace.id}`)
    expect(scopedSessionsRes.status).toBe(200)
    const scopedSessions = await scopedSessionsRes.json() as { sessions: Array<{ id: string, workspaceId: string }> }
    expect(scopedSessions.sessions.map(session => session.id)).toEqual([body.session.id])
    expect(scopedSessions.sessions.map(session => session.workspaceId)).toEqual([workspace.id])
  })

  it('rejects Host-owned free-form session notes in write bodies', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'freeform-context-reject-worker')
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Context Reject Workspace' })

    const rejectedCreateRes = await target.request('/api/sessions', {
      body: JSON.stringify({
        context: 'Host must not store this free-form session note.',
        title: 'Rejected context session',
        workerId: worker.id,
        workspaceId: workspace.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(rejectedCreateRes.status).toBe(400)
    expect(await rejectedCreateRes.json()).toMatchObject({ error: { code: 'CREATE_SESSION_INVALID' } })

    const { session } = await createWorkspaceAndSession(target, worker.id)
    const rejectedPatchRes = await target.request(`/api/sessions/${session.id}`, {
      body: JSON.stringify({
        context: 'Host must not patch free-form session note.',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(rejectedPatchRes.status).toBe(400)
    expect(await rejectedPatchRes.json()).toMatchObject({ error: { code: 'PATCH_SESSION_INVALID' } })
  })

  it('POST /api/workers rejects a second active worker with 409', async () => {
    const target = await app()
    await createFreeformWorker(target, 'first-active-worker')
    const res = await target.request('/api/workers', {
      body: JSON.stringify({ id: 'second-active-worker', name: 'Second', appId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'WORKER_ALREADY_ACTIVE' } })
  })

  it('bootstrap fails fast when the DB holds more than one active worker', async () => {
    const noopExecutor: LocalExecutor = {
      async invoke(input) {
        input.onEvent?.({ kind: 'text', text: 'done' })
        return { artifacts: [], summary: 'done' }
      },
    }
    const bootOptions = {
      dbPath: join(dir, 'worker.db'),
      executor: noopExecutor,
      runtimeVersion: 'test',
      workersRoot: join(dir, 'workers'),
    }
    await bootstrapWorkerApp(bootOptions)
    upsertWorker({ id: 'dirty-a', appId: FREEFORM_APP_ID, name: 'A', status: 'active' })
    upsertWorker({ id: 'dirty-b', appId: FREEFORM_APP_ID, name: 'B', status: 'active' })
    closeWorkerDb()
    await expect(bootstrapWorkerApp(bootOptions)).rejects.toThrow(/more than one active worker/i)
  })

  it('POST /api/workspace-locators rejects a ghost workerId that is not the active worker', async () => {
    const target = await app()
    await createFreeformWorker(target, 'real-worker')
    const res = await target.request('/api/workspace-locators', {
      // name 必填:省略会先撞 schema 校验,测不到 workerId 路径(实测钉死为 404 NOT_FOUND)。
      body: JSON.stringify({ name: 'Ghost Workspace', workerId: 'ghost-worker', rootPath: mkdtempSync(join(dir, 'ghost-')) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('POST /api/workspace-locators rejects an archived (existing, non-active) workerId', async () => {
    const target = await app()
    await createFreeformWorker(target, 'real-worker')
    upsertWorker({ id: 'archived-sibling', appId: FREEFORM_APP_ID, name: 'Archived', status: 'archived' })
    const res = await target.request('/api/workspace-locators', {
      body: JSON.stringify({ name: 'Archived Workspace', workerId: 'archived-sibling', rootPath: mkdtempSync(join(dir, 'arch-')) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    // present 但非 active(archived)→ 被拒(client error)。机制无关(WORKER_ARCHIVED),
    // 锁定的不变量是"非-active present workerId 必被拒",不锁具体码。
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it('derives workspace root under the Worker home and ignores any client-supplied rootPath', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'requested-root-worker')
    // daemon-per-worker:一 daemon 至多一 active worker(C2)。sibling 作 archived 元数据
    // 直插存在(绕过 C2 路由守卫),仅用于证明 scoped 列举按 workerId 隔离——其 workspace
    // 不出现在 active worker 的 scoped 列表。
    upsertWorker({ id: 'sibling-root-worker', appId: FREEFORM_APP_ID, name: 'Sibling', status: 'archived' })
    // workspace 根派生在 Worker home 下(<worker-home>/workspaces/<workspaceId>),
    // 非客户端选择。即使 body 带 rootPath(Zod 非 strict 会剥离未知字段),
    // 持久化的根必须是派生根,而不是这个请求的路径。
    const requestedRootPath = join(dir, 'requested-workspace-root')
    const workspacesRoot = join(dir, 'workers', worker.id, 'workspaces')

    const createRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        name: 'Requested Root Workspace',
        rootPath: requestedRootPath,
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(createRes.status).toBe(201)
    const body = await createRes.json() as { workspace: { id: string, rootPath: string } }
    const derivedRootPath = join(workspacesRoot, body.workspace.id)
    expect(body.workspace.rootPath).toBe(derivedRootPath)
    expect(body.workspace.rootPath).not.toBe(requestedRootPath)

    const getRes = await target.request(`/api/workspace-locators/${body.workspace.id}`)
    expect(getRes.status).toBe(200)
    const fetched = await getRes.json() as { workspace: { rootPath: string } }
    expect(fetched.workspace.rootPath).toBe(derivedRootPath)
    expect((await target.request('/api/local/workspaces')).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/workspaces`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Legacy Collection Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })).status).toBe(404)
    expect((await target.request(`/api/local/workspaces/${body.workspace.id}`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/workspaces/${body.workspace.id}`)).status).toBe(404)
    expect((await target.request(`/api/local/workspaces/${body.workspace.id}`, {
      body: JSON.stringify({ name: 'Legacy Direct Workspace Patch' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/workspaces/${body.workspace.id}`, {
      body: JSON.stringify({ name: 'Legacy Worker Workspace Patch' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })).status).toBe(404)

    const defaultRootCreateRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        name: 'Default Root Workspace',
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(defaultRootCreateRes.status).toBe(201)
    const defaultRootBody = await defaultRootCreateRes.json() as { workspace: { id: string, workerId: string } }
    expect(defaultRootBody.workspace.workerId).toBe(worker.id)

    // archived worker 不能经路由建 workspace(WORKER_ARCHIVED)。直插一行属 sibling 的
    // workspace,验证它被 active worker 的 scoped 列表排除(隔离按 workerId)。
    createWorkspace({
      id: 'sibling-workspace',
      workerId: 'sibling-root-worker',
      name: 'Sibling Workspace',
      rootPath: join(dir, 'sibling-root'),
      at: new Date().toISOString(),
    })

    const scopedListRes = await target.request(`/api/workspace-locators?workerId=${worker.id}`)
    expect(scopedListRes.status).toBe(200)
    const scopedList = await scopedListRes.json() as { workspaces: Array<{ id: string, workerId: string }> }
    expect(scopedList.workspaces.map(workspace => workspace.workerId)).toEqual([worker.id, worker.id])
    await expect(readFile(join(derivedRootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Freeform')
  })

  it('archives workspace locator metadata and blocks new workspace work', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'archive-workspace-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)

    const archiveRes = await target.request(`/api/workspace-locators/${workspace.id}/archive`, { method: 'POST' })

    expect(archiveRes.status).toBe(200)
    expect(await archiveRes.json()).toMatchObject({
      workspace: { id: workspace.id, status: 'archived' },
    })

    const blockedSessionRes = await target.request('/api/sessions', {
      body: JSON.stringify({
        input: 'Start after workspace archive.',
        title: 'Blocked archived workspace session',
        workerId: worker.id,
        workspaceId: workspace.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedSessionRes.status).toBe(400)
    expect(await blockedSessionRes.json()).toMatchObject({
      error: {
        code: 'WORKSPACE_ARCHIVED',
        message: `Workspace ${workspace.id} is archived and cannot start new work.`,
      },
    })

    const blockedProjectionRes = await target.request('/api/projections/codex/refresh', {
      body: JSON.stringify({ workerId: worker.id, workspaceId: workspace.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedProjectionRes.status).toBe(400)
    expect(await blockedProjectionRes.json()).toMatchObject({
      error: {
        code: 'WORKSPACE_ARCHIVED',
        message: `Workspace ${workspace.id} is archived and cannot start new work.`,
      },
    })

    const blockedInvocationRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue after workspace archive.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedInvocationRes.status).toBe(400)
    expect(await blockedInvocationRes.json()).toMatchObject({
      error: {
        code: 'WORKSPACE_ARCHIVED',
        message: `Workspace ${workspace.id} is archived and cannot start new work.`,
      },
    })
  })

  it('hard-deletes workspace locator metadata while preserving app-owned workspace files', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'delete-workspace-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    writeFileSync(join(workspace.rootPath, 'business.md'), '# Keep app-owned work\n')

    const deleteRes = await target.request(`/api/workspace-locators/${workspace.id}`, { method: 'DELETE' })

    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toMatchObject({
      deleted: true,
      workspace: { id: workspace.id },
    })
    expect((await target.request(`/api/workspace-locators/${workspace.id}`)).status).toBe(404)
    expect((await target.request(`/api/sessions/${session.id}`)).status).toBe(404)
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(workspace.rootPath, 'business.md'), 'utf8')).resolves.toContain('Keep app-owned work')
  })

  it('rejects workspace hard delete when its projection receipt schema is invalid', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'delete-workspace-invalid-receipt-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    const receiptPath = join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    const { freshnessMarker: _freshnessMarker, ...legacyReceipt } = receipt
    await writeFile(receiptPath, `${JSON.stringify({ ...legacyReceipt, secret: 'sk-workspace-delete-receipt' }, null, 2)}\n`)

    const deleteRes = await target.request(`/api/workspace-locators/${workspace.id}`, { method: 'DELETE' })

    expect(deleteRes.status).toBe(409)
    const bodyText = await deleteRes.text()
    expect(bodyText).toContain('PROJECTION_RECEIPT_STALE')
    expect(bodyText).not.toContain('sk-workspace-delete-receipt')
    expect((await target.request(`/api/workspace-locators/${workspace.id}`)).status).toBe(200)
    expect((await target.request(`/api/sessions/${session.id}`)).status).toBe(200)
  })

  it('archives worker metadata with archived status', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'archive-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)

    const archiveRes = await target.request(`/api/workers/${worker.id}/archive`, { method: 'POST' })

    expect(archiveRes.status).toBe(200)
    expect(await archiveRes.json()).toMatchObject({
      worker: { id: worker.id, status: 'archived' },
    })
    const getRes = await target.request(`/api/workers/${worker.id}`)
    expect(getRes.status).toBe(200)
    expect(await getRes.json()).toMatchObject({
      worker: { id: worker.id, status: 'archived' },
    })

    const blockedWorkspaceRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({ name: 'Blocked Archived Worker Workspace', type: 'workspace', workerId: worker.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedWorkspaceRes.status).toBe(400)
    expect(await blockedWorkspaceRes.json()).toMatchObject({
      error: {
        code: 'WORKER_ARCHIVED',
        message: `Worker ${worker.id} is archived and cannot start new work.`,
      },
    })

    const blockedProjectionRes = await target.request('/api/projections/codex/refresh', {
      body: JSON.stringify({ workerId: worker.id, workspaceId: workspace.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedProjectionRes.status).toBe(400)
    expect(await blockedProjectionRes.json()).toMatchObject({
      error: {
        code: 'WORKER_ARCHIVED',
        message: `Worker ${worker.id} is archived and cannot start new work.`,
      },
    })

    const blockedSessionRes = await target.request('/api/sessions', {
      body: JSON.stringify({
        input: 'Start session after worker archive.',
        title: 'Blocked archived worker session',
        workerId: worker.id,
        workspaceId: workspace.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedSessionRes.status).toBe(400)
    expect(await blockedSessionRes.json()).toMatchObject({
      error: {
        code: 'WORKER_ARCHIVED',
        message: `Worker ${worker.id} is archived and cannot start new work.`,
      },
    })

    const blockedInvocationRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue after worker archive.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedInvocationRes.status).toBe(400)
    expect(await blockedInvocationRes.json()).toMatchObject({
      error: {
        code: 'WORKER_ARCHIVED',
        message: `Worker ${worker.id} is archived and cannot start new work.`,
      },
    })
  })

  it('hard-deletes worker metadata after cleaning receipt-owned workspace projections', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'delete-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    writeFileSync(join(workspace.rootPath, 'business.md'), '# Keep worker app-owned work\n')

    const deleteRes = await target.request(`/api/workers/${worker.id}`, { method: 'DELETE' })

    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toMatchObject({
      deleted: true,
      worker: { id: worker.id },
    })
    expect((await target.request(`/api/workers/${worker.id}`)).status).toBe(404)
    expect((await target.request(`/api/workspace-locators/${workspace.id}`)).status).toBe(404)
    expect((await target.request(`/api/sessions/${session.id}`)).status).toBe(404)
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(workspace.rootPath, 'business.md'), 'utf8')).resolves.toContain('Keep worker app-owned work')
  })

  it('rejects worker hard delete when a workspace projection receipt schema is invalid', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'delete-worker-invalid-receipt')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    const receiptPath = join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    const { freshnessMarker: _freshnessMarker, ...legacyReceipt } = receipt
    await writeFile(receiptPath, `${JSON.stringify({ ...legacyReceipt, secret: 'sk-worker-delete-receipt' }, null, 2)}\n`)

    const deleteRes = await target.request(`/api/workers/${worker.id}`, { method: 'DELETE' })

    expect(deleteRes.status).toBe(409)
    const bodyText = await deleteRes.text()
    expect(bodyText).toContain('PROJECTION_RECEIPT_STALE')
    expect(bodyText).not.toContain('sk-worker-delete-receipt')
    expect((await target.request(`/api/workers/${worker.id}`)).status).toBe(200)
    expect((await target.request(`/api/workspace-locators/${workspace.id}`)).status).toBe(200)
    expect((await target.request(`/api/sessions/${session.id}`)).status).toBe(200)
  })

  it('hard-deletes session metadata without deleting workspace files', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'delete-session-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    writeFileSync(join(workspace.rootPath, 'business.md'), '# Keep session workspace file\n')

    const deleteRes = await target.request(`/api/sessions/${session.id}`, { method: 'DELETE' })

    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toMatchObject({
      deleted: true,
      session: { id: session.id },
    })
    expect((await target.request(`/api/sessions/${session.id}`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/sessions/${session.id}`)).status).toBe(404)
    await expect(readFile(join(workspace.rootPath, 'business.md'), 'utf8')).resolves.toContain('Keep session workspace file')
  })

  it('archives session metadata and blocks follow-up invocations', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'archive-session-worker')
    const { session } = await createWorkspaceAndSession(target, worker.id)

    const archiveRes = await target.request(`/api/sessions/${session.id}/archive`, { method: 'POST' })

    expect(archiveRes.status).toBe(200)
    expect(await archiveRes.json()).toMatchObject({
      session: { id: session.id, status: 'archived' },
    })

    const blockedInvocationRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue after session archive.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(blockedInvocationRes.status).toBe(400)
    expect(await blockedInvocationRes.json()).toMatchObject({
      error: {
        code: 'SESSION_ARCHIVED',
        message: `Session ${session.id} is archived and cannot start new work.`,
      },
    })
  })

  it('does not expose legacy transient turn read feeds', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)

    expect((await target.request('/api/local/turns')).status).toBe(404)
    expect((await target.request(`/api/local/sessions/${session.id}/turns`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/sessions/${session.id}/turns`)).status).toBe(404)
  })

  it('rejects legacy local turn and message follow-up writes and accepts session invocations', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)

    const turnAliasRes = await target.request(`/api/local/sessions/${session.id}/turns`, {
      body: JSON.stringify({ input: 'Continue through the legacy turn alias.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(turnAliasRes.status).toBe(404)
    expect(listEngineInvocations(session.id)).toEqual([])

    const workerMessageRes = await target.request(`/api/local/workers/${worker.id}/sessions/${session.id}/messages`, {
      body: JSON.stringify({ input: 'Continue through the legacy worker message alias.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerMessageRes.status).toBe(404)
    expect(listEngineInvocations(session.id)).toEqual([])

    const workerMessageStreamRes = await target.request(`/api/local/workers/${worker.id}/sessions/${session.id}/messages/stream`, {
      body: JSON.stringify({ input: 'Continue through the legacy worker message stream alias.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerMessageStreamRes.status).toBe(404)
    expect(listEngineInvocations(session.id)).toEqual([])

    const invocationRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue through the canonical session invocation route.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(invocationRes.status).toBe(201)
    const invocationBody = await invocationRes.json() as { invocation?: { inputRef: string, sessionId: string, status: string }, turn?: unknown }
    expect(invocationBody.turn).toBeUndefined()
    expect(invocationBody.invocation).toMatchObject({
      sessionId: session.id,
      status: 'succeeded',
    })
    expect(invocationBody.invocation?.inputRef).toContain('/invocations/')
    expect(invocationBody.invocation).toBeDefined()
    expect(listEngineInvocations(session.id).sort((left, right) => left.seq - right.seq).map(invocation => invocation.inputRef)).toEqual([
      invocationBody.invocation!.inputRef,
    ])
  })

  it('rejects legacy local turn stream writes', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)

    const streamRes = await target.request(`/api/local/sessions/${session.id}/turns/stream`, {
      body: JSON.stringify({ input: 'Continue through the legacy stream alias.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(streamRes.status).toBe(404)
    expect(listEngineInvocations(session.id)).toEqual([])
  })

  it('rejects legacy workspace session stream creation aliases', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspace = await createWorkspaceLocator(target, worker.id)

    const workerStreamRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions/stream`, {
      body: JSON.stringify({
        input: 'Start through legacy worker workspace stream alias.',
        title: 'Legacy stream session',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerStreamRes.status).toBe(404)

    const workspaceStreamRes = await target.request(`/api/local/workspaces/${workspace.id}/sessions/stream`, {
      body: JSON.stringify({
        input: 'Start through legacy workspace stream alias.',
        title: 'Legacy stream session',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceStreamRes.status).toBe(404)

    expect((await target.request('/api/local/sessions')).status).toBe(404)
    const sessionsBody = await (await target.request('/api/sessions')).json() as { sessions: unknown[] }
    expect(sessionsBody.sessions).toEqual([])
  })

  it('cancels engine invocations by invocation id and keeps session lifecycle active', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)
    const invocation = createEngineInvocation({
      id: 'daemon-cancel-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-cancel-invocation-1/input`,
      processState: 'spawned',
      status: 'running',
    })

    const cancelRes = await target.request(`/api/engine/invocations/${invocation.id}/cancel`, { method: 'POST' })

    expect(cancelRes.status).toBe(201)
    expect(await cancelRes.json()).toMatchObject({
      events: [
        {
          invocationId: invocation.id,
          payloadJson: {
            bridgeEvent: 'invocation.cancelled',
            invocationId: invocation.id,
            processState: 'killed',
            status: 'cancelled',
          },
          type: 'status',
        },
      ],
      invocation: {
        id: invocation.id,
        processState: 'killed',
        sessionId: session.id,
        status: 'cancelled',
        summary: 'Invocation cancelled.',
      },
      session: {
        id: session.id,
        status: 'active',
      },
    })
    expect(getSession(session.id)?.status).toBe('active')
    expect(listSessionEvents(session.id).at(-1)?.payloadJson).toMatchObject({
      bridgeEvent: 'invocation.cancelled',
      invocationId: invocation.id,
    })
  })

  it('reconciles lost engine invocations by invocation id and keeps session lifecycle active', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)
    const invocation = createEngineInvocation({
      id: 'daemon-reconcile-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-reconcile-invocation-1/input`,
      processState: 'spawned',
      status: 'running',
    })

    const reconcileRes = await target.request(`/api/engine/invocations/${invocation.id}/reconcile`, {
      body: JSON.stringify({
        diagnostic: 'native process vanished token=sk-daemon-reconcile-secret',
        handle: { invocationId: invocation.id, pid: 404 },
        state: 'lost',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(reconcileRes.status).toBe(201)
    const body = await reconcileRes.json()
    expect(body).toMatchObject({
      bridgeEvents: [
        {
          diagnostic: 'native process vanished token=[REDACTED]',
          failureCode: 'ENGINE_PROCESS_LOST',
          invocationId: invocation.id,
          processState: 'lost',
          type: 'process.lost',
        },
      ],
      events: [
        {
          invocationId: invocation.id,
          payloadJson: {
            bridgeEvent: 'process.lost',
            diagnostic: 'native process vanished token=[REDACTED]',
            failureCode: 'ENGINE_PROCESS_LOST',
            invocationId: invocation.id,
            processState: 'lost',
            status: 'lost',
          },
          type: 'status',
        },
      ],
      invocation: {
        failureCode: 'ENGINE_PROCESS_LOST',
        id: invocation.id,
        processState: 'lost',
        sessionId: session.id,
        status: 'lost',
        summary: 'Native engine process was lost.',
      },
      session: {
        id: session.id,
        status: 'active',
      },
    })
    expect(JSON.stringify(body)).not.toContain('sk-daemon-reconcile-secret')
    expect(getSession(session.id)?.status).toBe('active')
    expect(listSessionEvents(session.id).at(-1)?.payloadJson).toMatchObject({
      bridgeEvent: 'process.lost',
      invocationId: invocation.id,
      processState: 'lost',
    })
  })

  it('reattaches invocation events from an invocation-scoped cursor', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)
    const invocation = createEngineInvocation({
      id: 'daemon-reattach-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-reattach-invocation-1/input`,
      status: 'running',
    })
    const otherInvocation = createEngineInvocation({
      id: 'daemon-reattach-invocation-2',
      sessionId: session.id,
      seq: 2,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-reattach-invocation-2/input`,
      status: 'running',
    })
    const firstEvent = appendSessionEvent({
      invocationId: invocation.id,
      payloadJson: { index: 1 },
      seq: 1,
      sessionId: session.id,
      type: 'status',
    })
    appendSessionEvent({
      invocationId: otherInvocation.id,
      payloadJson: { index: 'other' },
      seq: 2,
      sessionId: session.id,
      type: 'status',
    })
    const secondEvent = appendSessionEvent({
      invocationId: invocation.id,
      payloadJson: { index: 2 },
      seq: 3,
      sessionId: session.id,
      type: 'status',
    })

    const eventsRes = await target.request(`/api/engine/invocations/${invocation.id}/events?after=${firstEvent.id}&limit=1`)

    expect(eventsRes.status).toBe(200)
    expect(await eventsRes.json()).toMatchObject({
      after: firstEvent.id,
      bridgeEvents: [
        {
          id: secondEvent.id,
          invocationId: invocation.id,
          type: 'invocation.progress',
        },
      ],
      events: [
        {
          id: secondEvent.id,
          invocationId: invocation.id,
          payloadJson: { index: 2 },
        },
      ],
      invocationId: invocation.id,
      nextAfter: secondEvent.id,
    })
  })

  it('streams invocation events as SSE frames with the same redacted bridge events as JSON', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)
    const invocation = createEngineInvocation({
      id: 'daemon-sse-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-sse-invocation-1/input`,
      status: 'succeeded',
    })
    const firstEvent = appendSessionEvent({ invocationId: invocation.id, payloadJson: { index: 1 }, seq: 1, sessionId: session.id, type: 'status' })
    const secondEvent = appendSessionEvent({ invocationId: invocation.id, payloadJson: { index: 2 }, seq: 2, sessionId: session.id, type: 'status' })

    // JSON endpoint provides the redaction reference (the bridge events the SSE
    // frames must carry verbatim — proves SSE reuses the same redaction).
    const jsonBody = await (await target.request(`/api/engine/invocations/${invocation.id}/events`)).json() as {
      bridgeEvents: Array<Record<string, unknown>>
      nextAfter: number
    }

    const sseRes = await target.request(`/api/engine/invocations/${invocation.id}/events`, {
      headers: { accept: 'text/event-stream' },
    })
    expect(sseRes.status).toBe(200)
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream')
    const body = await sseRes.text()
    const frames = parseSseFrames(body)
    const dataFrames = frames.filter(f => f.event !== 'done')
    // data frames are default `message` events (no `event:` field) so an
    // EventSource consumer receives them all via onmessage without per-type listeners.
    expect(dataFrames.every(f => f.event === undefined)).toBe(true)
    // one SSE frame per bridge event, carrying the JSON-identical redacted payload,
    // with the session-event id as the SSE id so EventSource can resume from it.
    expect(dataFrames.map(f => JSON.parse(f.data))).toEqual(jsonBody.bridgeEvents)
    expect(dataFrames.map(f => f.id)).toEqual([String(firstEvent.id), String(secondEvent.id)])
    // a terminal invocation closes the stream with a done frame carrying the cursor.
    const doneFrame = frames.find(f => f.event === 'done')
    expect(doneFrame?.data).toBe(String(jsonBody.nextAfter))
  })

  it('resumes the SSE stream from Last-Event-ID', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)
    const invocation = createEngineInvocation({
      id: 'daemon-sse-invocation-2',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-sse-invocation-2/input`,
      status: 'succeeded',
    })
    const firstEvent = appendSessionEvent({ invocationId: invocation.id, payloadJson: { index: 1 }, seq: 1, sessionId: session.id, type: 'status' })
    const secondEvent = appendSessionEvent({ invocationId: invocation.id, payloadJson: { index: 2 }, seq: 2, sessionId: session.id, type: 'status' })

    const sseRes = await target.request(`/api/engine/invocations/${invocation.id}/events`, {
      headers: { 'accept': 'text/event-stream', 'last-event-id': String(firstEvent.id) },
    })
    const dataFrames = parseSseFrames(await sseRes.text()).filter(f => f.event !== 'done')
    // resume delivers only events after the cursor.
    expect(dataFrames.map(f => f.id)).toEqual([String(secondEvent.id)])
    expect(dataFrames.map(f => (JSON.parse(f.data) as { id: number }).id)).toEqual([secondEvent.id])
  })

  it('answers a reconnecting SSE stream past a finished invocation cursor with 204', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)
    const invocation = createEngineInvocation({
      id: 'daemon-sse-invocation-3',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-sse-invocation-3/input`,
      status: 'succeeded',
    })
    const lastEvent = appendSessionEvent({ invocationId: invocation.id, payloadJson: { index: 1 }, seq: 1, sessionId: session.id, type: 'status' })

    // EventSource reconnects with Last-Event-ID past the final event of a finished
    // invocation; 204 No Content makes it stop instead of reconnect-looping.
    const res = await target.request(`/api/engine/invocations/${invocation.id}/events`, {
      headers: { 'accept': 'text/event-stream', 'last-event-id': String(lastEvent.id) },
    })
    expect(res.status).toBe(204)
  })

  it('lists workspace files for the mounted artifacts surface', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { workspace } = await createWorkspaceAndSession(target, worker.id)
    upsertFile({ id: 'artifact-file-1', kind: 'generated', path: 'output/report.md', size: 42, source: 'session', workspaceId: workspace.id })

    const res = await target.request(`/api/workspace-locators/${workspace.id}/files`)

    expect(res.status).toBe(200)
    const body = await res.json() as { files: Array<{ id: string, kind: string, path: string }> }
    expect(body.files).toEqual([expect.objectContaining({ id: 'artifact-file-1', kind: 'generated', path: 'output/report.md' })])
  })

  it('returns 404 listing files for an unknown workspace', async () => {
    const target = await app()
    expect((await target.request('/api/workspace-locators/missing-workspace/files')).status).toBe(404)
  })

  it('redacts legacy secret-like diagnostics from broker read responses', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session } = await createWorkspaceAndSession(target, worker.id)
    getWorkerDb().insert(engineInvocations).values({
      id: 'daemon-read-secret-invocation',
      sessionId: session.id,
      seq: 99,
      engineId: 'codex',
      engineCommand: 'codex --token sk-daemon-read-secret',
      status: 'failed',
      processState: 'exited',
      inputRef: `aiworker://sessions/${session.id}/invocations/daemon-read-secret-invocation/input`,
      summary: 'authorization = "literal-secret-value"',
      error: 'token=sk-daemon-read-secret',
      metadataJson: { authorization: 'literal-secret-value' },
      createdAt: '2026-05-27T08:20:00.000Z',
      updatedAt: '2026-05-27T08:20:00.000Z',
    }).run()
    getWorkerDb().insert(bridgeEvents).values({
      invocationId: 'daemon-read-secret-invocation',
      eventType: 'invocation.warning',
      eventJson: {
        payload: {
          message: 'token=sk-daemon-read-secret',
          authorization: 'literal-secret-value',
        },
        seq: 1,
        sessionEventType: 'log',
        version: 1,
      },
      createdAt: '2026-05-27T08:20:01.000Z',
    }).run()

    const invocationRes = await target.request('/api/engine/invocations/daemon-read-secret-invocation')
    const sessionRes = await target.request(`/api/sessions/${session.id}`)
    const eventsRes = await target.request('/api/engine/invocations/daemon-read-secret-invocation/events')

    for (const res of [invocationRes, sessionRes, eventsRes]) {
      expect(res.status).toBe(200)
      const body = JSON.stringify(await res.json())
      expect(body).not.toContain('sk-daemon-read-secret')
      expect(body).not.toContain('literal-secret-value')
      expect(body).toContain('[REDACTED]')
    }
    expect((await target.request(`/api/local/sessions/${session.id}/events`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/sessions/${session.id}/events`)).status).toBe(404)
  })

  it('blocks new invocations for existing workers when the Soul App is archived', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'archive-app-invocation-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)

    const archiveRes = await target.request(`/api/app-installation/apps/${FREEFORM_APP_ID}/archive`, { method: 'POST' })
    expect(archiveRes.status).toBe(200)

    const brokerWorkspaceCreateRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        name: 'Blocked broker workspace',
        rootPath: join(dir, 'blocked-broker-workspace'),
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(brokerWorkspaceCreateRes.status).toBe(409)
    expect(await brokerWorkspaceCreateRes.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
        message: `Soul App is not enabled: ${FREEFORM_APP_ID}`,
      },
    })

    const projectionRes = await target.request('/api/projections/codex/refresh', {
      body: JSON.stringify({ workerId: worker.id, workspaceId: workspace.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(projectionRes.status).toBe(409)
    expect(await projectionRes.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
        message: `Soul App is not enabled: ${FREEFORM_APP_ID}`,
      },
    })

    const localProjectionRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/projection`, { method: 'POST' })
    expect(localProjectionRes.status).toBe(404)

    const sessionCreateRes = await target.request('/api/sessions', {
      body: JSON.stringify({
        title: 'Blocked after Soul App archive',
        workerId: worker.id,
        workspaceId: workspace.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(sessionCreateRes.status).toBe(409)
    expect(await sessionCreateRes.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
        message: `Soul App is not enabled: ${FREEFORM_APP_ID}`,
      },
    })

    const followUpRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({ input: 'Continue after Soul App archive.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(followUpRes.status).toBe(409)
    expect(await followUpRes.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
        message: `Soul App is not enabled: ${FREEFORM_APP_ID}`,
      },
    })

    const lowLevelRes = await target.request('/api/engine/invocations', {
      body: JSON.stringify({
        input: 'Continue through low-level broker after Soul App archive.',
        sessionId: session.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(lowLevelRes.status).toBe(409)
    expect(await lowLevelRes.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
        message: `Soul App is not enabled: ${FREEFORM_APP_ID}`,
      },
    })
  })

  it('serves worker overlay through canonical worker config while legacy overlay route is gone', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)

    const readRes = await target.request(`/api/workers/${worker.id}/config`)
    expect(readRes.status).toBe(200)
    expect(await readRes.json()).toMatchObject({
      overlay: {
        workerId: worker.id,
      },
    })

    expect((await target.request(`/api/local/workers/${worker.id}/overlay`)).status).toBe(404)
    const legacyWriteRes = await target.request(`/api/local/workers/${worker.id}/overlay`, {
      body: JSON.stringify({
        assets: [{
          checksum: 'sha256:brief',
          enabled: true,
          id: 'brief',
          kind: 'skill',
          sourceRef: 'descriptor://engine/skills/brief',
          target: 'codex',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(legacyWriteRes.status).toBe(404)
  })

  it('rejects full native MCP files in broker metadata write bodies', async () => {
    const target = await app()

    const workerMetadataRes = await target.request('/api/workers', {
      body: JSON.stringify({
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
        name: 'Embedded MCP Worker',
        appId: FREEFORM_APP_ID,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerMetadataRes.status).toBe(422)
    expect(await workerMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKER_INVALID' } })

    const worker = await createFreeformWorker(target, 'metadata-guard-worker')
    const patchWorkerMetadataRes = await target.request(`/api/workers/${worker.id}`, {
      body: JSON.stringify({
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(patchWorkerMetadataRes.status).toBe(422)
    expect(await patchWorkerMetadataRes.json()).toMatchObject({ error: { code: 'PATCH_WORKER_INVALID' } })

    const workspaceLocatorMetadataRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
        name: 'Embedded MCP Workspace Locator',
        rootPath: join(dir, 'embedded-mcp-workspace-locator'),
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceLocatorMetadataRes.status).toBe(422)
    expect(await workspaceLocatorMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_LOCATOR_INVALID' } })

    const workspaceLocatorSourcePointersRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        name: 'Embedded MCP Workspace Locator Source',
        rootPath: join(dir, 'embedded-mcp-workspace-locator-source'),
        sourcePointers: [{
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        }],
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceLocatorSourcePointersRes.status).toBe(422)
    expect(await workspaceLocatorSourcePointersRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_LOCATOR_INVALID' } })

    const workspaceMetadataRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
        name: 'Embedded MCP Workspace',
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceMetadataRes.status).toBe(422)
    expect(await workspaceMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_LOCATOR_INVALID' } })

    const workspaceSourcePointersRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        name: 'Embedded MCP Workspace Source',
        sourcePointers: [{
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        }],
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceSourcePointersRes.status).toBe(422)
    expect(await workspaceSourcePointersRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_LOCATOR_INVALID' } })

    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)
    const workspaceLocatorPatchRes = await target.request(`/api/workspace-locators/${workspace.id}`, {
      body: JSON.stringify({
        metadataJson: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(workspaceLocatorPatchRes.status).toBe(422)
    expect(await workspaceLocatorPatchRes.json()).toMatchObject({ error: { code: 'PATCH_WORKSPACE_LOCATOR_INVALID' } })

    const workspaceLocatorSourcePointersPatchRes = await target.request(`/api/workspace-locators/${workspace.id}`, {
      body: JSON.stringify({
        sourcePointersJson: [{
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(workspaceLocatorSourcePointersPatchRes.status).toBe(422)
    expect(await workspaceLocatorSourcePointersPatchRes.json()).toMatchObject({ error: { code: 'PATCH_WORKSPACE_LOCATOR_INVALID' } })

    const localWorkspacePatchRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}`, {
      body: JSON.stringify({
        metadataJson: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(localWorkspacePatchRes.status).toBe(404)

    const localWorkspaceSourcePointersPatchRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}`, {
      body: JSON.stringify({
        sourcePointersJson: [{
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(localWorkspaceSourcePointersPatchRes.status).toBe(404)

    const sessionMetadataRes = await target.request(`/api/sessions/${session.id}`, {
      body: JSON.stringify({
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(sessionMetadataRes.status).toBe(422)
    expect(await sessionMetadataRes.json()).toMatchObject({ error: { code: 'PATCH_SESSION_INVALID' } })

    const invocationMetadataRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({
        input: 'Continue with invalid metadata.',
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(invocationMetadataRes.status).toBe(422)
    expect(await invocationMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_SESSION_INVOCATION_INVALID' } })

    const engineInvocationMetadataRes = await target.request('/api/engine/invocations', {
      body: JSON.stringify({
        input: 'Continue through invalid low-level engine metadata.',
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
        sessionId: session.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(engineInvocationMetadataRes.status).toBe(422)
    expect(await engineInvocationMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_ENGINE_INVOCATION_INVALID' } })
  })

  it('rejects Soul-owned payloads in broker metadata write bodies', async () => {
    const target = await app()

    const workerMetadataRes = await target.request('/api/workers', {
      body: JSON.stringify({
        metadata: {
          reviewRecord: { decision: 'approved' },
        },
        name: 'Domain Payload Worker',
        appId: FREEFORM_APP_ID,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerMetadataRes.status).toBe(422)
    expect(await workerMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKER_INVALID' } })

    const worker = await createFreeformWorker(target, 'domain-payload-guard-worker')
    const workspaceMetadataRes = await target.request('/api/workspace-locators', {
      body: JSON.stringify({
        metadata: {
          artifactContent: '# Generated report\n',
        },
        name: 'Domain Payload Workspace',
        type: 'workspace',
        workerId: worker.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceMetadataRes.status).toBe(422)
    expect(await workspaceMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_LOCATOR_INVALID' } })

    const { session } = await createWorkspaceAndSession(target, worker.id)
    const sessionMetadataRes = await target.request(`/api/sessions/${session.id}`, {
      body: JSON.stringify({
        metadata: {
          promptText: 'Summarize the business artifact.',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(sessionMetadataRes.status).toBe(422)
    expect(await sessionMetadataRes.json()).toMatchObject({ error: { code: 'PATCH_SESSION_INVALID' } })

    const invocationMetadataRes = await target.request(`/api/sessions/${session.id}/invocations`, {
      body: JSON.stringify({
        input: 'Continue with invalid domain metadata.',
        metadata: {
          candidateId: 'candidate-1',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(invocationMetadataRes.status).toBe(422)
    expect(await invocationMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_SESSION_INVOCATION_INVALID' } })
  })

  it('stores worker config envelopes with secret references but rejects literal secrets', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)

    const saveRes = await target.request(`/api/workers/${worker.id}/config/engine-selection`, {
      body: JSON.stringify({
        checksum: 'sha256:engine-selection',
        enabled: true,
        kind: 'engine-selection',
        options: {
          profileTokenRef: 'secretref:codex/default-profile',
        },
        sourceRef: 'descriptor://configuration/default-engine',
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(saveRes.status).toBe(200)
    expect(await saveRes.json()).toMatchObject({
      config: {
        archived: false,
        configKey: 'engine-selection',
        value: {
          enabled: true,
          kind: 'engine-selection',
          options: {
            profileTokenRef: 'secretref:codex/default-profile',
          },
          target: 'codex',
          updatedBy: 'web',
        },
        workerId: worker.id,
      },
    })

    const spoofedAuditRes = await target.request(`/api/workers/${worker.id}/config/engine-selection`, {
      body: JSON.stringify({
        checksum: 'sha256:engine-selection-spoof',
        enabled: true,
        kind: 'engine-selection',
        options: {},
        target: 'codex',
        updatedAt: '2000-01-01T00:00:00.000Z',
        updatedBy: 'cli',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(spoofedAuditRes.status).toBe(200)
    const spoofedAuditBody = await spoofedAuditRes.json() as {
      config: { updatedAt: string, value: { updatedAt: string, updatedBy: string } }
    }
    expect(spoofedAuditBody.config.value.updatedBy).toBe('web')
    expect(spoofedAuditBody.config.value.updatedAt).toBe(spoofedAuditBody.config.updatedAt)
    expect(spoofedAuditBody.config.value.updatedAt).not.toBe('2000-01-01T00:00:00.000Z')

    const listRes = await target.request(`/api/workers/${worker.id}/config`)
    expect(listRes.status).toBe(200)
    expect(await listRes.json()).toMatchObject({
      config: {
        values: [
          {
            archived: false,
            configKey: 'engine-selection',
            value: {
              enabled: true,
              kind: 'engine-selection',
              target: 'codex',
              updatedBy: 'web',
            },
            workerId: worker.id,
          },
        ],
      },
      workerId: worker.id,
    })

    const archiveRes = await target.request(`/api/workers/${worker.id}/config/engine-selection/archive`, {
      method: 'POST',
    })
    expect(archiveRes.status).toBe(200)
    expect(await archiveRes.json()).toMatchObject({
      config: {
        archived: true,
        configKey: 'engine-selection',
        value: null,
        workerId: worker.id,
      },
    })

    const afterArchiveListRes = await target.request(`/api/workers/${worker.id}/config`)
    expect(afterArchiveListRes.status).toBe(200)
    expect(await afterArchiveListRes.json()).toMatchObject({
      config: { values: [] },
      workerId: worker.id,
    })

    const malformedRes = await target.request(`/api/workers/${worker.id}/config/malformed`, {
      body: JSON.stringify({
        enabled: 'yes',
        kind: 'engine-selection',
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(malformedRes.status).toBe(400)
    expect(await malformedRes.json()).toMatchObject({ error: { code: 'WORKER_CONFIG_INVALID' } })

    const literalSecretRes = await target.request(`/api/workers/${worker.id}/config/literal-secret`, {
      body: JSON.stringify({
        enabled: true,
        kind: 'mcp-overlay',
        options: {
          apiKey: 'sk-abcdefghijklmnop',
        },
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(literalSecretRes.status).toBe(422)
    expect(await literalSecretRes.json()).toMatchObject({ error: { code: 'WORKER_CONFIG_SECRET' } })

    const embeddedMcpFileRes = await target.request(`/api/workers/${worker.id}/config/embedded-mcp-file`, {
      body: JSON.stringify({
        enabled: true,
        kind: 'mcp-overlay',
        options: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(embeddedMcpFileRes.status).toBe(422)
    expect(await embeddedMcpFileRes.json()).toMatchObject({ error: { code: 'WORKER_CONFIG_INVALID' } })

    const domainRecordRes = await target.request(`/api/workers/${worker.id}/config/domain-record`, {
      body: JSON.stringify({
        candidateId: 'candidate-1',
        enabled: true,
        kind: 'sdk-extension',
        target: 'none',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(domainRecordRes.status).toBe(400)
    expect(await domainRecordRes.json()).toMatchObject({ error: { code: 'WORKER_CONFIG_INVALID' } })

    const domainOptionsRes = await target.request(`/api/workers/${worker.id}/config/domain-options`, {
      body: JSON.stringify({
        enabled: true,
        kind: 'sdk-extension',
        options: {
          artifactContent: '# Generated report\n',
          candidateId: 'candidate-1',
        },
        target: 'none',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(domainOptionsRes.status).toBe(422)
    expect(await domainOptionsRes.json()).toMatchObject({ error: { code: 'WORKER_CONFIG_INVALID' } })
  })

  it('守住 projection-overlay 与 workbench-preference envelope kind 的 broker 正向合同', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'projection-overlay-worker')

    const projectionRes = await target.request(`/api/workers/${worker.id}/config/projection-overlay`, {
      body: JSON.stringify({
        checksum: 'sha256:projection-overlay',
        enabled: true,
        kind: 'projection-overlay',
        options: {
          baselineRef: 'descriptor://engine/workspace/AGENTS.md',
        },
        sourceRef: 'descriptor://engine/workspace/AGENTS.md',
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(projectionRes.status).toBe(200)
    expect(await projectionRes.json()).toMatchObject({
      config: {
        archived: false,
        configKey: 'projection-overlay',
        value: {
          enabled: true,
          kind: 'projection-overlay',
          options: {
            baselineRef: 'descriptor://engine/workspace/AGENTS.md',
          },
          target: 'codex',
          updatedBy: 'web',
        },
        workerId: worker.id,
      },
    })

    const workbenchRes = await target.request(`/api/workers/${worker.id}/config/workbench-preference`, {
      body: JSON.stringify({
        checksum: 'sha256:workbench-preference',
        enabled: true,
        kind: 'workbench-preference',
        options: {
          preferredEntry: 'mounted',
        },
        sourceRef: 'descriptor://workbench/entry',
        target: 'all',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(workbenchRes.status).toBe(200)
    expect(await workbenchRes.json()).toMatchObject({
      config: {
        archived: false,
        configKey: 'workbench-preference',
        value: {
          enabled: true,
          kind: 'workbench-preference',
          options: {
            preferredEntry: 'mounted',
          },
          target: 'all',
          updatedBy: 'web',
        },
        workerId: worker.id,
      },
    })

    const patchProjectionRes = await target.request(`/api/workers/${worker.id}/config/projection-overlay`, {
      body: JSON.stringify({
        checksum: 'sha256:projection-overlay-disabled',
        enabled: false,
        kind: 'projection-overlay',
        options: {
          baselineRef: 'descriptor://engine/workspace/AGENTS.md',
        },
        sourceRef: 'descriptor://engine/workspace/AGENTS.md',
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(patchProjectionRes.status).toBe(200)
    expect(await patchProjectionRes.json()).toMatchObject({
      config: {
        archived: false,
        configKey: 'projection-overlay',
        value: {
          enabled: false,
          kind: 'projection-overlay',
          updatedBy: 'web',
        },
      },
    })

    const listRes = await target.request(`/api/workers/${worker.id}/config`)
    expect(listRes.status).toBe(200)
    const listed = await listRes.json() as { config: { values: Array<{ configKey: string, value: { kind: string } }> } }
    const kindByKey = new Map(listed.config.values.map(row => [row.configKey, row.value.kind]))
    expect(kindByKey.get('projection-overlay')).toBe('projection-overlay')
    expect(kindByKey.get('workbench-preference')).toBe('workbench-preference')

    const archiveProjectionRes = await target.request(`/api/workers/${worker.id}/config/projection-overlay/archive`, {
      method: 'POST',
    })
    expect(archiveProjectionRes.status).toBe(200)
    expect(await archiveProjectionRes.json()).toMatchObject({
      config: {
        archived: true,
        configKey: 'projection-overlay',
        value: null,
      },
    })

    const archiveWorkbenchRes = await target.request(`/api/workers/${worker.id}/config/workbench-preference/archive`, {
      method: 'POST',
    })
    expect(archiveWorkbenchRes.status).toBe(200)
    expect(await archiveWorkbenchRes.json()).toMatchObject({
      config: {
        archived: true,
        configKey: 'workbench-preference',
        value: null,
      },
    })

    const afterArchiveListRes = await target.request(`/api/workers/${worker.id}/config`)
    expect(afterArchiveListRes.status).toBe(200)
    expect(await afterArchiveListRes.json()).toMatchObject({
      config: { values: [] },
      workerId: worker.id,
    })
  })

  it('serves projection receipts and cleans up only receipt-owned files', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Receipt Workspace' })
    writeFileSync(join(workspace.rootPath, 'business.md'), '# user-owned work\n')

    const receiptRes = await target.request(`/api/projections/receipts/${workspace.id}`)
    expect(receiptRes.status).toBe(200)
    expect(await receiptRes.json()).toMatchObject({
      receipt: {
        appId: FREEFORM_APP_ID,
        projections: expect.arrayContaining([
          expect.objectContaining({ kind: 'workspace-file', target: 'AGENTS.md' }),
          expect.objectContaining({ kind: 'native-skill', target: '.agents/skills/aiworker-freeform-freeform-session/SKILL.md' }),
          expect.objectContaining({ kind: 'mcp-client', target: '.codex/config.toml' }),
        ]),
        version: 1,
      },
      receiptId: workspace.id,
      status: 'found',
    })

    const cleanupRes = await target.request(`/api/projections/receipts/${workspace.id}/cleanup`, { method: 'POST' })
    expect(cleanupRes.status).toBe(201)
    expect(await cleanupRes.json()).toMatchObject({
      cleaned: true,
      receiptId: workspace.id,
      status: 'cleaned',
    })
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(workspace.rootPath, '.codex', 'config.toml'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(workspace.rootPath, 'business.md'), 'utf8')).resolves.toContain('user-owned')
    await expect(readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain(FREEFORM_APP_ID)
  })

  it('serves malformed projection receipts as stable platform errors without leaking receipt content', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Malformed Receipt API Workspace' })
    await writeFile(join(workspace.rootPath, '.aiworker', 'projections.json'), '{"secret":"sk-daemon-bad-receipt",')

    const receiptRes = await target.request(`/api/projections/receipts/${workspace.id}`)

    expect(receiptRes.status).toBe(409)
    const bodyText = await receiptRes.text()
    expect(bodyText).toContain('PROJECTION_RECEIPT_STALE')
    expect(bodyText).not.toContain('sk-daemon-bad-receipt')
    expect(bodyText).not.toContain('JSON Parse error')
  })

  it('serves schema-invalid projection receipts as stable platform errors without leaking receipt content', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Legacy Receipt API Workspace' })
    const receiptPath = join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    const { freshnessMarker: _freshnessMarker, ...legacyReceipt } = receipt
    await writeFile(receiptPath, `${JSON.stringify({ ...legacyReceipt, secret: 'sk-daemon-legacy-receipt' }, null, 2)}\n`)

    const receiptRes = await target.request(`/api/projections/receipts/${workspace.id}`)

    expect(receiptRes.status).toBe(409)
    const bodyText = await receiptRes.text()
    expect(bodyText).toContain('PROJECTION_RECEIPT_STALE')
    expect(bodyText).not.toContain('sk-daemon-legacy-receipt')
    expect(bodyText).not.toContain('freshnessMarker')
  })

  it('serves schema-invalid projection receipt cleanup as a stable platform error without leaking receipt content', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Legacy Receipt Cleanup Workspace' })
    const receiptPath = join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    const { freshnessMarker: _freshnessMarker, ...legacyReceipt } = receipt
    await writeFile(receiptPath, `${JSON.stringify({ ...legacyReceipt, secret: 'sk-daemon-cleanup-receipt' }, null, 2)}\n`)

    const cleanupRes = await target.request(`/api/projections/receipts/${workspace.id}/cleanup`, { method: 'POST' })

    expect(cleanupRes.status).toBe(409)
    const bodyText = await cleanupRes.text()
    expect(bodyText).toContain('PROJECTION_RECEIPT_STALE')
    expect(bodyText).not.toContain('sk-daemon-cleanup-receipt')
    expect(bodyText).not.toContain('freshnessMarker')
  })

  it('refreshes projection assets for the requested broker engine target', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Claude Refresh Workspace' })

    const refreshRes = await target.request('/api/projections/claude-code/refresh', {
      body: JSON.stringify({ workerId: worker.id, workspaceId: workspace.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(refreshRes.status).toBe(200)
    expect(await refreshRes.json()).toMatchObject({
      projection: {
        receipt: {
          projections: expect.arrayContaining([
            expect.objectContaining({ engineTarget: 'claude-code', kind: 'native-skill', target: '.claude/skills/aiworker-freeform-freeform-session/SKILL.md' }),
            expect.objectContaining({ engineTarget: 'claude-code', kind: 'mcp-client', target: '.mcp.json' }),
          ]),
        },
      },
      target: 'claude-code',
    })
    await expect(readFile(join(workspace.rootPath, '.claude', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8')).resolves.toContain('AIWorker Freeform Session')
    await expect(readFile(join(workspace.rootPath, '.mcp.json'), 'utf8')).resolves.toContain('mcpServers')
  })

  it('refreshes projection assets from canonical worker config overlay routes', async () => {
    const officialAppsRoot = join(dir, 'official-config-overlay-apps')
    writePackagedFreeform(officialAppsRoot)
    mkdirSync(join(officialAppsRoot, FREEFORM_APP_ID, 'dist', 'engine-assets', 'skills', 'freeform-overlay'), { recursive: true })
    writeFileSync(join(officialAppsRoot, FREEFORM_APP_ID, 'dist', 'engine-assets', 'skills', 'freeform-overlay', 'SKILL.md'), '# Broker Config Overlay Session\n')
    const target = await app(undefined, undefined, officialAppsRoot)
    const worker = await createFreeformWorker(target, 'config-overlay-projection-worker')
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Config Overlay Projection Workspace' })
    await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Packaged Freeform Session')

    const configRes = await target.request(`/api/workers/${worker.id}/config/skill-overlay%3Afreeform-session`, {
      body: JSON.stringify({
        checksum: 'sha256:broker-config-overlay',
        enabled: true,
        kind: 'skill-overlay',
        options: {
          replaces: 'descriptor://engine/skills/freeform-session',
        },
        sourceRef: 'descriptor://engine/skills/freeform-overlay',
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(configRes.status).toBe(200)

    const overlayRes = await target.request(`/api/workers/${worker.id}/config`)
    expect(overlayRes.status).toBe(200)
    expect(await overlayRes.json()).toMatchObject({
      overlay: {
        assets: expect.arrayContaining([
          expect.objectContaining({
            id: 'freeform-session',
            kind: 'skill',
            source: 'overlay',
            sourceRef: 'descriptor://engine/skills/freeform-overlay',
            target: 'codex',
          }),
        ]),
      },
    })

    const refreshRes = await target.request('/api/projections/codex/refresh', {
      body: JSON.stringify({ workerId: worker.id, workspaceId: workspace.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(refreshRes.status).toBe(200)
    expect(await refreshRes.json()).toMatchObject({
      projection: {
        receipt: {
          projections: expect.arrayContaining([
            expect.objectContaining({ engineTarget: 'codex', kind: 'native-skill', source: 'worker-overlay', target: '.agents/skills/aiworker-freeform-freeform-session/SKILL.md' }),
          ]),
        },
      },
      target: 'codex',
    })
    await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Broker Config Overlay Session')
  })

  it('reads, edits, and redacts worker overlay asset content through the config content routes', async () => {
    const officialAppsRoot = join(dir, 'official-content-apps')
    writePackagedFreeform(officialAppsRoot)
    // Author-owned native MCP file carries a literal secret: GET must redact it
    // and the route must never let it be edited (Option A view-only).
    writeFileSync(
      join(officialAppsRoot, FREEFORM_APP_ID, 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'),
      'command = "freeform-mcp"\napi_key = "sk-baselineliteralsecret999"\n',
    )
    const target = await app(undefined, undefined, officialAppsRoot)
    const worker = await createFreeformWorker(target, 'content-overlay-worker')

    // GET baseline: no overlay yet → baseline Soul-dist skill content.
    const baselineRes = await target.request(`/api/workers/${worker.id}/config/skill-overlay%3Afreeform-session/content`)
    expect(baselineRes.status).toBe(200)
    const baseline = await baselineRes.json() as { content: string, source: string, checksum: string, editable: boolean }
    expect(baseline.source).toBe('baseline')
    expect(baseline.editable).toBe(true)
    expect(baseline.content).toContain('Packaged Freeform Session')
    expect(baseline.checksum).toMatch(/^sha256:/)

    // PUT editable content → written to the overlay file, envelope carries only ref+checksum.
    const putRes = await target.request(`/api/workers/${worker.id}/config/skill-overlay%3Afreeform-session/content`, {
      body: JSON.stringify({ content: '# Worker Edited Freeform Session\n' }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(putRes.status).toBe(200)
    const put = await putRes.json() as { config: { value: Record<string, unknown> }, sourceRef: string, checksum: string }
    expect(put.sourceRef).toBe('worker-overlay://skills/freeform-session/SKILL.md')
    // Envelope contains ONLY ref + checksum, never the bulk content.
    expect(put.config.value).toMatchObject({
      kind: 'skill-overlay',
      enabled: true,
      sourceRef: 'worker-overlay://skills/freeform-session/SKILL.md',
      checksum: put.checksum,
    })
    expect(JSON.stringify(put.config.value)).not.toContain('Worker Edited Freeform Session')
    // The file holds the content under the worker overlay store.
    await expect(readFile(join(dir, 'workers', worker.id, 'overlays', 'skills', 'freeform-session', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Worker Edited Freeform Session')

    // GET after PUT → overlay content + source:overlay.
    const overlayRes = await target.request(`/api/workers/${worker.id}/config/skill-overlay%3Afreeform-session/content`)
    expect(overlayRes.status).toBe(200)
    const overlay = await overlayRes.json() as { content: string, source: string }
    expect(overlay.source).toBe('overlay')
    expect(overlay.content).toContain('Worker Edited Freeform Session')

    // Projected workspace file reflects the new overlay content after a refresh.
    const workspace = await createWorkspaceLocator(target, worker.id, { name: 'Content Overlay Workspace' })
    const refreshRes = await target.request('/api/projections/codex/refresh', {
      body: JSON.stringify({ workerId: worker.id, workspaceId: workspace.id }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(refreshRes.status).toBe(200)
    await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Worker Edited Freeform Session')

    // MCP content is view-only and redacted; PUT is rejected.
    const mcpRes = await target.request(`/api/workers/${worker.id}/config/mcp-overlay%3Acodex/content`)
    expect(mcpRes.status).toBe(200)
    const mcp = await mcpRes.json() as { content: string, editable: boolean, source: string }
    expect(mcp.editable).toBe(false)
    expect(mcp.content).toContain('[REDACTED]')
    expect(mcp.content).not.toContain('sk-baselineliteralsecret999')

    const mcpPutRes = await target.request(`/api/workers/${worker.id}/config/mcp-overlay%3Acodex/content`, {
      body: JSON.stringify({ content: 'command = "edited"\n' }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(mcpPutRes.status).toBe(422)
    expect(await mcpPutRes.json()).toMatchObject({ error: { code: 'WORKER_CONFIG_CONTENT_READONLY' } })
  })

  it('rejects literal secrets in editable overlay content', async () => {
    const officialAppsRoot = join(dir, 'official-secret-content-apps')
    writePackagedFreeform(officialAppsRoot)
    const target = await app(undefined, undefined, officialAppsRoot)
    const worker = await createFreeformWorker(target, 'content-secret-worker')

    const secretPutRes = await target.request(`/api/workers/${worker.id}/config/skill-overlay%3Afreeform-session/content`, {
      body: JSON.stringify({ content: '# Skill\napi_key = "sk-literalsecretvalue123"\n' }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(secretPutRes.status).toBe(422)
    expect(await secretPutRes.json()).toMatchObject({ error: { code: 'WORKER_CONFIG_CONTENT_SECRET' } })
    // No overlay file written for a rejected secret body.
    await expect(readFile(join(dir, 'workers', worker.id, 'overlays', 'skills', 'freeform-session', 'SKILL.md'), 'utf8'))
      .rejects
      .toThrow()
  })

  it('adds an additive overlay and its content file for a new configKey', async () => {
    const officialAppsRoot = join(dir, 'official-add-content-apps')
    writePackagedFreeform(officialAppsRoot)
    const target = await app(undefined, undefined, officialAppsRoot)
    const worker = await createFreeformWorker(target, 'content-add-worker')

    const addRes = await target.request(`/api/workers/${worker.id}/config/skill-overlay%3Afreeform-extra/content`, {
      body: JSON.stringify({ content: '# Added Freeform Extra Skill\n' }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(addRes.status).toBe(200)
    const added = await addRes.json() as { sourceRef: string }
    expect(added.sourceRef).toBe('worker-overlay://skills/freeform-extra/SKILL.md')
    await expect(readFile(join(dir, 'workers', worker.id, 'overlays', 'skills', 'freeform-extra', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Added Freeform Extra Skill')

    // The additive overlay surfaces in the config list and reads back as overlay content.
    const readBackRes = await target.request(`/api/workers/${worker.id}/config/skill-overlay%3Afreeform-extra/content`)
    expect(readBackRes.status).toBe(200)
    expect(await readBackRes.json()).toMatchObject({ source: 'overlay', content: '# Added Freeform Extra Skill\n' })
  })

  it('hard-deletes installed Soul App metadata without leaving a disabled app shell', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)

    expect((await target.request(`/api/app-installation/apps/${FREEFORM_APP_ID}`)).status).toBe(200)

    const deleteRes = await target.request(`/api/app-installation/apps/${FREEFORM_APP_ID}`, { method: 'DELETE' })

    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toMatchObject({
      app: { appId: FREEFORM_APP_ID },
      deleted: true,
    })
    expect((await target.request(`/api/app-installation/apps/${FREEFORM_APP_ID}`)).status).toBe(404)
    expect((await target.request(`/api/local/apps/${FREEFORM_APP_ID}`)).status).toBe(404)
    void worker
  })

  it('requires bearer auth only when a workspace token is configured', async () => {
    const target = await app('secret-token')

    const denied = await target.request('/api/app-installation/apps')
    expect(denied.status).toBe(401)

    const allowed = await target.request('/api/app-installation/apps', {
      headers: { authorization: 'Bearer secret-token' },
    })
    expect(allowed.status).toBe(200)
  })

  it('persists settings and supports engine rescan/test actions', async () => {
    writeFakeEngineCommand('codex')
    const target = await app()

    const patch = await target.request('/api/settings', {
      body: JSON.stringify({ executionMode: 'local-cli', engineId: 'codex' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(patch.status).toBe(200)

    const rescan = await target.request('/api/engine/targets/rescan', { method: 'POST' })
    expect(rescan.status).toBe(200)

    const targets = await target.request('/api/engine/targets')
    expect(targets.status).toBe(200)
    expect((await target.request('/api/local/settings/engines')).status).toBe(404)
    expect((await target.request('/api/local/settings/engines/rescan', { method: 'POST' })).status).toBe(404)

    const test = await target.request('/api/engine/targets/codex/test', {
      method: 'POST',
    })
    expect(test.status).toBe(200)
    expect(await test.json()).toMatchObject({ result: { status: 'pass' } })
    expect((await target.request('/api/local/settings/engines/test', {
      body: JSON.stringify({ engineId: 'codex' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })).status).toBe(404)
    expect((await target.request('/api/local/settings')).status).toBe(404)
    expect(listSettings().some(setting => setting.key === 'local-settings')).toBe(true)
  })

  it('rejects literal BYOK API keys in local settings', async () => {
    const target = await app()

    const response = await target.request('/api/settings', {
      body: JSON.stringify({
        byok: {
          apiKeyRef: 'sk-local-settings-secret',
          baseUrl: 'https://api.example.test/v1',
          model: 'gpt-test',
          provider: 'openai-compatible',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body).toMatchObject({
      error: { code: 'LOCAL_SETTINGS_SECRET' },
    })
    const serialized = JSON.stringify({ body, settings: listSettings() })
    expect(serialized).not.toContain('sk-local-settings-secret')
  })

  it('rejects prefixed BYOK API key references that embed literal values', async () => {
    const target = await app()

    // Prefix disguise: passes startsWith('env:') but embeds a plaintext literal
    // that storage-layer redaction cannot recognize, so the settings predicate is
    // the only gate. Must be rejected.
    const envAssignment = await target.request('/api/settings', {
      body: JSON.stringify({
        byok: {
          apiKeyRef: 'env:OPENAI_API_KEY=plaintextsecretvalue',
          baseUrl: 'https://api.example.test/v1',
          model: 'gpt-test',
          provider: 'openai-compatible',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(envAssignment.status).toBe(422)
    expect(await envAssignment.json()).toMatchObject({ error: { code: 'LOCAL_SETTINGS_SECRET' } })

    const dollarAssignment = await target.request('/api/settings', {
      body: JSON.stringify({
        byok: {
          apiKeyRef: '$OPENAI_API_KEY=literalplaintext',
          baseUrl: 'https://api.example.test/v1',
          model: 'gpt-test',
          provider: 'openai-compatible',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(dollarAssignment.status).toBe(422)
    expect(await dollarAssignment.json()).toMatchObject({ error: { code: 'LOCAL_SETTINGS_SECRET' } })

    const serialized = JSON.stringify(listSettings())
    expect(serialized).not.toContain('plaintextsecretvalue')
    expect(serialized).not.toContain('literalplaintext')
  })

  it('still accepts plain prefixed BYOK API key references', async () => {
    writeFakeEngineCommand('codex')
    const target = await app()

    const response = await target.request('/api/settings', {
      body: JSON.stringify({
        byok: {
          apiKeyRef: 'env:OPENAI_API_KEY',
          baseUrl: 'https://api.example.test/v1',
          model: 'gpt-test',
          provider: 'openai-compatible',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(response.status).toBe(200)
    const stored = listSettings().find(setting => setting.key === 'local-settings')
    expect(JSON.stringify(stored)).toContain('env:OPENAI_API_KEY')
  })

  it('rejects literal secrets and full native MCP files in local settings payloads', async () => {
    const target = await app()

    const secretResponse = await target.request('/api/settings', {
      body: JSON.stringify({
        externalMcpServers: [{
          command: 'node team-context.js --token=sk-local-mcp-secret',
          enabled: true,
          id: 'team-context',
          name: 'Team context MCP',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })

    expect(secretResponse.status).toBe(422)
    const secretBody = await secretResponse.json()
    expect(secretBody).toMatchObject({
      error: { code: 'LOCAL_SETTINGS_SECRET' },
    })

    const nativeMcpResponse = await target.request('/api/settings', {
      body: JSON.stringify({
        externalMcpServers: [{
          command: '[mcp_servers.local]\ncommand = "node"\n',
          enabled: true,
          id: 'team-context',
          name: 'Team context MCP',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })

    expect(nativeMcpResponse.status).toBe(422)
    const nativeMcpBody = await nativeMcpResponse.json()
    expect(nativeMcpBody).toMatchObject({
      error: { code: 'LOCAL_SETTINGS_INVALID' },
    })

    const serialized = JSON.stringify({ nativeMcpBody, secretBody, settings: listSettings() })
    expect(serialized).not.toContain('sk-local-mcp-secret')
    expect(serialized).not.toContain('[mcp_servers')
  })

  it('documents broker routes and rejects invalid write bodies', async () => {
    const target = await app()

    expect((await target.request('/api/info')).status).toBe(200)
    expect((await target.request('/api/local/info')).status).toBe(404)

    const openapi = await (await target.request('/openapi.json')).json() as { paths: Record<string, unknown> }
    const expectedBrokerRoutes: Array<[method: string, path: string]> = [
      ['post', '/api/app-installation/install'],
      ['get', '/api/app-installation/apps'],
      ['get', '/api/app-installation/apps/{appId}'],
      ['post', '/api/app-installation/apps/{appId}/enable'],
      ['post', '/api/app-installation/apps/{appId}/archive'],
      ['delete', '/api/app-installation/apps/{appId}'],
      ['post', '/api/workers'],
      ['get', '/api/workers'],
      ['get', '/api/workers/{workerId}'],
      ['patch', '/api/workers/{workerId}'],
      ['post', '/api/workers/{workerId}/archive'],
      ['delete', '/api/workers/{workerId}'],
      ['get', '/api/workers/{workerId}/config'],
      ['put', '/api/workers/{workerId}/config/{configKey}'],
      ['patch', '/api/workers/{workerId}/config/{configKey}'],
      ['post', '/api/workers/{workerId}/config/{configKey}/archive'],
      ['post', '/api/workspace-locators'],
      ['get', '/api/workspace-locators'],
      ['get', '/api/workspace-locators/{workspaceId}'],
      ['patch', '/api/workspace-locators/{workspaceId}'],
      ['post', '/api/workspace-locators/{workspaceId}/archive'],
      ['delete', '/api/workspace-locators/{workspaceId}'],
      ['post', '/api/sessions'],
      ['get', '/api/sessions'],
      ['get', '/api/sessions/{sessionId}'],
      ['patch', '/api/sessions/{sessionId}'],
      ['post', '/api/sessions/{sessionId}/archive'],
      ['delete', '/api/sessions/{sessionId}'],
      ['post', '/api/sessions/{sessionId}/invocations'],
      ['get', '/api/engine/targets'],
      ['get', '/api/engine/targets/{target}/readiness'],
      ['post', '/api/engine/targets/rescan'],
      ['post', '/api/engine/targets/{target}/test'],
      ['post', '/api/engine/invocations'],
      ['get', '/api/engine/invocations/{invocationId}'],
      ['get', '/api/engine/invocations/{invocationId}/events'],
      ['post', '/api/engine/invocations/{invocationId}/cancel'],
      ['post', '/api/engine/invocations/{invocationId}/reconcile'],
      ['post', '/api/projections/{target}/refresh'],
      ['get', '/api/projections/receipts/{receiptId}'],
      ['post', '/api/projections/receipts/{receiptId}/cleanup'],
      ['get', '/api/info'],
      ['get', '/api/settings'],
      ['patch', '/api/settings'],
    ]
    const missingBrokerRoutes = expectedBrokerRoutes.flatMap(([method, path]) =>
      (openapi.paths[path] as Record<string, unknown> | undefined)?.[method]
        ? []
        : [`${method.toUpperCase()} ${path}`],
    )
    expect(missingBrokerRoutes).toEqual([])

    const localWorkerEngineInvocationPath = ['/api/local/workers', '{workerId}', 'engine/invocations'].join('/')
    expect(Object.keys(openapi.paths)).toContain('/api/sessions/{sessionId}/invocations')
    expect(Object.keys(openapi.paths)).toContain('/api/engine/invocations')
    // A Soul has no app-owned API: the broker exposes no /api/apps proxy paths.
    expect(Object.keys(openapi.paths)).not.toContain('/api/apps/{appId}')
    expect(Object.keys(openapi.paths)).not.toContain('/api/apps/{appId}/{path}')
    // v1 has no mounted workbench: the Worker owns and directly renders its Workbench.
    expect(Object.keys(openapi.paths)).not.toContain('/api/mount/workbench')
    expect(Object.keys(openapi.paths)).not.toContain(localWorkerEngineInvocationPath)
    expect(Object.keys(openapi.paths)).not.toContain('/api/local/info')
    expect(Object.keys(openapi.paths)).not.toContain('/api/local/settings')
    expect(Object.keys(openapi.paths)).not.toContain('/api/local/apps/{appId}/actions/{actionId}')
    const retiredCapabilityField = ['capability', 'TemplateId'].join('')
    const serializedOpenApi = JSON.stringify(openapi)
    expect(serializedOpenApi).not.toContain(retiredCapabilityField)
    expect(serializedOpenApi).not.toContain('[mcp_servers')
    expect(serializedOpenApi).not.toContain('mcpServers')
    expect(serializedOpenApi).not.toContain('literal-secret')
    expect(serializedOpenApi).not.toContain('sk-')
    expect(serializedOpenApi).not.toContain('candidateId')
    expect(serializedOpenApi).not.toContain('artifactContent')
    const workerConfigOperation = (openapi.paths['/api/workers/{workerId}/config/{configKey}'] as {
      patch?: { requestBody?: unknown }
      put?: { requestBody?: unknown }
    }).put
    expect(workerConfigOperation?.requestBody).toBeTruthy()
    const serializedWorkerConfigOperation = JSON.stringify(workerConfigOperation)
    expect(serializedWorkerConfigOperation).toContain('WorkerConfigValueInput')
    expect(serializedOpenApi).toContain('configValueJson envelope')
    expect(serializedOpenApi).toContain('skill-overlay')
    expect(serializedOpenApi).toContain('descriptor://engine/skills/freeform-session')
    expect(serializedOpenApi).toContain('updatedBy')
    expect(serializedOpenApi).toContain('web')
    expect(serializedWorkerConfigOperation).not.toContain('candidateId')
    expect(serializedWorkerConfigOperation).not.toContain('artifactContent')
    expect((openapi.paths['/api/workers/{workerId}/config/{configKey}'] as {
      patch?: { requestBody?: unknown }
      put?: { requestBody?: unknown }
    }).patch?.requestBody).toEqual(workerConfigOperation?.requestBody)

    const invalidWorker = await target.request('/api/workers', {
      body: JSON.stringify({ appId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(invalidWorker.status).toBe(400)

    const validWorker = await target.request('/api/workers', {
      body: JSON.stringify({ extraField: 'ignored', name: 'Freeform Extra', appId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(validWorker.status).toBe(201)
    expect((await validWorker.json() as { worker: Record<string, unknown> }).worker).not.toHaveProperty('extraField')
  })

  it('classifies local API exposure warnings by host and token', () => {
    expect(localApiExposureWarning('127.0.0.1', null)).toContain('loopback')
    expect(localApiExposureWarning('[::1]', undefined)).toContain('loopback')
    expect(localApiExposureWarning('0.0.0.0', null)).toContain('非 loopback')
    expect(localApiExposureWarning('0.0.0.0', 'token')).toBeNull()
  })
})
