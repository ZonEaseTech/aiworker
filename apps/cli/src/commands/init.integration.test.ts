import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

const cliEntry = path.resolve(import.meta.dir, '..', 'aiworker.ts')

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  }
  catch {
    return false
  }
}

async function makeTmp(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
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
  args: string[],
  cwd: string,
  home: string,
  extraEnv: Record<string, string> = {},
): Promise<{ exitCode: number, output: string }> {
  const proc = Bun.spawnSync([process.execPath, cliEntry, ...args], {
    cwd,
    env: { ...isolatedEnv(home), ...extraEnv },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = new TextDecoder().decode(proc.stdout)
  const stderr = new TextDecoder().decode(proc.stderr)
  return { exitCode: proc.exitCode, output: `${stdout}\n${stderr}` }
}

describe('aiworker init / scope project placement', () => {
  it('scope is non-mutating outside a project', async () => {
    const cwd = await makeTmp('aiworker-cli-scope-cwd-')
    const home = await makeTmp('aiworker-cli-scope-home-')
    try {
      const result = await runCli(['scope'], cwd, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Scope')
      expect(result.output).toContain('user')
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('init in a fresh git repo creates project layout without user-scope fallback', async () => {
    const root = await makeTmp('aiworker-cli-init-')
    const home = await makeTmp('aiworker-cli-init-home-')
    const project = path.join(root, 'repo')
    try {
      await mkdir(path.join(project, '.git'), { recursive: true })

      const result = await runCli(['init'], project, home)

      expect(result.exitCode).toBe(0)
      expect(await exists(path.join(project, '.aiworker', 'AGENT.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'SOUL.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', '.env'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'workers'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
    }
    finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('scope inside an initialized project reports project paths', async () => {
    const root = await makeTmp('aiworker-cli-scope-project-')
    const home = await makeTmp('aiworker-cli-scope-project-home-')
    const project = path.join(root, 'repo')
    try {
      await mkdir(path.join(project, '.git'), { recursive: true })
      const init = await runCli(['init'], project, home)
      expect(init.exitCode).toBe(0)

      const result = await runCli(['scope'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Scope')
      expect(result.output).toContain('project')
      expect(result.output).toContain('project-detect')
      expect(result.output).toContain(path.join(project, '.aiworker', 'AGENT.md'))
      expect(result.output).not.toContain(path.join('.aiworker', 'local', 'workers'))
    }
    finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('init --force creates project layout outside git', async () => {
    const project = await makeTmp('aiworker-cli-force-')
    const home = await makeTmp('aiworker-cli-force-home-')
    try {
      const result = await runCli(['init', '--force'], project, home)

      expect(result.exitCode).toBe(0)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
    }
    finally {
      await rm(project, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('init preserves explicit master key so later project commands can decrypt identity', async () => {
    const root = await makeTmp('aiworker-cli-init-env-key-')
    const home = await makeTmp('aiworker-cli-init-env-key-home-')
    const project = path.join(root, 'repo')
    const env = {
      AIWORKER_MASTER_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
      INTERNAL_SHARED_SECRET: 'shared-secret-for-test',
    }
    try {
      await mkdir(path.join(project, '.git'), { recursive: true })

      const init = await runCli(['init'], project, home, env)
      expect(init.exitCode).toBe(0)

      const run = await runCli(['run', '--message', 'hello', '--dry-run'], project, home, env)
      expect(run.exitCode).toBe(0)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
    }
    finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })
})
