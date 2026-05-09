import type { IntegrationCleanup } from '../../test-utils/integration-cleanup'

import { stat } from 'node:fs/promises'
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
  env.NODE_ENV = 'test'
  env.NO_COLOR = '1'
  delete env.AIWORKER_ADMIN_EXTERNAL_AUTH
  delete env.AIWORKER_HOME
  delete env.AIWORKER_MASTER_KEY
  delete env.INTERNAL_SHARED_SECRET
  delete env.PORT
  delete env.WORKER_DATA_ROOT
  delete env.WORKER_DB_PATH
  delete env.WORKER_MIGRATIONS_FOLDER
  return env
}

async function runCli(
  cleanup: IntegrationCleanup,
  args: string[],
  cwd: string,
  home: string,
): Promise<{ exitCode: number, output: string }> {
  const proc = cleanup.trackProcess(Bun.spawn([process.execPath, cliEntry, ...args], {
    cwd,
    env: isolatedEnv(home),
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

describe('retired worker quick-start commands', () => {
  it('rejects pre-reset public worker entrypoints without bootstrapping state', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-retired-commands-')
      const home = await cleanup.makeTempDir('aiworker-retired-commands-home-')

      for (const args of [
        ['up'],
        ['serve'],
        ['scope'],
        ['config', 'show'],
      ]) {
        const result = await runCli(cleanup, args, project, home)
        expect(result.exitCode).toBe(2)
        expect(result.output).toContain(`Unknown command: ${args[0]}`)
      }

      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker'))).toBe(false)
    })
  })
})
