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
    for (const forbidden of ['worker-web', 'worker-daemon', 'worker-runtime', 'engine-bridge', 'engine-projection', 'host-web', 'host-cli', 'host-control', 'aiworker-host', '@zonease/aiworker-host', 'storage-sqlite', 'packages/ui', 'test:browser:freeform', 'test:engine-real'])
      expect(root).not.toContain(forbidden)
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
