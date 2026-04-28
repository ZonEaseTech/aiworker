import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

const cliEntry = path.resolve(import.meta.dir, '..', '..', 'aiworker.ts')

interface SpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

interface PipedProcess {
  exited: Promise<number>
  kill: (signal?: NodeJS.Signals) => void
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
}

async function readProcessOutput(proc: PipedProcess): Promise<SpawnResult> {
  const stdout = new Response(proc.stdout).text()
  const stderr = new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return {
    exitCode,
    stdout: await stdout,
    stderr: await stderr,
  }
}

async function waitForPersistedGatewayUrl(home: string, timeoutMs: number): Promise<string> {
  const statePath = path.join(home, 'aim.json')
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(await readFile(statePath, 'utf8')) as { gatewayUrl?: unknown }
      if (typeof parsed.gatewayUrl === 'string' && parsed.gatewayUrl.endsWith('/ws'))
        return parsed.gatewayUrl
    }
    catch (err) {
      lastError = err
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`gatewayUrl was not persisted with /ws: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function stopGateway(proc: PipedProcess, output: Promise<SpawnResult>): Promise<SpawnResult> {
  proc.kill('SIGTERM')
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutResult = new Promise<SpawnResult>((resolve) => {
    timeout = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve({ exitCode: -1, stdout: '', stderr: 'gateway did not stop after SIGTERM' })
    }, 5_000)
  })
  try {
    return await Promise.race([output, timeoutResult])
  }
  finally {
    if (timeout)
      clearTimeout(timeout)
  }
}

describe('aiworker gateway start operator state regression', () => {
  let dir: string
  let previousHome: string | undefined

  beforeEach(async () => {
    previousHome = process.env.AIWORKER_HOME
    dir = await mkdtemp(path.join(tmpdir(), 'aiworker-gateway-start-'))
  })

  afterEach(async () => {
    if (previousHome === undefined)
      delete process.env.AIWORKER_HOME
    else
      process.env.AIWORKER_HOME = previousHome
    await rm(dir, { recursive: true, force: true })
  })

  it('persists /ws and supports fleet list immediately after gateway start', async () => {
    const home = path.join(dir, 'home')
    const env = {
      ...process.env,
      AIWORKER_FLEET_DB_PATH: path.join(dir, 'fleet.db'),
      AIWORKER_GATEWAY_HOST: '127.0.0.1',
      AIWORKER_GATEWAY_NO_SERVE_WEB: '1',
      AIWORKER_HOME: home,
      NODE_ENV: 'test',
    }

    const gateway = Bun.spawn({
      cmd: [process.execPath, cliEntry, 'gateway', 'start', '--port', '0', '--no-serve-web'],
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const gatewayOutput = readProcessOutput(gateway)
    try {
      const gatewayUrl = await waitForPersistedGatewayUrl(home, 5_000)
      expect(gatewayUrl).toMatch(/^ws:\/\/localhost:\d+\/ws$/)

      const fleet = Bun.spawn({
        cmd: [process.execPath, cliEntry, 'fleet', 'list'],
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const fleetOutput = await readProcessOutput(fleet)
      expect(fleetOutput.exitCode).toBe(0)
      expect(JSON.parse(fleetOutput.stdout)).toEqual({ workers: [] })
    }
    finally {
      const stopped = await stopGateway(gateway, gatewayOutput)
      expect(stopped.exitCode).toBe(0)
    }
  })
})
