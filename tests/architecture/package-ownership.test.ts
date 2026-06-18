import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const deletedRuntimePaths = [
  'apps/worker-cli',
  'apps/worker-web',
  'packages/worker-daemon',
  'packages/worker-runtime',
  'packages/engine-bridge',
  'packages/engine-projection',
  'packages/worker-control-protocol',
  'apps/host-web',
  'apps/host-cli',
  'packages/storage-sqlite',
  'packages/ui',
  'packages/fs-layout',
  'packages/cli-doctor',
  'packages/host-control',
  '.agents/skills/aiworker-soul-e2e-sampling',
]

describe('Paseo thin-layer package ownership', () => {
  test('self-built Worker runtime packages are deleted', () => {
    expect(deletedRuntimePaths.filter(path => existsSync(path))).toEqual([])
  })

  test('root scripts do not build or test deleted Worker runtime surfaces', () => {
    const root = readFileSync('package.json', 'utf8')
    const forbiddenPatterns = [
      /(?<!ai)worker-web/,
      /worker-daemon/,
      /worker-runtime/,
      /engine-bridge/,
      /engine-projection/,
      /host-web/,
      /host-cli/,
      /host-control/,
      /aiworker-host/,
      /@zonease\/aiworker-host/,
      /storage-sqlite/,
      /packages\/ui/,
      /test:browser:freeform/,
      /test:engine-real/,
    ]

    for (const pattern of forbiddenPatterns)
      expect(root).not.toMatch(pattern)
  })

  test('aiworker CLI remains the only publishable package and carries pinned optional aissh-cli', () => {
    const aiworkerCli = JSON.parse(readFileSync('apps/aiworker-cli/package.json', 'utf8')) as {
      name: string
      optionalDependencies?: Record<string, string>
      private?: boolean
    }
    expect(aiworkerCli.name).toBe('@zonease/aiworker-cli')
    expect(aiworkerCli.private).toBeUndefined()
    expect(aiworkerCli.optionalDependencies?.['aissh-cli']).toBe('github:tubnt/aissh-cli#v0.8.0')
  })

  test('aiworker-web is a private admin app, not a publishable runtime package', () => {
    const aiworkerWeb = JSON.parse(readFileSync('apps/aiworker-web/package.json', 'utf8')) as {
      name: string
      private?: boolean
      scripts?: Record<string, string>
    }

    expect(aiworkerWeb.name).toBe('@zonease/aiworker-web')
    expect(aiworkerWeb.private).toBe(true)
    expect(aiworkerWeb.scripts?.['build:server']).toContain('bun build --target=bun')
    expect(aiworkerWeb.scripts?.['build:server']).toContain('dist-server/server.js')
    expect(aiworkerWeb.scripts?.['build:server']).not.toContain('--compile')
  })

  test('project workflow instructions do not revive retired dual-CLI or sampling surfaces', () => {
    const releaseLoop = readFileSync('.agents/skills/release-loop/SKILL.md', 'utf8')
    const forbiddenPatterns = [
      /apps\/worker-cli/,
      /apps\/host-cli/,
      /@zonease\/aiworker-host-cli/,
      /(?<!ai)worker-v\d/,
      /(?<!aiworker-)host-v\d/,
      /release-worker/,
      /release-host/,
      /release:check:phase2/,
    ]
    for (const pattern of forbiddenPatterns)
      expect(releaseLoop).not.toMatch(pattern)
  })
})
