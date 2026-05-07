import type { WorkerConfig } from '@zonease/aiworker-shared'
import type { IntegrationCleanup } from '../../test-utils/integration-cleanup'
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import process from 'node:process'
import { describe, expect, it, setDefaultTimeout } from 'bun:test'

import { BUILTIN_SOUL_PRESETS } from '../../soul/presets'
import { withIntegrationCleanup } from '../../test-utils/integration-cleanup'

const cliEntry = path.resolve(import.meta.dir, '..', '..', 'aiworker.ts')
const HELPER_TIMEOUT_MS = 30_000

setDefaultTimeout(30_000)

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  }
  catch {
    return false
  }
}

function isolatedEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined)
      env[key] = value
  }
  env.HOME = home
  delete env.AIWORKER_HOME
  delete env.AIWORKER_MASTER_KEY
  delete env.INTERNAL_SHARED_SECRET
  delete env.WORKER_DB_PATH
  delete env.WORKER_DATA_ROOT
  return env
}

async function runCli(
  cleanup: IntegrationCleanup,
  args: string[],
  cwd: string,
  home: string,
  extraEnv: Record<string, string> = {},
): Promise<{ exitCode: number, output: string }> {
  const proc = cleanup.trackProcess(Bun.spawn([process.execPath, cliEntry, ...args], {
    cwd,
    env: { ...isolatedEnv(home), ...extraEnv },
    stderr: 'pipe',
    stdout: 'pipe',
  }))
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, output: `${stdout}\n${stderr}` }
}

function withCliIntegrationCleanup<T>(run: (cleanup: IntegrationCleanup) => Promise<T>): Promise<T> {
  return withIntegrationCleanup({ timeoutMs: HELPER_TIMEOUT_MS }, run)
}

describe('aiworker init / scope project placement', () => {
  it('scope is non-mutating outside a project', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const cwd = await cleanup.makeTempDir('aiworker-cli-scope-cwd-')
      const home = await cleanup.makeTempDir('aiworker-cli-scope-home-')
      const result = await runCli(cleanup, ['scope'], cwd, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Scope')
      expect(result.output).toContain('user')
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
    })
  })

  it('init in a fresh non-interactive project requires an explicit Soul preset', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-init-no-soul-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-no-soul-home-')
      const result = await runCli(cleanup, ['init'], project, home)

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('brand-new project init requires a Soul preset in non-interactive mode')
      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
    })
  })

  it('init from HOME with legacy .aiworker requires Soul and scope reports user', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const home = await cleanup.makeTempDir('aiworker-cli-init-legacy-home-')
      const aiworker = path.join(home, '.aiworker')
      await mkdir(aiworker, { recursive: true })
      await writeFile(path.join(aiworker, '.env'), 'AIWORKER_MASTER_KEY=legacy\n', 'utf8')
      await writeFile(path.join(aiworker, 'worker.db'), '', 'utf8')

      const init = await runCli(cleanup, ['init', '--dry-run'], home, home)

      expect(init.exitCode).toBe(2)
      expect(init.output).toContain('brand-new project init requires a Soul preset in non-interactive mode')
      expect(init.output).not.toContain('[aiworker init] preflight (project-scope)')
      expect(await exists(path.join(aiworker, 'AGENT.md'))).toBe(false)
      expect(await exists(path.join(aiworker, 'SOUL.md'))).toBe(false)
      expect(await exists(path.join(aiworker, 'local', 'worker.db'))).toBe(false)

      const scope = await runCli(cleanup, ['scope'], home, home)
      expect(scope.exitCode).toBe(0)
      expect(scope.output).toContain('Scope        : user')
      expect(scope.output).toContain('Source       : user-default')
      expect(scope.output).not.toContain('Project root :')
    })
  })

  it('init --soul can adopt legacy HOME .aiworker into project layout', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const home = await cleanup.makeTempDir('aiworker-cli-init-adopt-home-')
      const aiworker = path.join(home, '.aiworker')
      const legacyEnv = 'AIWORKER_MASTER_KEY=legacy\n'
      await mkdir(aiworker, { recursive: true })
      await writeFile(path.join(aiworker, '.env'), legacyEnv, 'utf8')
      await writeFile(path.join(aiworker, 'worker.db'), 'legacy db marker', 'utf8')

      const init = await runCli(cleanup, ['init', '--soul', 'developer'], home, home)

      expect(init.exitCode).toBe(0)
      expect(init.output).toContain('[aiworker init] preflight (project-scope)')
      expect(init.output).toContain('Soul         : developer (Developer, flag)')
      expect(await readFile(path.join(aiworker, '.env'), 'utf8')).toBe(legacyEnv)
      expect(await readFile(path.join(aiworker, 'worker.db'), 'utf8')).toBe('legacy db marker')
      expect(await exists(path.join(aiworker, 'AGENT.md'))).toBe(true)
      expect(await exists(path.join(aiworker, 'SOUL.md'))).toBe(true)
      expect(await exists(path.join(aiworker, 'local', 'worker.db'))).toBe(true)

      const scope = await runCli(cleanup, ['scope'], home, home)
      const canonicalHome = await realpath(home)
      expect(scope.exitCode).toBe(0)
      expect(scope.output).toContain('Scope        : project')
      expect(scope.output).toContain('Source       : project-detect')
      expect(scope.output).toContain(`Project root : ${canonicalHome}`)
    })
  })

  it('explicit user-scope init paths remain available under legacy HOME .aiworker', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const home = await cleanup.makeTempDir('aiworker-cli-init-legacy-explicit-home-')
      const explicitHome = path.join(home, 'custom-aiworker-home')
      await mkdir(path.join(home, '.aiworker'), { recursive: true })

      const globalInit = await runCli(cleanup, ['init', '--global', '--dry-run'], home, home)
      expect(globalInit.exitCode).toBe(0)
      expect(globalInit.output).toContain('[aiworker init] preflight (user-scope)')
      expect(globalInit.output).toContain(`Home         : ${path.join(home, '.aiworker')}`)

      const explicitInit = await runCli(cleanup, ['init', '--dry-run'], home, home, {
        AIWORKER_HOME: explicitHome,
      })
      expect(explicitInit.exitCode).toBe(0)
      expect(explicitInit.output).toContain('[aiworker init] preflight (explicit-scope)')
      expect(explicitInit.output).toContain(`Home         : ${explicitHome}`)
    })
  })

  it('user and explicit init next steps do not point to project-only executor doctor', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const home = await cleanup.makeTempDir('aiworker-cli-init-user-next-steps-home-')
      const globalInit = await runCli(cleanup, ['init', '--global'], home, home)

      expect(globalInit.exitCode).toBe(0)
      expect(globalInit.output).toContain('[aiworker init] next steps')
      expect(globalInit.output).toContain('aiworker executor select --engine <YOUR_ENGINE> --apply')
      expect(globalInit.output).toContain('Suggested for general use')
      expect(globalInit.output).toContain('Advisory only')
      expect(globalInit.output).toContain('Candidates: claude-code | codex | acp | cursor | mcp | http')
      expect(globalInit.output).toContain('aiworker run --message "hello" --dry-run')
      // User-scope next-steps hint at executor doctor without forcing a single engine.
      expect(globalInit.output).toContain('aiworker executor doctor --engine claude-code')

      const explicitHome = path.join(home, 'explicit-aiworker-home')
      const explicitInit = await runCli(cleanup, ['init'], home, home, {
        AIWORKER_HOME: explicitHome,
      })

      expect(explicitInit.exitCode).toBe(0)
      expect(explicitInit.output).toContain('[aiworker init] next steps')
      expect(explicitInit.output).toContain('aiworker executor select --engine <YOUR_ENGINE> --apply')
      expect(explicitInit.output).toContain('Suggested for general use')
      expect(explicitInit.output).toContain('Advisory only')
      expect(explicitInit.output).toContain('aiworker run --message "hello" --dry-run')
    })
  })

  it('init in a fresh git repo creates project layout without user-scope fallback', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-home-')
      const project = path.join(root, 'repo')
      await mkdir(path.join(project, '.git'), { recursive: true })

      const result = await runCli(cleanup, ['init', '--soul', 'developer'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Soul         : developer (Developer, flag)')
      expect(result.output).toContain('[aiworker init] next steps')
      expect(result.output).toContain('aiworker scope')
      expect(result.output).toContain('.aiworker/SOUL.md')
      expect(result.output).toContain('aiworker soul show developer')
      expect(result.output).toContain('aiworker doctor')
      expect(result.output).toContain('aiworker executor doctor --engine <YOUR_ENGINE>')
      expect(result.output).toContain('Suggested for Soul `developer`')
      expect(result.output).toContain('Advisory only')
      expect(result.output).toContain('Candidates: claude-code | codex | acp | cursor | mcp | http')
      expect(result.output).toContain('aiworker run --message "hello" --dry-run')
      expect(result.output).toContain('aiworker up --port 9217')
      expect(await exists(path.join(project, '.aiworker', 'AGENT.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'SOUL.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'policy.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'toolsets.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'capability-packs.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'executor-capabilities.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'scope.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', '.env'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      const tokenFile = path.join(project, '.aiworker', 'local', 'bootstrap-token.txt')
      expect(await exists(tokenFile)).toBe(true)
      const tokenStat = await stat(tokenFile)
      expect(tokenStat.mode & 0o777).toBe(0o600)
      const tokenText = await readFile(tokenFile, 'utf8')
      const token = /^AIWORKER_BOOTSTRAP_TOKEN=(wtk_[\w-]+)$/m.exec(tokenText)?.[1]
      expect(token).toBeDefined()
      expect(result.output).toContain('Raw token stdout: hidden by default')
      expect(result.output).toContain('Bootstrap token : wtk_')
      expect(result.output).not.toContain(`AIWORKER_BOOTSTRAP_TOKEN=${token}`)
      const dotenv = await readFile(path.join(project, '.aiworker', 'local', '.env'), 'utf8')
      const masterKey = /^AIWORKER_MASTER_KEY=([0-9a-f]{64})$/m.exec(dotenv)?.[1]
      expect(masterKey).toBeDefined()
      expect(result.output).not.toContain(`AIWORKER_MASTER_KEY=${masterKey}`)
      expect(result.output).not.toContain(masterKey!)
      expect(await exists(path.join(project, '.aiworker', 'local', 'workers'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
      const soul = await readFile(path.join(project, '.aiworker', 'SOUL.md'), 'utf8')
      expect(soul).toContain('# Developer Soul')
      expect(soul).not.toContain('Voice / style guide')
      const policy = JSON.parse(await readFile(path.join(project, '.aiworker', 'policy.json'), 'utf8'))
      expect(policy.soul.preset).toBe('developer')
      const scopeManifest = JSON.parse(await readFile(path.join(project, '.aiworker', 'scope.json'), 'utf8'))
      expect(scopeManifest).toEqual({
        approval: 'manual-approval',
        kind: 'developer-repo',
        primarySoul: 'developer',
        privacy: 'private',
        schemaVersion: 1,
      })

      const configShow = await runCli(cleanup, ['config', 'show'], project, home)
      expect(configShow.exitCode).toBe(0)
      const stored = JSON.parse(configShow.output) as { config: WorkerConfig }
      expect(stored.config.brains).toEqual([
        {
          id: 'local-filesystem',
          type: 'filesystem',
          priority: 100,
          readOnly: false,
          config: {},
        },
      ])
      expect(stored.config.brainWriteTarget).toBe('local-filesystem')

      const brainStatus = await runCli(cleanup, ['brain', 'status'], project, home)
      expect(brainStatus.exitCode).toBe(0)
      const canonicalProject = await realpath(project)
      const statusBody = JSON.parse(brainStatus.output) as {
        brainWriteTarget: string
        brains: Array<{
          home: string
          id: string
          priority: number
          readOnly: boolean
          type: string
          writeTarget: boolean
        }>
        scope: {
          status: string
          manifest?: {
            approval?: string
            artifactRootCount: number
            kind: string
            labels: string[]
            primarySoul: string
            privacy?: string
          }
        }
        status: string
      }
      expect(statusBody.status).toBe('healthy')
      expect(statusBody.brainWriteTarget).toBe('local-filesystem')
      expect(statusBody.brains).toEqual([
        {
          id: 'local-filesystem',
          type: 'filesystem',
          priority: 100,
          readOnly: false,
          writeTarget: true,
          home: path.join(canonicalProject, '.aiworker'),
        },
      ])
      expect(statusBody.scope.status).toBe('ok')
      expect(statusBody.scope.manifest).toMatchObject({
        approval: 'manual-approval',
        artifactRootCount: 0,
        kind: 'developer-repo',
        primarySoul: 'developer',
        privacy: 'private',
      })

      const brainSkills = await runCli(cleanup, ['worker', 'brain', 'skills'], project, home)
      expect(brainSkills.exitCode).toBe(0)
      expect(JSON.parse(brainSkills.output)).toMatchObject({
        count: 3,
        skills: [
          { id: 'developer.codebase-orientation', name: 'Codebase Orientation' },
          { id: 'kernel.brain-admission', name: 'Brain Admission' },
          { id: 'kernel.executor-quality-review', name: 'Executor Quality Review' },
        ],
      })

      const brainMemories = await runCli(cleanup, ['brain', 'memories', '--limit', '5'], project, home)
      expect(brainMemories.exitCode).toBe(0)
      expect(JSON.parse(brainMemories.output)).toMatchObject({ count: 0, memories: [] })

      await mkdir(path.join(project, '.aiworker', 'skills', 'smoke'), { recursive: true })
      await writeFile(
        path.join(project, '.aiworker', 'skills', 'smoke', 'SKILL.md'),
        [
          '---',
          'name: Smoke Skill',
          'description: Runtime brain inspection smoke skill',
          'version: 1.0.0',
          'capabilities:',
          '  - smoke',
          '---',
          'Use this only for integration smoke tests.',
          '',
        ].join('\n'),
        'utf8',
      )
      await mkdir(path.join(project, '.aiworker', 'memories'), { recursive: true })
      await writeFile(
        path.join(project, '.aiworker', 'memories', 'runtime-brain-smoke.md'),
        [
          '---',
          'title: Runtime Brain Smoke',
          'createdAt: 2026-05-03T00:00:00.000Z',
          'updatedAt: 2026-05-03T00:00:00.000Z',
          '---',
          'runtime-brain-smoke memory is visible through the local filesystem brain.',
          '',
        ].join('\n'),
        'utf8',
      )

      const populatedSkills = await runCli(cleanup, ['brain', 'skills'], project, home)
      expect(populatedSkills.exitCode).toBe(0)
      const populatedSkillsBody = JSON.parse(populatedSkills.output)
      expect(populatedSkillsBody).toMatchObject({
        count: 4,
      })
      expect(populatedSkillsBody.skills).toContainEqual(
        expect.objectContaining({ id: 'smoke', name: 'Smoke Skill', version: '1.0.0', tags: ['smoke'] }),
      )

      const populatedMemories = await runCli(cleanup, ['brain', 'memories', '--query', 'runtime-brain-smoke'], project, home)
      expect(populatedMemories.exitCode).toBe(0)
      expect(JSON.parse(populatedMemories.output)).toMatchObject({
        count: 1,
        memories: [{ id: 'runtime-brain-smoke' }],
      })
    })
  })

  it('init --token-file writes the token to the requested file and --show-token gates raw stdout', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-token-file-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-token-file-home-')
      const project = path.join(root, 'repo')
      const tokenFile = path.join(root, 'secrets', 'bootstrap.env')
      await mkdir(path.join(project, '.git'), { recursive: true })

      const result = await runCli(cleanup, ['init', '--soul', 'developer', '--token-file', tokenFile, '--show-token'], project, home)

      expect(result.exitCode).toBe(0)
      const tokenStat = await stat(tokenFile)
      expect(tokenStat.mode & 0o777).toBe(0o600)
      const tokenText = await readFile(tokenFile, 'utf8')
      const token = /^AIWORKER_BOOTSTRAP_TOKEN=(wtk_[\w-]+)$/m.exec(tokenText)?.[1]
      expect(token).toBeDefined()
      expect(result.output).toContain('STORE THIS NOW')
      expect(result.output).toContain(`AIWORKER_BOOTSTRAP_TOKEN=${token}`)
      expect(result.output).toContain(tokenFile)
    })
  })

  it('all built-in Soul presets preview and materialize matching capability drafts', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-soul-matrix-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-soul-matrix-home-')

      for (const preset of BUILTIN_SOUL_PRESETS) {
        const dryRunProject = path.join(root, `${preset.id}-dry-run`)
        await mkdir(dryRunProject, { recursive: true })
        const dryRun = await runCli(cleanup, ['init', '--dry-run', '--soul', preset.id], dryRunProject, home)
        expect(dryRun.exitCode).toBe(0)
        expect(dryRun.output).toContain(`Soul         : ${preset.id} (${preset.label}, flag)`)
        expect(await exists(path.join(dryRunProject, '.aiworker'))).toBe(false)

        const project = path.join(root, preset.id)
        await mkdir(project, { recursive: true })
        const init = await runCli(cleanup, ['init', '--soul', preset.id], project, home)
        expect(init.exitCode).toBe(0)
        expect(init.output).toContain(`Soul         : ${preset.id} (${preset.label}, flag)`)
        expect(init.output).toContain(`aiworker soul show ${preset.id}`)
        expect(init.output).toContain('aiworker up --port 9217')

        const aiworker = path.join(project, '.aiworker')
        const soul = await readFile(path.join(aiworker, 'SOUL.md'), 'utf8')
        const agent = await readFile(path.join(aiworker, 'AGENT.md'), 'utf8')
        const policy = JSON.parse(await readFile(path.join(aiworker, 'policy.json'), 'utf8')) as {
          soul: { preset: string }
        }
        const toolsets = JSON.parse(await readFile(path.join(aiworker, 'toolsets.json'), 'utf8')) as {
          defaultToolsets: string[]
          soul: string
        }
        const packs = JSON.parse(await readFile(path.join(aiworker, 'capability-packs.json'), 'utf8')) as {
          packs: Array<{ id: string, status: string, validation: { status: string } }>
          soul: string
        }
        const scopeManifest = JSON.parse(await readFile(path.join(aiworker, 'scope.json'), 'utf8')) as {
          approval: string
          kind: string
          primarySoul: string
          privacy: string
          schemaVersion: number
        }

        expect(soul).toContain(`# ${preset.label} Soul`)
        expect(agent).toContain(`# ${preset.label} Worker`)
        expect(soul).toContain('## Brain admission governance')
        expect(agent).toContain('aiworker brain admission propose')
        expect(agent).toContain('Executor native memory is not canonical AIWorker Brain')
        expect(policy.soul.preset).toBe(preset.id)
        expect(toolsets.soul).toBe(preset.id)
        expect(toolsets.defaultToolsets).toEqual([...preset.toolsets])
        expect(packs.soul).toBe(preset.id)
        expect(packs.packs.map(pack => pack.id)).toEqual([...preset.packs])
        expect(packs.packs.every(pack => pack.status === 'draft' && pack.validation.status === 'pending')).toBe(true)
        expect(scopeManifest.schemaVersion).toBe(1)
        expect(scopeManifest.primarySoul).toBe(preset.id)
        expect(scopeManifest.privacy).toBe('private')
        expect(scopeManifest.approval).toBe('manual-approval')
        expect(typeof scopeManifest.kind).toBe('string')
        expect(scopeManifest.kind.length).toBeGreaterThan(0)
      }
    })
  })

  it('init --dry-run in a fresh git repo previews project layout without writing files', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-dry-run-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-dry-run-home-')
      const project = path.join(root, 'repo')
      await mkdir(path.join(project, '.git'), { recursive: true })

      const before = await readdir(project)
      const result = await runCli(cleanup, ['init', '--dry-run', '--soul', 'developer'], project, home)
      const after = await readdir(project)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('[aiworker init] preflight (project-scope)')
      expect(result.output).toContain('Mode         : dry-run (no files will be written)')
      expect(result.output).toContain('Soul         : developer (Developer, flag)')
      expect(result.output).toContain('.aiworker/AGENT.md')
      expect(result.output).toContain('.aiworker/policy.json')
      expect(result.output).toContain('.aiworker/toolsets.json')
      expect(result.output).toContain('.aiworker/capability-packs.json')
      expect(result.output).toContain('.aiworker/executor-capabilities.json')
      expect(result.output).toContain('.aiworker/scope.json')
      expect(result.output).toContain('.aiworker/local/worker.db (worker bootstrap)')
      expect(after).toEqual(before)
      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
    })
  })

  it('scope inside an initialized project reports project paths', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-scope-project-')
      const home = await cleanup.makeTempDir('aiworker-cli-scope-project-home-')
      const project = path.join(root, 'repo')
      await mkdir(path.join(project, '.git'), { recursive: true })
      const init = await runCli(cleanup, ['init', '--soul', 'developer'], project, home)
      expect(init.exitCode).toBe(0)

      const result = await runCli(cleanup, ['scope'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Scope')
      expect(result.output).toContain('project')
      expect(result.output).toContain('project-detect')
      expect(result.output).toContain(path.join(project, '.aiworker', 'AGENT.md'))
      expect(result.output).not.toContain(path.join('.aiworker', 'local', 'workers'))
    })
  })

  it('init creates project layout outside git by default', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-non-git-')
      const home = await cleanup.makeTempDir('aiworker-cli-non-git-home-')
      const result = await runCli(cleanup, ['init', '--soul', 'developer'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('No git repository detected')
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
    })
  })

  it('init --force remains accepted outside git', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-force-')
      const home = await cleanup.makeTempDir('aiworker-cli-force-home-')
      const result = await runCli(cleanup, ['init', '--force', '--soul', 'developer'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--force is accepted for compatibility')
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
    })
  })

  it('re-init preserves existing project persona files', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-preserve-persona-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-preserve-persona-home-')
      const project = path.join(root, 'repo')
      const aiworker = path.join(project, '.aiworker')
      const customAgent = '# Custom agent\n\nKeep this role.\n'
      const customSoul = '# Custom soul\n\nKeep this voice.\n'
      await mkdir(path.join(project, '.git'), { recursive: true })
      await mkdir(aiworker, { recursive: true })
      await writeFile(path.join(aiworker, 'AGENT.md'), customAgent, 'utf8')
      await writeFile(path.join(aiworker, 'SOUL.md'), customSoul, 'utf8')

      const result = await runCli(cleanup, ['init'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('.aiworker/AGENT.md (existing aiworker layout)')
      expect(result.output).toContain('.aiworker/SOUL.md (existing aiworker layout)')
      expect(await readFile(path.join(aiworker, 'AGENT.md'), 'utf8')).toBe(customAgent)
      expect(await readFile(path.join(aiworker, 'SOUL.md'), 'utf8')).toBe(customSoul)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
    })
  })

  it('init surfaces existing external agent files without modifying them', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-external-agents-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-external-agents-home-')
      const project = path.join(root, 'repo')
      const agentsMd = '# Existing agents\n'
      const claudeMd = '# Existing claude\n'
      const agentsSkill = 'skill'
      const claudeConfig = '{}\n'
      await mkdir(path.join(project, '.git'), { recursive: true })
      await mkdir(path.join(project, '.agents'), { recursive: true })
      await mkdir(path.join(project, '.claude'), { recursive: true })
      await writeFile(path.join(project, 'AGENTS.md'), agentsMd, 'utf8')
      await writeFile(path.join(project, 'CLAUDE.md'), claudeMd, 'utf8')
      await writeFile(path.join(project, '.agents', 'marker.txt'), agentsSkill, 'utf8')
      await writeFile(path.join(project, '.claude', 'config.json'), claudeConfig, 'utf8')

      const result = await runCli(cleanup, ['init', '--soul', 'developer'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('AGENTS.md (external agent file; not modified, future adopt/merge candidate)')
      expect(result.output).toContain('CLAUDE.md (external agent file; not modified, future adopt/merge candidate)')
      expect(result.output).toContain('.agents/ (external agent directory; not modified, future adopt/merge candidate)')
      expect(result.output).toContain('.claude/ (external agent directory; not modified, future adopt/merge candidate)')
      expect(await readFile(path.join(project, 'AGENTS.md'), 'utf8')).toBe(agentsMd)
      expect(await readFile(path.join(project, 'CLAUDE.md'), 'utf8')).toBe(claudeMd)
      expect(await readFile(path.join(project, '.agents', 'marker.txt'), 'utf8')).toBe(agentsSkill)
      expect(await readFile(path.join(project, '.claude', 'config.json'), 'utf8')).toBe(claudeConfig)
    })
  })

  it('init preserves explicit master key so later project commands can decrypt identity', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-env-key-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-env-key-home-')
      const project = path.join(root, 'repo')
      const env = {
        AIWORKER_MASTER_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
        INTERNAL_SHARED_SECRET: 'shared-secret-for-test',
      }
      await mkdir(path.join(project, '.git'), { recursive: true })

      const init = await runCli(cleanup, ['init', '--soul', 'developer'], project, home, env)
      expect(init.exitCode).toBe(0)

      const run = await runCli(cleanup, ['run', '--message', 'hello', '--dry-run'], project, home, env)
      expect(run.exitCode).toBe(0)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
    })
  })
})
