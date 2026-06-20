import { rmSync } from 'node:fs'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createAssignment,
  createEmptyControlPlaneSnapshot,
  createProvisionPlan,
  createProvisionReceipt,
  LocalFileControlPlaneStore,
} from '@zonease/aiworker-control'
import { beforeEach, describe, expect, test } from 'bun:test'
import { createServer as createViteDevServer } from 'vite'

import { adminBootstrapStatus, readSoulCatalog, resolveAiworkerCliCommand, summarizeApplyJobResult } from '@/admin-api'
import { assertServerHostAllowed, contentType, createServer, handleAdminRuntimeRequest, resolveStaticPath, serverHostname, staticRoot } from '@/server'

const authEnvKeys = [
  'AIWORKER_ALLOWED_EMAIL_DOMAINS',
  'AIWORKER_SESSION_SECRET',
  'AIWORKER_WEB_ALLOW_ANY_LOGTO_EMAIL',
  'AIWORKER_WEB_ALLOW_REMOTE',
  'AIWORKER_WEB_ADMIN_TOKEN',
  'AIWORKER_WEB_HOST',
  'AIWORKER_WEB_REQUIRE_AUTH',
  'LOGTO_ALLOWED_EMAIL_DOMAINS',
  'LOGTO_APP_ID',
  'LOGTO_APP_SECRET',
  'LOGTO_BASE_URL',
  'LOGTO_CLIENT_ID',
  'LOGTO_CLIENT_SECRET',
  'LOGTO_COOKIE_SECRET',
  'LOGTO_ENDPOINT',
  'LOGTO_ISSUER',
] as const

beforeEach(() => {
  for (const key of authEnvKeys)
    delete process.env[key]
})

describe('Bun static server helpers', () => {
  test('serves from the Vite dist directory by default', () => {
    expect(staticRoot()).toEndWith('/dist')
  })

  test('binds the release server to loopback unless remote access is explicit', () => {
    expect(serverHostname({})).toBe('127.0.0.1')
    expect(serverHostname({ AIWORKER_WEB_HOST: 'localhost' })).toBe('localhost')
    expect(() => assertServerHostAllowed('0.0.0.0', {})).toThrow('AIWORKER_WEB_ALLOW_REMOTE=1')
    expect(() => assertServerHostAllowed('0.0.0.0', { AIWORKER_WEB_ALLOW_REMOTE: '1' })).not.toThrow()
  })

  test('programmatic remote binding still requires admin authentication', async () => {
    process.env.AIWORKER_WEB_ALLOW_REMOTE = '1'
    const server = createServer({ hostname: '0.0.0.0', port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/admin-data`)
      const payload = await response.json()

      expect(response.status).toBe(401)
      expect(payload.error).toBe('admin_auth_required')
      expect(payload.remediation.code).toBe('admin_auth_required')
    }
    finally {
      server.stop(true)
    }
  })

  test('reports bootstrap metadata without exposing the admin token value', () => {
    const status = adminBootstrapStatus('control-plane', {
      AIWORKER_CONTROL_PLANE_DIR: '/tmp/aiworker-control-plane',
      AIWORKER_WEB_ADMIN_TOKEN: 'secret-admin-token',
      AIWORKER_WEB_ALLOW_REMOTE: '1',
      AIWORKER_WEB_HOST: '0.0.0.0',
    })

    expect(status).toEqual({
      adminTokenRequired: true,
      auth: {
        authenticated: false,
        loginRequired: true,
        loginUrl: '/login',
        logoutUrl: '/logout',
        mode: 'locked',
        remediationCode: 'admin_auth_required',
      },
      controlPlaneDirConfigured: true,
      host: '0.0.0.0',
      remoteAccessEnabled: true,
      source: 'control-plane',
    })
    expect(JSON.stringify(status)).not.toContain('secret-admin-token')
  })

  test('resolves the default CLI command from the monorepo root, not Web cwd', () => {
    const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
    const invocation = resolveAiworkerCliCommand(['apply', '--json'], {})

    expect(invocation.cwd).toBe(repoRoot)
    expect(invocation.command).toEqual([
      'bun',
      path.join(repoRoot, 'apps/aiworker-cli/src/aiworker.ts'),
      'apply',
      '--json',
    ])
  })

  test('summarizes apply readiness from execution output, not embedded plan text', () => {
    const payload = summarizeApplyJobResult('asn-1', 0, JSON.stringify({
      plan: {
        aissh: {
          script: 'printf AIWORKER_PROVIDER_WARNING only when provider readiness fails',
        },
      },
      status: 'executed',
      stderr: '',
      stdout: [
        'Local Daemon      running',
        'Connected Daemon  reachable',
        'AIWORKER_HANDOFF_READY: run paseo daemon pair',
      ].join('\n'),
    }), '')

    expect(payload.status).toBe('completed')
    expect(payload.remediation).toBeUndefined()
    expect(payload.steps.find(step => step.id === 'provider')?.status).toBe('done')
    expect(payload.steps.find(step => step.id === 'handoff')?.status).toBe('done')
  })

  test('keeps SPA fallback paths inside the static root', () => {
    expect(resolveStaticPath('/')).toBe(`${staticRoot()}/index.html`)
    expect(resolveStaticPath('/admin/../assets/app.js')).toBe(`${staticRoot()}/assets/app.js`)
    expect(resolveStaticPath('/../../etc/passwd')).toBe(`${staticRoot()}/etc/passwd`)
  })

  test('rejects malformed encoded paths before static resolution', () => {
    expect(resolveStaticPath('/%E0%A4%A')).toBeNull()
  })

  test('rejects state-changing methods at the static boundary', async () => {
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/assignments`, {
        method: 'POST',
      })

      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET, HEAD')
      expect(response.headers.get('x-aiworker-boundary')).toBe('admin-control-plane-only')
    }
    finally {
      server.stop(true)
    }
  })

  test('maps production asset content types', () => {
    expect(contentType('index.html')).toBe('text/html; charset=utf-8')
    expect(contentType('assets/app.css')).toBe('text/css; charset=utf-8')
    expect(contentType('assets/app.woff2')).toBe('font/woff2')
  })

  test('handles admin API requests through the shared runtime handler without HTML fallback', async () => {
    const response = await handleAdminRuntimeRequest(new Request('http://127.0.0.1:20831/api/admin-data'), {})

    if (!response)
      throw new Error('admin runtime handler did not handle /api/admin-data')

    const body = await response.text()
    const payload = JSON.parse(body)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body).not.toContain('<!doctype')
    expect(payload.source).toBe('fixture')
  })

  test('lists on-disk soul descriptors for the registration form', () => {
    const catalog = readSoulCatalog({})

    expect(catalog.length).toBeGreaterThan(0)
    const freeform = catalog.find(entry => entry.id === 'aiworker-freeform')
    expect(freeform).toBeDefined()
    expect(freeform?.descriptorRef).toEndWith('souls/aiworker-freeform/dist/soul.descriptor.json')
    expect(freeform?.soulReleaseRef).toBe(`aiworker-freeform@${freeform?.version}`)
    for (const entry of catalog)
      expect(entry.descriptorRef).toEndWith('soul.descriptor.json')
  })

  test('serves the soul catalog through the admin runtime handler', async () => {
    const response = await handleAdminRuntimeRequest(new Request('http://127.0.0.1:20831/api/soul-catalog'), {})

    if (!response)
      throw new Error('admin runtime handler did not handle /api/soul-catalog')

    const payload = JSON.parse(await response.text()) as { souls: Array<{ descriptorRef: string, id: string }> }

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(Array.isArray(payload.souls)).toBe(true)
    expect(payload.souls.some(entry => entry.id === 'aiworker-freeform')).toBe(true)
  })

  test('rejects non-GET methods on the soul catalog endpoint', async () => {
    const response = await handleAdminRuntimeRequest(
      new Request('http://127.0.0.1:20831/api/soul-catalog', { method: 'POST' }),
      {},
    )

    if (!response)
      throw new Error('admin runtime handler did not handle /api/soul-catalog POST')

    expect(response.status).toBe(405)
  })

  test('serves admin API JSON from the Vite dev server, defaulting to the central-home control plane', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousHome = process.env.AIWORKER_HOME
    delete process.env.AIWORKER_CONTROL_PLANE_DIR
    // Point the boot default at a throwaway home so the dev server resolves an
    // (empty) real control plane instead of the demo fixture, without ever
    // touching the operator's real ~/.aiworker.
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-web-dev-home-'))
    process.env.AIWORKER_HOME = home

    const appRoot = path.resolve(import.meta.dirname, '..')
    const vite = await createViteDevServer({
      configFile: path.join(appRoot, 'vite.config.ts'),
      logLevel: 'silent',
      root: appRoot,
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    })

    try {
      await vite.listen()
      const baseUrl = vite.resolvedUrls?.local[0]
      if (!baseUrl)
        throw new Error('Vite did not report a local dev URL')

      const response = await fetch(new URL('/api/admin-data', baseUrl))
      const body = await response.text()
      const payload = JSON.parse(body)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(body).not.toContain('<!doctype')
      // The boot layer wired <AIWORKER_HOME>/control-plane before serving, so the
      // dev server reads live (empty) control-plane data rather than demo mode.
      expect(payload.source).toBe('control-plane')

      const mutationFallback = await fetch(new URL('/assignments', baseUrl), {
        method: 'POST',
      })
      expect(mutationFallback.status).toBe(405)
      expect(mutationFallback.headers.get('allow')).toBe('GET, HEAD')
    }
    finally {
      await vite.close()
      rmSync(home, { force: true, recursive: true })
      if (previousDir === undefined)
        delete process.env.AIWORKER_CONTROL_PLANE_DIR
      else
        process.env.AIWORKER_CONTROL_PLANE_DIR = previousDir
      if (previousHome === undefined)
        delete process.env.AIWORKER_HOME
      else
        process.env.AIWORKER_HOME = previousHome
    }
  })

  test('reports control-plane load failures as unavailable instead of fixture preview', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-invalid-control-plane-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    await writeFile(path.join(root, 'snapshot.json'), JSON.stringify({
      ...createEmptyControlPlaneSnapshot(),
      schemaVersion: 999,
    }))
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/admin-data`)
      const payload = await response.json()

      expect(response.status).toBe(500)
      expect(payload.error).toBe('control_plane_unavailable')
      expect(payload.source).toBeUndefined()
      expect(payload.snapshot).toBeUndefined()
    }
    finally {
      server.stop(true)
      if (previousDir === undefined)
        delete process.env.AIWORKER_CONTROL_PLANE_DIR
      else
        process.env.AIWORKER_CONTROL_PLANE_DIR = previousDir
    }
  })

  test('serves real control-plane data and persists approval decisions through thin API', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const previousFakeMode = process.env.FAKE_AIWORKER_MODE
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-control-plane-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    const environment = {
      daemonEndpoint: '127.0.0.1:42057',
      daemonHostRef: '127.0.0.1:42057',
      daemonListenRef: '127.0.0.1:42057',
      endpointKind: 'tcp' as const,
      environmentId: 'env-api',
      isolation: 'os-user' as const,
      ownerEmail: 'ops-admin@example.com',
      paseoHome: '$HOME/.aiworker/alice-example.com/.paseo',
      providerProfileIds: ['codex-default'],
      targetRef: 'aissh:server-1',
      topologyKind: 'owner-scoped-paseo-home-v1' as const,
    }
    const providerProfile = {
      baseUrl: 'https://provider.example.local',
      id: 'codex-default',
      label: 'Codex Default',
      model: 'gpt-test',
      provider: 'codex',
      secretRef: 'secret://providers/codex/default',
    }
    const soul = {
      descriptorRef: path.join(root, 'custom-soul.descriptor.json'),
      displayName: 'AIWorker Freeform',
      files: [{ content: '# Freeform\n', relativePath: 'AGENTS.md' }],
      id: 'aiworker-freeform',
      version: '1.0.0',
    }
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: `${soul.id}@${soul.version}`,
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/aiworker-freeform',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })
    await writeFile(soul.descriptorRef, '{"schemaVersion":"soul/v1","identity":{"id":"aiworker-freeform","version":"1.0.0"},"protocol":{"runtime":"paseo-workspace"},"workspaceTemplate":{"files":[]}}\n')
    const store = new LocalFileControlPlaneStore(root)
    await store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [{ ...plan.assignment, status: 'draft' }],
      environments: [environment],
      providerProfiles: [providerProfile],
      receipts: [createProvisionReceipt(plan, { status: 'applied' })],
      soulReleases: [soul],
    })
    const server = createServer({ port: 0 })

    try {
      const dataResponse = await fetch(`http://127.0.0.1:${server.port}/api/admin-data`)
      const payload = await dataResponse.json()

      expect(dataResponse.status).toBe(200)
      expect(payload.source).toBe('control-plane')
      expect(payload.bootstrap).toMatchObject({
        adminTokenRequired: false,
        controlPlaneDirConfigured: true,
        source: 'control-plane',
      })
      expect(payload.snapshot.assignments[0].assignmentId).toBe(assignment.assignmentId)

      const approvalResponse = await fetch(`http://127.0.0.1:${server.port}/api/approvals/${assignment.assignmentId}`, {
        body: JSON.stringify({ note: '可以交付', reviewer: 'ops@example.com', status: 'approved' }),
        method: 'POST',
      })
      expect(approvalResponse.status).toBe(403)

      const crossOriginApprovalResponse = await fetch(`http://127.0.0.1:${server.port}/api/approvals/${assignment.assignmentId}`, {
        body: JSON.stringify({ note: '可以交付', reviewer: 'ops@example.com', status: 'approved' }),
        headers: { 'origin': 'https://evil.example', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      expect(crossOriginApprovalResponse.status).toBe(403)

      const guardedApprovalResponse = await fetch(`http://127.0.0.1:${server.port}/api/approvals/${assignment.assignmentId}`, {
        body: JSON.stringify({ note: '可以交付', reviewer: 'ops@example.com', status: 'approved' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const approvalPayload = await guardedApprovalResponse.json()

      expect(guardedApprovalResponse.status).toBe(200)
      expect(approvalPayload.approval.status).toBe('approved')
      expect(approvalPayload.approval.assignmentId).toBe(assignment.assignmentId)
      expect(JSON.stringify(approvalPayload)).not.toContain('offer=')

      const fakeCli = path.join(root, 'fake-aiworker-cli')
      const fakeArgs = path.join(root, 'fake-aiworker-cli.args')
      await writeFile(fakeCli, [
        '#!/bin/sh',
        `printf '%s\\n' "$*" >> ${fakeArgs}`,
        'case "$1" in',
        '  apply)',
        '    control_plane_dir=""',
        '    assignment_id=""',
        '    while [ "$#" -gt 0 ]; do',
        '      case "$1" in',
        '        --control-plane-dir)',
        '          shift; control_plane_dir="$1"',
        '          ;;',
        '        --assignment-id)',
        '          shift; assignment_id="$1"',
        '          ;;',
        '      esac',
        '      shift',
        '    done',
        '    case "$FAKE_AIWORKER_MODE" in',
        '      missing-aissh-token)',
        '        printf \'%s\\n\' \'AISSH_TOKEN is required for real execution\' >&2',
        '        exit 2',
        '        ;;',
        '      paseo-daemon-down)',
        '        printf \'%s\\n\' \'Paseo daemon not reachable: connection refused\' >&2',
        '        exit 3',
        '        ;;',
        '    esac',
        '    node - "$control_plane_dir" "$assignment_id" <<\\NODE',
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        'const [root, assignmentId] = process.argv.slice(2);',
        'const snapshotPath = path.join(root, "snapshot.json");',
        'const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));',
        'const ownerRootFor = (assignment) => assignment.workspaceRef.replace(/\\/projects\\/[^/]+$/, "");',
        'snapshot.assignments = snapshot.assignments.map((assignment) => assignment.assignmentId === assignmentId ? {',
        '  ...assignment,',
        '  status: "needs_attention",',
        '  handoff: {',
        '    kind: "paseo-daemon",',
        '    daemonEndpoint: "127.0.0.1:42057",',
        '    workspaceRef: assignment.workspaceRef,',
        '    instructions: "fake handoff ready: paseo --host 127.0.0.1:42057 " + assignment.workspaceRef,',
        '  },',
        '} : assignment);',
        'fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\\n");',
        'NODE',
        '    printf \'%s\\n\' \'{"status":"executed","stdout":"Local Daemon      running\\nConnected Daemon  reachable\\nAIWORKER_PROVIDER_WARNING: provider needs login\\nAIWORKER_HANDOFF_READY: run paseo daemon pair --home \\\\\\"$PASEO_HOME\\\\\\"","stderr":""}\'',
        '    ;;',
        '  pair)',
        '    printf \'%s\\n\' \'{"status":"paired","stdout":"Paseo pairing response\\nhttps://relay.paseo.example/#offer=real-token","stderr":"stderr pairing note"}\'',
        '    ;;',
        '  *)',
        '    exit 64',
        '    ;;',
        'esac',
      ].join('\n'))
      await chmod(fakeCli, 0o755)
      process.env.AIWORKER_CLI_BIN = fakeCli

      const preApplyPairResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments/${assignment.assignmentId}/pair`, {
        headers: { 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      expect(preApplyPairResponse.status).toBe(409)
      expect(await preApplyPairResponse.text()).toContain('handoff_not_ready')

      const applyResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments/${assignment.assignmentId}/apply`, {
        headers: { 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const applyPayload = await applyResponse.json()
      const applySerialized = JSON.stringify(applyPayload)

      expect(applyResponse.status).toBe(200)
      expect(applyPayload.job.status).toBe('completed')
      expect(applyPayload.job.remediation.code).toBe('provider_auth_required')
      expect(applyPayload.job.steps.map((step: { status: string }) => step.status)).toContain('needs_attention')
      expect(applySerialized).not.toContain('AIWORKER_HANDOFF_READY')
      expect(applySerialized).not.toContain('Local Daemon')
      expect(applySerialized).not.toContain('offer=')
      const applyArgs = await readFile(fakeArgs, 'utf8')
      expect(applyArgs).toContain('--target-owner ops-admin@example.com')
      expect(applyArgs).toContain('--provider-secret-ref secret://providers/codex/default')
      expect(applyArgs).toContain('--provider-base-url https://provider.example.local')
      expect(applyArgs).toContain('--provider-model gpt-test')
      expect(applyArgs).toContain(`--assignment-id ${assignment.assignmentId}`)
      expect(applyArgs).toContain(`--soul ${soul.descriptorRef}`)
      expect(applyArgs).not.toContain('souls/aiworker-freeform')
      const snapshotAfterApply = await store.loadSnapshot()
      const assignmentAfterApply = snapshotAfterApply.assignments.find(item => item.assignmentId === assignment.assignmentId)
      expect(assignmentAfterApply?.status).toBe('needs_attention')
      expect(assignmentAfterApply?.handoff?.workspaceRef).toBe(assignment.workspaceRef)

      process.env.FAKE_AIWORKER_MODE = 'missing-aissh-token'
      const failedApplyResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments/${assignment.assignmentId}/apply`, {
        headers: { 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const failedApplyPayload = await failedApplyResponse.json()
      expect(failedApplyResponse.status).toBe(200)
      expect(failedApplyPayload.job.status).toBe('failed')
      expect(failedApplyPayload.job.remediation.code).toBe('aissh_token_missing')
      expect(JSON.stringify(failedApplyPayload)).not.toContain('AISSH_TOKEN is required')
      delete process.env.FAKE_AIWORKER_MODE

      await store.saveSnapshot({
        ...await store.loadSnapshot(),
        soulReleases: [{ ...soul, descriptorRef: path.join(root, 'missing-soul.descriptor.json') }],
      })
      const missingDescriptorResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments/${assignment.assignmentId}/apply`, {
        headers: { 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const missingDescriptorPayload = await missingDescriptorResponse.json()
      expect(missingDescriptorResponse.status).toBe(409)
      expect(missingDescriptorPayload.error).toBe('soul_descriptor_missing')
      expect(missingDescriptorPayload.remediation.nextSteps.join(' ')).toContain('请技术支持重新发布')
      await store.saveSnapshot({
        ...await store.loadSnapshot(),
        soulReleases: [soul],
      })

      const pairResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments/${assignment.assignmentId}/pair`, {
        headers: {
          'origin': `https://127.0.0.1:${server.port}`,
          'x-aiworker-admin-action': '1',
        },
        method: 'POST',
      })
      const pairPayload = await pairResponse.json()
      const pairSerialized = JSON.stringify(pairPayload)

      expect(pairResponse.status).toBe(200)
      expect(pairPayload.pair.status).toBe('paired')
      expect(pairPayload.pair.pairingOutput).toContain('https://relay.paseo.example/#offer=real-token')
      expect(pairPayload.pair.pairingOutput).toContain('stderr pairing note')
      expect(pairPayload.pair).not.toHaveProperty('stdout')
      expect(pairPayload.pair).not.toHaveProperty('stderr')
      const pairArgs = await readFile(fakeArgs, 'utf8')
      expect(pairArgs).toContain('--target-owner ops-admin@example.com')
      expect(pairSerialized).toContain('#offer=real-token')
      expect(pairSerialized).not.toContain('set -euo')
      expect(await readFile(path.join(root, 'approvals.jsonl'), 'utf8')).not.toContain('offer=')
      expect(JSON.stringify(await store.loadSnapshot())).not.toContain('offer=')
    }
    finally {
      server.stop(true)
      if (previousDir === undefined)
        delete process.env.AIWORKER_CONTROL_PLANE_DIR
      else
        process.env.AIWORKER_CONTROL_PLANE_DIR = previousDir
      if (previousCli === undefined)
        delete process.env.AIWORKER_CLI_BIN
      else
        process.env.AIWORKER_CLI_BIN = previousCli
      if (previousFakeMode === undefined)
        delete process.env.FAKE_AIWORKER_MODE
      else
        process.env.FAKE_AIWORKER_MODE = previousFakeMode
    }
  })

  test('requires the configured admin token for mutation endpoints without leaking it', async () => {
    const previousToken = process.env.AIWORKER_WEB_ADMIN_TOKEN
    process.env.AIWORKER_WEB_ADMIN_TOKEN = 'expected-admin-token'
    const server = createServer({ port: 0 })

    try {
      const missingToken = await fetch(`http://127.0.0.1:${server.port}/api/assignments/asn-token/apply`, {
        headers: { 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const missingPayload = await missingToken.json()
      expect(missingToken.status).toBe(401)
      expect(missingPayload.error).toBe('admin_token_required')
      expect(JSON.stringify(missingPayload)).not.toContain('expected-admin-token')

      const wrongToken = await fetch(`http://127.0.0.1:${server.port}/api/assignments/asn-token/apply`, {
        headers: { 'authorization': 'Bearer wrong-token', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      expect(wrongToken.status).toBe(401)
    }
    finally {
      server.stop(true)
      if (previousToken === undefined)
        delete process.env.AIWORKER_WEB_ADMIN_TOKEN
      else
        process.env.AIWORKER_WEB_ADMIN_TOKEN = previousToken
    }
  })

  test('fails closed for partial Logto configuration', async () => {
    process.env.LOGTO_ENDPOINT = 'https://auth.example.com'
    process.env.LOGTO_CLIENT_ID = 'partial-client'
    const server = createServer({ port: 0 })

    try {
      const api = await fetch(`http://127.0.0.1:${server.port}/api/admin-data`)
      const apiPayload = await api.json()
      expect(api.status).toBe(503)
      expect(apiPayload.error).toBe('admin_auth_misconfigured')

      const html = await fetch(`http://127.0.0.1:${server.port}/`, {
        headers: { accept: 'text/html' },
        redirect: 'manual',
      })
      expect(html.status).toBe(503)
      expect(await html.text()).toContain('authentication is misconfigured')
    }
    finally {
      server.stop(true)
    }
  })

  test('requires Logto for browser and API reads but keeps admin token automation fallback', async () => {
    const logto = startFakeLogto()
    const server = createServer({ port: 0 })
    process.env.LOGTO_ENDPOINT = logto.baseUrl
    process.env.LOGTO_CLIENT_ID = 'aiworker-web'
    process.env.LOGTO_CLIENT_SECRET = 'client-secret'
    process.env.LOGTO_COOKIE_SECRET = 'cookie-secret-cookie-secret'
    process.env.LOGTO_BASE_URL = `http://127.0.0.1:${server.port}`
    process.env.LOGTO_ALLOWED_EMAIL_DOMAINS = 'zonease.org'
    process.env.AIWORKER_WEB_ADMIN_TOKEN = 'automation-token'

    try {
      const html = await fetch(`http://127.0.0.1:${server.port}/provisioning`, {
        headers: { accept: 'text/html' },
        redirect: 'manual',
      })
      expect(html.status).toBe(302)
      expect(html.headers.get('location')).toBe('/login?returnTo=%2Fprovisioning')

      const api = await fetch(`http://127.0.0.1:${server.port}/api/admin-data`)
      const apiPayload = await api.json()
      expect(api.status).toBe(401)
      expect(apiPayload.error).toBe('admin_auth_required')

      const tokenApi = await fetch(`http://127.0.0.1:${server.port}/api/admin-data`, {
        headers: { authorization: 'Bearer automation-token' },
      })
      const tokenPayload = await tokenApi.json()
      expect(tokenApi.status).toBe(200)
      expect(tokenPayload.bootstrap.auth.mode).toBe('logto')
      expect(tokenPayload.bootstrap.auth.authenticated).toBe(true)
      expect(tokenPayload.bootstrap.auth.via).toBe('token')

      const login = await fetch(`http://127.0.0.1:${server.port}/login?returnTo=/provisioning`, {
        redirect: 'manual',
      })
      expect(login.status).toBe(302)
      const loginCookie = cookiePair(login.headers.get('set-cookie'), 'aiworker_logto_state')
      const authUrl = new URL(login.headers.get('location')!)
      expect(authUrl.origin).toBe(logto.baseUrl)
      expect(authUrl.pathname).toBe('/oidc/auth')
      expect(authUrl.searchParams.get('client_id')).toBe('aiworker-web')
      const state = authUrl.searchParams.get('state')
      expect(state).toBeTruthy()

      const callback = await fetch(`http://127.0.0.1:${server.port}/callback?code=ok&state=${encodeURIComponent(state!)}`, {
        headers: { cookie: loginCookie },
        redirect: 'manual',
      })
      expect(callback.status).toBe(302)
      expect(callback.headers.get('location')).toBe('/provisioning')
      const sessionCookie = cookiePair(callback.headers.get('set-cookie'), 'aiworker_admin_session')

      const authedApi = await fetch(`http://127.0.0.1:${server.port}/api/admin-data`, {
        headers: { cookie: sessionCookie },
      })
      const authedPayload = await authedApi.json()
      expect(authedApi.status).toBe(200)
      expect(authedPayload.bootstrap.auth.authenticated).toBe(true)
      expect(authedPayload.bootstrap.auth.userEmail).toBe('admin@zonease.org')
    }
    finally {
      server.stop(true)
      logto.server.stop(true)
    }
  })

  test('keeps Logto state and callback on the configured external origin', async () => {
    const logto = startFakeLogto()
    const server = createServer({ port: 0 })
    const publicBaseUrl = 'https://20831--main--ben--ben.coder.tbc.5ok.co'
    const publicHost = new URL(publicBaseUrl).host
    process.env.LOGTO_ENDPOINT = logto.baseUrl
    process.env.LOGTO_CLIENT_ID = 'aiworker-web'
    process.env.LOGTO_CLIENT_SECRET = 'client-secret'
    process.env.LOGTO_COOKIE_SECRET = 'cookie-secret-cookie-secret'
    process.env.LOGTO_BASE_URL = publicBaseUrl
    process.env.LOGTO_ALLOWED_EMAIL_DOMAINS = 'zonease.org'

    try {
      const loopbackLogin = await fetch(`http://127.0.0.1:${server.port}/login?returnTo=/provisioning`, {
        redirect: 'manual',
      })
      expect(loopbackLogin.status).toBe(302)
      expect(loopbackLogin.headers.get('location')).toBe(`${publicBaseUrl}/login?returnTo=/provisioning`)
      expect(loopbackLogin.headers.get('set-cookie')).toBeNull()

      const proxiedLogin = await fetch(`http://127.0.0.1:${server.port}/login?returnTo=/provisioning`, {
        headers: {
          'x-forwarded-host': publicHost,
          'x-forwarded-proto': 'https',
        },
        redirect: 'manual',
      })
      expect(proxiedLogin.status).toBe(302)
      const proxiedStateCookie = proxiedLogin.headers.get('set-cookie')
      expect(cookiePair(proxiedStateCookie, 'aiworker_logto_state')).toStartWith('aiworker_logto_state=')
      expect(proxiedStateCookie).toContain('Secure')
      expect(proxiedStateCookie).toContain('SameSite=Lax')
      const authUrl = new URL(proxiedLogin.headers.get('location')!)
      expect(authUrl.origin).toBe(logto.baseUrl)
      expect(authUrl.searchParams.get('redirect_uri')).toBe(`${publicBaseUrl}/callback`)

      const hostOnlyLogin = await fetch(`http://127.0.0.1:${server.port}/login?returnTo=/provisioning`, {
        headers: { host: publicHost },
        redirect: 'manual',
      })
      expect(hostOnlyLogin.status).toBe(302)
      expect(hostOnlyLogin.headers.get('location')).toStartWith(`${logto.baseUrl}/oidc/auth?`)
      expect(cookiePair(hostOnlyLogin.headers.get('set-cookie'), 'aiworker_logto_state')).toStartWith('aiworker_logto_state=')
    }
    finally {
      server.stop(true)
      logto.server.stop(true)
    }
  })

  test('authors assignment, environment, provider, and soul metadata through thin create endpoints', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const previousFakeMode = process.env.FAKE_AIWORKER_CREATE_MODE
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-create-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    await new LocalFileControlPlaneStore(root).saveSnapshot(createEmptyControlPlaneSnapshot())

    const fakeCli = path.join(root, 'fake-create-cli')
    const fakeArgs = path.join(root, 'fake-create-cli.args')
    await writeFile(fakeCli, [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${fakeArgs}`,
      'if [ "$FAKE_AIWORKER_CREATE_MODE" = "fail" ]; then',
      '  printf \'%s\\n\' \'metadata command failed\' >&2',
      '  exit 7',
      'fi',
      'case "$1 $2" in',
      '  "assignment create")',
      '    printf \'%s\\n\' \'{"assignmentId":"asn-created","assignedEmail":"alice@example.com","environmentId":"env-alice","providerProfileId":"codex-default","soulReleaseRef":"aiworker-freeform@1.0.0","workspaceRef":"$HOME/.aiworker/alice-example.com/projects/aiworker-freeform","status":"draft"}\'',
      '    ;;',
      '  "environment create")',
      '    printf \'%s\\n\' \'{"environmentId":"env-alice","ownerEmail":"alice@example.com","targetRef":"aissh:server-1"}\'',
      '    ;;',
      '  "provider create")',
      '    printf \'%s\\n\' \'{"id":"codex-default","provider":"codex","secretRef":"secret://providers/codex/default"}\'',
      '    ;;',
      '  "soul register")',
      '    printf \'%s\\n\' \'{"id":"aiworker-freeform","version":"1.0.0","displayName":"AIWorker Freeform","files":[]}\'',
      '    ;;',
      '  *)',
      '    exit 64',
      '    ;;',
      'esac',
    ].join('\n'))
    await chmod(fakeCli, 0o755)
    process.env.AIWORKER_CLI_BIN = fakeCli
    const server = createServer({ port: 0 })

    try {
      const assignmentResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments`, {
        body: JSON.stringify({ environment: 'env-alice', provider: 'codex-default', soulReleaseRef: 'aiworker-freeform@1.0.0', user: 'alice@example.com' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const assignmentPayload = await assignmentResponse.json()
      expect(assignmentResponse.status).toBe(200)
      expect(assignmentPayload.assignment.assignmentId).toBe('asn-created')

      const environmentResponse = await fetch(`http://127.0.0.1:${server.port}/api/environments`, {
        body: JSON.stringify({ environment: 'env-alice', provider: 'codex-default', target: 'aissh:server-1', user: 'alice@example.com' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const environmentPayload = await environmentResponse.json()
      expect(environmentResponse.status).toBe(200)
      expect(environmentPayload.environment.environmentId).toBe('env-alice')

      const providerResponse = await fetch(`http://127.0.0.1:${server.port}/api/providers`, {
        body: JSON.stringify({ provider: 'codex-default', providerKind: 'codex', secretRef: 'secret://providers/codex/default' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const providerPayload = await providerResponse.json()
      expect(providerResponse.status).toBe(200)
      expect(providerPayload.provider.id).toBe('codex-default')

      const soulResponse = await fetch(`http://127.0.0.1:${server.port}/api/soul-releases`, {
        body: JSON.stringify({ soul: 'souls/aiworker-freeform/dist/soul.descriptor.json' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const soulPayload = await soulResponse.json()
      expect(soulResponse.status).toBe(200)
      expect(soulPayload.soulRelease.id).toBe('aiworker-freeform')

      const recordedArgs = await readFile(fakeArgs, 'utf8')
      expect(recordedArgs).toContain('assignment create --json --control-plane-dir')
      expect(recordedArgs).toContain('environment create --json --control-plane-dir')
      expect(recordedArgs).toContain('provider create --json --control-plane-dir')
      expect(recordedArgs).toContain('soul register --json --control-plane-dir')
    }
    finally {
      server.stop(true)
      restoreEnv('AIWORKER_CONTROL_PLANE_DIR', previousDir)
      restoreEnv('AIWORKER_CLI_BIN', previousCli)
      restoreEnv('FAKE_AIWORKER_CREATE_MODE', previousFakeMode)
    }
  })

  test('returns 409 when create endpoints lack a configured control-plane directory', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    delete process.env.AIWORKER_CONTROL_PLANE_DIR
    const server = createServer({ port: 0 })

    try {
      for (const route of ['assignments', 'environments', 'soul-releases']) {
        const response = await fetch(`http://127.0.0.1:${server.port}/api/${route}`, {
          body: JSON.stringify({}),
          headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
          method: 'POST',
        })
        const payload = await response.json()
        expect(response.status).toBe(409)
        expect(payload.error).toBe('control_plane_dir_required')
      }

      const providerResponse = await fetch(`http://127.0.0.1:${server.port}/api/providers`, {
        body: JSON.stringify({ provider: 'codex-default', secretRef: 'secret://providers/codex/default' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const providerPayload = await providerResponse.json()
      expect(providerResponse.status).toBe(409)
      expect(providerPayload.error).toBe('control_plane_dir_required')
    }
    finally {
      server.stop(true)
      restoreEnv('AIWORKER_CONTROL_PLANE_DIR', previousDir)
    }
  })

  test('rejects literal provider secrets before spawning the CLI', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-secret-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    await new LocalFileControlPlaneStore(root).saveSnapshot(createEmptyControlPlaneSnapshot())

    const fakeCli = path.join(root, 'fake-secret-cli')
    const fakeArgs = path.join(root, 'fake-secret-cli.args')
    await writeFile(fakeCli, ['#!/bin/sh', `printf '%s\\n' "$*" >> ${fakeArgs}`, 'exit 0'].join('\n'))
    await chmod(fakeCli, 0o755)
    process.env.AIWORKER_CLI_BIN = fakeCli
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/providers`, {
        body: JSON.stringify({ provider: 'codex-default', providerKind: 'codex', secretRef: `s${'k'}-literal-secret-value` }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const payload = await response.json()
      expect(response.status).toBe(400)
      expect(payload.error).toBe('provider_secret_ref_invalid')
      expect(JSON.stringify(payload)).not.toContain('literal-secret-value')
      expect(await readFile(fakeArgs, 'utf8').catch(() => '')).toBe('')
    }
    finally {
      server.stop(true)
      restoreEnv('AIWORKER_CONTROL_PLANE_DIR', previousDir)
      restoreEnv('AIWORKER_CLI_BIN', previousCli)
    }
  })

  test('previews provisioning plans read-only without mutating the control-plane snapshot', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-plan-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    const store = new LocalFileControlPlaneStore(root)
    await store.saveSnapshot(createEmptyControlPlaneSnapshot())
    const snapshotPath = path.join(root, 'snapshot.json')
    const snapshotBefore = await readFile(snapshotPath)
    const descriptorPath = path.join(root, 'plan-soul.descriptor.json')
    await writeFile(descriptorPath, '{"schemaVersion":"soul/v1","identity":{"id":"aiworker-freeform","version":"1.0.0"},"protocol":{"runtime":"paseo-workspace"},"workspaceTemplate":{"root":"workspace-template","files":[]}}\n')

    const fakeCli = path.join(root, 'fake-plan-cli')
    const fakeArgs = path.join(root, 'fake-plan-cli.args')
    await writeFile(fakeCli, [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${fakeArgs}`,
      'if [ "$1" = "plan" ]; then',
      '  printf \'%s\\n\' \'{"assignment":{"assignmentId":"asn-preview"},"environment":{"environmentId":"env-alice"}}\'',
      '  exit 0',
      'fi',
      'exit 64',
    ].join('\n'))
    await chmod(fakeCli, 0o755)
    process.env.AIWORKER_CLI_BIN = fakeCli
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
        body: JSON.stringify({ environment: 'env-alice', provider: 'codex-default', soul: descriptorPath, target: 'aissh:server-1', user: 'alice@example.com' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const payload = await response.json()
      expect(response.status).toBe(200)
      expect(payload.plan.assignment.assignmentId).toBe('asn-preview')

      const recordedArgs = await readFile(fakeArgs, 'utf8')
      expect(recordedArgs).toContain('plan --json')
      expect(recordedArgs).not.toContain('--control-plane-dir')
      expect(recordedArgs).not.toContain('apply')

      const snapshotAfter = await readFile(snapshotPath)
      expect(snapshotAfter.equals(snapshotBefore)).toBe(true)
    }
    finally {
      server.stop(true)
      restoreEnv('AIWORKER_CONTROL_PLANE_DIR', previousDir)
      restoreEnv('AIWORKER_CLI_BIN', previousCli)
    }
  })

  test('enriches plan preview args from the snapshot environment so plan --json gets --target-owner', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-plan-enrich-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    const store = new LocalFileControlPlaneStore(root)
    await store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      environments: [{
        environmentId: 'env-alice',
        targetRef: 'aissh:alice-box',
        ownerEmail: 'owner@example.com',
        paseoHome: '$HOME/.paseo/alice',
        endpointKind: 'local-home',
        isolation: 'os-user',
        daemonEndpoint: '$HOME/.paseo/alice/daemon.sock',
        providerProfileIds: ['codex-default'],
      }],
    })
    const snapshotPath = path.join(root, 'snapshot.json')
    const snapshotBefore = await readFile(snapshotPath)
    const descriptorPath = path.join(root, 'plan-soul.descriptor.json')
    await writeFile(descriptorPath, '{"schemaVersion":"soul/v1","identity":{"id":"aiworker-freeform","version":"1.0.0"},"protocol":{"runtime":"paseo-workspace"},"workspaceTemplate":{"root":"workspace-template","files":[]}}\n')

    const fakeCli = path.join(root, 'fake-plan-cli')
    const fakeArgs = path.join(root, 'fake-plan-cli.args')
    await writeFile(fakeCli, [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${fakeArgs}`,
      'if [ "$1" = "plan" ]; then',
      '  printf \'%s\\n\' \'{"assignment":{"assignmentId":"asn-preview"},"environment":{"environmentId":"env-alice"}}\'',
      '  exit 0',
      'fi',
      'exit 64',
    ].join('\n'))
    await chmod(fakeCli, 0o755)
    process.env.AIWORKER_CLI_BIN = fakeCli
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
        body: JSON.stringify({ environment: 'env-alice', provider: 'codex-default', soul: descriptorPath, user: 'alice@example.com' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const payload = await response.json()
      expect(response.status).toBe(200)
      expect(payload.plan.assignment.assignmentId).toBe('asn-preview')

      const recordedArgs = await readFile(fakeArgs, 'utf8')
      expect(recordedArgs).toContain('plan --json')
      expect(recordedArgs).toContain('--target aissh:alice-box')
      expect(recordedArgs).toContain('--target-owner owner@example.com')
      expect(recordedArgs).not.toContain('--control-plane-dir')
      expect(recordedArgs).not.toContain('apply')

      const snapshotAfter = await readFile(snapshotPath)
      expect(snapshotAfter.equals(snapshotBefore)).toBe(true)
    }
    finally {
      server.stop(true)
      restoreEnv('AIWORKER_CONTROL_PLANE_DIR', previousDir)
      restoreEnv('AIWORKER_CLI_BIN', previousCli)
    }
  })

  test('preview plan args include --paseo-provider-id when provider has paseoProviderId', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-plan-paseo-provider-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    const store = new LocalFileControlPlaneStore(root)
    await store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      environments: [{
        environmentId: 'env-alice',
        targetRef: 'aissh:alice-box',
        ownerEmail: 'owner@example.com',
        paseoHome: '$HOME/.paseo/alice',
        endpointKind: 'local-home',
        isolation: 'os-user',
        daemonEndpoint: '$HOME/.paseo/alice/daemon.sock',
        providerProfileIds: ['provider-with-paseo'],
      }],
      providerProfiles: [{
        id: 'provider-with-paseo',
        label: 'Provider With Paseo',
        provider: 'claude-code',
        paseoProviderId: 'paseo-provider-xyz',
      }],
    })
    const descriptorPath = path.join(root, 'plan-soul.descriptor.json')
    await writeFile(descriptorPath, '{"schemaVersion":"soul/v1","identity":{"id":"aiworker-freeform","version":"1.0.0"},"protocol":{"runtime":"paseo-workspace"},"workspaceTemplate":{"root":"workspace-template","files":[]}}\n')

    const fakeCli = path.join(root, 'fake-plan-cli')
    const fakeArgs = path.join(root, 'fake-plan-cli.args')
    await writeFile(fakeCli, [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${fakeArgs}`,
      'if [ "$1" = "plan" ]; then',
      '  printf \'%s\\n\' \'{"assignment":{"assignmentId":"asn-preview"},"environment":{"environmentId":"env-alice"}}\'',
      '  exit 0',
      'fi',
      'exit 64',
    ].join('\n'))
    await chmod(fakeCli, 0o755)
    process.env.AIWORKER_CLI_BIN = fakeCli
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
        body: JSON.stringify({ environment: 'env-alice', provider: 'provider-with-paseo', soul: descriptorPath, user: 'alice@example.com' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      expect(response.status).toBe(200)

      const recordedArgs = await readFile(fakeArgs, 'utf8')
      expect(recordedArgs).toContain('--paseo-provider-id paseo-provider-xyz')
      expect(recordedArgs).not.toContain('--control-plane-dir')
      expect(recordedArgs).not.toContain('apply')
    }
    finally {
      server.stop(true)
      restoreEnv('AIWORKER_CONTROL_PLANE_DIR', previousDir)
      restoreEnv('AIWORKER_CLI_BIN', previousCli)
    }
  })

  test('surfaces an error response when a create CLI invocation exits non-zero', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const previousFakeMode = process.env.FAKE_AIWORKER_CREATE_MODE
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-create-fail-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    const failStore = new LocalFileControlPlaneStore(root)
    await failStore.saveSnapshot(createEmptyControlPlaneSnapshot())
    const snapshotBefore = await readFile(path.join(root, 'snapshot.json'))

    const fakeCli = path.join(root, 'fake-fail-cli')
    await writeFile(fakeCli, ['#!/bin/sh', 'printf \'%s\\n\' \'metadata command failed\' >&2', 'exit 7'].join('\n'))
    await chmod(fakeCli, 0o755)
    process.env.AIWORKER_CLI_BIN = fakeCli
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/assignments`, {
        body: JSON.stringify({ environment: 'env-alice', provider: 'codex-default', soulReleaseRef: 'aiworker-freeform@1.0.0', user: 'alice@example.com' }),
        headers: { 'content-type': 'application/json', 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const payload = await response.json()
      expect(response.status).not.toBe(200)
      expect(payload.error).toBeDefined()
      expect(payload.assignment).toBeUndefined()
      const snapshotAfter = await readFile(path.join(root, 'snapshot.json'))
      expect(snapshotAfter.equals(snapshotBefore)).toBe(true)
    }
    finally {
      server.stop(true)
      restoreEnv('AIWORKER_CONTROL_PLANE_DIR', previousDir)
      restoreEnv('AIWORKER_CLI_BIN', previousCli)
      restoreEnv('FAKE_AIWORKER_CREATE_MODE', previousFakeMode)
    }
  })
})

function restoreEnv(key: string, previous: string | undefined): void {
  if (previous === undefined)
    delete process.env[key]
  else
    process.env[key] = previous
}

function startFakeLogto(): { baseUrl: string, server: ReturnType<typeof Bun.serve> } {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const baseUrl = new URL(request.url).origin
      if (url.pathname === '/oidc/.well-known/openid-configuration') {
        return Response.json({
          authorization_endpoint: `${baseUrl}/oidc/auth`,
          issuer: `${baseUrl}/oidc`,
          token_endpoint: `${baseUrl}/oidc/token`,
          userinfo_endpoint: `${baseUrl}/oidc/me`,
        })
      }
      if (url.pathname === '/oidc/token') {
        const body = await request.text()
        expect(body).toContain('grant_type=authorization_code')
        expect(body).toContain('code_verifier=')
        return Response.json({ access_token: 'fake-access-token' })
      }
      if (url.pathname === '/oidc/me') {
        expect(request.headers.get('authorization')).toBe('Bearer fake-access-token')
        return Response.json({
          email: 'admin@zonease.org',
          email_verified: true,
          name: 'Admin User',
          sub: 'usr_admin',
        })
      }
      return new Response('not found', { status: 404 })
    },
  })
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    server,
  }
}

function cookiePair(header: string | null, name: string): string {
  const match = header?.match(new RegExp(`${name}=([^;,]+)`))
  if (!match?.[1])
    throw new Error(`missing ${name} cookie in ${header}`)
  return `${name}=${match[1]}`
}
