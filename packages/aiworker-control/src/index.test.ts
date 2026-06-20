import type { PaseoEnvironmentTopologyKind } from './control-plane'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  canAdvanceAssignment,
  CONTROL_PLANE_SCHEMA_VERSION,
  createAssignment,
  createAuditEvent,
  createEmptyControlPlaneSnapshot,
  createEnvironment,
  createHandoff,
  createProviderProfile,
  createProvisionPlan,
  createProvisionReceipt,
  createSoulRelease,
  createWorkspaceProjectionManifest,
  deriveAssignedUserSlug,
  deriveOwnerScopedPaseoPort,
  LocalFileControlPlaneStore,
  normalizeAisshServerRef,
  RESERVED_USER_SLUGS,
  resolveCentralHome,
  resolveControlPlaneDir,
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
  test('assignment is user + environment + soul + provider + Project workdir, not one daemon per soul', () => {
    const assignment = createAssignment({
      assignedEmail: ' Alice@Example.COM ',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      projectRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
    })
    const lowerCaseAssignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      projectRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
    })

    expect(assignment.assignedEmail).toBe('alice@example.com')
    expect(assignment.assignmentId.slice(0, 16)).toBe(lowerCaseAssignment.assignmentId.slice(0, 16))
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
    expect(plan.aissh.script).toContain('AIWORKER_OWNER_ROOT="$AIWORKER_ROOT/$AIWORKER_USER_SLUG"')
    expect(plan.aissh.script).toContain('AIWORKER_PASEO_HOME="$AIWORKER_OWNER_ROOT/.paseo"')
    expect(plan.aissh.script).toContain('AIWORKER_PASEO_LISTEN=127.0.0.1:42057')
    expect(plan.aissh.script).toContain('AIWORKER_PASEO_HOST=127.0.0.1:42057')
    expect(plan.aissh.script).toContain('PASEO_HOME="$AIWORKER_PASEO_HOME"')
    expect(plan.aissh.script).toContain('PASEO_LISTEN="$AIWORKER_PASEO_LISTEN"')
    expect(plan.aissh.script).toContain('AIWORKER_USER_SLUG=alice-example.com')
    expect(plan.aissh.script).toContain('AIWORKER_ROOT="$AIWORKER_REMOTE_HOME/.aiworker"')
    expect(plan.aissh.script).toContain('AIWORKER_PROJECT_ROOT="$AIWORKER_OWNER_ROOT/projects"')
    expect(plan.aissh.script).toContain('AIWORKER_PROJECT_REF="$AIWORKER_PROJECT_ROOT/$AIWORKER_PROJECT_NAME"')
    expect(plan.aissh.script).toContain('AIWORKER_WORKSPACE_REF="$AIWORKER_PROJECT_REF"')
    expect(plan.aissh.script).toContain('mkdir -p "$AIWORKER_WORKSPACE_REF" && cd "$AIWORKER_WORKSPACE_REF"')
    expect(plan.aissh.script).toContain('(command -v paseo >/dev/null || npm install -g @getpaseo/cli)')
    expect(plan.aissh.script).toContain('command -v claude')
    expect(plan.aissh.script).toContain('AIWORKER_PROVIDER_NOTE: Provider CLI claude was not found')
    expect(plan.aissh.script).toContain('Paseo provider readiness is checked through the owner-scoped daemon')
    expect(plan.aissh.script).toContain('AIWORKER_PASEO_STATUS="$(paseo daemon status --home "$PASEO_HOME" 2>&1 || true)"')
    expect(plan.aissh.script).toContain('paseo daemon restart --home "$PASEO_HOME" --listen "$AIWORKER_PASEO_LISTEN" --force')
    expect(plan.aissh.script).toContain('paseo daemon start --home "$PASEO_HOME" --listen "$AIWORKER_PASEO_LISTEN"')
    expect(plan.aissh.script).toContain('Paseo daemon readiness failed after start')
    expect(plan.aissh.script).toContain('paseo provider ls --host "$AIWORKER_PASEO_HOST" --json >"$AIWORKER_PROVIDER_LS_JSON"')
    expect(plan.aissh.script).toContain('AIWORKER_PROVIDER_WARNING')
    expect(plan.aissh.script).not.toContain('paseo provider models')
    expect(plan.aissh.script).toContain('AIWORKER_HANDOFF_READY: run paseo daemon pair --home')
    expect(plan.aissh.script).not.toContain('&& paseo daemon pair')
    expect(plan.aissh.script).toContain('paseo run --host \\"$AIWORKER_PASEO_HOST\\" --cwd \\"$AIWORKER_WORKSPACE_REF\\"')
    expect(plan.command).not.toContain('paseo --host unix:/run/paseo/alice.sock daemon status')
    expect(plan.command).toContain('base64 -d')
    expect(plan.receipt.soulReleaseRef).toBe('hr-recruiter@1.2.0')
    expect(plan.receipt.projectRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-recruiter')
    expect(plan.receipt.workspaceRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-recruiter')
    expect(plan.environment.ownerEmail).toBe('alice@example.com')
    expect(plan.environment.paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')
    expect(plan.environment.endpointKind).toBe('tcp')
    expect(plan.environment.daemonEndpoint).toBe('127.0.0.1:42057')
    expect(plan.ownership).toEqual({
      assignedEmail: 'alice@example.com',
      dedicatedTarget: false,
      environmentOwnerEmail: 'alice@example.com',
      kind: 'target-owner-matches-assigned-user',
      topologyKind: 'owner-scoped-paseo-home-v1',
      userSlug: 'alice-example.com',
    })
    expect(plan.workspacePolicy).toEqual({
      authority: 'aissh-execution-home',
      assignedEmail: 'alice@example.com',
      daemonEndpointRef: '127.0.0.1:42057',
      daemonHostRef: '127.0.0.1:42057',
      daemonListenRef: '127.0.0.1:42057',
      kind: 'project-workdir',
      ownerEmail: 'alice@example.com',
      ownerRoot: '$HOME/.aiworker/alice-example.com',
      paseoHome: '$HOME/.aiworker/alice-example.com/.paseo',
      projectName: 'hr-recruiter',
      projectRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
      projectRoot: '$HOME/.aiworker/alice-example.com/projects',
      runDir: '$HOME/.aiworker/alice-example.com/run',
      topologyKind: 'owner-scoped-paseo-home-v1',
      userSlug: 'alice-example.com',
      workspaceName: 'hr-recruiter',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
      workspaceRoot: '$HOME/.aiworker',
    })
    expect(plan.endpointBinding).toEqual({
      bindingKind: 'owner-scoped-local-daemon',
      endpointKind: 'tcp',
      hostRef: '127.0.0.1:42057',
      listenRef: '127.0.0.1:42057',
      ownerRoot: '$HOME/.aiworker/alice-example.com',
      ref: '127.0.0.1:42057',
      topologyKind: 'owner-scoped-paseo-home-v1',
    })
    expect(plan.providerReadiness).toEqual({
      commands: ['paseo provider ls --host "$AIWORKER_PASEO_HOST" --json'],
      effect: 'non-blocking-warning',
      kind: 'paseo-provider-json-v1',
      modelListPolicy: 'not-collected-by-aiworker',
      providerId: 'claude',
      providerListPredicate: 'warn if provider != providerId || status != "available" || enabled != "Enabled"',
      rawOutputPolicy: 'redacted-warning-only',
    })
    expect(plan.receipt.workspacePathPolicy).toBe('project-workdir')
    expect(plan.receipt.endpointBinding).toBe('owner-scoped-local-daemon')
    expect(plan.receipt.environmentOwnerEmail).toBe('alice@example.com')
    expect(plan.receipt.topologyKind).toBe('owner-scoped-paseo-home-v1')
    expect(plan.receipt.ownerRoot).toBe('$HOME/.aiworker/alice-example.com')
    expect(plan.receipt.runDir).toBe('$HOME/.aiworker/alice-example.com/run')
    expect(plan.receipt.projectRoot).toBe('$HOME/.aiworker/alice-example.com/projects')
    expect(plan.receipt.daemonListenRef).toBe('127.0.0.1:42057')
    expect(plan.receipt.daemonHostRef).toBe('127.0.0.1:42057')
    expect(plan.receipt.ownershipKind).toBe('target-owner-matches-assigned-user')
    expect(plan.receipt.dedicatedTarget).toBe(false)
    expect(plan.receipt.userSlug).toBe('alice-example.com')
    expect(plan.receipt.providerReadinessPolicy).toBe('paseo-provider-json-v1')
    expect(plan.receipt.aisshArgs).toEqual(plan.aissh.args)
    expect(plan.assignment.handoff?.kind).toBe('paseo-daemon')
    expect(plan.assignment.handoff?.instructions).toContain('AIWorker derives owner-scoped PASEO_HOME')
    expect(plan.assignment.handoff?.instructions).toContain('paseo --host')
    expect(plan.assignment.handoff?.instructions).toContain('paseo run --host')
    expect(plan.assignment.handoff?.instructions).toContain('"$HOME/.aiworker/alice-example.com/projects/hr-recruiter"')
    expect(plan.assignment.handoff?.instructions).toContain('paseo daemon pair --home "$PASEO_HOME"')
    expect(plan.command).toContain('command -v claude')
    expect(plan.command).not.toContain('secret://org/claude-work')
  })

  test('records explicit dedicated target ownership while keeping owner-scoped PASEO_HOME', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
    })
    const plan = createProvisionPlan({
      assignment,
      environment: {
        ...environment,
        dedication: {
          kind: 'assigned-user-dedicated',
          assignedEmail: 'Alice@Example.COM',
          assertedBy: 'aiworker-cli',
          reason: '--dedicated-target-user',
        },
      },
      providerProfile,
      soul,
    })

    expect(plan.environment.dedication).toEqual({
      kind: 'assigned-user-dedicated',
      assignedEmail: 'alice@example.com',
      assertedBy: 'aiworker-cli',
      reason: '--dedicated-target-user',
    })
    expect(plan.ownership.kind).toBe('dedicated-target-asserted')
    expect(plan.ownership.dedicatedTarget).toBe(true)
    expect(plan.workspacePolicy.paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')
    expect(plan.workspacePolicy.workspaceRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-recruiter')
    expect(plan.aissh.script).toContain('AIWORKER_PASEO_HOME="$AIWORKER_OWNER_ROOT/.paseo"')
    expect(plan.receipt.ownershipKind).toBe('dedicated-target-asserted')
    expect(plan.receipt.dedicatedTarget).toBe(true)
  })

  test('allows shared target owner with owner-scoped assignment roots and rejects legacy shared HOME', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
    })

    const sharedHomePlan = createProvisionPlan({
      assignment,
      environment: { ...environment, ownerEmail: 'bob@example.com' },
      providerProfile,
      soul,
    })

    expect(sharedHomePlan.ownership.kind).toBe('owner-scoped-shared-home')
    expect(sharedHomePlan.environment.ownerEmail).toBe('bob@example.com')
    expect(sharedHomePlan.workspacePolicy.ownerEmail).toBe('bob@example.com')
    expect(sharedHomePlan.workspacePolicy.userSlug).toBe('alice-example.com')
    expect(sharedHomePlan.workspacePolicy.paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')

    // US-001: a persisted snapshot may still carry the abolished legacy topologyKind
    // string. It must migrate-on-read to owner-scoped (never crash, never produce a
    // bare $HOME/.paseo), so an owner!=assigned plan stays a valid shared-home plan.
    const migratedLegacyPlan = createProvisionPlan({
      assignment,
      environment: {
        ...environment,
        ownerEmail: 'bob@example.com',
        topologyKind: 'legacy-home-derived-paseo-home-v1' as unknown as PaseoEnvironmentTopologyKind,
      },
      providerProfile,
      soul,
    })
    expect(migratedLegacyPlan.ownership.kind).toBe('owner-scoped-shared-home')
    expect(migratedLegacyPlan.ownership.topologyKind).toBe('owner-scoped-paseo-home-v1')
    expect(migratedLegacyPlan.workspacePolicy.topologyKind).toBe('owner-scoped-paseo-home-v1')
    expect(migratedLegacyPlan.workspacePolicy.paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')
    expect(migratedLegacyPlan.receipt.paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')

    expect(() => createProvisionPlan({
      assignment,
      environment: {
        ...environment,
        dedication: {
          kind: 'assigned-user-dedicated',
          assignedEmail: 'bob@example.com',
        },
      },
      providerProfile,
      soul,
    })).toThrow('dedication bob@example.com must match assigned user')
  })

  test('rejects Project workdir refs that are not HOME-derived safe segments', () => {
    const unsafeAssignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '/home/alice/workspaces/hr-recruiter',
    })

    expect(() => createProvisionPlan({ assignment: unsafeAssignment, environment, providerProfile, soul })).toThrow('project name must')
    expect(() => createProvisionPlan({
      assignment: { ...unsafeAssignment, workspaceRef: '../evil; echo SHOULD_NOT_RUN' },
      environment,
      providerProfile,
      soul,
    })).toThrow('project name must be a safe relative segment')
    expect(() => createProvisionPlan({
      assignment: { ...unsafeAssignment, workspaceRef: '../evil; echo SHOULD_NOT_RUN' },
      environment,
      providerProfile,
      soul,
    })).not.toThrow('SHOULD_NOT_RUN')
  })

  test('US-001: derived PASEO_HOME is always owner-scoped, never a bare $HOME/.paseo', () => {
    const baseAssignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
    })
    const expectedPaseoHome = '$HOME/.aiworker/alice-example.com/.paseo'

    // Any topologyKind input (missing, owner-scoped, or a persisted legacy string)
    // must derive the same owner-scoped Paseo home and must never emit bare $HOME/.paseo.
    const topologyInputs: Array<PaseoEnvironmentTopologyKind | undefined> = [
      undefined,
      'owner-scoped-paseo-home-v1',
      'legacy-home-derived-paseo-home-v1' as unknown as PaseoEnvironmentTopologyKind,
    ]
    for (const topologyKind of topologyInputs) {
      const plan = createProvisionPlan({
        assignment: baseAssignment,
        environment: {
          ...environment,
          // Even if a snapshot carried a literal bare home, projection must override it.
          paseoHome: '$HOME/.paseo',
          ...(topologyKind ? { topologyKind } : {}),
        },
        providerProfile,
        soul,
      })
      expect(plan.workspacePolicy.paseoHome).toBe(expectedPaseoHome)
      expect(plan.environment.paseoHome).toBe(expectedPaseoHome)
      expect(plan.receipt.paseoHome).toBe(expectedPaseoHome)
      expect(plan.workspacePolicy.topologyKind).toBe('owner-scoped-paseo-home-v1')
      expect(plan.workspacePolicy.paseoHome).not.toBe('$HOME/.paseo')
      // The owner-scoped Paseo home must be nested under $HOME/.aiworker/<slug>/.paseo,
      // never the bare Paseo install another tool may own on the target machine.
      expect(plan.workspacePolicy.paseoHome.startsWith('$HOME/.aiworker/')).toBe(true)
      expect(plan.workspacePolicy.paseoHome.endsWith('/.paseo')).toBe(true)
    }
  })

  test('US-001: provision script only writes under .aiworker/<slug>/, never bare $HOME/.paseo', () => {
    const plan = createProvisionPlan({
      assignment: createAssignment({
        assignedEmail: 'alice@example.com',
        environmentId: environment.environmentId,
        providerProfileId: providerProfile.id,
        soulReleaseRef: 'hr-recruiter@1.2.0',
        workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
      }),
      environment,
      providerProfile,
      soul,
    })
    expect(plan.aissh.script).toContain('AIWORKER_OWNER_ROOT')
    expect(plan.aissh.script).toContain('AIWORKER_PASEO_HOME="$AIWORKER_OWNER_ROOT/.paseo"')
    expect(plan.aissh.script).not.toContain('PASEO_HOME="$HOME/.paseo"')
    expect(plan.aissh.script).not.toContain('PASEO_HOME=$HOME/.paseo')
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
    expect(loaded.receipts[0]?.aisshArgs).toContain('[omitted: generated provisioning script]')
    expect(loaded.receipts[0]?.command).not.toContain('base64 -d')
    expect(loaded.auditEvents).toEqual([auditEvent])
    expect(loaded.projectionManifests[0]?.files.map(file => file.relativePath)).toEqual(['.mcp.json', 'AGENTS.md', 'CLAUDE.md'])
    expect(loaded.projectionManifests[0]?.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  test('loads legacy v1 receipts that predate explicit ownership fields', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-control-store-'))
    const store = new LocalFileControlPlaneStore(root)
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })
    const legacyReceipt = createProvisionReceipt(plan, {
      at: '2026-06-15T18:00:00.000Z',
      id: 'rcpt-legacy',
      status: 'applied',
    })
    delete legacyReceipt.dedicatedTarget
    delete legacyReceipt.environmentOwnerEmail
    delete legacyReceipt.ownershipKind
    delete legacyReceipt.userSlug

    await store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [assignment],
      environments: [environment],
      providerProfiles: [providerProfile],
      receipts: [legacyReceipt],
      soulReleases: [soul],
    })

    const loaded = await store.loadSnapshot()

    expect(loaded.receipts[0]).toEqual(legacyReceipt)
    expect(loaded.receipts[0]?.environmentOwnerEmail).toBeUndefined()
    expect(loaded.environments[0]?.dedication).toBeUndefined()
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/hr-recruiter',
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

describe('central home / control-plane dir resolution', () => {
  test('resolveCentralHome honors AIWORKER_HOME then falls back to ~/.aiworker', () => {
    expect(resolveCentralHome({ AIWORKER_HOME: '/srv/aiworker-dev' })).toBe(path.resolve('/srv/aiworker-dev'))
    expect(resolveCentralHome({ AIWORKER_HOME: '   ' })).toBe(path.join(homedir(), '.aiworker'))
    expect(resolveCentralHome({})).toBe(path.join(homedir(), '.aiworker'))
  })

  test('resolveControlPlaneDir applies explicit, env, then central home priority', () => {
    expect(resolveControlPlaneDir({ AIWORKER_CONTROL_PLANE_DIR: '/env/dir', AIWORKER_HOME: '/home-dir' }, '/explicit/dir'))
      .toBe(path.resolve('/explicit/dir'))
    expect(resolveControlPlaneDir({ AIWORKER_CONTROL_PLANE_DIR: '/env/dir', AIWORKER_HOME: '/home-dir' }))
      .toBe(path.resolve('/env/dir'))
    expect(resolveControlPlaneDir({ AIWORKER_HOME: '/home-dir' }))
      .toBe(path.join(path.resolve('/home-dir'), 'control-plane'))
  })
})

describe('shared control-plane factories', () => {
  test('createEnvironment assembles a PaseoEnvironment and omits absent optionals', () => {
    expect(createEnvironment({
      environmentId: 'env-alice',
      ownerEmail: 'alice@example.com',
      targetRef: 'aissh:server-1',
      paseoHome: '$HOME/.aiworker/alice/.paseo',
      daemonEndpoint: '127.0.0.1:42057',
      endpointKind: 'tcp',
      isolation: 'os-user',
      providerProfileIds: ['claude-work'],
    })).toEqual({
      environmentId: 'env-alice',
      ownerEmail: 'alice@example.com',
      targetRef: 'aissh:server-1',
      paseoHome: '$HOME/.aiworker/alice/.paseo',
      daemonEndpoint: '127.0.0.1:42057',
      endpointKind: 'tcp',
      isolation: 'os-user',
      providerProfileIds: ['claude-work'],
    })
  })

  test('createEnvironment carries optional refs, dedication, and topology when present', () => {
    const env = createEnvironment({
      environmentId: 'env-alice',
      ownerEmail: 'alice@example.com',
      targetRef: 'aissh:server-1',
      paseoHome: '$HOME/.aiworker/alice/.paseo',
      daemonEndpoint: '127.0.0.1:42057',
      daemonListenRef: '127.0.0.1:42057',
      daemonHostRef: '127.0.0.1:42057',
      endpointKind: 'tcp',
      isolation: 'os-user',
      providerProfileIds: ['claude-work'],
      topologyKind: 'owner-scoped-paseo-home-v1',
      dedication: {
        kind: 'assigned-user-dedicated',
        assignedEmail: 'alice@example.com',
        assertedBy: 'aiworker-cli',
        reason: '--dedicated-target-user',
      },
    })
    expect(env.daemonListenRef).toBe('127.0.0.1:42057')
    expect(env.daemonHostRef).toBe('127.0.0.1:42057')
    expect(env.topologyKind).toBe('owner-scoped-paseo-home-v1')
    expect(env.dedication).toEqual({
      kind: 'assigned-user-dedicated',
      assignedEmail: 'alice@example.com',
      assertedBy: 'aiworker-cli',
      reason: '--dedicated-target-user',
    })
  })

  test('createProviderProfile keeps required fields and omits absent optionals', () => {
    expect(createProviderProfile({
      id: 'claude-work',
      label: 'claude-work',
      provider: 'claude',
      secretRef: 'secret://provider/claude-work',
    })).toEqual({
      id: 'claude-work',
      label: 'claude-work',
      provider: 'claude',
      secretRef: 'secret://provider/claude-work',
    })
  })

  test('createProviderProfile carries baseUrl/model/cliCommand/paseoProviderId when present', () => {
    expect(createProviderProfile({
      id: 'claude-work',
      label: 'Claude curated',
      provider: 'claude',
      secretRef: 'secret://provider/claude-work',
      baseUrl: 'https://api.example.test',
      model: 'big-model',
      cliCommand: 'claude',
      paseoProviderId: 'pp-1',
    })).toEqual({
      id: 'claude-work',
      label: 'Claude curated',
      provider: 'claude',
      secretRef: 'secret://provider/claude-work',
      baseUrl: 'https://api.example.test',
      model: 'big-model',
      cliCommand: 'claude',
      paseoProviderId: 'pp-1',
    })
  })

  test('createSoulRelease does not compose id and omits descriptorRef when absent', () => {
    expect(createSoulRelease({
      id: 'hr-manager',
      version: '1.2.3',
      displayName: 'HR Manager',
      files: [{ relativePath: 'AGENTS.md', content: '# HR Manager\n' }],
    })).toEqual({
      id: 'hr-manager',
      version: '1.2.3',
      displayName: 'HR Manager',
      files: [{ relativePath: 'AGENTS.md', content: '# HR Manager\n' }],
    })
  })

  test('createSoulRelease carries the caller-composed id and descriptorRef', () => {
    expect(createSoulRelease({
      id: 'hr-manager@1.2.3',
      version: '1.2.3',
      displayName: 'HR Manager',
      descriptorRef: '/abs/path/soul.descriptor.json',
      files: [{ relativePath: 'AGENTS.md', content: '# HR Manager\n' }],
    })).toEqual({
      id: 'hr-manager@1.2.3',
      version: '1.2.3',
      displayName: 'HR Manager',
      descriptorRef: '/abs/path/soul.descriptor.json',
      files: [{ relativePath: 'AGENTS.md', content: '# HR Manager\n' }],
    })
  })

  test('US-002: user slug that collides with a reserved AIWorker home segment is rejected', () => {
    // The reserved set must at least cover the control-plane SoT and the per-owner home
    // structure segments under $HOME/.aiworker/<userSlug>/.
    for (const reserved of ['control-plane', 'config', 'cache', 'run', 'projects', 'paseo', '.paseo'])
      expect(RESERVED_USER_SLUGS.has(reserved)).toBe(true)

    // Inputs that sanitize down to a reserved word must throw, not silently pass.
    // Each is traced through normalizeAssignedEmail + the two .replace() passes:
    //   'control-plane'   -> 'control-plane'   (dash survives)
    //   'CONTROL-PLANE'   -> 'control-plane'   (lowercased)
    //   'control-plane@'  -> 'control-plane'   (@->-, trailing - stripped)
    //   'config'/'cache'/'run'/'projects'/'paseo' -> unchanged
    //   '.paseo'          -> '.paseo'          (dot survives, only dashes trimmed)
    for (const collidingEmail of [
      'control-plane',
      'CONTROL-PLANE',
      'control-plane@',
      'config',
      'cache',
      'run',
      'projects',
      'paseo',
      '.paseo',
    ]) {
      expect(() => deriveAssignedUserSlug(collidingEmail)).toThrow(/reserved AIWorker home segment/)
    }
  })

  test('US-002: reserved-name guard also rejects a pre-derived reserved slug at the port chokepoint', () => {
    // getWorkspacePathPolicy/createDefaultPaseoDaemonEndpointRef route a raw userSlug
    // through deriveOwnerScopedPaseoPort, so the guard must reject reserved slugs there too,
    // not only inside deriveAssignedUserSlug.
    expect(() => deriveOwnerScopedPaseoPort('control-plane')).toThrow(/reserved AIWorker home segment/)
    // Project names that happen to equal a reserved word are a different segment layer
    // (projects/<name>) and must NOT be rejected — only the user-slug layer collides.
  })

  test('US-002: normal emails are unaffected by the reserved-name guard', () => {
    expect(deriveAssignedUserSlug('alice@example.com')).toBe('alice-example.com')
    // 'control-plane@x.com' sanitizes to 'control-plane-x.com', which is NOT a reserved
    // exact match, so a real employee whose email merely starts with a reserved word passes.
    expect(deriveAssignedUserSlug('control-plane@x.com')).toBe('control-plane-x.com')
    expect(deriveAssignedUserSlug('configurator@example.com')).toBe('configurator-example.com')
  })
})
