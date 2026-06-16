import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  canAdvanceAssignment,
  CONTROL_PLANE_SCHEMA_VERSION,
  createAssignment,
  createAuditEvent,
  createEmptyControlPlaneSnapshot,
  createHandoff,
  createProvisionPlan,
  createProvisionReceipt,
  createWorkspaceProjectionManifest,
  LocalFileControlPlaneStore,
  normalizeAisshServerRef,
  userCanOpenWorkspace,
  validateProjectedFilePath,
  writeProjectedFiles,
} from './index'

const environment = {
  environmentId: 'env_alice_server1',
  daemonEndpoint: 'unix:/run/paseo/alice.sock',
  isolation: 'os-user' as const,
  endpointKind: 'unix' as const,
  ownerEmail: 'alice@example.com',
  paseoHome: '/home/alice/.paseo',
  providerProfileIds: ['claude-work'],
  targetRef: 'aissh:server-1',
}

const providerProfile = {
  id: 'claude-work',
  label: 'Claude Work',
  provider: 'claude',
  secretRef: 'secret://org/claude-work',
}

const soul = {
  displayName: 'HR 招聘助手',
  files: [
    { relativePath: 'AGENTS.md', content: '# HR 招聘助手\n' },
    { relativePath: 'CLAUDE.md', content: '# HR 招聘助手\n' },
    { relativePath: '.mcp.json', content: '{"mcpServers":{}}\n' },
  ],
  id: 'hr-recruiter',
  version: '1.2.0',
}

describe('Paseo thin-layer aiworker-control contract', () => {
  test('assignment is user + environment + soul + provider + workspace, not one daemon per soul', () => {
    const assignment = createAssignment({
      assignedEmail: ' Alice@Example.COM ',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })

    expect(assignment.assignedEmail).toBe('alice@example.com')
    expect(userCanOpenWorkspace({ email: 'alice@example.com' }, { ...assignment, status: 'ready' })).toBe(true)
    expect(userCanOpenWorkspace({ email: 'bob@example.com' }, { ...assignment, status: 'ready' })).toBe(false)
  })

  test('tracks thin-layer status transitions without worker check-in states', () => {
    expect(canAdvanceAssignment('draft', 'provisioning')).toBe(true)
    expect(canAdvanceAssignment('provisioning', 'workspace_projected')).toBe(true)
    expect(canAdvanceAssignment('workspace_projected', 'handoff_ready')).toBe(true)
    expect(canAdvanceAssignment('handoff_ready', 'ready')).toBe(true)
    expect(canAdvanceAssignment('ready', 'provisioning')).toBe(false)
  })

  test('builds redacted aissh provisioning command and Paseo handoff metadata', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })

    expect(plan.command).toContain('aissh exec server-1')
    expect(plan.command).not.toContain('PASEO_HOME=/home/alice/.paseo')
    expect(plan.aissh.serverRef).toBe('server-1')
    expect(plan.aissh.args[0]).toBe('exec')
    expect(plan.aissh.args[1]).toBe('server-1')
    expect(plan.aissh.cwdPolicy).toBe('neutral-tempdir')
    expect(plan.aissh.credentials).toEqual({ optionalEnv: ['AISSH_BIN', 'AISSH_SERVER'], requiredEnv: ['AISSH_TOKEN'], source: 'env' })
    expect(plan.aissh.script).toContain('unset PASEO_HOST')
    expect(plan.aissh.script).toContain('AIWORKER_REMOTE_USER="$(whoami)"')
    expect(plan.aissh.script).toContain('AIWORKER_REMOTE_UID="$(id -u)"')
    expect(plan.aissh.script).toContain('AIWORKER_REMOTE_PWD="$(pwd -P)"')
    expect(plan.aissh.script).toContain('AIWORKER_REMOTE_PATH="$PATH"')
    expect(plan.aissh.script).toContain('AIWORKER_REMOTE_HOME="$(cd "$HOME" && pwd -P)"')
    expect(plan.aissh.script).toContain('PASEO_HOME="$AIWORKER_REMOTE_HOME/.paseo"')
    expect(plan.aissh.script).toContain('AIWORKER_WORKSPACE_ROOT="$AIWORKER_REMOTE_HOME/aiworker-workspaces"')
    expect(plan.aissh.script).toContain('AIWORKER_WORKSPACE_REF="$AIWORKER_WORKSPACE_ROOT/$AIWORKER_WORKSPACE_NAME"')
    expect(plan.aissh.script).toContain('mkdir -p "$AIWORKER_WORKSPACE_REF" && cd "$AIWORKER_WORKSPACE_REF"')
    expect(plan.aissh.script).toContain('(command -v paseo >/dev/null || npm install -g @getpaseo/cli)')
    expect(plan.aissh.script).toContain('command -v claude')
    expect(plan.aissh.script).toContain('Missing provider CLI: claude')
    expect(plan.aissh.script).toContain('AIWORKER_PASEO_STATUS="$(paseo daemon status --home "$PASEO_HOME" 2>&1 || true)"')
    expect(plan.aissh.script).toContain('grep -Eq \'Local Daemon[[:space:]]+running|Connected Daemon[[:space:]]+reachable\' || paseo daemon start --home "$PASEO_HOME"')
    expect(plan.aissh.script).toContain('Paseo daemon readiness failed after start')
    expect(plan.aissh.script).toContain('paseo provider ls --json >"$AIWORKER_PROVIDER_LS_JSON"')
    expect(plan.aissh.script).toContain('paseo provider models "$AIWORKER_PASEO_PROVIDER_ID" --json >"$AIWORKER_PROVIDER_MODELS_JSON"')
    expect(plan.aissh.script).toContain('AIWORKER_HANDOFF_READY: run paseo daemon pair --home')
    expect(plan.aissh.script).not.toContain('&& paseo daemon pair')
    expect(plan.aissh.script).not.toContain('--host')
    expect(plan.command).not.toContain('paseo --host unix:/run/paseo/alice.sock daemon status')
    expect(plan.command).toContain('base64 -d')
    expect(plan.receipt.soulReleaseRef).toBe('hr-recruiter@1.2.0')
    expect(plan.receipt.workspaceRef).toBe('$HOME/aiworker-workspaces/hr-recruiter')
    expect(plan.workspacePolicy).toEqual({
      authority: 'aissh-execution-home',
      kind: 'home-derived',
      paseoHome: '$HOME/.paseo',
      workspaceName: 'hr-recruiter',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
      workspaceRoot: '$HOME/aiworker-workspaces',
    })
    expect(plan.endpointBinding).toEqual({
      bindingKind: 'external-endpoint',
      endpointKind: 'unix',
      ref: 'unix:/run/paseo/alice.sock',
    })
    expect(plan.providerReadiness).toEqual({
      commands: ['paseo provider ls --json', 'paseo provider models <provider> --json'],
      kind: 'paseo-provider-json-v1',
      modelListPredicate: 'non-empty array',
      providerId: 'claude',
      providerListPredicate: 'provider == providerId && status == "available" && enabled == "Enabled"',
      rawOutputPolicy: 'redacted-pass-fail-only',
    })
    expect(plan.receipt.workspacePathPolicy).toBe('home-derived')
    expect(plan.receipt.endpointBinding).toBe('external-endpoint')
    expect(plan.receipt.providerReadinessPolicy).toBe('paseo-provider-json-v1')
    expect(plan.receipt.aisshArgs).toEqual(plan.aissh.args)
    expect(plan.assignment.handoff?.kind).toBe('paseo-daemon')
    expect(plan.assignment.handoff?.instructions).toContain('AIWorker derives PASEO_HOME')
    expect(plan.assignment.handoff?.instructions).toContain('cd "$HOME/aiworker-workspaces/hr-recruiter"')
    expect(plan.assignment.handoff?.instructions).not.toContain('cd \'$HOME/aiworker-workspaces/hr-recruiter\'')
    expect(plan.assignment.handoff?.instructions).toContain('paseo daemon pair --home "$PASEO_HOME"')
    expect(plan.command).toContain('command -v claude')
    expect(plan.command).not.toContain('secret://org/claude-work')
  })

  test('rejects workspace refs that are not HOME-derived safe segments', () => {
    const unsafeAssignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '/home/alice/workspaces/hr-recruiter',
    })

    expect(() => createProvisionPlan({ assignment: unsafeAssignment, environment, providerProfile, soul })).toThrow('workspace name must')
    expect(() => createProvisionPlan({
      assignment: { ...unsafeAssignment, workspaceRef: '../evil; echo SHOULD_NOT_RUN' },
      environment,
      providerProfile,
      soul,
    })).toThrow('workspace name must be a safe relative segment')
    expect(() => createProvisionPlan({
      assignment: { ...unsafeAssignment, workspaceRef: '../evil; echo SHOULD_NOT_RUN' },
      environment,
      providerProfile,
      soul,
    })).not.toThrow('SHOULD_NOT_RUN')
  })

  test('normalizes aissh target refs without binding AIWorker to local .aissh.yaml files', () => {
    expect(normalizeAisshServerRef('aissh:server-1')).toBe('server-1')
    expect(normalizeAisshServerRef('server-2')).toBe('server-2')
    expect(() => normalizeAisshServerRef('   ')).toThrow('aissh target ref is required')
  })

  test('redacts secret-like values from structured aissh plan surfaces', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })
    const plan = createProvisionPlan({
      assignment,
      environment: { ...environment, targetRef: 'aissh:server-sk-abc123456789' },
      providerProfile,
      soul,
    })

    expect(plan.command).toContain('[REDACTED]')
    expect(plan.aissh.args.join(' ')).not.toContain('sk-abc123456789')
    expect(plan.receipt.command).not.toContain('sk-abc123456789')
  })

  test('rejects provider profiles that are not attached to the Paseo environment', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: 'codex-personal',
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })

    expect(() => createProvisionPlan({
      assignment,
      environment,
      providerProfile: { id: 'codex-personal', label: 'Codex Personal', provider: 'codex' },
      soul,
    })).toThrow('is not attached')
  })

  test('supports ACP provider profiles explicitly instead of treating them as custom fallthrough', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: 'acp-team',
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })
    const plan = createProvisionPlan({
      assignment,
      environment: { ...environment, providerProfileIds: [...environment.providerProfileIds, 'acp-team'] },
      providerProfile: { id: 'acp-team', label: 'ACP Team', paseoProviderId: 'paseo-acp-team', provider: 'acp' },
      soul,
    })

    expect(plan.command).toContain('Paseo provider profile paseo-acp-team')
    expect(plan.command).not.toContain('custom')
  })

  test('rejects incomplete ACP provider profiles before reporting handoff ready', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: 'acp-team',
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })

    expect(() => createProvisionPlan({
      assignment,
      environment: { ...environment, providerProfileIds: [...environment.providerProfileIds, 'acp-team'] },
      providerProfile: { id: 'acp-team', label: 'ACP Team', provider: 'acp' },
      soul,
    })).toThrow('must declare paseoProviderId or cliCommand')
  })

  test('projects Soul files into a normal Paseo workspace directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-paseo-workspace-'))
    const written = await writeProjectedFiles(root, soul.files)

    expect(written).toEqual(['.mcp.json', 'AGENTS.md', 'CLAUDE.md'])
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toContain('HR 招聘助手')
  })

  test('rejects path traversal and literal provider secrets in projected files', async () => {
    expect(() => validateProjectedFilePath('../AGENTS.md')).toThrow('escapes workspace')
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-paseo-workspace-'))
    await expect(writeProjectedFiles(root, [{ relativePath: 'AGENTS.md', content: 'key sk-abc123456789' }])).rejects.toThrow('literal provider secrets')
  })

  test('handoff can target relay offers without making AIWorker a workspace UI', () => {
    const handoff = createHandoff({ ...environment, daemonEndpoint: 'https://relay.paseo.example/#offer=abc', endpointKind: 'relay-offer' }, '/w/hr')
    expect(handoff.kind).toBe('pairing-offer')
    expect(handoff.daemonEndpoint).toBe('[REDACTED_PAIRING_URL]')
    expect(handoff.instructions).toContain('/w/hr')
    expect(handoff.instructions).not.toContain('https://relay.paseo.example/#offer=abc')
    expect(handoff.instructions).toContain('out-of-band')
  })

  test('rejects raw Paseo pairing material in provision plans and snapshots', () => {
    const pairingEnvironment = { ...environment, daemonEndpoint: 'https://relay.paseo.example/?offer=abc', endpointKind: 'relay-offer' as const }
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: pairingEnvironment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })

    expect(() => createProvisionPlan({ assignment, environment: pairingEnvironment, providerProfile, soul })).toThrow('raw Paseo pairing material')
  })

  test('persists a versioned control-plane snapshot and append-only receipts/audit/projection logs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-control-store-'))
    const store = new LocalFileControlPlaneStore(root)
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })
    const receipt = createProvisionReceipt(plan, { at: '2026-06-15T18:00:00.000Z', id: 'rcpt-1', status: 'applied' })
    const auditEvent = createAuditEvent({
      action: 'assignment.apply',
      actor: 'ops@example.com',
      at: '2026-06-15T18:00:01.000Z',
      id: 'audit-1',
      target: assignment.assignmentId,
    })
    const projectionManifest = createWorkspaceProjectionManifest({
      at: '2026-06-15T18:00:02.000Z',
      files: soul.files,
      id: 'proj-1',
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: assignment.workspaceRef,
    })

    await store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [assignment],
      environments: [environment],
      providerProfiles: [providerProfile],
      soulReleases: [soul],
    })
    await store.appendReceipt(receipt)
    await store.appendAuditEvent(auditEvent)
    await store.appendProjectionManifest(projectionManifest)

    const loaded = await store.loadSnapshot()

    expect(loaded.schemaVersion).toBe(CONTROL_PLANE_SCHEMA_VERSION)
    expect(loaded.assignments).toHaveLength(1)
    expect(loaded.receipts).toEqual([receipt])
    expect(loaded.auditEvents).toEqual([auditEvent])
    expect(loaded.projectionManifests[0]?.files.map(file => file.relativePath)).toEqual(['.mcp.json', 'AGENTS.md', 'CLAUDE.md'])
    expect(loaded.projectionManifests[0]?.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  test('rejects unsupported control-plane schema versions and literal secrets in persisted records', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-control-store-'))
    const store = new LocalFileControlPlaneStore(root)
    const unsafeSnapshot = {
      ...createEmptyControlPlaneSnapshot(),
      schemaVersion: 99 as typeof CONTROL_PLANE_SCHEMA_VERSION,
    }

    await expect(store.saveSnapshot(unsafeSnapshot)).rejects.toThrow('unsupported schemaVersion 99')

    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })
    const unsafeReceipt = {
      ...createProvisionReceipt(plan, { id: 'rcpt-secret' }),
      command: 'aissh exec server --token sk-abc123456789',
    }

    await expect(store.appendReceipt(unsafeReceipt)).rejects.toThrow('must use a secret reference')
    expect(() => createWorkspaceProjectionManifest({
      files: [{ relativePath: '../AGENTS.md', content: '# nope\n' }],
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: assignment.workspaceRef,
    })).toThrow('escapes workspace')
  })

  test('rejects unsafe persisted snapshot and JSONL records during load/save', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-control-store-'))
    const store = new LocalFileControlPlaneStore(root)
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })

    await expect(store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      soulReleases: [{
        ...soul,
        files: [{ relativePath: 'AGENTS.md', content: 'provider sk-abc123456789' }],
      }],
    })).rejects.toThrow('literal provider secrets')

    await expect(store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      providerProfiles: [{
        ...providerProfile,
        label: 'leaked sk-abc123456789',
      }],
    })).rejects.toThrow('control-plane snapshot.providerProfiles[0].label')

    await expect(store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [{
        ...assignment,
        handoff: {
          daemonEndpoint: environment.daemonEndpoint,
          instructions: 'open with sk-abc123456789',
          kind: 'paseo-daemon',
          workspaceRef: assignment.workspaceRef,
        },
      }],
    })).rejects.toThrow('assignment')

    await writeFile(path.join(root, 'snapshot.json'), JSON.stringify({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [{
        ...assignment,
        handoff: {
          daemonEndpoint: 'unix:/run/paseo/sk-abc123456789.sock',
          instructions: 'open workspace',
          kind: 'paseo-daemon',
          workspaceRef: assignment.workspaceRef,
        },
      }],
    }))

    await expect(store.loadSnapshot()).rejects.toThrow('handoff:daemonEndpoint')
    await writeFile(path.join(root, 'snapshot.json'), JSON.stringify(createEmptyControlPlaneSnapshot()))

    await writeFile(path.join(root, 'audit-events.jsonl'), `${JSON.stringify({
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      id: 'audit-secret',
      kind: 'audit-event',
      at: '2026-06-15T19:00:00.000Z',
      actor: 'admin@example.com',
      action: 'leaked sk-abc123456789',
      target: 'asn-secret',
    })}\n`)

    await expect(store.loadSnapshot()).rejects.toThrow('must use a secret reference')
  })

  test('keeps append-only records idempotent across load and save cycles', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-control-store-'))
    const store = new LocalFileControlPlaneStore(root)
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/aiworker-workspaces/hr-recruiter',
    })
    const receipt = createProvisionReceipt(createProvisionPlan({ assignment, environment, providerProfile, soul }), {
      at: '2026-06-15T19:01:00.000Z',
      id: 'rcpt-idempotent',
    })

    await store.saveSnapshot(createEmptyControlPlaneSnapshot())
    await store.appendReceipt(receipt)
    const loaded = await store.loadSnapshot()
    await store.saveSnapshot(loaded)

    expect((await store.loadSnapshot()).receipts).toEqual([receipt])
  })
})
