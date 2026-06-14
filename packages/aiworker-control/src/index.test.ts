import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  canAdvanceAssignment,
  createAssignment,
  createHandoff,
  createProvisionPlan,
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
      workspaceRef: '/home/alice/workspaces/hr-recruiter',
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
      workspaceRef: '/home/alice/workspaces/hr-recruiter',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })

    expect(plan.command).toContain('aissh exec aissh:server-1')
    expect(plan.command).toContain('PASEO_HOME=/home/alice/.paseo')
    expect(plan.command).toContain('paseo --host unix:/run/paseo/alice.sock daemon status')
    expect(plan.command).toContain('base64 -d')
    expect(plan.receipt.soulReleaseRef).toBe('hr-recruiter@1.2.0')
    expect(plan.assignment.handoff?.kind).toBe('paseo-daemon')
    expect(plan.command).toContain('command -v claude')
    expect(plan.command).not.toContain('secret://org/claude-work')
  })

  test('rejects provider profiles that are not attached to the Paseo environment', () => {
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: 'codex-personal',
      soulReleaseRef: 'hr-recruiter@1.2.0',
      workspaceRef: '/home/alice/workspaces/hr-recruiter',
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
      workspaceRef: '/home/alice/workspaces/hr-recruiter',
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
      workspaceRef: '/home/alice/workspaces/hr-recruiter',
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
    const handoff = createHandoff({ ...environment, daemonEndpoint: 'https://app.paseo.sh/#offer=abc', endpointKind: 'relay-offer' }, '/w/hr')
    expect(handoff.kind).toBe('pairing-offer')
    expect(handoff.instructions).toContain('/w/hr')
  })
})
