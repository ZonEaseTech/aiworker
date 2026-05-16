import type { SoulAppEngineAssets } from '@zonease/aiworker-shared'

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { LocalWorkerRuntime } from './runtime'

describe('LocalWorkerRuntime', () => {
  let dir: string
  let tick: number

  beforeEach(() => {
    closeWorkerDb()
    tick = 0
    dir = mkdtempSync(join(tmpdir(), 'aiworker-workspace-runtime-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function now(): string {
    tick += 1
    return `2026-05-09T00:00:${String(tick).padStart(2, '0')}.000Z`
  }

  function runtime(executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor']) {
    return new LocalWorkerRuntime({
      worker: {
        id: 'worker-hr',
        soulId: 'hr',
        name: 'HR',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-hr', 'workspaces'),
      now,
      executor,
    })
  }

  function runtimeWithEngineAssets(
    sourceRoot: string,
    executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor'],
    options: { defaultEngineId?: string, engineAssets?: SoulAppEngineAssets } = {},
  ) {
    return new LocalWorkerRuntime({
      worker: {
        id: 'worker-hr',
        soulId: 'aiworker-hr',
        name: 'AIWorker HR',
        defaultEngineId: options.defaultEngineId ?? 'codex',
      },
      engineAssetSource: {
        appId: 'aiworker-hr',
        ...(options.engineAssets ? { engineAssets: options.engineAssets } : {}),
        sourceRoot,
      },
      workspacesRoot: join(dir, 'workers', 'worker-hr', 'workspaces'),
      now,
      executor,
    })
  }

  function runtimeFor(worker: { id: string, name: string, soulId: string }, executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor']) {
    return new LocalWorkerRuntime({
      worker: {
        id: worker.id,
        soulId: worker.soulId,
        name: worker.name,
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', worker.id, 'workspaces'),
      now,
      executor,
    })
  }

  it('runs the workspace session loop from turn to artifacts, review, and lessons', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return {
          summary: `Finished ${input.turnId}`,
          artifacts: [
            {
              path: `artifacts/${input.sessionId}/candidate.md`,
              title: 'Candidate Review',
              content: '# Candidate Review\n\nEvidence attached.\n',
            },
          ],
          review: {
            verdict: 'warn',
            findings: [{ message: 'Needs one more source.' }],
          },
          lessons: [
            {
              statement: 'Attach source evidence to every candidate recommendation.',
              evidence: [{ turnId: input.turnId }],
            },
          ],
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({
      name: 'Hiring Workspace',
    })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Screen candidate',
      context: 'Review the packet.',
      metadata: {
        outputKind: 'candidate-screen',
        skillName: 'Candidate Screen',
      },
    })

    const result = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Prepare the screen.',
      engineId: 'codex',
      engineCommand: 'codex',
      metadata: {
        outputKind: 'candidate-screen',
        skillName: 'Candidate Screen',
      },
    })

    expect(result.turn.status).toBe('succeeded')
    expect(result.invocation.status).toBe('succeeded')
    expect(result.files).toHaveLength(1)
    expect(result.artifacts[0]?.title).toBe('Candidate Review')
    expect(result.review?.verdict).toBe('warn')
    expect(result.lessons[0]?.statement).toContain('source evidence')
    expect(result.events.map(event => event.type)).toEqual(['status', 'status', 'artifact', 'review', 'lesson', 'status'])
    await expect(workerRuntime.files(workspace.id).read('artifacts/'.concat(session.id, '/candidate.md'))).resolves.toContain('Evidence attached')

    const snapshot = workerRuntime.snapshot()
    expect(snapshot.worker.soulId).toBe('hr')
    expect(snapshot.workspaces).toHaveLength(1)
    expect(snapshot.sessions[0]?.capabilityTemplateId).toBe('candidate-screen')
    expect(snapshot.turns[0]?.status).toBe('succeeded')
    expect(snapshot.invocations[0]?.metadataJson).toMatchObject({ outputKind: 'candidate-screen' })
    expect(snapshot.artifacts).toHaveLength(1)
    expect(snapshot.reviews).toHaveLength(1)
    expect(snapshot.lessons).toHaveLength(1)
  })

  it('records failed turns without throwing away the event trail', async () => {
    const workerRuntime = runtime({
      async invoke() {
        throw new Error('executor failed')
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Hiring Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Screen candidate',
    })

    const result = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Start direct session turn.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(result.turn.status).toBe('failed')
    expect(result.turn.error).toBe('executor failed')
    expect(result.invocation.status).toBe('failed')
    expect(result.events.map(event => event.type)).toEqual(['status', 'status', 'error'])
  })

  it('keeps runtime workspaces isolated when two workers share one Soul', async () => {
    const executor = {
      async invoke() {
        return { summary: 'ok' }
      },
    }
    const recruitingRuntime = runtimeFor({ id: 'worker-hr-recruiting', soulId: 'hr', name: 'HR Recruiting' }, executor)
    const talentRuntime = runtimeFor({ id: 'worker-hr-talent-pool', soulId: 'hr', name: 'HR Talent Pool' }, executor)

    await recruitingRuntime.init()
    await talentRuntime.init()
    const recruitingWorkspace = await recruitingRuntime.createWorkspace({ name: 'Open roles' })
    const talentWorkspace = await talentRuntime.createWorkspace({ name: 'Talent pool' })

    expect(recruitingRuntime.snapshot().worker.soulId).toBe('hr')
    expect(talentRuntime.snapshot().worker.soulId).toBe('hr')
    expect(recruitingRuntime.snapshot().workspaces.map(workspace => workspace.id)).toEqual([recruitingWorkspace.id])
    expect(talentRuntime.snapshot().workspaces.map(workspace => workspace.id)).toEqual([talentWorkspace.id])
  })

  it('bootstraps profile workspace ledger and projects app-owned native skills', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr')
    await writeProfileEngineAssets(appRoot)

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Ada Lovelace Candidate', type: 'people-profile' })

    const readme = await readFile(join(workspace.rootPath, 'README.md'), 'utf8')
    expect(readme).toContain('# Ada Lovelace Candidate')
    expect(readme).toContain('## Current Profile Summary')
    expect(readme).toContain('## Identity And Basics')
    expect(readme).toContain('## Role Context And Responsibilities')
    expect(readme).toContain('## Capabilities And Stack')
    expect(readme).toContain('## Accepted External Sections')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('README.md is the accepted profile state')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('AIWorker HR')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('treat that action as an explicit skill selection')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Do not silently switch to another skill')
    await expect(readFile(join(workspace.rootPath, 'CLAUDE.md'), 'utf8')).resolves.toBe('@AGENTS.md\n')
    await expect(stat(join(workspace.rootPath, 'artifacts'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, 'reviews'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, 'evidence', 'descriptors'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, 'evidence', 'raw'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, '.aiworker', 'sessions'))).resolves.toBeTruthy()

    const gitignore = await readFile(join(workspace.rootPath, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.aiworker/sessions/')
    expect(gitignore).toContain('.aiworker/projections.json')
    expect(gitignore).toContain('evidence/raw/')
    expect(gitignore).not.toContain('AGENTS.md')
    expect(gitignore).not.toContain('CLAUDE.md')
    expect(gitignore).not.toContain('.agents/skills/aiworker-*')
    expect(gitignore).not.toContain('.claude/skills/aiworker-*')

    await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-hr-candidate-profile', 'SKILL.md'), 'utf8')).resolves.toContain('Candidate Profile')
    await expect(readFile(join(workspace.rootPath, '.claude', 'skills', 'aiworker-hr-candidate-profile', 'SKILL.md'), 'utf8')).resolves.toContain('Candidate Profile')
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      appId: string
      projections: Array<{ kind: string, sha256: string, source: string, target: string }>
    }
    expect(receipt.appId).toBe('aiworker-hr')
    expect(receipt.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'workspace-file', source: 'engine-assets/workspace/AGENTS.md', target: 'AGENTS.md' }),
      expect.objectContaining({ kind: 'native-skill', source: 'engine-assets/skills/candidate-profile/SKILL.md', target: '.agents/skills/aiworker-hr-candidate-profile/SKILL.md' }),
      expect.objectContaining({ kind: 'native-skill', source: 'engine-assets/skills/candidate-profile/SKILL.md', target: '.claude/skills/aiworker-hr-candidate-profile/SKILL.md' }),
    ]))
    expect(receipt.projections.every(item => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true)

    if (gitAvailable()) {
      const head = spawnSync('git', ['-C', workspace.rootPath, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' })
      expect(head.status).toBe(0)
      expect(head.stdout.trim()).toMatch(/^[a-f0-9]{40}$/)
    }
  })

  it('projects Codex MCP client config for codex workers', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr-mcp-codex')
    await writeMcpClientEngineAssets(appRoot)

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, { engineAssets: mcpClientEngineAssets() })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Codex MCP Workspace' })

    await expect(readFile(join(workspace.rootPath, '.codex', 'config.toml'), 'utf8')).resolves.toContain('mcp_servers.ats')
    await expect(stat(join(workspace.rootPath, '.mcp.json'))).rejects.toThrow()
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ engineTarget?: string, kind: string, source: string, target: string }>
    }
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      engineTarget: 'codex',
      kind: 'mcp-client',
      source: 'engine-assets/mcp-clients/codex/config.toml',
      target: '.codex/config.toml',
    }))
  })

  it('projects Claude Code MCP client config for claude-code workers', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr-mcp-claude')
    await writeMcpClientEngineAssets(appRoot)

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, {
      defaultEngineId: 'claude-code',
      engineAssets: mcpClientEngineAssets(),
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Claude MCP Workspace' })

    await expect(readFile(join(workspace.rootPath, '.mcp.json'), 'utf8')).resolves.toContain('aiworker-mcp-ats')
    await expect(stat(join(workspace.rootPath, '.codex', 'config.toml'))).rejects.toThrow()
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ engineTarget?: string, kind: string, source: string, target: string }>
    }
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      engineTarget: 'claude-code',
      kind: 'mcp-client',
      source: 'engine-assets/mcp-clients/claude-code/.mcp.json',
      target: '.mcp.json',
    }))
  })

  it('skips MCP client config for unsupported worker engine targets', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr-mcp-http')
    await writeMcpClientEngineAssets(appRoot)

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, {
      defaultEngineId: 'http',
      engineAssets: mcpClientEngineAssets(),
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'HTTP MCP Workspace' })
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ kind: string }>
    }

    expect(receipt.projections.filter(item => item.kind === 'mcp-client')).toEqual([])
    await expect(stat(join(workspace.rootPath, '.mcp.json'))).rejects.toThrow()
    await expect(stat(join(workspace.rootPath, '.codex', 'config.toml'))).rejects.toThrow()
  })

  it('rejects literal secrets in MCP client config projections', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr-mcp-secret')
    await writeMcpClientEngineAssets(appRoot)
    await writeFile(join(appRoot, 'engine-assets', 'mcp-clients', 'codex', 'config.toml'), 'token = "sk-test-literal-secret"\n')

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    }, { engineAssets: mcpClientEngineAssets() })

    await workerRuntime.init()
    await expect(workerRuntime.createWorkspace({ name: 'Secret MCP Workspace' })).rejects.toThrow('MCP client config must not contain literal secrets')
  })

  it('repairs stale workspace root agent instructions during runtime init', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr')
    await writeProfileEngineAssets(appRoot)
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Repairable Profile' })
    await writeFile(join(workspace.rootPath, 'AGENTS.md'), '# stale\n')
    await writeFile(join(workspace.rootPath, 'CLAUDE.md'), 'stale\n')

    await workerRuntime.init()

    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('README.md is the accepted profile state')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Repairable Profile')
    await expect(readFile(join(workspace.rootPath, 'CLAUDE.md'), 'utf8')).resolves.toBe('@AGENTS.md\n')
  })

  it('keeps a Soul App without native skills valid and usable', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr-no-skills')
    await writeWorkspaceEngineAssets(appRoot)
    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'No Skills Profile' })
    const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      appId: string
      projections: Array<{ kind: string }>
    }

    expect(receipt.appId).toBe('aiworker-hr')
    expect(receipt.projections.filter(item => item.kind === 'native-skill')).toEqual([])
    const readme = await readFile(join(workspace.rootPath, 'README.md'), 'utf8')
    expect(readme).toContain('## Identity And Basics')
    expect(readme).toContain('## Review State')
    expect(readme).toContain('No approved profile revision yet.')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Available native skills may be empty')
    await expect(readFile(join(workspace.rootPath, 'CLAUDE.md'), 'utf8')).resolves.toBe('@AGENTS.md\n')
  })

  it('promotes a reviewed artifact into the canonical profile README', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return {
          summary: 'Profile proposal ready',
          artifacts: [
            {
              path: `artifacts/${input.sessionId}/profile-proposal.md`,
              title: 'Profile proposal',
              content: '# Accepted Candidate Profile\n\nEvidence-backed summary.\n',
            },
          ],
        }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Profile Promotion Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'person-profile',
      title: 'Prepare profile',
    })
    const turn = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Draft the profile.',
      engineId: 'codex',
    })

    const promotion = await workerRuntime.promoteProfileRevision({
      artifactId: turn.artifacts[0]!.id,
      findingsJson: [{ message: 'Approved from HR review.' }],
      risksJson: [],
      verdict: 'pass',
      workspaceId: workspace.id,
    })

    expect(promotion.review.verdict).toBe('pass')
    expect(promotion.profilePath).toBe('README.md')
    expect(promotion.reviewPath).toBe(`reviews/${promotion.review.id}.md`)
    await expect(readFile(join(workspace.rootPath, 'README.md'), 'utf8')).resolves.toContain('Accepted Candidate Profile')
    await expect(readFile(join(workspace.rootPath, promotion.reviewPath), 'utf8')).resolves.toContain('Approved from HR review.')
    expect(workerRuntime.snapshot().reviews.map(review => review.id)).toContain(promotion.review.id)

    if (gitAvailable()) {
      expect(promotion.git.status).toBe('created')
      const log = spawnSync('git', ['-C', workspace.rootPath, 'log', '--oneline', '--', 'README.md'], { encoding: 'utf8' })
      expect(log.stdout).toContain('profile: approve Profile Promotion Workspace revision')
    }
  })
})

async function writeProfileEngineAssets(appRoot: string): Promise<void> {
  await writeWorkspaceEngineAssets(appRoot)
  await mkdir(join(appRoot, 'engine-assets', 'skills', 'candidate-profile'), { recursive: true })
  await writeFile(join(appRoot, 'engine-assets', 'skills', 'candidate-profile', 'SKILL.md'), [
    '---',
    'name: candidate-profile',
    'description: Maintain a source-backed candidate profile.',
    '---',
    '',
    '# Candidate Profile',
    '',
    'Use candidate, employee, and alumni lifecycle language.',
    '',
  ].join('\n'))
}

async function writeMcpClientEngineAssets(appRoot: string): Promise<void> {
  await writeProfileEngineAssets(appRoot)
  await mkdir(join(appRoot, 'engine-assets', 'mcp-clients', 'codex'), { recursive: true })
  await mkdir(join(appRoot, 'engine-assets', 'mcp-clients', 'claude-code'), { recursive: true })
  await writeFile(join(appRoot, 'engine-assets', 'mcp-clients', 'codex', 'config.toml'), [
    '[mcp_servers.ats]',
    'command = "uvx"',
    'args = ["aiworker-mcp-ats"]',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'mcp-clients', 'claude-code', '.mcp.json'), `${JSON.stringify({
    mcpServers: {
      ats: {
        args: ['aiworker-mcp-ats'],
        command: 'uvx',
      },
    },
  }, null, 2)}\n`)
}

function mcpClientEngineAssets(): SoulAppEngineAssets {
  return {
    mcpClients: [
      { source: './engine-assets/mcp-clients/codex', target: 'codex' },
      { source: './engine-assets/mcp-clients/claude-code', target: 'claude-code' },
    ],
    skills: {
      source: './engine-assets/skills',
      targets: ['codex', 'claude-code'],
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  }
}

async function writeWorkspaceEngineAssets(appRoot: string): Promise<void> {
  await mkdir(join(appRoot, 'engine-assets', 'workspace', 'evidence'), { recursive: true })
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'AGENTS.md'), [
    '# {{workerName}} Workspace Instructions',
    '',
    'This workspace belongs to an AIWorker Soul App profile ledger.',
    '',
    '## Workspace Identity',
    '',
    '- Soul worker: {{workerName}}',
    '- Soul id: {{soulId}}',
    '- Workspace profile: {{workspaceName}}',
    '',
    '## Accepted State',
    '',
    '- README.md is the accepted profile state for this workspace.',
    '- Do not directly update `README.md` during an agent session.',
    '',
    '## Action and Skill Binding',
    '',
    '- When a session is started from a Soul App action, treat that action as an explicit skill selection.',
    '- Do not silently switch to another skill.',
    '- Available native skills may be empty.',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'CLAUDE.md'), '@AGENTS.md\n')
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'README.md'), [
    '# {{workspaceName}}',
    '',
    '> Accepted People Profile for this workspace. Agent outputs remain proposals until review.',
    '',
    '## Current Profile Summary',
    '',
    'No approved profile revision yet.',
    '',
    '## Identity And Basics',
    '',
    '- Lifecycle: Unknown',
    '- Target role: Unknown',
    '- Current stage: Not started',
    '- Profile confidence: No accepted evidence yet',
    '',
    '## Role Context And Responsibilities',
    '',
    'No accepted role context yet.',
    '',
    '## Capabilities And Stack',
    '',
    '- No accepted capabilities yet.',
    '',
    '## Confirmed Facts',
    '',
    '- No confirmed facts yet.',
    '',
    '## Evidence Status',
    '',
    '| Signal | Status | Source |',
    '| --- | --- | --- |',
    '| Profile baseline | Missing | No approved revision |',
    '',
    '## Risks And Gaps',
    '',
    '- No accepted risks or gaps yet.',
    '',
    '## Next HR Actions',
    '',
    '- Approve a profile revision to update this README.',
    '',
    '## Review State',
    '',
    'No approved profile revision yet.',
    '',
    '## Accepted External Sections',
    '',
    '- None yet.',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'workspace', '.gitignore'), [
    '.aiworker/sessions/',
    '.aiworker/projections.json',
    'evidence/raw/',
    '',
  ].join('\n'))
  await writeFile(join(appRoot, 'engine-assets', 'workspace', 'evidence', 'README.md'), '# Evidence\n')
}

function gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
}
