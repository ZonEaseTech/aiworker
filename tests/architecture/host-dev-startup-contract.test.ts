import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

const repoRoot = resolve(import.meta.dir, '..', '..')

const workerDaemonCommand = 'AIWORKER_HOME=${AIWORKER_HOME:-$HOME/.aiworker-dev} AIWORKER_WORKER_HOST=${AIWORKER_WORKER_HOST:-127.0.0.1} PORT=${PORT:-9217} bun apps/worker-cli/src/aiworker.ts daemon foreground --host ${AIWORKER_WORKER_HOST:-127.0.0.1} --port ${PORT:-9217}'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function readOptionalRepoFile(relativePath: string): string {
  const path = resolve(repoRoot, relativePath)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
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
})
