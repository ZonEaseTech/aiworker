import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

const repoRoot = resolve(import.meta.dir, '..', '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

describe('dev service contract', () => {
  it('exposes stable package scripts for worker, fleet, and host profiles', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as { scripts?: Record<string, string> }

    expect(pkg.scripts?.dev).toBe('bun run dev:worker')

    expect(pkg.scripts?.['dev:worker']).toBe('bun run dev:env:check && bash scripts/dev-local.sh')
    expect(pkg.scripts?.['dev:worker:status']).toBe('bun run dev:env:check && bash scripts/dev-status.sh')
    expect(pkg.scripts?.['dev:worker:stop']).toBe('bash scripts/dev-clean.sh stop')
    expect(pkg.scripts?.['dev:worker:clean']).toBe('bash scripts/dev-clean.sh clean')

    expect(pkg.scripts?.['dev:fleet']).toBe('bun run dev:env:check && bun --env-file=packages/worker-daemon/.env scripts/dev-fleet-web.ts start')
    expect(pkg.scripts?.['dev:fleet:status']).toBe('bun run dev:env:check && bun --env-file=packages/worker-daemon/.env scripts/dev-fleet-web.ts status')
    expect(pkg.scripts?.['dev:fleet:stop']).toBe('bun scripts/dev-fleet-web.ts stop')
    expect(pkg.scripts?.['dev:fleet:clean']).toBe('bun scripts/dev-fleet-web.ts clean')

    expect(pkg.scripts?.['dev:host']).toBe('bun run dev:env:check && bun apps/host-cli/src/aiworker-host.ts start --dev --seed-souls-dir souls')
    expect(pkg.scripts?.['dev:host:status']).toBe('bun run dev:env:check && bun apps/host-cli/src/aiworker-host.ts status')
    expect(pkg.scripts?.['dev:host:stop']).toBe('bun apps/host-cli/src/aiworker-host.ts stop')
    expect(pkg.scripts?.['dev:host:clean']).toBe('bun apps/host-cli/src/aiworker-host.ts clean')
    expect(pkg.scripts?.['dev:host:logs']).toBe('bun apps/host-cli/src/aiworker-host.ts logs')
  })

  it('documents the agent-facing dev startup rules in AGENTS.md', () => {
    const agents = readRepoFile('AGENTS.md')

    expect(agents).toContain('## Dev Services')
    expect(agents).toContain('Agent 不要自选新端口')
    expect(agents).toContain('先运行对应 `:status`')
    expect(agents).toContain('Host API/daemon 都只能通过对应 profile lifecycle 启停')
    expect(agents).toContain('不要给 API/daemon 自造 tmux session')
    expect(agents).toContain('只有 Vite 由固定 tmux session 托管')
    expect(agents).toContain('Agent 不要前台起 Vite')
    expect(agents).toContain('单 Worker：`bun run dev:worker` / `:status` / `:stop` / `:clean`，默认 `9217 + 5173`。')
    expect(agents).toContain('多 Soul：`bun run dev:fleet` / `:status` / `:stop` / `:clean`，默认 `9217-9221 + 5173-5177`。')
    expect(agents).toContain('Host：`bun run dev:host` / `:status` / `:stop` / `:clean`，默认 `9117 + 5050`。')
    expect(agents).toContain('环境变量按真实加载路径归属，不按代码字符串归属')
    expect(agents).toContain('Host Logto session auth 的 6 个 runtime key 也放根 `.env`')
    expect(agents).toContain('Logto setup/M2M key 是项目开发配置，放根 `.env.example` / ignored `.env`')
  })

  it('documents Host daemon as package-install service lifecycle without Worker runtime ownership', () => {
    const architecture = readRepoFile('docs/architecture.md')
    const runtime = readRepoFile('docs/runtime.md')

    expect(architecture).toContain('Host may run as its own installable')
    expect(architecture).toContain('npm/bun install experience')
    expect(architecture).toContain('aiworker-host daemon foreground')
    expect(architecture).toContain('This daemon does not')
    expect(runtime).toContain('## Host Service Entry (Phase 2)')
    expect(runtime).toContain('aiworker-host start')
    expect(runtime).toContain('aiworker-host daemon start')
    expect(runtime).toContain('aiworker-host daemon foreground')
    expect(runtime).toContain('service lifecycle layer, not the runtime')
  })
})
