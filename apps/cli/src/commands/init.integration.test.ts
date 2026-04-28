import type { IntegrationCleanup } from '../test-utils/integration-cleanup'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

import process from 'node:process'
import { describe, expect, it, setDefaultTimeout } from 'bun:test'

import { withIntegrationCleanup } from '../test-utils/integration-cleanup'

const cliEntry = path.resolve(import.meta.dir, '..', 'aiworker.ts')
const HELPER_TIMEOUT_MS = 12_000

setDefaultTimeout(15_000)

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

  it('init in a fresh git repo creates project layout without user-scope fallback', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const root = await cleanup.makeTempDir('aiworker-cli-init-')
      const home = await cleanup.makeTempDir('aiworker-cli-init-home-')
      const project = path.join(root, 'repo')
      await mkdir(path.join(project, '.git'), { recursive: true })

      const result = await runCli(cleanup, ['init'], project, home)

      expect(result.exitCode).toBe(0)
      expect(await exists(path.join(project, '.aiworker', 'AGENT.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'SOUL.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', '.env'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'workers'))).toBe(false)
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
      const init = await runCli(cleanup, ['init'], project, home)
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

  it('init --force creates project layout outside git', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-cli-force-')
      const home = await cleanup.makeTempDir('aiworker-cli-force-home-')
      const result = await runCli(cleanup, ['init', '--force'], project, home)

      expect(result.exitCode).toBe(0)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
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

      const init = await runCli(cleanup, ['init'], project, home, env)
      expect(init.exitCode).toBe(0)

      const run = await runCli(cleanup, ['run', '--message', 'hello', '--dry-run'], project, home, env)
      expect(run.exitCode).toBe(0)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
    })
  })
})
