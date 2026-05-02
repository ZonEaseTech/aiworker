import type { IntegrationCleanup } from '../../test-utils/integration-cleanup'
import { mkdir, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it, setDefaultTimeout } from 'bun:test'

import { withIntegrationCleanup } from '../../test-utils/integration-cleanup'

const cliEntry = path.resolve(import.meta.dir, '..', '..', 'aiworker.ts')
const HELPER_TIMEOUT_MS = 30_000

setDefaultTimeout(30_000)

interface CliProcess {
  exited: Promise<number>
  pid: number
  stderr: ReadableStream<Uint8Array>
  stdout: ReadableStream<Uint8Array>
}

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

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || address === null) {
        server.close()
        reject(new Error('failed to acquire an ephemeral port'))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

async function waitForHealth(port: number, proc: CliProcess): Promise<void> {
  const health = (async (): Promise<'healthy'> => {
    const deadline = Date.now() + 8_000
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`)
        if (res.ok)
          return 'healthy'
      }
      catch {
        // Server is still binding.
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`up /health did not return 200 on port ${port}`)
  })()

  const exited = proc.exited.then(code => ({ code }))
  const result = await Promise.race([health, exited])
  if (result !== 'healthy')
    throw new Error(`up process exited before /health was ready (code=${result.code})`)
}

describe('aiworker up quick start', () => {
  it('requires --soul for a brand-new non-interactive project', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-up-no-soul-')
      const home = await cleanup.makeTempDir('aiworker-up-no-soul-home-')

      const result = await runCli(cleanup, ['up'], project, home)

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('[aiworker up] stage 1/5 resolve scope')
      expect(result.output).toContain('brand-new project init requires a Soul preset in non-interactive mode')
      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
    })
  })

  it('dry-runs a brand-new project without writing files or bootstrapping user scope', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-up-dry-run-')
      const home = await cleanup.makeTempDir('aiworker-up-dry-run-home-')

      const result = await runCli(cleanup, ['up', '--dry-run', '--soul', 'developer', '--port', '9217', '--no-open'], project, home)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('[aiworker up] stage 1/5 resolve scope')
      expect(result.output).toContain('Scope        : brand-new-project')
      expect(result.output).toContain('[aiworker init] preflight (project-scope)')
      expect(result.output).toContain('stage 5/5 serve')
      expect(result.output).toContain('dry-run: server not started and browser not opened')
      expect(await exists(path.join(project, '.aiworker'))).toBe(false)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)
    })
  })

  it('initializes a brand-new project and starts the worker server', async () => {
    await withCliIntegrationCleanup(async (cleanup) => {
      const project = await cleanup.makeTempDir('aiworker-up-serve-')
      const home = await cleanup.makeTempDir('aiworker-up-serve-home-')
      const port = await pickFreePort()
      await mkdir(project, { recursive: true })

      const proc = cleanup.trackProcess(Bun.spawn([
        process.execPath,
        cliEntry,
        'up',
        '--soul',
        'developer',
        '--port',
        String(port),
        '--host',
        '127.0.0.1',
        '--no-serve-web',
        '--no-open',
      ], {
        cwd: project,
        env: isolatedEnv(home),
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
      }))

      await waitForHealth(port, proc)
      expect(await exists(path.join(project, '.aiworker', 'AGENT.md'))).toBe(true)
      expect(await exists(path.join(project, '.aiworker', 'local', 'worker.db'))).toBe(true)
      expect(await exists(path.join(home, '.aiworker', '.env'))).toBe(false)

      process.kill(proc.pid, 'SIGTERM')
      expect(await proc.exited).toBe(0)
      const output = `${await new Response(proc.stdout).text()}\n${await new Response(proc.stderr).text()}`
      expect(output).toContain('[aiworker up] stage 5/5 serve')
    })
  })
})
