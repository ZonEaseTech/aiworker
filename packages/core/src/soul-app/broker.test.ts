import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { hrSoulAppManifest } from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  initWorkerDb,
  listSoulAppAuditEvents,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createSoulAppBroker } from './broker'
import { enableSoulApp, installSoulAppManifest } from './registry'

describe('Soul App isolation broker', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(path.join(tmpdir(), 'aiworker-soul-app-broker-'))
    initWorkerDb(path.join(dir, 'worker.db'))
    runWorkerMigrations()
    installSoulAppManifest({
      manifest: hrSoulAppManifest,
      sourceKind: 'inline',
      sourceRef: 'test:inline',
    }, {
      availableConnectorIds: ['ats', 'calendar'],
      hostVersion: '0.12.1',
    })
    enableSoulApp('aiworker-hr', {
      availableConnectorIds: ['ats', 'calendar'],
      enabledConnectorIds: ['ats'],
      hostVersion: '0.12.1',
    })
    upsertWorker({
      id: 'worker-hr',
      name: 'HR',
      soulId: 'aiworker-hr',
    })
    createWorkspace({
      id: 'workspace-hr',
      name: 'HR workspace',
      rootPath: path.join(dir, 'workers/worker-hr/workspaces/workspace-hr'),
      workerId: 'worker-hr',
    })
    createSession({
      capabilityTemplateId: 'aiworker-hr.candidate-screen',
      id: 'session-1',
      title: 'Candidate screen',
      workerId: 'worker-hr',
      workspaceId: 'workspace-hr',
    })
    upsertWorker({
      id: 'worker-qa',
      name: 'QA',
      soulId: 'aiworker-qa',
    })
    createWorkspace({
      id: 'workspace-qa',
      name: 'QA workspace',
      rootPath: path.join(dir, 'workers/worker-qa/workspaces/workspace-qa'),
      workerId: 'worker-qa',
    })
    createSession({
      capabilityTemplateId: 'aiworker-qa.release-gate',
      id: 'session-qa',
      title: 'Release gate',
      workerId: 'worker-qa',
      workspaceId: 'workspace-qa',
    })
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('allows app-scoped storage and denies cross-namespace storage', () => {
    const broker = createSoulAppBroker({
      appId: 'aiworker-hr',
      now: () => '2026-05-13T00:05:00.000Z',
      operatorId: 'operator-local',
      workspaceId: 'workspace-hr',
    })

    const written = broker.storage.put('profiles/ada', { name: 'Ada', status: 'candidate' })
    if ('decision' in written)
      throw new Error(written.decision.reason)
    expect(written.namespace).toBe('aiworker-hr')
    expect(written.valueJson).toMatchObject({ name: 'Ada' })
    const read = broker.storage.get('profiles/ada')
    if (!read || 'decision' in read)
      throw new Error('expected storage record')
    expect(read.valueJson).toMatchObject({ status: 'candidate' })

    const denied = broker.storage.put('profiles/grace', { name: 'Grace' }, { namespace: 'aiworker-qa' })
    expect(denied).toMatchObject({
      decision: { allowed: false, code: 'permission_denied' },
    })

    const audit = listSoulAppAuditEvents('aiworker-hr')
    expect(audit.map(event => event.decision)).toEqual(['allowed', 'allowed', 'denied'])
    expect(audit.at(-1)?.reason).toContain('storage namespace')
  })

  it('brokers connector evidence without exposing raw tokens', () => {
    const broker = createSoulAppBroker({
      appId: 'aiworker-hr',
      enabledConnectorIds: ['ats'],
      sessionId: 'session-1',
      workspaceId: 'workspace-hr',
    })

    const evidence = broker.connectors.readEvidence('ats', { candidateId: 'cand-1' })
    expect(evidence).toMatchObject({
      connectorId: 'ats',
      redacted: true,
      records: [expect.objectContaining({ source: 'host-connector-broker' })],
    })
    expect(JSON.stringify(evidence)).not.toContain('token')
    expect(listSoulAppAuditEvents('aiworker-hr').at(-1)).toMatchObject({
      action: 'read',
      decision: 'allowed',
      target: 'ats',
      targetKind: 'connector',
    })
  })

  it('rejects mismatched Host scope before broker writes', () => {
    const broker = createSoulAppBroker({
      appId: 'aiworker-hr',
      now: () => '2026-05-13T00:05:00.000Z',
      sessionId: 'session-qa',
      workerId: 'worker-hr',
      workspaceId: 'workspace-qa',
    })

    const denied = broker.storage.put('profiles/eve', { name: 'Eve' })
    expect(denied).toMatchObject({
      decision: {
        allowed: false,
        code: 'scope_mismatch',
      },
    })
    expect(listSoulAppAuditEvents('aiworker-hr').at(-1)).toMatchObject({
      decision: 'denied',
      targetKind: 'storage',
    })
  })

  it('keeps engine ownership on Host by denying raw app engine invocations', () => {
    const broker = createSoulAppBroker({
      appId: 'aiworker-hr',
      sessionId: 'session-1',
      workspaceId: 'workspace-hr',
    })

    expect(broker.engine.createInvocation({ prompt: 'call codex directly' })).toMatchObject({
      decision: {
        allowed: false,
        code: 'engine_owned_by_host',
      },
    })
    expect(listSoulAppAuditEvents('aiworker-hr').at(-1)).toMatchObject({
      decision: 'denied',
      targetKind: 'engine',
    })
  })
})
