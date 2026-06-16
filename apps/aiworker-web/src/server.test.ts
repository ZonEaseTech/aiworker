import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createAssignment,
  createEmptyControlPlaneSnapshot,
  createHandoff,
  createProvisionPlan,
  createProvisionReceipt,
  LocalFileControlPlaneStore,
} from '@zonease/aiworker-control'
import { describe, expect, test } from 'bun:test'

import { assertServerHostAllowed, contentType, createServer, resolveStaticPath, serverHostname, staticRoot } from '@/server'

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

  test('serves real control-plane data and persists approval decisions through thin API', async () => {
    const previousDir = process.env.AIWORKER_CONTROL_PLANE_DIR
    const previousCli = process.env.AIWORKER_CLI_BIN
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-control-plane-'))
    process.env.AIWORKER_CONTROL_PLANE_DIR = root
    const environment = {
      daemonEndpoint: 'paseo-daemon:remote-home',
      endpointKind: 'local-home' as const,
      environmentId: 'env-api',
      isolation: 'os-user' as const,
      ownerEmail: 'alice@example.com',
      paseoHome: '$HOME/.paseo',
      providerProfileIds: ['codex-default'],
      targetRef: 'aissh:server-1',
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
      workspaceRef: '$HOME/aiworker-workspaces/aiworker-freeform',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })
    const store = new LocalFileControlPlaneStore(root)
    await store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [{ ...plan.assignment, handoff: createHandoff(environment, plan.assignment.workspaceRef), status: 'draft' }],
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

      const applyResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments/${assignment.assignmentId}/apply`, {
        headers: { 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      const applyPayload = await applyResponse.json()
      const applySerialized = JSON.stringify(applyPayload)

      expect(applyResponse.status).toBe(200)
      expect(applyPayload.job.status).toBe('completed')
      expect(applyPayload.job.steps.map((step: { status: string }) => step.status)).toContain('needs_attention')
      expect(applySerialized).not.toContain('AIWORKER_HANDOFF_READY')
      expect(applySerialized).not.toContain('Local Daemon')
      expect(applySerialized).not.toContain('offer=')
      const applyArgs = await readFile(fakeArgs, 'utf8')
      expect(applyArgs).toContain('--provider-secret-ref secret://providers/codex/default')
      expect(applyArgs).toContain('--provider-base-url https://provider.example.local')
      expect(applyArgs).toContain('--provider-model gpt-test')
      expect(applyArgs).toContain(`--soul ${soul.descriptorRef}`)
      expect(applyArgs).not.toContain('souls/aiworker-freeform')

      const prematurePairResponse = await fetch(`http://127.0.0.1:${server.port}/api/assignments/${assignment.assignmentId}/pair`, {
        headers: { 'x-aiworker-admin-action': '1' },
        method: 'POST',
      })
      expect(prematurePairResponse.status).toBe(409)
      expect(await prematurePairResponse.text()).toContain('handoff-ready')

      await store.saveSnapshot({
        ...await store.loadSnapshot(),
        assignments: [{ ...assignment, handoff: createHandoff(environment, assignment.workspaceRef), status: 'handoff_ready' }],
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
    }
  })
})
