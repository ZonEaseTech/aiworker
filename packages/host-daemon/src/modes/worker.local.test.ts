import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { namespaceSoulAppCapabilityId, parseSoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'
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
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp, localApiExposureWarning, mountedServiceSpawnEnv } from './worker'

const FREEFORM_APP_ID = 'aiworker-freeform'
const FREEFORM_CAPABILITY = namespaceSoulAppCapabilityId(FREEFORM_APP_ID, 'default')

const freeformDescriptor = parseSoulDescriptorV1({
  api: null,
  capabilities: [{
    id: 'default',
    name: 'Freeform Session',
    prompt: { ref: 'dist/product/capabilities/default/prompt.md', type: 'packaged-file' },
    purpose: 'Start an open-ended engine-backed AIWorker session inside a workspace locator.',
  }],
  compatibility: { host: '>=1.0.0' },
  configuration: {},
  engine: {
    mcp: {
      targets: {
        codex: { file: 'dist/engine-assets/mcp/codex/config.toml' },
      },
    },
    skills: { source: 'dist/engine-assets/skills' },
    workspaceAssets: { source: 'dist/engine-assets/workspace' },
  },
  extensions: {},
  external: {},
  health: { ready: true, type: 'static' },
  identity: {
    appId: FREEFORM_APP_ID,
    description: 'Open-ended Soul for freeform local work.',
    name: 'AIWorker Freeform',
    soulId: 'freeform',
    version: '0.1.0',
  },
  protocol: 'soul/v1',
  workbench: {
    entry: 'dist/web/workbench/index.html',
    type: 'micro-app',
  },
})

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

  async function app(token?: string, webStaticDir?: string, officialAppsRoot?: string) {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
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
    const res = await target.request('/api/local/workers', {
      body: JSON.stringify({ id, name: 'Freeform', soulId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(res.status).toBe(201)
    return (await res.json() as { worker: { id: string, soulId: string } }).worker
  }

  async function createWorkspaceAndSession(target: Awaited<ReturnType<typeof app>>, workerId: string) {
    const workspaceRes = await target.request(`/api/local/workers/${workerId}/workspaces`, {
      body: JSON.stringify({ name: 'Open Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string, rootPath: string } }).workspace

    const sessionRes = await target.request(`/api/local/workers/${workerId}/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        capabilityId: FREEFORM_CAPABILITY,
        title: 'Freeform session',
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
    mkdirSync(join(distRoot, 'web', 'workbench'), { recursive: true })
    writeFileSync(join(distRoot, 'soul.descriptor.json'), `${JSON.stringify(freeformDescriptor, null, 2)}\n`)
    writeFileSync(join(distRoot, 'engine-assets', 'workspace', 'AGENTS.md'), '# Packaged Freeform Workspace\n')
    writeFileSync(join(distRoot, 'engine-assets', 'skills', 'freeform-session', 'SKILL.md'), '# Packaged Freeform Session\n')
    writeFileSync(join(distRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex mcp\n')
    writeFileSync(join(distRoot, 'web', 'workbench', 'index.html'), '<main data-aiworker-common-workbench="true"></main>\n')
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
      soulId: 'hr',
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
      capabilityId: 'candidate-screen',
      id: 'legacy-hr-session',
      metadataJson: { capabilityId: 'candidate-screen', soulName: 'HR' },
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

    const appsBody = await (await target.request('/api/local/apps')).json() as { apps: Array<{ appId: string, status: string }> }
    expect(appsBody.apps).toEqual([expect.objectContaining({ appId: FREEFORM_APP_ID, status: 'enabled' })])

    const legacyRes = await target.request('/api/local/workers', {
      body: JSON.stringify({ id: 'legacy-hr-worker', name: 'Legacy HR', soulId: 'hr' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(legacyRes.status).toBe(400)
    expect(await legacyRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })

    const worker = await createFreeformWorker(target, 'official-freeform-worker')
    expect(worker.soulId).toBe(FREEFORM_APP_ID)
  })

  it('lists capabilities without retired template route aliases', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'capability-route-worker')

    const capabilitiesRes = await target.request('/api/local/capabilities')
    expect(capabilitiesRes.status).toBe(200)
    const capabilitiesBody = await capabilitiesRes.json() as { capabilities: Array<{ id: string }> }
    expect(capabilitiesBody.capabilities.map(capability => capability.id)).toContain(FREEFORM_CAPABILITY)

    const workerCapabilitiesRes = await target.request(`/api/local/workers/${worker.id}/capabilities`)
    expect(workerCapabilitiesRes.status).toBe(200)
    const workerCapabilitiesBody = await workerCapabilitiesRes.json() as { capabilities: Array<{ id: string }> }
    expect(workerCapabilitiesBody.capabilities.map(capability => capability.id)).toEqual([FREEFORM_CAPABILITY])

    const capabilityRes = await target.request(`/api/local/workers/${worker.id}/capabilities/${FREEFORM_CAPABILITY}`)
    expect(capabilityRes.status).toBe(200)
    expect(await capabilityRes.json()).toMatchObject({ capability: { id: FREEFORM_CAPABILITY } })

    expect((await target.request('/api/local/templates')).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/templates`)).status).toBe(404)
    expect((await target.request(`/api/local/workers/${worker.id}/templates/${FREEFORM_CAPABILITY}`)).status).toBe(404)
  })

  it('bootstraps official descriptors from an explicit packaged app root', async () => {
    const officialAppsRoot = join(dir, 'official-apps')
    writePackagedFreeform(officialAppsRoot)

    const target = await app(undefined, undefined, officialAppsRoot)
    const body = await (await target.request('/api/local/apps')).json() as {
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
    const workerRes = await restarted.request('/api/local/workers', {
      body: JSON.stringify({ id: 'disabled-freeform-worker', name: 'Disabled Freeform', soulId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerRes.status).toBe(400)
    expect(await workerRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })
  })

  it('discards legacy HR worker metadata during daemon bootstrap', async () => {
    seedLegacyHrMetadata()

    const target = await app()
    const workersBody = await (await target.request('/api/local/workers')).json() as { workers: Array<{ id: string }> }
    expect(workersBody.workers.some(worker => worker.id === 'legacy-hr-worker')).toBe(false)

    const worker = await createFreeformWorker(target, 'freeform-after-discard')
    expect(worker.soulId).toBe(FREEFORM_APP_ID)
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

    const localSessionRes = await target.request(`/api/local/workers/${worker.id}/sessions/${session.id}`)
    expect(localSessionRes.status).toBe(200)
    const localSessionBody = await localSessionRes.json() as {
      invocations: Array<{ sessionId: string, status: string }>
    }
    expect('turns' in localSessionBody).toBe(false)
    expect(localSessionBody.invocations.map(invocation => invocation.sessionId)).toEqual([session.id, session.id])
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

  it('creates session input as the first session-level invocation without transient turns', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'freeform-first-invocation')
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'First Invocation Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string } }).workspace

    const sessionRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        capabilityId: FREEFORM_CAPABILITY,
        input: 'Start through the daemon session create route.',
        title: 'First invocation session',
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

    const localSessionRes = await target.request(`/api/local/workers/${worker.id}/sessions/${body.session.id}`)
    expect(localSessionRes.status).toBe(200)
    const localSessionBody = await localSessionRes.json() as {
      invocations: Array<{ id: string, inputRef: string }>
    }
    expect('turns' in localSessionBody).toBe(false)
    expect(localSessionBody.invocations.map(invocation => invocation.id)).toEqual([body.invocation!.id])
    expect(localSessionBody.invocations[0]?.inputRef).not.toContain('/turns/')
  })

  it('rejects legacy session create bodies that still send capabilityTemplateId', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'legacy-capability-field-worker')
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Legacy Capability Field Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string } }).workspace

    const legacyRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        capabilityTemplateId: FREEFORM_CAPABILITY,
        title: 'Legacy capability field',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(legacyRes.status).toBe(400)
    expect(await legacyRes.json()).toMatchObject({ error: { code: 'CREATE_SESSION_INVALID' } })
  })

  it('rejects Host-owned free-form session notes in write bodies', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'freeform-context-reject-worker')
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Context Reject Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string } }).workspace

    const rejectedCreateRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        capabilityId: FREEFORM_CAPABILITY,
        context: 'Host must not store this free-form session note.',
        title: 'Rejected context session',
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

  it('honors workspace locator rootPath for app-owned workspace projection', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'requested-root-worker')
    const requestedRootPath = join(dir, 'requested-workspace-root')

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
    expect(body.workspace.rootPath).toBe(requestedRootPath)

    const getRes = await target.request(`/api/workspace-locators/${body.workspace.id}`)
    expect(getRes.status).toBe(200)
    const fetched = await getRes.json() as { workspace: { rootPath: string } }
    expect(fetched.workspace.rootPath).toBe(requestedRootPath)
    await expect(readFile(join(requestedRootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Freeform')
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

    const blockedSessionRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        capabilityId: FREEFORM_CAPABILITY,
        input: 'Start after workspace archive.',
        title: 'Blocked archived workspace session',
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

  it('archives worker metadata with archived status', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'archive-worker')
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Archived Worker Existing Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string } }).workspace

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

    const blockedWorkspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Blocked Archived Worker Workspace', type: 'workspace' }),
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
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Open Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string } }).workspace

    const workerStreamRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions/stream`, {
      body: JSON.stringify({
        capabilityId: FREEFORM_CAPABILITY,
        input: 'Start through legacy worker workspace stream alias.',
        title: 'Legacy stream session',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerStreamRes.status).toBe(404)

    const workspaceStreamRes = await target.request(`/api/local/workspaces/${workspace.id}/sessions/stream`, {
      body: JSON.stringify({
        capabilityId: FREEFORM_CAPABILITY,
        input: 'Start through legacy workspace stream alias.',
        title: 'Legacy stream session',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceStreamRes.status).toBe(404)

    const sessionsBody = await (await target.request('/api/local/sessions')).json() as { sessions: unknown[] }
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
      eventType: 'diagnostic',
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
    const eventsRes = await target.request(`/api/local/sessions/${session.id}/events`)

    for (const res of [invocationRes, sessionRes, eventsRes]) {
      expect(res.status).toBe(200)
      const body = JSON.stringify(await res.json())
      expect(body).not.toContain('sk-daemon-read-secret')
      expect(body).not.toContain('literal-secret-value')
      expect(body).toContain('[REDACTED]')
    }
  })

  it('resolves one descriptor workbench mount from locator context only', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)

    const res = await target.request(`/api/mount/workbench?workerId=${worker.id}&workspaceId=${workspace.id}&sessionId=${session.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      locator: {
        sessionId: session.id,
        workerId: worker.id,
        workspaceId: workspace.id,
      },
      microApp: {
        data: {
          mountTokenPresent: false,
          sessionId: session.id,
          workerId: worker.id,
          workspaceId: workspace.id,
        },
        name: `${FREEFORM_APP_ID}--workbench`,
        url: `/api/apps/${FREEFORM_APP_ID}/micro-app/workbench?workerId=${worker.id}&workspaceId=${workspace.id}&sessionId=${session.id}`,
      },
      mount: {
        appId: FREEFORM_APP_ID,
        entry: `/api/apps/${FREEFORM_APP_ID}/micro-app/workbench`,
        surfaceId: 'workbench',
        type: 'micro-app',
      },
      routerMode: 'search',
    })

    const htmlRes = await target.request(`/api/apps/${FREEFORM_APP_ID}/micro-app/workbench?workerId=${worker.id}&workspaceId=${workspace.id}&theme=light`)
    expect(htmlRes.status).toBe(200)
    expect(htmlRes.headers.get('content-type')).toContain('text/html')
    expect(await htmlRes.text()).toContain('data-aiworker-common-workbench="true"')
  })

  it('rejects descriptor workbench mount without worker locator', async () => {
    const target = await app()

    const res = await target.request('/api/mount/workbench')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'MOUNT_CONTEXT_INVALID',
      },
    })
  })

  it('rejects descriptor workbench mount when session and workspace locators mismatch', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const first = await createWorkspaceAndSession(target, worker.id)
    const second = await createWorkspaceAndSession(target, worker.id)

    const res = await target.request(`/api/mount/workbench?workerId=${worker.id}&workspaceId=${first.workspace.id}&sessionId=${second.session.id}`)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'MOUNT_CONTEXT_INVALID',
      },
    })
  })

  it('rejects descriptor workbench mount for an unknown worker', async () => {
    const target = await app()

    const res = await target.request('/api/mount/workbench?workerId=missing-worker')

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'NOT_FOUND',
      },
    })
  })

  it('rejects descriptor workbench mount when the worker Soul App is disabled', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const archiveRes = await target.request(`/api/app-installation/apps/${FREEFORM_APP_ID}/archive`, { method: 'POST' })
    expect(archiveRes.status).toBe(200)

    const res = await target.request(`/api/mount/workbench?workerId=${worker.id}`)

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
      },
    })
  })

  it('blocks new invocations for existing workers when the Soul App is archived', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target, 'archive-app-invocation-worker')
    const { session, workspace } = await createWorkspaceAndSession(target, worker.id)

    const archiveRes = await target.request(`/api/app-installation/apps/${FREEFORM_APP_ID}/archive`, { method: 'POST' })
    expect(archiveRes.status).toBe(200)

    const workerWorkspaceCreateRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Blocked worker workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerWorkspaceCreateRes.status).toBe(409)
    expect(await workerWorkspaceCreateRes.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
        message: `Soul App is not enabled: ${FREEFORM_APP_ID}`,
      },
    })

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
    expect(localProjectionRes.status).toBe(409)
    expect(await localProjectionRes.json()).toMatchObject({
      error: {
        code: 'SOUL_APP_DISABLED',
        message: `Soul App is not enabled: ${FREEFORM_APP_ID}`,
      },
    })

    const sessionCreateRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/sessions`, {
      body: JSON.stringify({
        capabilityId: FREEFORM_CAPABILITY,
        title: 'Blocked after Soul App archive',
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

  it('saves worker overlay assets as metadata and rejects literal secrets', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)

    const saveRes = await target.request(`/api/local/workers/${worker.id}/overlay`, {
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
    expect(saveRes.status).toBe(200)
    expect(await saveRes.json()).toMatchObject({
      overlay: {
        assets: expect.arrayContaining([expect.objectContaining({ id: 'brief', source: 'overlay' })]),
      },
    })

    const secretRes = await target.request(`/api/local/workers/${worker.id}/overlay`, {
      body: JSON.stringify({
        assets: [{
          enabled: true,
          id: 'secret',
          kind: 'mcp-client',
          sourceRef: 'sk-abcdefghijklmnop',
          target: 'codex',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(secretRes.status).toBe(422)
    expect(await secretRes.json()).toMatchObject({ error: { code: 'WORKER_OVERLAY_SECRET' } })

    const embeddedMcpFileRes = await target.request(`/api/local/workers/${worker.id}/overlay`, {
      body: JSON.stringify({
        assets: [{
          enabled: true,
          id: 'embedded-mcp-file',
          kind: 'mcp-client',
          optionsJson: {
            configToml: '[mcp_servers.local]\ncommand = "node"\n',
          },
          sourceRef: 'descriptor://engine/mcp/codex',
          target: 'codex',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(embeddedMcpFileRes.status).toBe(422)
    expect(await embeddedMcpFileRes.json()).toMatchObject({ error: { code: 'WORKER_OVERLAY_INVALID' } })
  })

  it('rejects full native MCP files in broker metadata write bodies', async () => {
    const target = await app()

    const workerMetadataRes = await target.request('/api/local/workers', {
      body: JSON.stringify({
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
        name: 'Embedded MCP Worker',
        soulId: FREEFORM_APP_ID,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerMetadataRes.status).toBe(422)
    expect(await workerMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKER_INVALID' } })

    const worker = await createFreeformWorker(target, 'metadata-guard-worker')
    const patchWorkerMetadataRes = await target.request(`/api/local/workers/${worker.id}`, {
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

    const workspaceMetadataRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({
        metadata: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
        name: 'Embedded MCP Workspace',
        type: 'workspace',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceMetadataRes.status).toBe(422)
    expect(await workspaceMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_INVALID' } })

    const workspaceSourcePointersRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({
        name: 'Embedded MCP Workspace Source',
        sourcePointers: [{
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        }],
        type: 'workspace',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceSourcePointersRes.status).toBe(422)
    expect(await workspaceSourcePointersRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_INVALID' } })

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
    expect(localWorkspacePatchRes.status).toBe(422)
    expect(await localWorkspacePatchRes.json()).toMatchObject({ error: { code: 'PATCH_WORKSPACE_INVALID' } })

    const localWorkspaceSourcePointersPatchRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}`, {
      body: JSON.stringify({
        sourcePointersJson: [{
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(localWorkspaceSourcePointersPatchRes.status).toBe(422)
    expect(await localWorkspaceSourcePointersPatchRes.json()).toMatchObject({ error: { code: 'PATCH_WORKSPACE_INVALID' } })

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

    const workerMetadataRes = await target.request('/api/local/workers', {
      body: JSON.stringify({
        metadata: {
          reviewRecord: { decision: 'approved' },
        },
        name: 'Domain Payload Worker',
        soulId: FREEFORM_APP_ID,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerMetadataRes.status).toBe(422)
    expect(await workerMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKER_INVALID' } })

    const worker = await createFreeformWorker(target, 'domain-payload-guard-worker')
    const workspaceMetadataRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({
        metadata: {
          artifactContent: '# Generated report\n',
        },
        name: 'Domain Payload Workspace',
        type: 'workspace',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceMetadataRes.status).toBe(422)
    expect(await workspaceMetadataRes.json()).toMatchObject({ error: { code: 'CREATE_WORKSPACE_INVALID' } })

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

  it('serves projection receipts and cleans up only receipt-owned files', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Receipt Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string, rootPath: string } }).workspace
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

  it('refreshes projection assets for the requested broker engine target', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Claude Refresh Workspace', type: 'workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string, rootPath: string } }).workspace

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

  it('proxies descriptor-declared app-owned API with sanitized locator context and no Host action routes', async () => {
    const target = await app()
    const appRoot = join(dir, 'api-soul')
    writeApiSoul(appRoot)

    const installRes = await target.request('/api/local/apps/install', {
      body: JSON.stringify({ descriptorPath: join(appRoot, 'dist', 'soul.descriptor.json') }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(installRes.status).toBe(201)
    expect((await target.request('/api/local/apps/demo-api/enable', { method: 'POST' })).status).toBe(200)

    const proxied = await target.request('/api/apps/demo-api/echo?workerId=worker-1&workspaceId=workspace-1&sessionId=session-1', {
      headers: {
        'authorization': 'Bearer client-forwarded-credential',
        'cookie': 'sid=client-cookie',
        'x-forwarded-for': '203.0.113.10',
      },
    })
    expect(proxied.status).toBe(200)
    expect(proxied.headers.get('set-cookie')).toBeNull()
    expect(proxied.headers.get('x-aiworker-mount-token')).toBeNull()
    expect(await proxied.json()).toMatchObject({
      appId: 'demo-api',
      hasAuthorization: false,
      hasCookie: false,
      hasForwardedFor: false,
      hasMountToken: true,
      mountContext: {
        appId: 'demo-api',
        routePrefix: '/api/apps/demo-api',
        sessionId: 'session-1',
        workerId: 'worker-1',
        workspaceId: 'workspace-1',
      },
      path: '/echo',
    })

    const proxiedRoot = await target.request('/api/apps/demo-api?workerId=worker-1')
    const proxiedRootText = await proxiedRoot.text()
    expect(proxiedRoot.status, proxiedRootText).toBe(200)
    expect(JSON.parse(proxiedRootText)).toMatchObject({
      appId: 'demo-api',
      hasMountToken: true,
      path: '/',
    })
    expect((await target.request('/api/apps/demo-api/?workerId=worker-1')).status).toBe(200)

    const workerRes = await target.request('/api/local/workers', {
      body: JSON.stringify({ id: 'demo-api-worker', name: 'Demo API Worker', soulId: 'demo-api' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workerRes.status).toBe(201)
    const mountRes = await target.request('/api/mount/workbench?workerId=demo-api-worker')
    expect(mountRes.status).toBe(200)
    const mountBody = await mountRes.json() as { microApp: { data: Record<string, unknown> } }
    expect(mountBody.microApp.data.mountTokenPresent).toBe(true)
    expect(mountBody.microApp.data).not.toHaveProperty('mountToken')

    const hostAction = await target.request('/api/local/apps/demo-api/actions/create-profile', { method: 'POST' })
    expect(hostAction.status).toBe(404)

    await target.request('/api/app-installation/apps/demo-api/archive', { method: 'POST' })
  })

  it('redacts mounted app-owned API startup diagnostics before returning broker errors', async () => {
    const target = await app()
    const appRoot = join(dir, 'failing-api-soul')
    writeFailingApiSoul(appRoot)

    const installRes = await target.request('/api/local/apps/install', {
      body: JSON.stringify({ descriptorPath: join(appRoot, 'dist', 'soul.descriptor.json') }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(installRes.status).toBe(201)
    expect((await target.request('/api/local/apps/demo-failing-api/enable', { method: 'POST' })).status).toBe(200)

    const response = await target.request('/api/apps/demo-failing-api/echo')
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body).toMatchObject({
      error: { code: 'SOUL_APP_SERVICE_UNREACHABLE' },
      routePrefix: '/api/apps/demo-failing-api',
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('sk-mounted-service-secret')
    expect(serialized).not.toContain('literal-secret-value')
    expect(serialized).toContain('[REDACTED]')
  })

  it('hard-deletes installed Soul App metadata without leaving a disabled app shell', async () => {
    const target = await app()
    const appRoot = join(dir, 'delete-api-soul')
    writeApiSoul(appRoot)

    const installRes = await target.request('/api/app-installation/install', {
      body: JSON.stringify({ descriptorPath: join(appRoot, 'dist', 'soul.descriptor.json') }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(installRes.status).toBe(201)
    expect((await target.request('/api/app-installation/apps/demo-api/enable', { method: 'POST' })).status).toBe(200)
    expect((await target.request('/api/apps/demo-api/echo')).status).toBe(200)

    const deleteRes = await target.request('/api/app-installation/apps/demo-api', { method: 'DELETE' })

    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toMatchObject({
      app: { appId: 'demo-api' },
      deleted: true,
    })
    expect((await target.request('/api/app-installation/apps/demo-api')).status).toBe(404)
    expect((await target.request('/api/local/apps/demo-api')).status).toBe(404)
    expect((await target.request('/api/apps/demo-api/echo')).status).toBe(404)
  })

  it('requires bearer auth only when a workspace token is configured', async () => {
    const target = await app('secret-token')

    const denied = await target.request('/api/local/apps')
    expect(denied.status).toBe(401)

    const allowed = await target.request('/api/local/apps', {
      headers: { authorization: 'Bearer secret-token' },
    })
    expect(allowed.status).toBe(200)
  })

  it('persists settings and supports engine rescan/test actions', async () => {
    writeFakeEngineCommand('codex')
    const target = await app()

    const patch = await target.request('/api/local/settings', {
      body: JSON.stringify({ executionMode: 'local-cli', engineId: 'codex' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    expect(patch.status).toBe(200)

    const rescan = await target.request('/api/local/settings/engines/rescan', { method: 'POST' })
    expect(rescan.status).toBe(200)

    const test = await target.request('/api/local/settings/engines/test', {
      body: JSON.stringify({ engineId: 'codex' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(test.status).toBe(200)
    expect(await test.json()).toMatchObject({ result: { status: 'pass' } })
    expect(listSettings().some(setting => setting.key === 'local-settings')).toBe(true)
  })

  it('rejects literal BYOK API keys in local settings', async () => {
    const target = await app()

    const response = await target.request('/api/local/settings', {
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

  it('rejects literal secrets and full native MCP files in local settings payloads', async () => {
    const target = await app()

    const secretResponse = await target.request('/api/local/settings', {
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

    const nativeMcpResponse = await target.request('/api/local/settings', {
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
      ['post', '/api/engine/invocations'],
      ['get', '/api/engine/invocations/{invocationId}'],
      ['get', '/api/engine/invocations/{invocationId}/events'],
      ['post', '/api/engine/invocations/{invocationId}/cancel'],
      ['post', '/api/projections/{target}/refresh'],
      ['get', '/api/projections/receipts/{receiptId}'],
      ['post', '/api/projections/receipts/{receiptId}/cleanup'],
      ['get', '/api/mount/workbench'],
      ['get', '/api/apps/{appId}'],
      ['post', '/api/apps/{appId}'],
      ['put', '/api/apps/{appId}'],
      ['patch', '/api/apps/{appId}'],
      ['delete', '/api/apps/{appId}'],
      ['get', '/api/apps/{appId}/{path}'],
      ['post', '/api/apps/{appId}/{path}'],
      ['put', '/api/apps/{appId}/{path}'],
      ['patch', '/api/apps/{appId}/{path}'],
      ['delete', '/api/apps/{appId}/{path}'],
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
    expect(Object.keys(openapi.paths)).toContain('/api/apps/{appId}')
    expect(Object.keys(openapi.paths)).toContain('/api/apps/{appId}/{path}')
    expect(Object.keys(openapi.paths)).not.toContain(localWorkerEngineInvocationPath)
    expect(Object.keys(openapi.paths)).not.toContain('/api/local/apps/{appId}/actions/{actionId}')
    const retiredCapabilityField = ['capability', 'TemplateId'].join('')
    const serializedOpenApi = JSON.stringify(openapi)
    expect(serializedOpenApi).not.toContain(retiredCapabilityField)
    expect(serializedOpenApi).not.toContain('[mcp_servers')
    expect(serializedOpenApi).not.toContain('mcpServers')
    expect(serializedOpenApi).not.toContain('literal-secret')
    expect(serializedOpenApi).not.toContain('sk-')

    const invalidWorker = await target.request('/api/local/workers', {
      body: JSON.stringify({ soulId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(invalidWorker.status).toBe(400)

    const validWorker = await target.request('/api/local/workers', {
      body: JSON.stringify({ extraField: 'ignored', name: 'Freeform Extra', soulId: FREEFORM_APP_ID }),
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

  it('mounted service env drops LLM/cloud credentials and injects mount token', () => {
    const env = mountedServiceSpawnEnv('mount-token')
    expect(env.AIWORKER_MOUNT_TOKEN).toBe('mount-token')
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  function writeApiSoul(root: string): void {
    const descriptor = parseSoulDescriptorV1({
      ...freeformDescriptor,
      api: {
        entry: 'dist/api/server.js',
        mount: '/api/apps/demo-api',
        type: 'local-service',
      },
      identity: {
        appId: 'demo-api',
        description: 'Descriptor-only API Soul.',
        name: 'Demo API Soul',
        soulId: 'demo-api',
        version: '0.1.0',
      },
    })
    const distRoot = join(root, 'dist')
    mkdirSync(join(distRoot, 'api'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'workspace'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'skills'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'mcp', 'codex'), { recursive: true })
    writeFileSync(join(distRoot, 'soul.descriptor.json'), `${JSON.stringify(descriptor, null, 2)}\n`)
    writeFileSync(join(distRoot, 'engine-assets', 'workspace', 'AGENTS.md'), '# Demo API Workspace\n')
    writeFileSync(join(distRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex mcp\n')
    writeFileSync(join(distRoot, 'api', 'server.js'), `
const server = Bun.serve({
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return Response.json({ status: 'ok' })
    if (url.pathname === '/' || url.pathname === '/echo') {
      const mountContextHeader = request.headers.get('x-aiworker-mount-context')
      const mountContext = mountContextHeader
        ? JSON.parse(Buffer.from(mountContextHeader, 'base64url').toString('utf8'))
        : null
      return Response.json({
        appId: 'demo-api',
        hasAuthorization: Boolean(request.headers.get('authorization')),
        hasCookie: Boolean(request.headers.get('cookie')),
        hasForwardedFor: Boolean(request.headers.get('x-forwarded-for')),
        hasMountToken: Boolean(request.headers.get('x-aiworker-mount-token')),
        mountContext,
        path: url.pathname,
      }, {
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'demo_api_session=should-not-reach-host',
          'x-aiworker-mount-token': request.headers.get('x-aiworker-mount-token') ?? '',
        },
      })
    }
    return Response.json({ path: url.pathname }, { status: 404 })
  },
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 0),
})
process.stdout.write(JSON.stringify({ url: \`http://\${server.hostname}:\${server.port}\` }) + '\\n')
`)
  }

  function writeFailingApiSoul(root: string): void {
    const descriptor = parseSoulDescriptorV1({
      ...freeformDescriptor,
      api: {
        entry: 'dist/api/server.js',
        mount: '/api/apps/demo-failing-api',
        type: 'local-service',
      },
      identity: {
        appId: 'demo-failing-api',
        description: 'Descriptor-only API Soul with failing local service.',
        name: 'Failing API Soul',
        soulId: 'demo-failing-api',
        version: '0.1.0',
      },
    })
    const distRoot = join(root, 'dist')
    mkdirSync(join(distRoot, 'api'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'workspace'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'skills'), { recursive: true })
    mkdirSync(join(distRoot, 'engine-assets', 'mcp', 'codex'), { recursive: true })
    writeFileSync(join(distRoot, 'soul.descriptor.json'), `${JSON.stringify(descriptor, null, 2)}\n`)
    writeFileSync(join(distRoot, 'engine-assets', 'workspace', 'AGENTS.md'), '# Failing API Workspace\n')
    writeFileSync(join(distRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex mcp\n')
    writeFileSync(join(distRoot, 'api', 'server.js'), `
process.stderr.write('startup token=sk-mounted-service-secret\\n')
process.stderr.write('authorization = "literal-secret-value"\\n')
setTimeout(() => process.exit(7), 10)
`)
  }
})
