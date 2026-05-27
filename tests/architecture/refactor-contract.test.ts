import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function listNumberedFiles(dir: string, suffix: string): string[] {
  return readdirSync(join(repoRoot, dir))
    .filter(file => /^\d+_/.test(file) && file.endsWith(suffix))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
}

function latestNumberedFile(dir: string, suffix: string): string {
  const files = listNumberedFiles(dir, suffix)
  expect(files.length, `${dir} should contain generated ${suffix} files`).toBeGreaterThan(0)
  return join(dir, files.at(-1)!)
}

function listSourceFiles(dir: string): string[] {
  const root = join(repoRoot, dir)
  if (!existsSync(root))
    return []

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const rel = join(dir, entry.name)
    if (entry.isDirectory()) {
      if ([
        'node_modules',
        'dist',
        'coverage',
        'tmp',
        'drizzle',
      ].includes(entry.name)) {
        return []
      }
      return listSourceFiles(rel)
    }
    if (!/\.(ts|tsx)$/.test(entry.name))
      return []
    if (rel === 'tests/architecture/refactor-contract.test.ts')
      return []
    return [rel]
  })
}

describe('destructive refactor contract bootstrap', () => {
  test('canonical docs are promoted as the only architecture authority set', () => {
    const canonicalDocs = [
      'docs/architecture.md',
      'docs/protocol.md',
      'docs/runtime.md',
      'docs/soul-authoring.md',
      'docs/testing.md',
    ]

    for (const path of canonicalDocs) {
      expect(existsSync(join(repoRoot, path)), `${path} should exist`).toBe(true)
    }

    const architecture = readRepoFile('docs/architecture.md')
    expect(architecture).toContain('Host is shell / locator / mount / bridge')
    expect(architecture).toContain('CLI-first')
    expect(architecture).toContain('descriptor-only')
    expect(architecture).toContain('packages/core and packages/shared disappear')
  })

  test('root workspace includes runnable apps, packages, and Soul Apps', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      workspaces?: string[]
    }

    expect(rootPackage.workspaces).toEqual(
      expect.arrayContaining(['apps/*', 'packages/*', 'souls/*']),
    )
  })

  test('AGENTS.md is a short bootstrap and does not preserve old authority', () => {
    const agents = readRepoFile('AGENTS.md')
    const lineCount = agents.trim().split(/\r?\n/).length

    expect(lineCount).toBeLessThanOrEqual(90)
    expect(agents).toContain('canonical docs')
    expect(agents).toContain('Superpowers')
    expect(agents).toContain('Host is shell / locator / mount / bridge')
    expect(agents).not.toContain('docs/plan')
    expect(agents).not.toContain('docs/task')
    expect(agents).not.toContain('aiworker-host-dev')
    expect(agents).not.toContain('aiworker-soul-app-dev')
    expect(agents).not.toContain('PMA requirement')
  })

  test('runtime contract keeps session lifecycle separate from invocation state', () => {
    const runtime = readRepoFile('docs/runtime.md')

    expect(runtime).toContain('session lifecycle: active | archived | deleted')
    expect(runtime).toContain('execution/process state belongs to engine_invocations')
    expect(runtime).toContain('POST /api/sessions/:sessionId/invocations')
  })

  test('worker-scoped engine invocation storage and APIs stay removed from current surfaces', () => {
    const currentSources = [
      'packages/storage-sqlite/src/worker/schema.ts',
      latestNumberedFile('packages/storage-sqlite/drizzle/worker/meta', '_snapshot.json'),
      'packages/host-daemon/src/modes/worker.ts',
      'packages/host-daemon/src/modes/worker/openapi.ts',
      'packages/host-daemon/src/modes/worker/schemas.ts',
    ]
    const forbiddenPatterns = [
      new RegExp(['worker', 'engine', 'invocations'].join('_')),
      new RegExp(['worker', 'Engine', 'Invocations'].join('')),
      new RegExp(['/api/local/workers', ':workerId', 'engine/invocations'].join('/')),
      new RegExp(['create', 'Worker', 'Engine', 'Invocation'].join('')),
      new RegExp(['list', 'Worker', 'Engine', 'Invocations'].join('')),
      new RegExp(['next', 'Worker', 'Engine', 'Invocation', 'Seq'].join('')),
    ]

    const findings = currentSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbiddenPatterns
        .filter(pattern => pattern.test(source))
        .map(pattern => `${basename(path)}: ${pattern.source}`)
    })

    expect(findings, 'engine execution state must be session-scoped via engine_invocations').toEqual([])
  })

  test('protocol and authoring contracts stay descriptor-only and native-MCP based', () => {
    const protocol = readRepoFile('docs/protocol.md')
    const authoring = readRepoFile('docs/soul-authoring.md')

    expect(protocol).toContain('dist/soul.descriptor.json')
    expect(protocol).toContain('router-mode="search"')
    expect(protocol).not.toContain('host-adapter')
    expect(protocol).not.toContain('source exports')

    expect(authoring).toContain('souls/*')
    expect(authoring).toContain('soul.config.ts')
    expect(authoring).toContain('author-owned native MCP files may contain literal secrets')
  })

  test('package guardrails reject broad replacement buckets', () => {
    expect(existsSync(join(repoRoot, 'packages/core-v2'))).toBe(false)
    expect(existsSync(join(repoRoot, 'packages/shared-v2'))).toBe(false)
  })

  test('production mounted workbench chain uses descriptor v1 without legacy surface shim', () => {
    const activeProductionSources = [
      'packages/host-daemon/src/modes/worker.ts',
      'apps/web/src/features/local-workspace/api/workspace-data.ts',
      'apps/web/src/features/local-workspace/api/index.ts',
      'apps/web/src/worker/studio/mounted-surface.tsx',
      'apps/web/src/worker/worker-studio.tsx',
    ]
    const forbiddenSnippets = [
      '/api/local/apps/:appId/surfaces/:surfaceId',
      '/api/local/apps/${appId}/surfaces/${surfaceId}',
      'mountedSurfaceResponse',
      'findMountedSurfaceContribution',
      'findWorkbenchMountContributions',
      'host-descriptor',
      'resolveMountedSurface',
    ]

    const findings = activeProductionSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbiddenSnippets
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'descriptor workbench mount must not depend on legacy surface shim').toEqual([])
  })

  test('WorkerStudio derives production workbench routes from descriptor v1 only', () => {
    const source = readRepoFile('apps/web/src/worker/worker-studio.tsx')
    const match = source.match(/function descriptorWorkbenchRoutes[\s\S]*?\n}\n/)
    expect(match, 'descriptorWorkbenchRoutes should stay a small explicit descriptor adapter').not.toBeNull()

    const routeAdapter = match![0]
    const forbiddenSnippets = [
      'mountedContribution',
      'microAppSurfaceIds',
      'routePaths',
    ]

    const findings = forbiddenSnippets
      .filter(snippet => routeAdapter.includes(snippet))
      .map(snippet => `descriptorWorkbenchRoutes: ${snippet}`)

    expect(findings, 'descriptor workbench routes must not be derived from legacy manifest.ui projection').toEqual([])
  })

  test('active protocol/runtime/daemon/web/test source no longer exposes legacy Soul manifest compatibility', () => {
    const activeSources = [
      ...listSourceFiles('packages'),
      ...listSourceFiles('apps'),
      ...listSourceFiles('tests'),
    ]
    const forbiddenExactSnippets = [
      'SoulAppManifest',
      'soulAppManifestSchema',
      'runtimeManifestForDescriptor',
      'mountedContributionForManifest',
      'descriptorSurfaceIds',
      'host-descriptor',
    ]
    const forbiddenPropertyPatterns = [
      /\.\s*manifest\b/,
      /\.\s*mountedContribution\b/,
    ]

    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      const exact = forbiddenExactSnippets
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
      const properties = source.split(/\r?\n/).flatMap((line, index) => {
        if (line.includes('soul-app.manifest.json'))
          return []
        return forbiddenPropertyPatterns
          .filter(pattern => pattern.test(line))
          .map(pattern => `${path}:${index + 1}: ${pattern.source}`)
      })
      return [...exact, ...properties]
    })

    expect(findings, 'descriptor-only active code must not expose the legacy SoulAppManifest compatibility layer').toEqual([])
  })
})
