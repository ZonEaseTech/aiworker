import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

import {
  buildOpenBrowserCommand,
  buildWorkerAdminBaseUrl,
  buildWorkerAdminTokenUrl,
  shouldOpenWorkerAdminBrowser,
} from './serve'

const cliEntry = path.resolve(import.meta.dir, '..', 'aiworker.ts')
const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

interface ServeProcess {
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

function isolatedEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined)
      env[key] = value
  }
  env.AIWORKER_HOME = home
  env.HOME = path.join(home, 'os-home')
  env.NODE_ENV = 'test'
  env.NO_COLOR = '1'
  delete env.AIWORKER_ADMIN_EXTERNAL_AUTH
  delete env.AIWORKER_ENROLL_MODE
  delete env.AIWORKER_GATEWAY_URL
  delete env.AIWORKER_JOIN_TOKEN
  delete env.AIWORKER_MASTER_KEY
  delete env.AIWORKER_WORKER_HOST
  delete env.INTERNAL_SHARED_SECRET
  delete env.PORT
  delete env.WORKER_DATA_ROOT
  delete env.WORKER_DB_PATH
  delete env.WORKER_MIGRATIONS_FOLDER
  return env
}

async function seedEnv(home: string): Promise<void> {
  await mkdir(home, { recursive: true })
  await writeFile(path.join(home, '.env'), [
    `AIWORKER_MASTER_KEY=${MASTER_KEY}`,
    'INTERNAL_SHARED_SECRET=shared-secret-for-test',
    '',
  ].join('\n'), { mode: 0o600 })
}

async function hasExited(proc: ServeProcess): Promise<boolean> {
  return Promise.race([
    proc.exited.then(() => true, () => true),
    delay(0).then(() => false),
  ])
}

async function readOutput(proc: ServeProcess): Promise<string> {
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return `${stdout}\n${stderr}`
}

async function waitForHealth(port: number, proc: ServeProcess): Promise<void> {
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
    throw new Error(`serve /health did not return 200 on port ${port}`)
  })()

  const exited = proc.exited.then(code => ({ code }))
  const result = await Promise.race([health, exited])
  if (result !== 'healthy') {
    const output = await readOutput(proc)
    throw new Error(`serve process exited before /health was ready (code=${result.code})\n${output}`)
  }
}

async function stopProcess(proc: ServeProcess): Promise<number> {
  signalProcess(proc, 'SIGTERM')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<number>((resolve) => {
      timer = setTimeout(() => {
        signalProcess(proc, 'SIGKILL')
        resolve(-1)
      }, 3_000)
    })
    const code = await Promise.race([proc.exited, timeout])
    if (code === -1)
      await proc.exited.catch(() => undefined)
    return code
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}

function signalProcess(proc: ServeProcess, signal: NodeJS.Signals): void {
  try {
    process.kill(proc.pid, signal)
  }
  catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ESRCH')
      return
    throw err
  }
}

describe('worker admin 启动入口 helper', () => {
  it('按 bind host 生成浏览器可访问的 admin 基础 URL', () => {
    expect(buildWorkerAdminBaseUrl({ host: '127.0.0.1', port: 9217 })).toBe('http://127.0.0.1:9217/admin/')
    expect(buildWorkerAdminBaseUrl({ host: '0.0.0.0', port: 9217 })).toBe('http://127.0.0.1:9217/admin/')
    expect(buildWorkerAdminBaseUrl({ host: '::', port: 9217 })).toBe('http://[::1]:9217/admin/')
    expect(buildWorkerAdminBaseUrl({ host: '[::1]', port: 9217 })).toBe('http://[::1]:9217/admin/')
  })

  it('把 bearer token 放进 URL fragment 而不是 query string', () => {
    const url = buildWorkerAdminTokenUrl({ host: 'localhost', port: 9217, token: 'wtk_a b/=' })

    expect(url).toBe('http://localhost:9217/admin/#token=wtk_a%20b%2F%3D')
    expect(url).not.toContain('?token=')
  })

  it('默认只在交互式 TTY 自动打开，显式参数可覆盖', () => {
    expect(shouldOpenWorkerAdminBrowser({ stdoutIsTTY: true })).toBe(true)
    expect(shouldOpenWorkerAdminBrowser({ stdoutIsTTY: false })).toBe(false)
    expect(shouldOpenWorkerAdminBrowser({ open: true, stdoutIsTTY: false })).toBe(true)
    expect(shouldOpenWorkerAdminBrowser({ open: false, stdoutIsTTY: true })).toBe(false)
  })

  it('按平台映射本机浏览器打开命令', () => {
    expect(buildOpenBrowserCommand('http://127.0.0.1:9217/admin/', 'darwin')).toEqual({
      command: 'open',
      args: ['http://127.0.0.1:9217/admin/'],
    })
    expect(buildOpenBrowserCommand('http://127.0.0.1:9217/admin/', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['http://127.0.0.1:9217/admin/'],
    })
    expect(buildOpenBrowserCommand('http://127.0.0.1:9217/admin/', 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', 'http://127.0.0.1:9217/admin/'],
    })
  })
})

describe('aiworker serve foreground lifecycle', () => {
  it('stays alive after startup and exits cleanly on SIGTERM', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-serve-lifecycle-'))
    const cwd = path.join(root, 'cwd')
    const home = path.join(root, 'home')
    const port = await pickFreePort()
    let proc: ServeProcess | undefined

    try {
      await mkdir(cwd, { recursive: true })
      await seedEnv(home)

      proc = Bun.spawn([process.execPath, cliEntry, 'serve', '--port', String(port), '--host', '127.0.0.1', '--no-serve-web'], {
        cwd,
        env: isolatedEnv(home),
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
      })

      await waitForHealth(port, proc)
      await delay(250)

      expect(await hasExited(proc)).toBe(false)
      expect(await exists(path.join(home, 'worker.db'))).toBe(true)

      const exitCode = await stopProcess(proc)
      expect(exitCode).toBe(0)
      proc = undefined
    }
    finally {
      if (proc)
        await stopProcess(proc).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)
})
