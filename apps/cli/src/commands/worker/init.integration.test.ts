import type { IntegrationCleanup } from '../../test-utils/integration-cleanup'

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it, setDefaultTimeout } from 'bun:test'

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
  env.NO_COLOR = '1'
  delete env.AIWORKER_HOME
  delete env.AIWORKER_MASTER_KEY
  delete env.INTERNAL_SHARED_SECRET
  delete env.WORKER_DB_PATH
  delete env.WORKER_DATA_ROOT
  delete env.WORKER_MIGRATIONS_FOLDER
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

describe('aiworker init hard-reset project placement', () => {
  it('requires an explicit Soul preset for brand-new non-interactive workspaces', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-init-no-soul-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-no-soul-home-')
      const result = await runCli(cleanup, ['init'], project, home)

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('brand-new project init requires a Soul preset in non-interactive mode')
      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker'))).toBe(false)
    })
  })

  it('creates the project-local worker loop layout and no user-scope fallback', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-home-')
      const project = path.join(root, 'repo')
      await mkdir(path.join(project, '.git'), { recursive: true })

      const result = await runCli(cleanup, ['init', '--soul', 'developer'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Soul         : developer (Developer, flag)')
      expect(result.output).toContain('Worker pack  : developer (Developer, soul-default)')
      expect(result.output).toContain('[aiworker init] next steps — local worker loop')
      expect(result.output).toContain('aiworker pack show developer')
      expect(result.output).toContain('aiworker doctor')
      expect(result.output).toContain('aiworker executor select --engine <YOUR_ENGINE> --apply')
      expect(result.output).toContain('aiworker daemon start')
      expect(result.output).toContain('aiworker daemon check')
      expect(result.output).toContain('aiworker run --message "hello"')
      expect(result.output).toContain('aiworker artifacts list --run <runId>')
      expect(result.output).toContain('aiworker lessons promote <runId>')
      expect(result.output).not.toContain('aiworker scope')
      expect(result.output).not.toContain('aiworker soul show')
      expect(result.output).not.toContain('aiworker brain')
      expect(result.output).not.toContain('aiworker up')
      expect(result.output).not.toContain('aiworker serve')
      expect(result.output).not.toContain('aiworker fleet')
      expect(result.output).not.toContain('aiworker token rotate')

      const aiworker = path.join(project, '.aiworker')
      expect(await exists(path.join(aiworker, 'SOUL.md'))).toBe(true)
      expect(await exists(path.join(aiworker, 'policy.json'))).toBe(true)
      expect(await exists(path.join(aiworker, 'brain-capabilities.json'))).toBe(true)
      expect(await exists(path.join(aiworker, 'executor-capabilities.json'))).toBe(true)
      expect(await exists(path.join(aiworker, 'scope.json'))).toBe(true)
      expect(await exists(path.join(aiworker, 'worker-packs', 'developer', 'SKILL.md'))).toBe(true)
      expect(await exists(path.join(aiworker, 'domain-systems', 'developer', 'DOMAIN.md'))).toBe(true)
      expect(await exists(path.join(project, '.agents', 'skills', 'aiworker-kernel-brain-admission', 'SKILL.md'))).toBe(true)
      expect(await exists(path.join(project, '.claude', 'skills', 'aiworker-kernel-brain-admission', 'SKILL.md'))).toBe(true)
      expect(await exists(path.join(aiworker, 'local', '.env'))).toBe(true)
      expect(await exists(path.join(aiworker, 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(home, '.aiworker'))).toBe(false)

      const tokenFile = path.join(aiworker, 'local', 'bootstrap-token.txt')
      expect(await exists(tokenFile)).toBe(true)
      expect((await stat(tokenFile)).mode & 0o777).toBe(0o600)
      const token = /^AIWORKER_BOOTSTRAP_TOKEN=(wtk_[\w-]+)$/m.exec(await readFile(tokenFile, 'utf8'))?.[1]
      expect(token).toBeDefined()
      expect(result.output).toContain('Raw token stdout: hidden by default')
      expect(result.output).not.toContain(`AIWORKER_BOOTSTRAP_TOKEN=${token}`)

      const policy = JSON.parse(await readFile(path.join(aiworker, 'policy.json'), 'utf8'))
      expect(policy.soul.preset).toBe('developer')
      expect(policy.workerPack).toEqual({
        id: 'developer',
        label: 'Developer',
        source: 'soul-default',
      })
      const scopeManifest = JSON.parse(await readFile(path.join(aiworker, 'scope.json'), 'utf8'))
      expect(scopeManifest).toMatchObject({
        approval: 'manual-approval',
        kind: 'developer-repo',
        primarySoul: 'developer',
        privacy: 'private',
      })
    })
  })

  it('supports explicit worker pack override', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-pack-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-pack-home-')
      const project = path.join(root, 'repo')
      await mkdir(path.join(project, '.git'), { recursive: true })

      const result = await runCli(cleanup, ['init', '--soul', 'developer', '--pack', 'hr-recruiting'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Worker pack  : hr-recruiting (HR Recruiting, flag)')
      expect(result.output).toContain('aiworker pack show hr-recruiting')
      expect(await exists(path.join(project, '.aiworker', 'worker-packs', 'hr-recruiting', 'SKILL.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'domain-systems', 'hr-recruiting', 'DOMAIN.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'worker-packs', 'developer', 'SKILL.md'))).toBe(false)
    })
  })

  it('rejects unknown worker packs before writing project files', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-init-pack-invalid-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-pack-invalid-home-')
      const result = await runCli(cleanup, ['init', '--soul', 'developer', '--pack', 'missing-pack'], project, home)

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('unknown worker pack "missing-pack"')
      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker'))).toBe(false)
    })
  })

  it('dry-run previews the layout without writing files', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-init-dry-run-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-dry-run-home-')
      const before = await readdir(project)
      const result = await runCli(cleanup, ['init', '--dry-run', '--soul', 'developer'], project, home)
      const after = await readdir(project)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Mode         : dry-run (no files will be written)')
      expect(result.output).toContain('.aiworker/worker-packs/developer/SKILL.md')
      expect(result.output).toContain('.aiworker/domain-systems/developer/DOMAIN.md')
      expect(after).toEqual(before)
      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker'))).toBe(false)
    })
  })

  it('writes requested token file and gates raw stdout behind --show-token', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-token-file-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-token-file-home-')
      const project = path.join(root, 'repo')
      const tokenFile = path.join(root, 'secrets', 'bootstrap.env')
      await mkdir(path.join(project, '.git'), { recursive: true })

      const result = await runCli(cleanup, ['init', '--soul', 'developer', '--token-file', tokenFile, '--show-token'], project, home)

      expect(result.exitCode).toBe(0)
      expect((await stat(tokenFile)).mode & 0o777).toBe(0o600)
      const token = /^AIWORKER_BOOTSTRAP_TOKEN=(wtk_[\w-]+)$/m.exec(await readFile(tokenFile, 'utf8'))?.[1]
      expect(token).toBeDefined()
      expect(result.output).toContain('STORE THIS NOW')
      expect(result.output).toContain(`AIWORKER_BOOTSTRAP_TOKEN=${token}`)
    })
  })

  it('re-init preserves existing project soul material', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-preserve-soul-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-preserve-soul-home-')
      const project = path.join(root, 'repo')
      const aiworker = path.join(project, '.aiworker')
      const customSoul = '# Custom soul\n\nKeep this voice.\n'
      await mkdir(path.join(project, '.git'), { recursive: true })
      await mkdir(aiworker, { recursive: true })
      await writeFile(path.join(aiworker, 'SOUL.md'), customSoul, 'utf8')

      const result = await runCli(cleanup, ['init'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('.aiworker/SOUL.md (existing aiworker layout)')
      expect(await readFile(path.join(aiworker, 'SOUL.md'), 'utf8')).toBe(customSoul)
      expect(await exists(path.join(aiworker, 'local', 'worker.db'))).toBe(true)
    })
  })

  it('creates project layout outside git by default', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-init-non-git-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-non-git-home-')
      const result = await runCli(cleanup, ['init', '--soul', 'developer'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('No git repository detected')
      expect(result.output).toContain('Run from the directory that should own this worker.')
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(home, '.aiworker'))).toBe(false)
    })
  })
})
