import type { SoulAppEngineAssets } from '@zonease/aiworker-shared'

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb, initWorkerDb, runWorkerMigrations, upsertWorkerOverlayAssets } from '@zonease/aiworker-storage-sqlite/worker'
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

  it('runs the workspace session loop from turn to completion', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return { summary: `Finished ${input.turnId}` }
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
    expect(result.files).toHaveLength(0)
    expect(result.events.map(event => event.type)).toEqual(['status', 'status', 'status'])

    const snapshot = workerRuntime.snapshot()
    expect(snapshot.worker.soulId).toBe('hr')
    expect(snapshot.workspaces).toHaveLength(1)
    expect(snapshot.sessions[0]?.capabilityTemplateId).toBe('candidate-screen')
    expect(snapshot.turns[0]?.status).toBe('succeeded')
    expect(snapshot.invocations[0]?.metadataJson).toMatchObject({ outputKind: 'candidate-screen' })
    expect(snapshot).not.toHaveProperty('reviews')
    expect(snapshot).not.toHaveProperty('lessons')
  })

  it('carries session template metadata into continuation turn prompts and artifacts', async () => {
    const prompts: string[] = []
    const workerRuntime = runtime({
      async invoke(input) {
        prompts.push(input.prompt)
        return {
          summary: `Finished ${input.turnId}`,
          artifacts: [
            {
              path: `artifacts/${input.sessionId}/${input.turnId}-candidate-screen.md`,
              kind: 'candidate-screen',
              title: 'Candidate Screen',
              content: '# Candidate Screen\n\nEvidence attached.\n',
            },
          ],
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Hiring Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Screen candidate',
      metadata: {
        outputKind: 'candidate-screen',
        reviewRubric: ['Evidence references are present.'],
        skillName: 'Candidate Screen',
      },
    })

    const result = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Continue the screen.',
      engineId: 'codex',
      metadata: { executionMode: 'local-cli' },
    })

    expect(prompts[0]).toContain('Output kind: candidate-screen')
    expect(result.invocation.metadataJson).toMatchObject({ executionMode: 'local-cli', outputKind: 'candidate-screen', skillName: 'Candidate Screen' })
    expect(result.turn.metadataJson).toMatchObject({ executionMode: 'local-cli', outputKind: 'candidate-screen', skillName: 'Candidate Screen' })
  })

  it('records explicit skill mention metadata while preserving natural language input', async () => {
    const prompts: string[] = []
    const workerRuntime = runtime({
      async invoke(input) {
        prompts.push(input.prompt)
        return {
          summary: `Finished ${input.turnId}`,
          artifacts: [],
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Candidate pool' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-profile',
      title: 'Candidate pool',
      context: 'Use $interview-brief for this resume.',
      metadata: {
        mentions: [{ id: 'interview-brief', kind: 'skill', label: 'Interview brief' }],
      },
    })

    const result = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Use $interview-brief for this resume.',
      engineId: 'codex',
      metadata: {
        mentions: [{ id: 'interview-brief', kind: 'skill', label: 'Interview brief' }],
      },
    })

    expect(result.turn.metadataJson).toMatchObject({
      mentions: [{ id: 'interview-brief', kind: 'skill' }],
    })
    expect(prompts[0]).toContain('Explicit skill mentions:\n- skill: interview-brief')
    expect(prompts[0]).toContain('Turn request:\nUse $interview-brief for this resume.')
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

  it('materializes simplified session context with cwd, engine, and soul-app files', async () => {
    const workerRuntime = runtime({
      async invoke(_input) {
        return { summary: 'ok' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Hiring Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'aiworker-hr.interview-brief',
      title: 'Interview brief',
      metadata: {
        outputKind: 'interview-brief',
      },
    })

    await expect(
      workerRuntime.files(workspace.id).read(`.aiworker/sessions/${session.id}/context/cwd.txt`),
    ).resolves.toBe(workspace.rootPath)
    await expect(
      workerRuntime.files(workspace.id).read(`.aiworker/sessions/${session.id}/context/engine.json`),
    ).resolves.toContain('"engineId": "codex"')
    await expect(
      workerRuntime.files(workspace.id).read(`.aiworker/sessions/${session.id}/context/soul-app.json`),
    ).resolves.toContain('"soulId": "hr"')
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

  it('projects worker overlay skills over the Soul App baseline for new workspaces and explicit reprojects', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr-overlay-skill')
    await writeProfileEngineAssets(appRoot)
    await mkdir(join(appRoot, 'engine-assets', 'skills', 'interview-brief'), { recursive: true })
    await writeFile(join(appRoot, 'engine-assets', 'skills', 'interview-brief', 'SKILL.md'), '# Baseline Interview Brief\n')

    const workerRuntime = runtimeWithEngineAssets(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const existingWorkspace = await workerRuntime.createWorkspace({ name: 'Existing candidate pool' })
    await expect(readFile(join(existingWorkspace.rootPath, '.agents', 'skills', 'aiworker-hr-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Baseline Interview Brief')

    upsertWorkerOverlayAssets(workerRuntime.workerId, [{
      content: '# Overlay Interview Brief\n',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      target: 'codex',
    }])

    await workerRuntime.init()
    await expect(readFile(join(existingWorkspace.rootPath, '.agents', 'skills', 'aiworker-hr-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Baseline Interview Brief')

    const reprojected = await workerRuntime.reprojectWorkspaceAssets(existingWorkspace.id)
    await expect(readFile(join(existingWorkspace.rootPath, '.agents', 'skills', 'aiworker-hr-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Overlay Interview Brief')
    expect(reprojected.receipt?.projections).toContainEqual(expect.objectContaining({
      source: 'worker-overlay',
      target: '.agents/skills/aiworker-hr-interview-brief/SKILL.md',
    }))
    expect(reprojected.workspace.metadataJson.engineAssetProjection).toMatchObject({
      projectionManifestPath: '.aiworker/projections.json',
    })

    const newWorkspace = await workerRuntime.createWorkspace({ name: 'New candidate pool' })
    await expect(readFile(join(newWorkspace.rootPath, '.agents', 'skills', 'aiworker-hr-interview-brief', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Overlay Interview Brief')
    const receipt = JSON.parse(await readFile(join(newWorkspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
      projections: Array<{ source: string, target: string }>
    }
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      source: 'worker-overlay',
      target: '.agents/skills/aiworker-hr-interview-brief/SKILL.md',
    }))
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
    expect(readme).toContain('## Profile Update State')
    expect(readme).toContain('No accepted profile update yet.')
    await expect(readFile(join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('Available native skills may be empty')
    await expect(readFile(join(workspace.rootPath, 'CLAUDE.md'), 'utf8')).resolves.toBe('@AGENTS.md\n')
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
    '- If a result should change the accepted profile, write a clear artifact with an `aiworker-profile-readme` draft.',
    '- The owning Soul App decides when a README patch is accepted into `README.md`.',
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
    '> Starter People Profile for this workspace. The owning Soul App may replace this scaffold with accepted profile content.',
    '',
    '## Current Profile Summary',
    '',
    'No accepted profile update yet.',
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
    '| Profile baseline | Missing | No accepted profile update |',
    '',
    '## Risks And Gaps',
    '',
    '- No accepted risks or gaps yet.',
    '',
    '## Next HR Actions',
    '',
    '- Add source-backed profile evidence through the owning Soul App.',
    '',
    '## Profile Update State',
    '',
    'No accepted profile update yet.',
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

function _gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
}
