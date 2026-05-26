import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { namespaceSoulAppCapabilityId, parseSoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  initWorkerDb,
  listSettings,
  listWorkerEngineInvocations,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp, localApiExposureWarning, mountedServiceSpawnEnv } from './worker'

const FREEFORM_APP_ID = 'aiworker-freeform'
const FREEFORM_TEMPLATE = namespaceSoulAppCapabilityId(FREEFORM_APP_ID, 'default')

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
        capabilityTemplateId: FREEFORM_TEMPLATE,
        context: 'Use the Freeform Soul.',
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
      capabilityTemplateId: 'candidate-screen',
      id: 'legacy-hr-session',
      metadataJson: { capabilityTemplateId: 'candidate-screen', soulName: 'HR' },
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
    const disableRes = await target.request(`/api/local/apps/${FREEFORM_APP_ID}/disable`, { method: 'POST' })
    expect(disableRes.status).toBe(200)

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
    expect(followUpBody.invocation.processState).toBe('not_spawned')
    expect(followUpBody.session.status).toBe('active')
    expect(followUpBody.events.length).toBeGreaterThan(0)
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
      mount: {
        appId: FREEFORM_APP_ID,
        entry: `/api/apps/${FREEFORM_APP_ID}/micro-app/workbench`,
        surfaceId: 'workbench',
        type: 'micro-app',
      },
      routerMode: 'search',
    })

    const surfaceRes = await target.request(`/api/local/apps/${FREEFORM_APP_ID}/surfaces/workbench?workerId=${worker.id}&workspaceId=${workspace.id}&theme=light`)
    expect(surfaceRes.status).toBe(200)
    const surface = await surfaceRes.json() as {
      microApp: {
        data: { mountTokenPresent: boolean, workerId: string, workspaceId: string }
        url: string
      }
    }
    expect(surface.microApp).toMatchObject({
      data: {
        mountTokenPresent: false,
        workerId: worker.id,
        workspaceId: workspace.id,
      },
      url: `/api/apps/${FREEFORM_APP_ID}/micro-app/workbench?workerId=${worker.id}&workspaceId=${workspace.id}&theme=light`,
    })

    const htmlRes = await target.request(`/api/apps/${FREEFORM_APP_ID}/micro-app/workbench?workerId=${worker.id}&workspaceId=${workspace.id}&theme=light`)
    expect(htmlRes.status).toBe(200)
    expect(htmlRes.headers.get('content-type')).toContain('text/html')
    expect(await htmlRes.text()).toContain('data-aiworker-common-workbench="true"')
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
  })

  it('runs worker-scoped native engine invocations without session rows', async () => {
    const target = await app()
    const worker = await createFreeformWorker(target)
    const cwd = join(dir, 'native-cwd')
    mkdirSync(cwd, { recursive: true })

    const res = await target.request(`/api/local/workers/${worker.id}/engine/invocations`, {
      body: JSON.stringify({
        args: ['-lc', 'cat >/dev/null; echo native-ok'],
        cwd,
        engineCommand: 'bash',
        engineId: 'codex',
        input: 'hello',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { invocation: { status: string, workerId: string }, result: { stdout: string } }
    expect(body.invocation).toMatchObject({ status: 'succeeded', workerId: worker.id })
    expect(body.result.stdout).toContain('native-ok')
    expect(listWorkerEngineInvocations(worker.id)).toHaveLength(1)
  })

  it('proxies descriptor-declared app-owned API without exposing Host workbench action routes', async () => {
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

    const proxied = await target.request('/api/apps/demo-api/echo?workerId=worker-1')
    expect(proxied.status).toBe(200)
    expect(await proxied.json()).toMatchObject({
      appId: 'demo-api',
      hasMountToken: true,
      path: '/echo',
    })

    const hostAction = await target.request('/api/local/apps/demo-api/actions/create-profile', { method: 'POST' })
    expect(hostAction.status).toBe(404)

    await target.request('/api/local/apps/demo-api/disable', { method: 'POST' })
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

  it('documents broker routes and rejects invalid write bodies', async () => {
    const target = await app()

    const openapi = await (await target.request('/openapi.json')).json() as { paths: Record<string, unknown> }
    expect(Object.keys(openapi.paths)).toContain('/api/sessions/{sessionId}/invocations')
    expect(Object.keys(openapi.paths)).not.toContain('/api/local/apps/{appId}/actions/{actionId}')

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
    if (url.pathname === '/echo')
      return Response.json({
        appId: 'demo-api',
        hasMountToken: Boolean(request.headers.get('x-aiworker-mount-token')),
        path: url.pathname,
      })
    return Response.json({ path: url.pathname }, { status: 404 })
  },
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 0),
})
process.stdout.write(JSON.stringify({ url: \`http://\${server.hostname}:\${server.port}\` }) + '\\n')
`)
  }
})
