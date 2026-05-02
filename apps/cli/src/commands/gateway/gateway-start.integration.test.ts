import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

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

async function makeTmp(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

function isolatedEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined)
      env[key] = value
  }
  env.AIWORKER_HOME = home
  env.HOME = path.join(home, 'os-home')
  env.NODE_ENV = 'test'
  delete env.AIWORKER_FLEET_DB_PATH
  delete env.AIWORKER_MASTER_KEY
  delete env.INTERNAL_SHARED_SECRET
  delete env.WORKER_DB_PATH
  delete env.WORKER_DATA_ROOT
  return env
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

type GatewayProcess = Bun.Subprocess<'ignore', 'pipe', 'pipe'>

async function readOutput(proc: GatewayProcess): Promise<string> {
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return `${stdout}\n${stderr}`
}

async function waitForHealth(port: number, proc: GatewayProcess): Promise<void> {
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
      await delay(100)
    }
    throw new Error(`gateway /health did not return 200 on port ${port}`)
  })()

  const exited = proc.exited.then(async (code) => {
    const output = await readOutput(proc)
    return { code, output }
  })

  const result = await Promise.race([health, exited])
  if (result !== 'healthy')
    throw new Error(`gateway process exited before /health was ready (code=${result.code})\n${result.output}`)
}

async function stopProcess(proc: GatewayProcess): Promise<void> {
  signalProcess(proc, 'SIGTERM')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      proc.exited,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          signalProcess(proc, 'SIGKILL')
          resolve()
        }, 3_000)
      }),
    ])
    await proc.exited.catch(() => undefined)
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}

function signalProcess(proc: GatewayProcess, signal: NodeJS.Signals): void {
  try {
    process.kill(proc.pid, signal)
  }
  catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ESRCH')
      return
    throw err
  }
}

describe('aiworker gateway start default fleet DB path', () => {
  it('starts from a clean cwd without AIWORKER_FLEET_DB_PATH', async () => {
    const root = await makeTmp('aiworker-gateway-start-')
    const cwd = path.join(root, 'cwd')
    const home = path.join(root, 'home')
    const port = await pickFreePort()
    await mkdir(cwd, { recursive: true })

    const proc = Bun.spawn([process.execPath, cliEntry, 'gateway', 'start', '--port', String(port), '--no-serve-web'], {
      cwd,
      env: isolatedEnv(home),
      stderr: 'pipe',
      stdout: 'pipe',
    })

    try {
      await waitForHealth(port, proc)

      expect(await exists(path.join(home, 'fleet.db'))).toBe(true)
      expect(await exists(path.join(cwd, 'data', 'fleet.db'))).toBe(false)
    }
    finally {
      await stopProcess(proc)
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)
})
