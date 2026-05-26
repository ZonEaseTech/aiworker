import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { parseSoulDescriptorV1 } from '../../packages/soul-protocol/src/index'

const repoRoot = join(import.meta.dir, '..', '..')
const freeformPath = 'souls/aiworker-freeform'
const freeformRoot = join(repoRoot, freeformPath)
const freeformDescriptorPath = `${freeformPath}/dist/soul.descriptor.json`

interface PackageJson {
  name?: string
  workspaces?: string[]
}

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function readJson<T>(path: string): T {
  return JSON.parse(readRepoFile(path)) as T
}

function expectRepoFile(path: string): void {
  expect(existsSync(join(repoRoot, path)), `${path} should exist`).toBe(true)
}

function listExisting(paths: string[]): string[] {
  return paths.filter(path => existsSync(join(repoRoot, path)))
}

function findForbiddenDescriptorPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => findForbiddenDescriptorPaths(item, [...path, String(index)]))

  if (!value || typeof value !== 'object')
    return []

  return Object.entries(value).flatMap(([key, item]) => {
    const currentPath = [...path, key]
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    const stringValue = typeof item === 'string' ? item : ''
    const localFailures: string[] = []

    if ([
      'chrome',
      'hostadapter',
      'hostchrome',
      'manifest',
      'slot',
      'sourceexport',
      'workerconfig',
      'workerconfiguration',
    ].includes(normalizedKey)) {
      localFailures.push(currentPath.join('.'))
    }

    if (/host-adapter|source exports?|host chrome|worker configuration|literal-secret|api[_-]?key|bearer|password|token/i.test(stringValue))
      localFailures.push(currentPath.join('.'))

    return [...localFailures, ...findForbiddenDescriptorPaths(item, currentPath)]
  })
}

describe('Freeform Soul descriptor contract', () => {
  test('root workspaces include souls/* and Freeform lives only under souls/', () => {
    const rootPackage = readJson<PackageJson>('package.json')

    expect(rootPackage.workspaces).toEqual(expect.arrayContaining(['apps/*', 'packages/*', 'souls/*']))
    expect(existsSync(freeformRoot), `${freeformPath} should be the v1 Freeform Soul package`).toBe(true)
    expect(listExisting([
      'apps/aiworker-freeform',
      'apps/aiworker-custom',
    ])).toEqual([])
  })

  test('Freeform skeleton contains the v1 minimum author-owned source layout', () => {
    for (const path of [
      `${freeformPath}/package.json`,
      `${freeformPath}/soul.config.ts`,
      `${freeformPath}/product/capabilities/default/prompt.md`,
      `${freeformPath}/engine/workspace/AGENTS.md`,
      `${freeformPath}/engine/skills/freeform-session/SKILL.md`,
      `${freeformPath}/engine/mcp/codex/config.toml`,
      `${freeformPath}/engine/mcp/claude-code/.mcp.json`,
    ]) {
      expectRepoFile(path)
    }
  })

  test('Freeform descriptor is descriptor v1 and generated from built output only', () => {
    expectRepoFile(freeformDescriptorPath)

    const descriptor = parseSoulDescriptorV1(readJson<unknown>(freeformDescriptorPath))

    expect(descriptor).toMatchObject({
      api: null,
      identity: {
        appId: 'aiworker-freeform',
        name: 'AIWorker Freeform',
        soulId: 'freeform',
        version: '0.1.0',
      },
      protocol: 'soul/v1',
      workbench: {
        mode: 'sdk-common',
        router: {
          mode: 'search',
        },
        type: 'micro-app',
      },
    })
    expect(descriptor.capabilities).toEqual([
      expect.objectContaining({
        id: 'default',
        name: 'Freeform Session',
      }),
    ])
    expect(descriptor.engine).toMatchObject({
      mcp: {
        targets: {
          'claude-code': {
            file: 'dist/engine-assets/mcp/claude-code/.mcp.json',
          },
          'codex': {
            file: 'dist/engine-assets/mcp/codex/config.toml',
          },
        },
      },
      skills: {
        source: 'dist/engine-assets/skills',
      },
      workspaceAssets: {
        source: 'dist/engine-assets/workspace',
      },
    })
  })

  test('Freeform descriptor does not carry old source hooks, Host chrome slots, domain config, or secrets', () => {
    expectRepoFile(freeformDescriptorPath)

    const descriptor = readJson<unknown>(freeformDescriptorPath)
    expect(findForbiddenDescriptorPaths(descriptor)).toEqual([])
  })

  test('v1 strong acceptance is scoped to Freeform only', () => {
    const strongAcceptanceSoulPaths = [`${freeformPath}/dist/soul.descriptor.json`]

    for (const path of strongAcceptanceSoulPaths) {
      expect(existsSync(join(repoRoot, path)), `${path} should exist for the v1 acceptance chain`).toBe(true)
      expect(relative(repoRoot, join(repoRoot, path)).startsWith('souls/aiworker-freeform/')).toBe(true)
    }

    expect(strongAcceptanceSoulPaths).not.toContain('souls/aiworker-qa/dist/soul.descriptor.json')
    expect(strongAcceptanceSoulPaths).not.toContain('souls/aiworker-hr/dist/soul.descriptor.json')
  })

  test('SDK public surface exposes descriptor authoring builders and validators, not old source entrypoints', async () => {
    const sdk = await import('../../packages/soul-app-sdk/src/index')

    for (const exportName of [
      'artifact',
      'buildSoul',
      'capability',
      'commonWorkbench',
      'defineSoul',
      'extendWorkbench',
      'nativeMcp',
      'skill',
      'validateSoul',
      'workspaceAsset',
    ]) {
      expect(sdk, `@zonease/aiworker-soul-app-sdk should export ${exportName}`).toHaveProperty(exportName)
      expect(typeof sdk[exportName as keyof typeof sdk]).toBe('function')
    }

    expect(sdk).not.toHaveProperty('defineSoulApp')
    expect(sdk).not.toHaveProperty('createSoulAppManifest')
    expect(sdk).not.toHaveProperty('defineSoulAppEngineAssets')
  })
})
