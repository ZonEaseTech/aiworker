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
      expect(result.output).toContain('aiworker run --message "hello" --dry-run')
      expect(result.output).toContain('aiworker up --port 9217')
      expect(await exists(path.join(project, '.aiworker', 'AGENT.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'SOUL.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'policy.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'toolsets.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'capability-packs.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'executor-capabilities.json'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', '.env'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'workers'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
      const soul = await readFile(path.join(project, '.aiworker', 'SOUL.md'), 'utf8')
      expect(soul).toContain('# Developer Soul')
      expect(soul).not.toContain('Voice / style guide')
      const policy = JSON.parse(await readFile(path.join(project, '.aiworker', 'policy.json'), 'utf8'))
      expect(policy.soul.preset).toBe('developer')
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

        expect(soul).toContain(`# ${preset.label} Soul`)
        expect(agent).toContain(`# ${preset.label} Worker`)
        expect(policy.soul.preset).toBe(preset.id)
        expect(toolsets.soul).toBe(preset.id)
        expect(toolsets.defaultToolsets).toEqual([...preset.toolsets])
        expect(packs.soul).toBe(preset.id)
        expect(packs.packs.map(pack => pack.id)).toEqual([...preset.packs])
        expect(packs.packs.every(pack => pack.status === 'draft' && pack.validation.status === 'pending')).toBe(true)
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
