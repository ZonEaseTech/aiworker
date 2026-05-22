import { Buffer } from 'node:buffer'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId, qaSoulAppManifest } from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  initWorkerDb,
  listWorkerEngineInvocations,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp } from './worker'

const HR_APP_ID = 'aiworker-hr'
const QA_APP_ID = 'aiworker-qa'
const HR_CANDIDATE_SCREEN = namespaceSoulAppCapabilityId(HR_APP_ID, 'candidate-screen')

describe('local daemon API', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-workspace-api-'))
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  async function app(token?: string, webStaticDir?: string, officialAppsRoot?: string) {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
      officialAppsRoot,
      workersRoot: join(dir, 'workers'),
      token,
      webStaticDir,
      runtimeVersion: 'test',
      executor: {
        async invoke(input) {
          input.onEvent?.({ kind: 'status', label: 'test-started', detail: input.engineId })
          input.onEvent?.({ id: 'tool-1', input: { command: 'test engine' }, kind: 'tool_use', name: 'Bash' })
          input.onEvent?.({ id: 'tool-1', content: 'ok', kind: 'tool_result', name: 'Bash' })
          input.onEvent?.({ kind: 'text', text: 'done' })
          return {
            summary: 'done',
            artifacts: [{ path: `artifacts/${input.sessionId}/result.md`, title: 'Result', content: `# ${input.prompt}\n` }],
          }
        },
      },
    })
    return boot.app
  }

  async function createHrWorker(target: Awaited<ReturnType<typeof app>>) {
    const res = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'hr-worker', soulId: HR_APP_ID, name: 'HR Recruiting' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(201)
    return (await res.json() as { worker: { id: string, soulId: string } }).worker
  }

  function seedLegacyHrMetadata() {
    const seedNow = '2026-05-13T13:04:00.000Z'
    closeWorkerDb()
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    upsertWorker({
      id: 'legacy-hr-worker',
      soulId: 'hr',
      name: 'Legacy HR',
      defaultEngineId: 'codex',
      at: seedNow,
    })
    createWorkspace({
      id: 'legacy-hr-workspace',
      workerId: 'legacy-hr-worker',
      name: 'Legacy HR workspace',
      rootPath: join(dir, 'workers', 'legacy-hr-worker', 'workspaces', 'legacy-hr-workspace'),
      at: seedNow,
    })
    createSession({
      id: 'legacy-hr-session',
      workerId: 'legacy-hr-worker',
      workspaceId: 'legacy-hr-workspace',
      capabilityTemplateId: 'candidate-screen',
      title: 'Legacy candidate screen',
      metadataJson: { capabilityTemplateId: 'candidate-screen', soulName: 'HR' },
      at: seedNow,
    })
    closeWorkerDb()
  }

  it('bootstraps official apps and rejects legacy built-in Soul ids', async () => {
    const target = await app()

    const appsBody = await (await target.request('/api/local/apps')).json() as { apps: Array<{ appId: string, status: string }> }
    expect(appsBody.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({ appId: 'aiworker-hr', status: 'enabled' }),
      expect.objectContaining({ appId: 'aiworker-qa', status: 'enabled' }),
    ]))

    const legacyRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'legacy-hr-worker', soulId: 'hr', name: 'Legacy HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(legacyRes.status).toBe(400)
    expect(await legacyRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })

    const appWorkerRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'official-hr-worker', soulId: HR_APP_ID, name: 'Official HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(appWorkerRes.status).toBe(201)
    expect(await appWorkerRes.json()).toMatchObject({ worker: { soulId: HR_APP_ID } })
  })

  it('bootstraps official apps from an explicit packaged app root', async () => {
    const officialAppsRoot = join(dir, 'official-apps')
    mkdirSync(join(officialAppsRoot, 'aiworker-hr'), { recursive: true })
    mkdirSync(join(officialAppsRoot, 'aiworker-qa'), { recursive: true })
    writeFileSync(join(officialAppsRoot, 'aiworker-hr', 'soul-app.manifest.json'), JSON.stringify(hrSoulAppManifest))
    writeFileSync(join(officialAppsRoot, 'aiworker-qa', 'soul-app.manifest.json'), JSON.stringify(qaSoulAppManifest))

    const target = await app(undefined, undefined, officialAppsRoot)
    const body = await (await target.request('/api/local/apps')).json() as {
      apps: Array<{ appId: string, sourceRef: string, status: string }>
    }

    expect(body.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({ appId: 'aiworker-hr', status: 'enabled' }),
      expect.objectContaining({ appId: 'aiworker-qa', status: 'enabled' }),
    ]))
    expect(body.apps.every(item => item.sourceRef.startsWith(officialAppsRoot))).toBe(true)
  })

  it('does not re-enable disabled official apps on daemon restart', async () => {
    const target = await app()
    const disableRes = await target.request(`/api/local/apps/${HR_APP_ID}/disable`, { method: 'POST' })
    expect(disableRes.status).toBe(200)

    const restarted = await app()
    const workerRes = await restarted.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'disabled-hr-worker', soulId: HR_APP_ID, name: 'Disabled HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(workerRes.status).toBe(400)
    expect(await workerRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })
  })

  it('enables Soul Apps without a Host-owned security review preflight', async () => {
    const target = await app()
    expect((await target.request(`/api/local/apps/${QA_APP_ID}/disable`, { method: 'POST' })).status).toBe(200)

    const reviewRes = await target.request(`/api/local/apps/${QA_APP_ID}/security-review`)
    expect(reviewRes.status).toBe(409)
    expect(await reviewRes.json()).toMatchObject({ error: { code: 'SOUL_APP_DISABLED' } })

    const enableRes = await target.request(`/api/local/apps/${QA_APP_ID}/enable`, { method: 'POST' })
    expect(enableRes.status).toBe(200)
    const enableBody = await enableRes.json() as { app: { status: string }, review?: unknown }
    expect(enableBody.app.status).toBe('enabled')
    expect(enableBody).not.toHaveProperty('review')
  })

  it('discards legacy HR worker metadata during daemon bootstrap', async () => {
    seedLegacyHrMetadata()

    const target = await app()

    const workersBody = await (await target.request('/api/local/workers')).json() as { workers: Array<{ id: string, soulId: string }> }
    expect(workersBody.workers.some(worker => worker.id === 'legacy-hr-worker')).toBe(false)

    const workspacesBody = await (await target.request('/api/local/workspaces')).json() as {
      workspaces: Array<{ id: string, workerId: string }>
    }
    expect(workspacesBody.workspaces.some(workspace => workspace.id === 'legacy-hr-workspace')).toBe(false)

    const sessionsBody = await (await target.request('/api/local/sessions')).json() as {
      sessions: Array<{ id: string, workspaceId: string }>
    }
    expect(sessionsBody.sessions.some(session => session.id === 'legacy-hr-session')).toBe(false)

    const appWorkerRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'official-hr-after-discard', soulId: HR_APP_ID, name: 'Official HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(appWorkerRes.status).toBe(201)
  })

  it('serves the session workspace loop through /api/local routes', async () => {
    const target = await app()
    const createdWorker = await createHrWorker(target)

    const workersRes = await target.request('/api/local/workers')
    expect(workersRes.status).toBe(200)
    const workersBody = await workersRes.json() as { workers: Array<{ id: string, soulId: string }> }
    const hrWorker = workersBody.workers.find(worker => worker.soulId === HR_APP_ID)
    expect(hrWorker?.id).toBe('hr-worker')
    expect(createdWorker.id).toBe(hrWorker!.id)

    const workspaceRes = await target.request(`/api/local/workers/${hrWorker!.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Hiring workspace' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(workspaceRes.status).toBe(201)
    const workspaceBody = await workspaceRes.json() as { workspace: { id: string } }

    const sessionRes = await target.request(`/api/local/workers/${hrWorker!.id}/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        context: 'Review packet',
        input: 'Prepare a candidate screen.',
        title: 'Screen candidate',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(sessionRes.status).toBe(201)
    const sessionBody = await sessionRes.json() as {
      session: { capabilityTemplateId: string, status: string }
      turn: { status: string }
    }
    expect(sessionBody.session.capabilityTemplateId).toBe(HR_CANDIDATE_SCREEN)
    expect(sessionBody.turn.status).toBe('succeeded')
    expect(sessionBody).not.toHaveProperty('lessons')
  })

  it('saves and reads worker overlay assets through worker-scoped routes', async () => {
    const target = await app()
    const worker = await createHrWorker(target)

    const saveRes = await target.request(`/api/local/workers/${worker.id}/overlay`, {
      method: 'PUT',
      body: JSON.stringify({
        assets: [{
          content: '# Interview brief\n',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          target: 'codex',
        }],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(saveRes.status).toBe(200)
    const savedBody = await saveRes.json() as { overlay: { assets: Array<{ id: string, kind: string, source: string }>, workerId: string } }
    expect(savedBody.overlay.workerId).toBe(worker.id)
    expect(savedBody.overlay.assets[0]).toMatchObject({ id: 'interview-brief', kind: 'skill', source: 'overlay' })

    const readRes = await target.request(`/api/local/workers/${worker.id}/overlay`)
    expect(readRes.status).toBe(200)
    const readBody = await readRes.json() as { overlay: { assets: Array<{ id: string, kind: string, source: string }>, workerId: string } }
    expect(readBody.overlay.workerId).toBe(worker.id)
    expect(readBody.overlay.assets[0]).toMatchObject({ id: 'interview-brief', kind: 'skill', source: 'overlay' })
  })

  it('explicitly projects worker overlay assets into an existing workspace', async () => {
    const target = await app()
    const worker = await createHrWorker(target)
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Existing candidate workspace' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(workspaceRes.status).toBe(201)
    const workspace = (await workspaceRes.json() as { workspace: { id: string } }).workspace

    const saveRes = await target.request(`/api/local/workers/${worker.id}/overlay`, {
      method: 'PUT',
      body: JSON.stringify({
        assets: [{
          content: '# Overlay Candidate Profile\n',
          enabled: true,
          id: 'candidate-profile',
          kind: 'skill',
          target: 'codex',
        }],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(saveRes.status).toBe(200)

    const projectRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspace.id}/projection`, { method: 'POST' })
    expect(projectRes.status).toBe(200)
    const projectBody = await projectRes.json() as { projection: { receipt: { projections: Array<{ source: string, target: string }> }, workspace: { id: string, metadataJson: Record<string, unknown> } } }
    expect(projectBody.projection.workspace.id).toBe(workspace.id)
    expect(projectBody.projection.workspace.metadataJson.engineAssetProjection).toMatchObject({
      projectionManifestPath: '.aiworker/projections.json',
    })
    expect(projectBody.projection.receipt.projections).toContainEqual(expect.objectContaining({
      source: 'worker-overlay',
      target: '.agents/skills/aiworker-hr-candidate-profile/SKILL.md',
    }))
  })

  it('returns not found for invalid worker overlay projection locators', async () => {
    const target = await app()
    const worker = await createHrWorker(target)
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Projection locator workspace' }),
      headers: { 'content-type': 'application/json' },
    })
    const workspace = (await workspaceRes.json() as { workspace: { id: string } }).workspace

    const missingWorkerRes = await target.request(`/api/local/workers/missing-worker/workspaces/${workspace.id}/projection`, { method: 'POST' })
    expect(missingWorkerRes.status).toBe(404)

    const missingWorkspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces/missing-workspace/projection`, { method: 'POST' })
    expect(missingWorkspaceRes.status).toBe(404)
  })

  it('rejects literal MCP secrets in worker overlay assets', async () => {
    const target = await app()
    const worker = await createHrWorker(target)

    const res = await target.request(`/api/local/workers/${worker.id}/overlay`, {
      method: 'PUT',
      body: JSON.stringify({
        assets: [{
          content: 'token = "sk-live-secret"\n',
          enabled: true,
          id: 'codex-ats',
          kind: 'mcp-client',
          target: 'codex',
        }],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: { code: 'WORKER_OVERLAY_SECRET', message: expect.stringContaining('literal MCP secrets') },
    })
  })

  it('runs worker-scoped native engine invocations without session metadata', async () => {
    const target = await app()
    const worker = await createHrWorker(target)
    const cwd = join(dir, 'native-cwd')
    mkdirSync(cwd, { recursive: true })
    const command = join(dir, 'native-engine.sh')
    writeFileSync(command, `#!/usr/bin/env bash
set -euo pipefail
printf 'cwd=%s\\n' "$PWD"
printf 'args=%s\\n' "$*"
printf 'stdin<<EOF\\n'
cat
printf '\\nEOF\\n'
`)
    chmodSync(command, 0o755)

    const res = await target.request(`/api/local/workers/${worker.id}/engine/invocations`, {
      method: 'POST',
      body: JSON.stringify({
        args: ['--native-flag', 'value'],
        cwd,
        engineCommand: command,
        engineId: 'native-test',
        input: 'native payload\n',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(201)
    const body = await res.json() as {
      invocation: Record<string, unknown> & { cwd: string, exitCode: number, status: string, workerId: string }
      result: { exitCode: number, status: string, stdout: string }
    }
    expect(body.invocation).toMatchObject({
      cwd: realpathSync(cwd),
      engineCommand: command,
      engineId: 'native-test',
      exitCode: 0,
      status: 'succeeded',
      workerId: worker.id,
    })
    expect(body.invocation).not.toHaveProperty('workspaceId')
    expect(body.invocation).not.toHaveProperty('sessionId')
    expect(body.invocation).not.toHaveProperty('turnId')
    expect(body.invocation).not.toHaveProperty('prompt')
    expect(body.invocation).not.toHaveProperty('input')
    expect(body.result).toMatchObject({ exitCode: 0, status: 'succeeded' })
    expect(body.result.stdout).toContain(`cwd=${realpathSync(cwd)}`)
    expect(body.result.stdout).toContain('args=--native-flag value')
    expect(body.result.stdout).toContain('stdin<<EOF\nnative payload\n\nEOF')

    const rows = listWorkerEngineInvocations(worker.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cwd: realpathSync(cwd),
      engineCommand: command,
      engineId: 'native-test',
      exitCode: 0,
      status: 'succeeded',
      workerId: worker.id,
    })
    expect(JSON.stringify(rows[0])).not.toContain('native payload')
  })

  it('streams worker-scoped native engine events without storing raw engine IO', async () => {
    const target = await app()
    const worker = await createHrWorker(target)
    const cwd = join(dir, 'native-stream-cwd')
    mkdirSync(cwd, { recursive: true })
    const command = join(dir, 'native-stream-engine.sh')
    writeFileSync(command, `#!/usr/bin/env bash
set -euo pipefail
printf 'stream stdout cwd=%s\\n' "$PWD"
printf 'stream stderr args=%s\\n' "$*" >&2
printf 'stdin<<EOF\\n'
cat
printf '\\nEOF\\n'
`)
    chmodSync(command, 0o755)

    const res = await target.request(`/api/local/workers/${worker.id}/engine/invocations/stream`, {
      method: 'POST',
      body: JSON.stringify({
        args: ['--stream-flag', 'value'],
        cwd,
        engineCommand: command,
        engineId: 'native-stream-test',
        input: 'stream payload\n',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const body = await res.text()
    expect(body).toContain('event: status')
    expect(body).toContain('"status":"started"')
    expect(body).toContain('event: engine_event')
    expect(body).toContain('"kind":"stdout"')
    expect(body).toContain(`stream stdout cwd=${realpathSync(cwd)}`)
    expect(body).toContain('"kind":"stderr"')
    expect(body).toContain('stream stderr args=--stream-flag value')
    expect(body).toContain('"kind":"exit"')
    expect(body).toContain('event: result')
    expect(body).toContain('"status":"succeeded"')

    const rows = listWorkerEngineInvocations(worker.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cwd: realpathSync(cwd),
      engineCommand: command,
      engineId: 'native-stream-test',
      exitCode: 0,
      status: 'succeeded',
      workerId: worker.id,
    })
    expect(JSON.stringify(rows[0])).not.toContain('stream payload')
    expect(JSON.stringify(rows[0])).not.toContain('stream stdout')
    expect(JSON.stringify(rows[0])).not.toContain('stream stderr')
  })

  it('does not expose Host-owned profile promotion, review, or lesson APIs', async () => {
    const target = await app()
    const hrWorker = await createHrWorker(target)
    const workspaceBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Profile API workspace', type: 'people-profile' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }

    const profileRes = await target.request(`/api/local/workspaces/${workspaceBody.workspace.id}/profile`)
    expect(profileRes.status).toBe(404)

    const promoteRes = await target.request(`/api/local/workspaces/${workspaceBody.workspace.id}/profile-revisions`, {
      method: 'POST',
      body: JSON.stringify({
        profileMarkdown: '# Approved Profile\n\nEvidence-backed update.\n',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(promoteRes.status).toBe(404)

    expect((await target.request('/api/local/reviews')).status).toBe(404)
    expect((await target.request('/api/local/reviews', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: workspaceBody.workspace.id }),
      headers: { 'content-type': 'application/json' },
    })).status).toBe(404)
    expect((await target.request('/api/local/lessons')).status).toBe(404)
    expect((await target.request('/api/local/lessons', {
      method: 'POST',
      body: JSON.stringify({ statement: 'old generic lesson', workspaceId: workspaceBody.workspace.id }),
      headers: { 'content-type': 'application/json' },
    })).status).toBe(404)
  })

  it('mounts enabled Soul App manifests into app, soul, template, worker, and session surfaces', async () => {
    const target = await app()
    const installRes = await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({ manifest: hrSoulAppManifest }),
      headers: { 'content-type': 'application/json' },
    })
    expect(installRes.status).toBe(201)
    const installBody = await installRes.json() as { app: { appId: string, status: string } }
    expect(installBody.app).toMatchObject({ appId: 'aiworker-hr', status: 'installed' })

    const enableRes = await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })
    expect(enableRes.status).toBe(200)
    const enableBody = await enableRes.json() as { app: { healthStatus: string, status: string } }
    expect(enableBody.app.status).toBe('enabled')
    expect(enableBody.app.healthStatus).toBe('pass')

    const appsBody = await (await target.request('/api/local/apps')).json() as { apps: Array<{ appId: string, status: string }> }
    expect(appsBody.apps).toEqual(expect.arrayContaining([expect.objectContaining({ appId: 'aiworker-hr', status: 'enabled' })]))

    const workerRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'mounted-hr-worker', soulId: 'aiworker-hr', name: 'Mounted HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(workerRes.status).toBe(201)
    const capabilityId = HR_CANDIDATE_SCREEN
    const workerTemplatesBody = await (await target.request('/api/local/workers/mounted-hr-worker/templates')).json() as { templates: Array<{ id: string, soulId: string }> }
    expect(workerTemplatesBody.templates).toEqual(expect.arrayContaining([expect.objectContaining({ id: capabilityId, soulId: 'aiworker-hr' })]))

    const workspaceBody = await (await target.request('/api/local/workers/mounted-hr-worker/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mounted HR workspace', type: 'people-profile' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }

    const sessionRes = await target.request(`/api/local/workers/mounted-hr-worker/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: capabilityId,
        context: 'Review mounted app candidate packet',
        input: 'Prepare a mounted candidate screen.',
        title: 'Mounted candidate screen',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(sessionRes.status).toBe(201)
    const sessionBody = await sessionRes.json() as { session: { capabilityTemplateId: string, metadataJson: Record<string, unknown> } }
    expect(sessionBody.session.capabilityTemplateId).toBe(capabilityId)

    const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain')
    expect(mountedApiRes.status).toBe(424)
    expect(await mountedApiRes.json()).toMatchObject({ error: { code: 'SOUL_APP_SERVICE_NOT_CONFIGURED' } })

    const disableRes = await target.request('/api/local/apps/aiworker-hr/disable', { method: 'POST' })
    expect(disableRes.status).toBe(200)
    const disabledTemplatesBody = await (await target.request('/api/local/workers/mounted-hr-worker/templates')).json() as { templates: unknown[] }
    expect(disabledTemplatesBody.templates).toEqual([])

    const blockedSessionRes = await target.request(`/api/local/workers/mounted-hr-worker/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: capabilityId,
        context: 'Should be blocked',
        input: 'Try disabled app.',
        title: 'Disabled app session',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(blockedSessionRes.status).toBe(400)
    expect(await blockedSessionRes.json()).toMatchObject({ error: { code: 'TEMPLATE_NOT_AVAILABLE' } })
  })

  it('proxies enabled Soul App API calls to a mounted local service', async () => {
    const target = await app()
    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ appId: 'aiworker-hr', status: 'ok' })
        if (url.pathname === '/domain') {
          return Response.json({
            appId: request.headers.get('x-aiworker-app-id'),
            authorization: request.headers.get('authorization'),
            cookie: request.headers.get('cookie'),
            forwardedHost: request.headers.get('x-forwarded-host'),
            hostUrl: request.headers.get('x-aiworker-host-url'),
            mountContext: request.headers.get('x-aiworker-mount-context'),
            mountSignature: request.headers.get('x-aiworker-mount-signature'),
            mounted: true,
            mountToken: request.headers.get('x-aiworker-mount-token'),
            routePrefix: request.headers.get('x-aiworker-route-prefix'),
          })
        }
        if (url.pathname === '/micro-app/widgets/hr-people-widget') {
          return new Response('<!doctype html><html><body><h1>HR micro-app</h1></body></html>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      const installRes = await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect(installRes.status).toBe(201)
      expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

      const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain', {
        headers: {
          'authorization': 'Bearer caller-token',
          'cookie': 'session=caller',
          'x-forwarded-host': 'evil.example.com',
        },
      })
      expect(mountedApiRes.status).toBe(200)
      const mountedApiBody = await mountedApiRes.json() as {
        authorization: string | null
        cookie: string | null
        forwardedHost: string | null
        mountContext: string | null
        mountSignature: string | null
        mountToken: string | null
      }
      expect(mountedApiBody).toMatchObject({
        appId: 'aiworker-hr',
        authorization: null,
        cookie: null,
        forwardedHost: null,
        mounted: true,
        routePrefix: '/api/local/apps/aiworker-hr',
      })
      expect(mountedApiBody.mountToken).toMatch(/^[a-f0-9-]{36}$/)
      expect(mountedApiBody.mountContext).toBeTruthy()
      expect(mountedApiBody.mountSignature).toMatch(/^[a-f0-9]{64}$/)

      const surfaceRes = await target.request('/api/local/apps/aiworker-hr/surfaces/hr-home?theme=light')
      expect(surfaceRes.status).toBe(200)
      const surfaceBody = await surfaceRes.json() as { microApp: { data: Record<string, unknown>, name: string, url: string }, surface: { renderer: string } }
      expect(surfaceBody).toMatchObject({
        microApp: {
          data: {
            appId: 'aiworker-hr',
            mountTokenPresent: true,
            surfaceId: 'hr-home',
            theme: 'light',
          },
          name: 'aiworker-hr--hr-home',
          url: '/api/local/apps/aiworker-hr/micro-app/routes/hr-home?theme=light',
        },
        surface: { renderer: 'micro-app' },
      })
      expect(surfaceBody).not.toHaveProperty('frame')

      const widgetRes = await target.request('/api/local/apps/aiworker-hr/surfaces/hr-people-widget?theme=dark')
      expect(widgetRes.status).toBe(200)
      const widgetBody = await widgetRes.json() as { microApp: { data: Record<string, unknown>, name: string, url: string }, surface: { renderer: string } }
      expect(widgetBody.surface.renderer).toBe('micro-app')
      expect(widgetBody.microApp.name).toBe('aiworker-hr--hr-people-widget')
      expect(widgetBody.microApp.url).toBe('/api/local/apps/aiworker-hr/micro-app/widgets/hr-people-widget?theme=dark')
      expect(widgetBody.microApp.data).toMatchObject({
        appId: 'aiworker-hr',
        surfaceId: 'hr-people-widget',
        surfaceScope: 'workspace',
        theme: 'dark',
      })
    }
    finally {
      mountedService.stop()
    }
  })

  it('proxies app-owned mounted API paths instead of Host workbench action/search routes', async () => {
    const target = await app()
    let actionMountContext: Record<string, unknown> | null = null
    const mountedService = Bun.serve({
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'ok' })
        if (url.pathname === '/protocol/actions') {
          const body = await request.json() as { protocolAction?: string }
          const mountContext = request.headers.get('x-aiworker-mount-context')
          actionMountContext = mountContext
            ? JSON.parse(Buffer.from(mountContext, 'base64url').toString('utf8')) as Record<string, unknown>
            : null
          return Response.json({
            message: 'App-owned action result',
            ok: true,
            protocolAction: body.protocolAction,
            redirectTo: '/hr/people',
            refresh: true,
          })
        }
        if (url.pathname === '/protocol/search') {
          return Response.json({
            items: [
              {
                appId: 'aiworker-hr',
                authority: 'soul-app',
                id: 'profile-draft',
                kind: 'people-profile',
                summary: url.searchParams.get('query'),
                title: 'People profile draft',
              },
            ],
            limit: url.searchParams.get('limit'),
            providerId: url.searchParams.get('providerId'),
          })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      const installRes = await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
            ui: {
              ...hrSoulAppManifest.ui,
              workbench: {
                primaryAction: {
                  id: 'create-people-profile',
                  label: 'New people profile',
                  protocolAction: 'peopleProfiles.create',
                  requiredPermissions: ['storage:write:aiworker-hr'],
                  role: 'primary',
                },
                search: {
                  id: 'people-profile-search',
                  label: 'Search people profiles',
                  placeholder: 'Search people profiles',
                  protocolProvider: 'peopleProfiles.search',
                  requiredPermissions: ['search:read:aiworker-hr'],
                },
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect(installRes.status).toBe(201)
      expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)
      const workerBody = await (await target.request('/api/local/workers', {
        method: 'POST',
        body: JSON.stringify({ id: 'action-scope-hr-worker', soulId: 'aiworker-hr', name: 'Action Scope HR' }),
        headers: { 'content-type': 'application/json' },
      })).json() as { worker: { id: string } }
      const workspaceBody = await (await target.request('/api/local/workers/action-scope-hr-worker/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Action Scope HR workspace', type: 'people-profile' }),
        headers: { 'content-type': 'application/json' },
      })).json() as { workspace: { id: string } }

      const hostActionRes = await target.request('/api/local/apps/aiworker-hr/actions/create-people-profile', {
        method: 'POST',
        body: JSON.stringify({
          input: { source: 'test' },
          scope: {
            operatorId: 'operator-local',
            workerId: workerBody.worker.id,
            workspaceId: workspaceBody.workspace.id,
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect(hostActionRes.status).not.toBe(200)

      const hostSearchRes = await target.request('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&query=ada&limit=2')
      expect(hostSearchRes.status).not.toBe(200)

      const actionRes = await target.request(`/api/local/apps/aiworker-hr/protocol/actions?operatorId=operator-local&workerId=${workerBody.worker.id}&workspaceId=${workspaceBody.workspace.id}`, {
        method: 'POST',
        body: JSON.stringify({ input: { source: 'test' }, protocolAction: 'peopleProfiles.create' }),
        headers: { 'content-type': 'application/json' },
      })
      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({
        message: 'App-owned action result',
        ok: true,
        protocolAction: 'peopleProfiles.create',
        redirectTo: '/hr/people',
        refresh: true,
      })
      expect(actionMountContext).toMatchObject({
        operatorId: 'operator-local',
        workerId: workerBody.worker.id,
        workspaceId: workspaceBody.workspace.id,
      })

      const searchRes = await target.request('/api/local/apps/aiworker-hr/protocol/search?providerId=peopleProfiles.search&query=ada&limit=2')
      expect(searchRes.status).toBe(200)
      expect(await searchRes.json()).toMatchObject({
        items: [
          expect.objectContaining({
            appId: 'aiworker-hr',
            authority: 'soul-app',
            kind: 'people-profile',
            summary: 'ada',
          }),
        ],
        limit: '2',
        providerId: 'peopleProfiles.search',
      })
    }
    finally {
      mountedService.stop()
    }
  })

  it('does not expose Host workbench action and search routes as product API', async () => {
    const target = await app()
    const protocolCalls: string[] = []
    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'ok' })
        if (url.pathname === '/protocol/actions' || url.pathname === '/protocol/search') {
          protocolCalls.push(url.pathname)
          return Response.json({ ok: true })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      const installRes = await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
            ui: {
              ...hrSoulAppManifest.ui,
              workbench: {
                primaryAction: {
                  id: 'create-people-profile',
                  label: 'New people profile',
                  protocolAction: 'peopleProfiles.create',
                  requiredPermissions: ['storage:write:aiworker-qa'],
                  role: 'primary',
                },
                search: {
                  id: 'people-profile-search',
                  label: 'Search people profiles',
                  placeholder: 'Search people profiles',
                  protocolProvider: 'peopleProfiles.search',
                  requiredPermissions: ['storage:read:aiworker-qa'],
                },
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect(installRes.status).toBe(201)
      expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

      const actionRes = await target.request('/api/local/apps/aiworker-hr/actions/create-people-profile', { method: 'POST' })
      expect(actionRes.status).not.toBe(200)

      const searchRes = await target.request('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&query=ada')
      expect(searchRes.status).not.toBe(200)
      expect(protocolCalls).toEqual([])
    }
    finally {
      mountedService.stop()
    }
  })

  it('rejects undeclared mounted API paths through the app-owned proxy', async () => {
    const target = await app()
    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'ok' })
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })

      const res = await target.request('/api/local/apps/aiworker-hr/actions/delete-all-people', { method: 'POST' })
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    }
    finally {
      mountedService.stop()
    }
  })

  it('rejects disabled Soul Apps before proxying app-owned mounted API paths', async () => {
    const target = await app()
    await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({ manifest: hrSoulAppManifest }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await target.request('/api/local/apps/aiworker-hr/protocol/actions', { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'SOUL_APP_DISABLED' } })
  })

  it('healthchecks declared mounted service base URLs before proxying', async () => {
    const target = await app()
    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'not-ready' }, { status: 503 })
        return Response.json({ appId: 'aiworker-hr' })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

      const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain')
      expect(mountedApiRes.status).toBe(502)
      expect(await mountedApiRes.json()).toMatchObject({ error: { code: 'SOUL_APP_SERVICE_UNREACHABLE' } })
    }
    finally {
      mountedService.stop()
    }
  })

  it('stops Host-launched mounted Soul App services when the app is disabled', async () => {
    const target = await app()
    const servicePath = join(dir, 'mounted-service.ts')
    const stoppedPath = join(dir, 'mounted-service-stopped.txt')
    writeFileSync(servicePath, `
import { writeFileSync } from 'node:fs'
const stoppedPath = ${JSON.stringify(stoppedPath)}
const server = Bun.serve({
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return Response.json({ status: 'ok' })
    if (url.pathname === '/domain')
      return Response.json({
        appId: request.headers.get('x-aiworker-app-id'),
        mountToken: request.headers.get('x-aiworker-mount-token'),
      })
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  },
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 0),
})
process.on('SIGTERM', () => {
  writeFileSync(stoppedPath, 'stopped')
  server.stop()
  process.exit(0)
})
process.stdout.write(JSON.stringify({ url: \`http://\${server.hostname}:\${server.port}\` }) + '\\n')
`)

    const installRes = await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({
        manifest: {
          ...hrSoulAppManifest,
          api: {
            ...hrSoulAppManifest.api,
            localService: {
              command: ['bun', servicePath],
              healthPath: '/health',
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(installRes.status).toBe(201)
    expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

    const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain')
    expect(mountedApiRes.status).toBe(200)
    expect(await mountedApiRes.json()).toMatchObject({ appId: 'aiworker-hr' })

    const disableRes = await target.request('/api/local/apps/aiworker-hr/disable', { method: 'POST' })
    expect(disableRes.status).toBe(200)
    await waitForFile(stoppedPath)
  })

  it('deduplicates concurrent mounted surface service launches per app', async () => {
    const target = await app()
    const servicePath = join(dir, 'mounted-service-concurrent.ts')
    const startedPath = join(dir, 'mounted-service-started.txt')
    writeFileSync(servicePath, `
import { writeFileSync } from 'node:fs'
const startedPath = ${JSON.stringify(startedPath)}
writeFileSync(startedPath, 'start\\n', { flag: 'a' })
const server = Bun.serve({
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return Response.json({ status: 'ok' })
    if (url.pathname === '/micro-app/widgets/hr-people-widget')
      return new Response('<!doctype html><html><body>HR micro-app</body></html>', { headers: { 'content-type': 'text/html' } })
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  },
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 0),
})
process.on('SIGTERM', () => {
  server.stop()
  process.exit(0)
})
process.stdout.write(JSON.stringify({ url: \`http://\${server.hostname}:\${server.port}\` }) + '\\n')
`)

    await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({
        manifest: {
          ...hrSoulAppManifest,
          api: {
            ...hrSoulAppManifest.api,
            localService: {
              command: ['bun', servicePath],
              healthPath: '/health',
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

    const responses = await Promise.all([
      target.request('/api/local/apps/aiworker-hr/surfaces/hr-home'),
      target.request('/api/local/apps/aiworker-hr/surfaces/hr-people-widget'),
    ])

    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect((await target.request('/api/local/apps/aiworker-hr/surfaces/hr-profile-panel')).status).toBe(404)
    const descriptorBody = await responses[0].json() as Record<string, unknown>
    expect(descriptorBody).toMatchObject({
      microApp: {
        data: {
          appId: 'aiworker-hr',
          mountTokenPresent: true,
          surfaceId: 'hr-home',
        },
        name: 'aiworker-hr--hr-home',
        url: '/api/local/apps/aiworker-hr/micro-app/routes/hr-home',
      },
      surface: {
        id: 'hr-home',
        renderer: 'micro-app',
      },
    })
    expect(descriptorBody).not.toHaveProperty('candidateRisk')
    expect(descriptorBody).not.toHaveProperty('profileCompleteness')
    const starts = readFileSync(startedPath, 'utf8').trim().split('\n').filter(Boolean)
    expect(starts).toHaveLength(1)
    expect((await target.request('/api/local/apps/aiworker-hr/disable', { method: 'POST' })).status).toBe(200)
  })

  it('does not expose Host broker routes as product API', async () => {
    const target = await app()

    const providersRes = await target.request('/api/local/apps/aiworker-hr/broker/providers')
    expect(providersRes.status).not.toBe(200)

    const storageRes = await target.request('/api/local/apps/aiworker-hr/broker/storage/profiles/ada', {
      method: 'PUT',
      body: JSON.stringify({ valueJson: { name: 'Ada' } }),
      headers: { 'content-type': 'application/json' },
    })
    expect(storageRes.status).not.toBe(200)
  })

  it('requires bearer auth only when a workspace token is configured', async () => {
    const target = await app('local-token-123456')

    expect((await target.request('/api/local/info')).status).toBe(401)
    expect((await target.request('/api/local/info', {
      headers: { authorization: 'Bearer local-token-123456' },
    })).status).toBe(200)
  })

  it('projects authenticated local identity into signed mount context', async () => {
    const target = await app('local-token-123456')
    const authHeaders = { authorization: 'Bearer local-token-123456' }

    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'ok' })
        if (url.pathname === '/domain') {
          const mountContext = request.headers.get('x-aiworker-mount-context')
          return Response.json({
            authorization: request.headers.get('authorization'),
            cookie: request.headers.get('cookie'),
            mountContext,
          })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      const installRes = await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
          },
        }),
        headers: { ...authHeaders, 'content-type': 'application/json' },
      })
      expect(installRes.status).toBe(201)
      expect((await target.request('/api/local/apps/aiworker-hr/enable', {
        method: 'POST',
        headers: authHeaders,
      })).status).toBe(200)

      const mountedRes = await target.request('/api/local/apps/aiworker-hr/domain?operatorId=spoofed-operator', {
        headers: {
          ...authHeaders,
          cookie: 'session=caller',
        },
      })
      expect(mountedRes.status).toBe(200)
      const mountedBody = await mountedRes.json() as { authorization: string | null, cookie: string | null, mountContext: string }
      expect(mountedBody.authorization).toBeNull()
      expect(mountedBody.cookie).toBeNull()
      const mountContext = JSON.parse(Buffer.from(mountedBody.mountContext, 'base64url').toString('utf8')) as {
        identity: { authMethod: string, operatorId: string, providerId: string }
        operatorId: string
      }
      expect(mountContext.operatorId).toBe('operator-local')
      expect(mountContext.identity).toMatchObject({
        authMethod: 'local-bearer',
        operatorId: 'operator-local',
        providerId: 'local-bearer',
      })
      expect(mountContext).not.toHaveProperty('brokerGrants')
      expect(mountContext).not.toHaveProperty('brokerUrl')
    }
    finally {
      mountedService.stop()
    }
  })

  it('passes a Host-issued mount token only to the mounted app proxy', async () => {
    const target = await app('local-token-123456')
    const authHeaders = { authorization: 'Bearer local-token-123456' }
    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'ok' })
        if (url.pathname === '/domain') {
          return Response.json({
            mountToken: request.headers.get('x-aiworker-mount-token'),
          })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      const installRes = await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
          },
        }),
        headers: { ...authHeaders, 'content-type': 'application/json' },
      })
      expect(installRes.status).toBe(201)
      expect((await target.request('/api/local/apps/aiworker-hr/enable', {
        method: 'POST',
        headers: authHeaders,
      })).status).toBe(200)

      const mountedRes = await target.request('/api/local/apps/aiworker-hr/domain', {
        headers: authHeaders,
      })
      expect(mountedRes.status).toBe(200)
      const mountedBody = await mountedRes.json() as { mountToken: string | null }
      expect(mountedBody.mountToken).toMatch(/^[a-f0-9-]{36}$/)

      const brokerRes = await target.request('/api/local/apps/aiworker-hr/broker/storage/mount-token/probe?operatorId=mounted-app', {
        method: 'PUT',
        body: JSON.stringify({ valueJson: { ok: true } }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-mount-token': mountedBody.mountToken ?? '',
        },
      })
      expect(brokerRes.status).not.toBe(200)

      expect((await target.request('/api/local/info', {
        headers: { 'x-aiworker-mount-token': mountedBody.mountToken ?? '' },
      })).status).toBe(401)
    }
    finally {
      mountedService.stop()
    }
  })

  it('serves Worker Web font assets from the static build', async () => {
    const webStaticDir = join(dir, 'web-static')
    mkdirSync(join(webStaticDir, 'fonts'), { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<html></html>')
    writeFileSync(join(webStaticDir, 'fonts', 'inter.woff2'), 'font-data')

    const target = await app(undefined, webStaticDir)
    const res = await target.request('/fonts/inter.woff2')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('font/woff2')
    expect(await res.text()).toBe('font-data')
  })

  it('serves Worker Web engine icon assets from the static build', async () => {
    const webStaticDir = join(dir, 'web-static')
    mkdirSync(join(webStaticDir, 'engine-icons'), { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<html></html>')
    writeFileSync(join(webStaticDir, 'engine-icons', 'openai.svg'), '<svg></svg>')

    const target = await app(undefined, webStaticDir)
    const res = await target.request('/engine-icons/openai.svg')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(await res.text()).toBe('<svg></svg>')
  })

  it('serves Worker Web PNG brand assets from the static build', async () => {
    const webStaticDir = join(dir, 'web-static')
    mkdirSync(webStaticDir, { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<html></html>')
    writeFileSync(join(webStaticDir, 'favicon.png'), 'favicon-data')
    writeFileSync(join(webStaticDir, 'logo.png'), 'logo-data')

    const target = await app(undefined, webStaticDir)
    const favicon = await target.request('/favicon.png')
    const logo = await target.request('/logo.png')

    expect(favicon.status).toBe(200)
    expect(favicon.headers.get('content-type')).toBe('image/png')
    expect(await favicon.text()).toBe('favicon-data')
    expect(logo.status).toBe(200)
    expect(logo.headers.get('content-type')).toBe('image/png')
    expect(await logo.text()).toBe('logo-data')
  })

  it('streams session turn engine events before returning the final result', async () => {
    const target = await app()
    const hrWorker = await createHrWorker(target)
    const workspaceBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Hiring stream workspace' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }
    const sessionBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        context: 'Review packet',
        title: 'Screen candidate',
      }),
      headers: { 'content-type': 'application/json' },
    })).json() as { session: { id: string } }

    const streamRes = await target.request(`/api/local/workers/${hrWorker.id}/sessions/${sessionBody.session.id}/messages/stream`, {
      method: 'POST',
      body: JSON.stringify({ input: 'Prepare a streamed candidate screen.' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(streamRes.status).toBe(200)
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream')
    const body = await streamRes.text()
    expect(body).toContain('event: turn')
    expect(body).toContain('"status":"running"')
    expect(body).toContain('event: session_event')
    expect(body).toContain('"kind":"tool_use"')
    expect(body).toContain('event: result')
    expect(body).toContain('"turn"')
  })

  it('streams initial workspace session creation before the engine finishes', async () => {
    const target = await app()
    const hrWorker = await createHrWorker(target)
    const workspaceBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Hiring initial stream workspace' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }

    const streamRes = await target.request(`/api/local/workers/${hrWorker.id}/workspaces/${workspaceBody.workspace.id}/sessions/stream`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        context: 'Review packet',
        input: 'Prepare the first streamed candidate screen.',
        title: 'Screen candidate',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(streamRes.status).toBe(200)
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream')
    const body = await streamRes.text()
    expect(body).toContain('event: session')
    expect(body).toContain(`"capabilityTemplateId":"${HR_CANDIDATE_SCREEN}"`)
    expect(body.indexOf('event: session')).toBeLessThan(body.indexOf('event: turn'))
    expect(body).toContain('event: session_event')
    expect(body).toContain('event: result')
  })

  it('documents the local Host API surface without retired control routes', async () => {
    const target = await app()
    const doc = await (await target.request('/openapi.json')).json() as { paths: Record<string, unknown> }
    const paths = Object.keys(doc.paths)

    expect(paths).toContain('/api/local/info')
    expect(paths).toContain('/api/local/apps')
    expect(paths).toContain('/api/local/apps/install')
    expect(paths).not.toContain('/api/local/apps/{appId}/security-review')
    expect(paths).toContain('/api/local/apps/{appId}/enable')
    expect(paths).not.toContain('/api/local/apps/{appId}/actions/{actionId}')
    expect(paths).not.toContain('/api/local/apps/{appId}/search')
    expect(paths).toContain('/api/local/apps/{appId}/{path}')
    expect(paths.some(path => path.includes('/broker/'))).toBe(false)
    expect(paths).toContain('/api/local/workers')
    expect(paths).toContain('/api/local/workers/{workerId}')
    expect(paths).toContain('/api/local/workers/{workerId}/overlay')
    expect(paths).toContain('/api/local/workers/{workerId}/engine/invocations')
    expect(paths).toContain('/api/local/workers/{workerId}/engine/invocations/stream')
    expect(paths).toContain('/api/local/workers/{workerId}/templates')
    expect(paths).toContain('/api/local/souls')
    expect(paths).toContain('/api/local/templates')
    expect(paths).not.toContain('/api/local/artifacts')
    expect(paths).not.toContain('/api/local/workers/{workerId}/artifacts')
    expect(paths).not.toContain('/api/local/workspaces/{workspaceId}/artifacts')
    expect(paths).not.toContain('/api/local/artifacts/{id}')
    expect(paths).not.toContain('/api/local/files')
    expect(paths).not.toContain('/api/local/workers/{workerId}/files')
    expect(paths).not.toContain('/api/local/workspaces/{workspaceId}/files')
    expect(paths).not.toContain('/api/local/events')
    expect(paths).toContain('/api/local/workers/{workerId}/workspaces')
    expect(paths).toContain('/api/local/workers/{workerId}/workspaces/{workspaceId}/projection')
    expect(paths).toContain('/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions')
    expect(paths).toContain('/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions/stream')
    expect(paths).not.toContain('/api/local/workspaces/{workspaceId}/profile')
    expect(paths).not.toContain('/api/local/workspaces/{workspaceId}/profile-revisions')
    expect(paths).not.toContain('/api/local/reviews')
    expect(paths).not.toContain('/api/local/reviews/{id}')
    expect(paths).not.toContain('/api/local/lessons')
    expect(paths).not.toContain('/api/local/lessons/{id}')
    expect(paths).toContain('/api/local/workers/{workerId}/sessions/{sessionId}/messages')
    expect(paths).toContain('/api/local/settings/engines/rescan')
    expect(paths.some(path => path.includes('/runs'))).toBe(false)
    expect(paths.some(path => path.startsWith('/api/worker'))).toBe(false)
  })

  it('persists settings and supports engine rescan/test actions', async () => {
    const target = await app()

    const settingsRes = await target.request('/api/local/settings')
    expect(settingsRes.status).toBe(200)
    const initial = await settingsRes.json() as { settings: { engineId: string, engines: Array<{ id: string }>, executionMode: string, externalMcpServers: Array<{ enabled: boolean }>, localMcpServer: { enabled: boolean } } }
    expect(['local-cli', 'byok']).toContain(initial.settings.executionMode)
    expect(initial.settings.engines.some(engine => engine.id === 'workspace-template')).toBe(false)
    expect(initial.settings.localMcpServer.enabled).toBe(false)
    expect(initial.settings.externalMcpServers.every(server => !server.enabled)).toBe(true)

    const patchRes = await target.request('/api/local/settings', {
      method: 'PATCH',
      body: JSON.stringify({ language: 'zh-CN' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(patchRes.status).toBe(200)
    expect((await patchRes.json() as { settings: { language: string } }).settings.language).toBe('zh-CN')

    const mcpPatchRes = await target.request('/api/local/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        externalMcpServers: [{ command: 'custom-mcp', enabled: true, id: 'team-context', name: 'Team context MCP' }],
        localMcpServer: { enabled: true, url: 'http://127.0.0.1:4319/mcp' },
      }),
      headers: { 'content-type': 'application/json' },
    })
    const mcpPatchBody = await mcpPatchRes.json() as { settings: { externalMcpServers: Array<{ enabled: boolean }>, localMcpServer: { enabled: boolean } } }
    expect(mcpPatchRes.status).toBe(200)
    expect(mcpPatchBody.settings.localMcpServer.enabled).toBe(false)
    expect(mcpPatchBody.settings.externalMcpServers.every(server => !server.enabled)).toBe(true)

    expect((await target.request('/api/local/settings/engines/rescan', { method: 'POST' })).status).toBe(200)
    const testRes = await target.request('/api/local/settings/engines/test', {
      method: 'POST',
      body: JSON.stringify({ engineId: initial.settings.engines[0]?.id ?? 'codex' }),
      headers: { 'content-type': 'application/json' },
    })
    expect([200, 404]).toContain(testRes.status)
  })
})

async function waitForFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (existsSync(filePath))
      return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for file: ${filePath}`)
}
