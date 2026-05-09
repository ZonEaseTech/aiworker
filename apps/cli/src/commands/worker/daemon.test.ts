import type { AiworkerScopeResult } from '@zonease/aiworker-fs-layout'

import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

import {
  getWorkerDaemonStatus,
  resolveWorkerDaemonPaths,
  tailText,
} from './daemon'

const cliEntry = path.resolve(import.meta.dir, '..', '..', 'aiworker.ts')

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  }
  catch {
    return false
  }
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function testScope(home: string): AiworkerScopeResult {
  return {
    home,
    scope: 'project',
    source: 'project-detect',
    projectRoot: path.dirname(path.dirname(path.dirname(home))),
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
  delete env.AIWORKER_HOME
  delete env.AIWORKER_MASTER_KEY
  delete env.AIWORKER_WORKER_HOST
  delete env.INTERNAL_SHARED_SECRET
  delete env.PORT
  delete env.WORKER_DATA_ROOT
  delete env.WORKER_DB_PATH
  delete env.WORKER_MIGRATIONS_FOLDER
  return env
}

function runCli(args: string[], cwd: string, home: string): { exitCode: number, output: string } {
  const proc = Bun.spawnSync([process.execPath, cliEntry, ...args], {
    cwd,
    env: isolatedEnv(home),
    stderr: 'pipe',
    stdin: 'ignore',
    stdout: 'pipe',
  })
  const output = `${new TextDecoder().decode(proc.stdout)}\n${new TextDecoder().decode(proc.stderr)}`
  return { exitCode: proc.exitCode ?? 0, output }
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok)
        return
    }
    catch {
      // Server is still starting.
    }
    await delay(100)
  }
  throw new Error(`worker daemon /health did not return 200 on port ${port}`)
}

describe('worker daemon lifecycle helpers', () => {
  it('resolves project-local daemon paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-daemon-paths-'))
    try {
      const home = path.join(root, 'repo', '.aiworker', 'local')
      const paths = resolveWorkerDaemonPaths(testScope(home))
      expect(paths.pidFile).toBe(path.join(home, 'aiworker-worker.pid'))
      expect(paths.logFile).toBe(path.join(home, 'aiworker-worker.log'))
      expect(paths.metaFile).toBe(path.join(home, 'aiworker-worker-daemon.json'))
      expect(paths.scope).toBe('project')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('detects live and stale pid files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-daemon-status-'))
    try {
      const home = path.join(root, 'repo', '.aiworker', 'local')
      await mkdir(home, { recursive: true })
      const paths = resolveWorkerDaemonPaths(testScope(home))

      await writeFile(paths.pidFile, `${process.pid}\n`, 'utf8')
      expect(getWorkerDaemonStatus(testScope(home))).toMatchObject({ pid: process.pid, running: true })

      await writeFile(paths.pidFile, '99999999\n', 'utf8')
      expect(getWorkerDaemonStatus(testScope(home))).toMatchObject({ running: false })
      expect(await exists(paths.pidFile)).toBe(false)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('tails text by recent line count', () => {
    expect(tailText('a\nb\nc\n', 2)).toBe('b\nc\n')
    expect(tailText('a\nb\nc', 1)).toBe('c\n')
  })
})

describe('aiworker daemon command lifecycle', () => {
  it('starts, checks, logs, inspects, and stops a detached local worker daemon', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-daemon-cli-'))
    const project = path.join(root, 'repo')
    const home = path.join(root, 'home')
    const port = await pickFreePort()

    try {
      await mkdir(path.join(project, '.git'), { recursive: true })

      const start = runCli([
        'daemon',
        'start',
        '--soul',
        'developer',
        '--port',
        String(port),
        '--host',
        '127.0.0.1',
        '--no-serve-web',
      ], project, home)
      expect(start.exitCode).toBe(0)
      expect(start.output).toContain('[aiworker init] preflight')

      await waitForHealth(port)

      const status = runCli(['daemon', 'status'], project, home)
      expect(status.exitCode).toBe(0)
      expect(status.output).toContain('worker daemon running')

      const check = runCli(['daemon', 'check', '--timeout-ms', '3000'], project, home)
      expect(check.exitCode).toBe(0)
      expect(check.output).toContain('worker daemon healthy')

      const logs = runCli(['daemon', 'logs', '--tail', '20'], project, home)
      expect(logs.exitCode).toBe(0)
      expect(logs.output).toContain('[aiworker up] stage 5/5 serve')

      const inspect = runCli(['daemon', 'inspect'], project, home)
      expect(inspect.exitCode).toBe(0)
      const inspected = JSON.parse(inspect.output) as { meta: { port: number }, running: boolean }
      expect(inspected.running).toBe(true)
      expect(inspected.meta.port).toBe(port)

      const stop = runCli(['daemon', 'stop', '--timeout-ms', '3000'], project, home)
      expect(stop.exitCode).toBe(0)
      expect(stop.output).toContain('worker daemon stopped')

      const after = runCli(['daemon', 'status'], project, home)
      expect(after.exitCode).toBe(1)
    }
    finally {
      runCli(['daemon', 'stop', '--timeout-ms', '1000'], project, home)
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)
})
