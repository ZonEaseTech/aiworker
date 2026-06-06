import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

const repoRoot = resolve(import.meta.dir, '..', '..')

const workerDaemonCommand = 'AIWORKER_HOME=${AIWORKER_HOME:-$HOME/.aiworker-dev} AIWORKER_WORKER_HOST=${AIWORKER_WORKER_HOST:-127.0.0.1} PORT=${PORT:-9217} bun apps/worker-cli/src/aiworker.ts daemon foreground --host ${AIWORKER_WORKER_HOST:-127.0.0.1} --port ${PORT:-9217}'

interface ScriptResult {
  exitCode: number | null
  stderr: string
  stdout: string
}

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function readOptionalRepoFile(relativePath: string): string {
  const path = resolve(repoRoot, relativePath)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function createFakeToolDir(): { binDir: string, rootDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), 'aiworker-host-dev-test-'))
  const binDir = join(rootDir, 'bin')
  const logPath = join(rootDir, 'bun.log')
  mkdirSync(binDir)

  writeExecutable(join(binDir, 'lsof'), `#!/usr/bin/env bash
exit 0
`)
  writeExecutable(join(binDir, 'curl'), `#!/usr/bin/env bash
exit 0
`)
  writeExecutable(join(binDir, 'bun'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${logPath}"
if [[ "$*" == *"apps/host-cli/src/aiworker-host.ts serve"* ]]; then
  sleep 30
elif [[ "$*" == *"run dev"* ]]; then
  exit "\${FAKE_HOST_WEB_EXIT_CODE:-42}"
else
  exit 99
fi
`)

  return { binDir, rootDir }
}

async function runDevHostWithFakeTools(env: Record<string, string> = {}): Promise<ScriptResult> {
  const { binDir, rootDir } = createFakeToolDir()
  try {
    return await runDevHost({
      ...env,
      HOME: rootDir,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    })
  }
  finally {
    rmSync(rootDir, { force: true, recursive: true })
  }
}

function runDevHost(env: Record<string, string>): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['scripts/dev-host.sh'], {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => stdout += chunk)
    child.stderr.on('data', chunk => stderr += chunk)

    const timeout = setTimeout(() => {
      timedOut = true
      killProcessGroup(child.pid)
      setTimeout(() => killProcessGroup(child.pid, 'SIGKILL'), 250).unref()
    }, 5000)

    child.on('error', reject)
    child.on('exit', (exitCode) => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(new Error(`scripts/dev-host.sh timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`))
        return
      }
      resolve({ exitCode, stderr, stdout })
    })
  })
}

function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!pid)
    return
  try {
    process.kill(-pid, signal)
  }
  catch {
    // Process already exited.
  }
}

interface PackageJson {
  scripts?: Record<string, string>
}

describe('Host dev startup contract', () => {
  it('routes dev:host through the Host startup script instead of worker daemon foreground', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as PackageJson

    expect(pkg.scripts?.['dev:host']).toBe('bash scripts/dev-host.sh')
    expect(pkg.scripts?.['dev:host']).not.toContain('daemon foreground')
    expect(pkg.scripts?.['dev:host']).not.toContain('apps/worker-cli/src/aiworker.ts')
  })

  it('keeps the old worker daemon shortcut under dev:worker-daemon', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as PackageJson

    expect(pkg.scripts?.['dev:worker-daemon']).toBe(workerDaemonCommand)
  })

  it('uses Host dev defaults and does not carry Worker dev port defaults', () => {
    const scriptPath = resolve(repoRoot, 'scripts/dev-host.sh')
    const script = readOptionalRepoFile('scripts/dev-host.sh')

    expect(existsSync(scriptPath), 'scripts/dev-host.sh must exist').toBe(true)
    expect(script).toContain('AIWORKER_HOST_API_PORT="${AIWORKER_HOST_API_PORT:-9117}"')
    expect(script).toContain('AIWORKER_HOST_WEB_PORT="${AIWORKER_HOST_WEB_PORT:-5050}"')
    expect(script).toContain('AIWORKER_HOST_API_URL="${AIWORKER_HOST_API_URL:-http://${AIWORKER_HOST}:${AIWORKER_HOST_API_PORT}}"')
    expect(script).toContain('${HOME}/.aiworker-dev/host.db')
    expect(script).toContain('admin@zonease.org')
    expect(script).not.toContain('PORT="${PORT:-9217}"')
    expect(script).not.toContain('AIWORKER_WEB_PORT="${AIWORKER_WEB_PORT:-5173}"')
  })

  it('waits for Host API /host before starting Host Web on the configured port', () => {
    const script = readOptionalRepoFile('scripts/dev-host.sh')
    const healthIndex = script.indexOf('${AIWORKER_HOST_API_URL}/host')
    const webDirectoryIndex = script.indexOf('cd "$ROOT_DIR/apps/host-web"')
    const webPortIndex = script.indexOf('bun run dev --host "$AIWORKER_HOST" --port "$AIWORKER_HOST_WEB_PORT"')

    expect(healthIndex, 'dev-host must poll the Host API /host endpoint').toBeGreaterThanOrEqual(0)
    expect(webDirectoryIndex, 'dev-host must launch Host Web from apps/host-web').toBeGreaterThanOrEqual(0)
    expect(webPortIndex, 'dev-host must pass the configured Host Web port to Vite').toBeGreaterThanOrEqual(0)
    expect(healthIndex, 'Host API readiness must gate Host Web startup').toBeLessThan(webDirectoryIndex)
  })

  it('launches Host Web with strict port and rejects identical API/Web ports', () => {
    const script = readOptionalRepoFile('scripts/dev-host.sh')

    expect(script).toContain('--strictPort')
    expect(script).toContain('"$AIWORKER_HOST_API_PORT" == "$AIWORKER_HOST_WEB_PORT"')
    expect(script).toMatch(/Host API and Web ports must not be the same/)
  })

  it('preserves an unexpected Host Web child exit code', async () => {
    const result = await runDevHostWithFakeTools({
      FAKE_HOST_WEB_EXIT_CODE: '42',
    })

    expect(result.exitCode).toBe(42)
  })

  it('fails fast when Host API and Web ports are identical', async () => {
    const result = await runDevHostWithFakeTools({
      AIWORKER_HOST_API_PORT: '9117',
      AIWORKER_HOST_WEB_PORT: '9117',
    })

    expect(result.exitCode).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Host API and Web ports must not be the same/)
  })
})
