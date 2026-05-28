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
    if (!/\.(?:ts|tsx)$/.test(entry.name))
      return []
    if (rel === 'tests/architecture/refactor-contract.test.ts')
      return []
    return [rel]
  })
}

function documentedTestingPaths(): string[] {
  const lines = readRepoFile('docs/testing.md').split(/\r?\n/)
  const paths: string[] = []
  let inCodeFence = false
  let baseDir: string | null = null

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence
      baseDir = null
      continue
    }
    if (!inCodeFence)
      continue

    const trimmed = line.trim()
    if (!trimmed)
      continue
    if (/^[\w./-]+\/$/.test(trimmed)) {
      baseDir = trimmed
      continue
    }
    if (/\.(?:test|spec)\.tsx?$/.test(trimmed)) {
      const repoRelative = /^(?:apps|packages|souls|tests)\//.test(trimmed)
        ? trimmed
        : `${baseDir ?? ''}${trimmed}`
      paths.push(repoRelative)
    }
  }

  return [...new Set(paths)].sort()
}

function documentedReleaseGateCommands(): string[] {
  const testing = readRepoFile('docs/testing.md')
  const match = testing.match(/## Current Release Gates[\s\S]*?```text\n([\s\S]*?)```/)
  expect(match, 'docs/testing.md must document current release gates in a text fence').toBeTruthy()
  return match![1].split(/\r?\n/).map(line => line.trim()).filter(Boolean)
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

  test('canonical architecture records the tmp refactor coverage policy', () => {
    const architecture = readRepoFile('docs/architecture.md')
    const agents = readRepoFile('AGENTS.md')

    expect(architecture).toContain('Decision Coverage Index')
    expect(architecture).toContain('tmp/refactor decisions are evidence until promoted')
    expect(architecture).toContain('docs/protocol.md owns descriptor, broker route, configuration envelope, mounted workbench, and app-owned API contracts')
    expect(architecture).toContain('docs/runtime.md owns projection, runtime assets CRUD, engine bridge, lifecycle, cleanup, and redaction contracts')
    expect(architecture).toContain('docs/testing.md owns the coverage ledger and guardrail mapping')
    expect(agents).toContain('tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation')
  })

  test('soul authoring and testing docs expose coverage ledger details', () => {
    const authoring = readRepoFile('docs/soul-authoring.md')
    const testing = readRepoFile('docs/testing.md')

    for (const phrase of [
      'Convention discovery',
      'product/capabilities/*/prompt.md',
      'engine/workspace/*',
      'engine/skills/*',
      'engine/mcp/codex/config.toml',
      'engine/mcp/claude-code/.mcp.json',
      'dist/engine-assets/',
    ]) {
      expect(authoring).toContain(phrase)
    }
    expect(authoring).not.toContain('product/api/index.ts')
    expect(authoring).not.toContain('product/artifacts/*')
    expect(authoring).not.toContain('dist/api/')
    expect(authoring).not.toContain('  web/\n  api/\n  engine-assets/')

    for (const phrase of [
      'Canonical Coverage Ledger',
      'docs+tests',
      'docs-only',
      'tests-only',
      'tmp-only',
      'tmp-only is not acceptable for closed hard decisions',
      'Protocol implementation contract',
      'Runtime and bridge contract',
      'Soul authoring contract',
    ]) {
      expect(testing).toContain(phrase)
    }
  })

  test('testing doc names current test files that exist', () => {
    const paths = documentedTestingPaths()

    expect(paths).toContain('tests/architecture/refactor-contract.test.ts')
    expect(paths).toContain('packages/engine-bridge/src/bridge-contract.test.ts')
    expect(paths).toContain('packages/engine-projection/src/workspace-projection.test.ts')

    const missing = paths.filter(path => !existsSync(join(repoRoot, path)))
    expect(missing).toEqual([])
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
    expect(agents).not.toContain('docs/superpowers')
    expect(agents).not.toContain('aiworker-host-dev')
    expect(agents).not.toContain('aiworker-soul-app-dev')
    expect(agents).not.toContain('PMA requirement')
  })

  test('docs tree contains canonical docs plus current Superpowers process artifacts only', () => {
    const docsEntries = readdirSync(join(repoRoot, 'docs')).sort()

    expect(docsEntries).toEqual([
      'architecture.md',
      'protocol.md',
      'runtime.md',
      'soul-authoring.md',
      'superpowers',
      'testing.md',
    ])
    expect(readdirSync(join(repoRoot, 'docs/superpowers')).sort()).toEqual([
      'plans',
      'specs',
    ])
  })

  test('README files route developers to canonical docs, not retired local authority', () => {
    const requiredDocs = [
      'docs/architecture.md',
      'docs/protocol.md',
      'docs/runtime.md',
      'docs/soul-authoring.md',
      'docs/testing.md',
    ]
    const forbiddenSnippets = [
      'docs/plan',
      'docs/task',
      'docs/superpowers',
      'docs/changelog.md',
      'docs/soul-app-developer.md',
      'docs/cli.md',
      'docs/deployment.md',
      'docs/executor-engines.md',
      'aiworker-host-dev',
      'aiworker-soul-app-dev',
    ]

    for (const file of ['README.md', 'README.zh-CN.md']) {
      const readme = readRepoFile(file)

      for (const doc of requiredDocs)
        expect(readme, file).toContain(doc)
      for (const snippet of forbiddenSnippets)
        expect(readme, file).not.toContain(snippet)
    }
  })

  test('runtime contract keeps session lifecycle separate from invocation state', () => {
    const runtime = readRepoFile('docs/runtime.md')

    expect(runtime).toContain('session lifecycle: active | archived | deleted')
    expect(runtime).toContain('execution/process state belongs to engine_invocations')
    expect(runtime).toContain('POST /api/sessions/:sessionId/invocations')
  })

  test('worker lifecycle uses archive status without disabled or paused worker states', () => {
    const protocol = readRepoFile('packages/soul-protocol/src/local-workspace.ts')
    const storageSchema = readRepoFile('packages/storage-sqlite/src/worker/schema.ts')
    const daemonSchemas = readRepoFile('packages/host-daemon/src/modes/worker/schemas.ts')
    const cliSource = readRepoFile('apps/cli/src/aiworker.ts')
    const daemonSource = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const cliArchiveWorker = cliSource.slice(
      cliSource.indexOf('async function archiveWorkerCommand'),
      cliSource.indexOf('async function deleteWorkerCommand'),
    )
    const daemonArchiveWorker = daemonSource.slice(
      daemonSource.indexOf('app.post(\'/api/workers/:workerId/archive\''),
      daemonSource.indexOf('app.delete(\'/api/workers/:workerId\''),
    )
    const findings = [
      protocol.includes('localWorkerStatusSchema = z.enum([\'active\', \'paused\', \'disabled\'])') ? 'protocol: paused/disabled worker enum' : null,
      storageSchema.includes('enum: [\'active\', \'paused\', \'disabled\']') ? 'storage schema: paused/disabled worker enum' : null,
      daemonSchemas.includes('[\'active\',\'paused\',\'disabled\']') ? 'daemon schema comment: paused/disabled worker enum' : null,
      cliArchiveWorker.includes('status: \'disabled\'') ? 'CLI worker archive writes disabled' : null,
      daemonArchiveWorker.includes('status: \'disabled\'') ? 'daemon worker archive writes disabled' : null,
    ].filter(Boolean)

    expect(protocol).toContain('localWorkerStatusSchema = z.enum([\'active\', \'archived\'])')
    expect(cliArchiveWorker).toContain('status: \'archived\'')
    expect(daemonArchiveWorker).toContain('status: \'archived\'')
    expect(findings, 'Local Worker lifecycle should archive/delete Host metadata; Soul App disabled remains a separate app registry state').toEqual([])
  })

  test('runtime doc promotes projection, assets CRUD, and bridge hard rules', () => {
    const runtime = readRepoFile('docs/runtime.md')
    const runtimeTests = readRepoFile('packages/host-runtime/src/worker/runtime.test.ts')

    expect(runtime).toContain('Host orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.')
    expect(runtime).toContain('Runtime skills, MCP, and entry-file CRUD')
    expect(runtime).toContain('Worker-scoped overlay records live in Host metadata; projected file contents do not.')
    expect(runtime).toContain('ENGINE_SESSION_REF_MISSING')
    expect(runtime).toContain('ENGINE_CANCEL_FAILED')
    expect(runtime).toContain('PROJECTION_RECEIPT_STALE')
    expect(runtime).toContain('Allowed bridge event classes')
    expect(runtime).toContain('invocation.tool.observed')
    expect(runtime).toContain('process.lost')
    expect(runtime).toContain('Delayed hard kill must never terminate a newer invocation.')
    expect(readRepoFile('docs/protocol.md')).toContain('POST   /api/engine/invocations/:invocationId/reconcile')
    expect(readRepoFile('packages/host-daemon/src/modes/worker.ts')).toContain('/api/engine/invocations/:invocationId/reconcile')
    expect(readRepoFile('packages/host-daemon/src/modes/worker/openapi.ts')).toContain('/api/engine/invocations/{invocationId}/reconcile')
    expect(runtimeTests).toContain('assertMissingNativeResumeFailureProof')
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
    const soulAppEngineAssets = readRepoFile('packages/soul-protocol/src/soul-app/manifest.ts')

    expect(protocol).toContain('dist/soul.descriptor.json')
    expect(protocol).toContain('router-mode="search"')
    expect(protocol).not.toContain('host-adapter')
    expect(protocol).not.toContain('source exports')

    expect(authoring).toContain('souls/*')
    expect(authoring).toContain('soul.config.ts')
    expect(authoring).toContain('author-owned native MCP files may contain literal secrets')

    expect(soulAppEngineAssets).toContain('mcpClients')
    expect(soulAppEngineAssets).not.toContain('soulAppMcpServer')
    expect(soulAppEngineAssets).not.toContain('mcpServers:')
  })

  test('protocol doc promotes broker methods and worker config envelope details', () => {
    const protocol = readRepoFile('docs/protocol.md')

    for (const route of [
      'GET    /api/app-installation/apps/:appId',
      'POST   /api/app-installation/apps/:appId/archive',
      'DELETE /api/app-installation/apps/:appId',
      'GET    /api/info',
      'GET    /api/settings',
      'PATCH  /api/settings',
      'GET    /api/capabilities',
      'PATCH  /api/workers/:workerId',
      'POST   /api/workers/:workerId/archive',
      'DELETE /api/workers/:workerId',
      'PATCH  /api/workers/:workerId/config/:configKey',
      'POST   /api/workers/:workerId/config/:configKey/archive',
      'PATCH  /api/workspace-locators/:workspaceId',
      'POST   /api/workspace-locators/:workspaceId/archive',
      'DELETE /api/workspace-locators/:workspaceId',
      'PATCH  /api/sessions/:sessionId',
      'POST   /api/sessions/:sessionId/archive',
      'DELETE /api/sessions/:sessionId',
      'ANY    /api/apps/:appId',
      'ANY    /api/apps/:appId/*',
    ]) {
      expect(protocol).toContain(route)
    }

    expect(protocol).toContain('configValueJson envelope')
    expect(protocol).toContain('kind, target, enabled, sourceRef, checksum, options, updatedAt, updatedBy')
    expect(protocol).toContain('Config values must not contain literal secrets, full native MCP files, full skill bodies, full entry-file contents, Soul domain records, business action state, or artifact content.')
    expect(protocol).not.toContain('/api/local/info')
    expect(protocol).not.toContain('/api/local/settings')
    expect(protocol).toContain('GET /api/workspace-locators` may receive `workerId`')
    expect(protocol).toContain('POST /api/workspace-locators` receives `workerId`, may receive `rootPath`')
    expect(protocol).toContain('GET /api/sessions` may receive `workerId` and `workspaceId`')
    expect(protocol).toContain('POST /api/sessions` receives `workerId` and `workspaceId`')
    expect(protocol).toContain('strips client credentials before proxying')
    expect(protocol).toContain('strips app-owned cookies plus Host mount credentials before returning')
  })

  test('soul protocol does not expose legacy worker overlay write contracts', () => {
    const protocolIndex = readRepoFile('packages/soul-protocol/src/index.ts')
    const localWorkspaceProtocol = readRepoFile('packages/soul-protocol/src/local-workspace.ts')
    const forbidden = [
      'localWorkerOverlaySaveSchema',
      'LocalWorkerOverlaySaveInput',
    ]
    const findings = forbidden.flatMap(snippet => [
      protocolIndex.includes(snippet) ? `packages/soul-protocol/src/index.ts: ${snippet}` : null,
      localWorkspaceProtocol.includes(snippet) ? `packages/soul-protocol/src/local-workspace.ts: ${snippet}` : null,
    ].filter((item): item is string => Boolean(item)))

    expect(findings, 'worker overlay writes must use worker config envelope contracts').toEqual([])
    expect(protocolIndex).toContain('localWorkerConfigValueInputSchema')
    expect(localWorkspaceProtocol).toContain('localWorkerConfigValueInputSchema')
  })

  test('capability template projections stay generic and do not expose review rubric fields', () => {
    const activeSources = [
      'packages/soul-protocol/src/soul-app/registry.ts',
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'packages/soul-app-runtime/src/index.ts',
      'apps/web/src/features/local-workspace/model-types.ts',
    ]

    const findings = activeSources
      .filter(path => readRepoFile(path).includes('reviewRubricRef'))
      .map(path => `${path}: reviewRubricRef`)

    expect(findings, 'Host-visible capability templates must not carry app-owned review rubric fields').toEqual([])
  })

  test('CLI exposes capability listing without the retired template list command', () => {
    const cliSource = readRepoFile('apps/cli/src/aiworker.ts')
    const cliTest = readRepoFile('apps/cli/src/aiworker.test.ts')
    const cliSmoke = readRepoFile('apps/cli/scripts/smoke-dist-release.ts')
    const sourceForbidden = [
      'cli.command(\'template list\'',
      'compatibility inspection: template list',
      'list app-declared session templates',
      'compatibility inspection:',
    ]

    for (const snippet of sourceForbidden)
      expect(cliSource).not.toContain(snippet)
    for (const snippet of sourceForbidden.slice(1))
      expect(cliTest).not.toContain(snippet)
    expect(cliSmoke).not.toContain('const templates')
    expect(cliSmoke).not.toContain('templates.stdout')

    expect(cliSource).toContain('cli.command(\'capability list\'')
    expect(cliSource).toContain('list app-declared capabilities')
    expect(cliSource).toContain('printJson({ capabilities })')
    expect(cliSmoke).toContain('[\'capability\', \'list\'')
    expect(cliTest).toContain('argv(\'capability\', \'list\'')
    expect(cliTest).toContain('argv(\'template\', \'list\'')
    expect(cliTest).toContain(').toBe(1)')
  })

  test('CLI does not preserve the source-checkout dev compatibility alias', () => {
    const cliSource = readRepoFile('apps/cli/src/aiworker.ts')
    const cliTest = readRepoFile('apps/cli/src/aiworker.test.ts')
    const forbidden = [
      'cli.command(\'dev\'',
      'source-checkout alias for daemon foreground',
      'source-checkout compatibility alias',
      '\'dev\',',
      'expect(output).toContain(\'dev\')',
    ]
    const findings = [
      ...forbidden
        .filter(snippet => cliSource.includes(snippet))
        .map(snippet => `apps/cli/src/aiworker.ts: ${snippet}`),
      ...forbidden
        .filter(snippet => cliTest.includes(snippet))
        .map(snippet => `apps/cli/src/aiworker.test.ts: ${snippet}`),
    ]

    expect(findings, 'CLI should use bun run dev in source checkouts and daemon foreground/start in the product CLI').toEqual([])
  })

  test('CLI updater does not preserve confirmation compatibility flags', () => {
    const cliSource = readRepoFile('apps/cli/src/aiworker.ts')
    const updaterSource = readRepoFile('apps/cli/src/updater.ts')
    const updaterTest = readRepoFile('apps/cli/src/updater.test.ts')
    const forbidden = [
      '.option(\'--yes\'',
      'accepted for compatibility',
      'confirm update application',
      'update requires --yes',
      'requiresConfirmation',
      'yes?: boolean',
      'yes: boolean',
      'opts.yes',
    ]
    const findings = [
      ...forbidden
        .filter(snippet => cliSource.includes(snippet))
        .map(snippet => `apps/cli/src/aiworker.ts: ${snippet}`),
      ...forbidden
        .filter(snippet => updaterSource.includes(snippet))
        .map(snippet => `apps/cli/src/updater.ts: ${snippet}`),
      ...forbidden
        .filter(snippet => updaterTest.includes(snippet))
        .map(snippet => `apps/cli/src/updater.test.ts: ${snippet}`),
    ]

    expect(findings, 'update and upgrade apply by default and should not keep --yes compatibility state').toEqual([])
  })

  test('CLI app lifecycle surface uses archive command without disable alias', () => {
    const cliSource = readRepoFile('apps/cli/src/aiworker.ts')
    const cliTest = readRepoFile('apps/cli/src/aiworker.test.ts')

    const findings = [
      ...[
        'cli.command(\'app disable',
        'disable an installed Soul App',
        'app list|show|install|enable|archive|disable|delete',
      ]
        .filter(snippet => cliSource.includes(snippet))
        .map(snippet => `apps/cli/src/aiworker.ts: ${snippet}`),
      ...[
        'argv(\'app\', \'disable\'',
        'installs, enables, lists, and disables local Soul descriptors',
      ]
        .filter(snippet => cliTest.includes(snippet))
        .map(snippet => `apps/cli/src/aiworker.test.ts: ${snippet}`),
    ]

    expect(findings, 'CLI should expose app archive/delete lifecycle commands without the retired disable alias').toEqual([])
    expect(cliSource).toContain('cli.command(\'app archive <id>\'')
    expect(cliSource).toContain('archive an installed Soul App')
    expect(cliTest).toContain('argv(\'app\', \'archive\'')
  })

  test('daemon and Web app lifecycle surfaces use archive without disable alias', () => {
    const sources = [
      'packages/host-daemon/src/modes/worker.ts',
      'packages/host-daemon/src/modes/worker.local.test.ts',
      'apps/web/src/features/local-workspace/api/workspace-data.ts',
      'apps/web/src/features/settings/components/settings-dialog.tsx',
      'apps/web/src/worker/__tests__/worker-studio.test.tsx',
    ].map(path => [path, readRepoFile(path)] as const)
    const forbidden = [
      '/api/local/apps/:appId/disable',
      ['/api/local/apps/', '{appId}/disable'].join('$'),
      '/api/local/apps/aiworker-demo-release/disable',
      '/api/local/apps/demo-api/disable',
      'disableSoulApp',
    ]

    const findings = sources.flatMap(([path, source]) =>
      forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`),
    )

    expect(findings, 'daemon and Web should expose app archive lifecycle without retired disable aliases').toEqual([])
  })

  test('daemon app list surface does not preserve local lifecycle alias', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')

    expect(daemon).toContain('app.get(\'/api/app-installation/apps\'')
    expect(daemon).not.toContain('app.get(\'/api/local/apps\'')
  })

  test('Web derives Host-visible souls from app-installation apps without local souls alias', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const workspaceData = readRepoFile('apps/web/src/features/local-workspace/api/workspace-data.ts')
    const workspaceDataTest = readRepoFile('apps/web/src/features/local-workspace/api/workspace-data.test.ts')
    const workerStudioTest = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')

    expect(daemon).toContain('app.get(\'/api/app-installation/apps\'')
    expect(daemon).not.toContain('app.get(\'/api/local/souls\'')
    expect(workspaceData).toContain('projectedSoul')
    expect(workspaceData).not.toContain('/api/local/souls')
    expect(workspaceDataTest).not.toContain('/api/local/souls')
    expect(workerStudioTest).not.toContain('/api/local/souls')
  })

  test('daemon app installation surface does not preserve local lifecycle aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')

    expect(daemon).toContain('app.post(\'/api/app-installation/install\'')
    expect(daemon).toContain('app.post(\'/api/app-installation/apps/:appId/enable\'')
    expect(daemon).not.toContain('app.post(\'/api/local/apps/install\'')
    expect(daemon).not.toContain('app.get(\'/api/local/apps/:appId\'')
    expect(daemon).not.toContain('app.post(\'/api/local/apps/:appId/enable\'')
    expect(daemon).not.toContain('app.post(\'/api/local/apps/:appId/healthcheck\'')
  })

  test('daemon app-owned API proxy does not preserve local catch-all alias', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const daemonTest = readRepoFile('packages/host-daemon/src/modes/worker.local.test.ts')
    const protocol = readRepoFile('docs/protocol.md')

    expect(protocol).toContain('ANY    /api/apps/:appId')
    expect(protocol).toContain('ANY    /api/apps/:appId/*')
    expect(protocol).toContain('strips client credentials before proxying')
    expect(protocol).toContain('strips app-owned cookies plus Host mount credentials before returning')
    expect(daemon).toContain('app.all(\'/api/apps/:appId/:path{.+}\'')
    expect(daemon).not.toContain('app.all(\'/api/local/apps/:appId/:path{.+}\'')
    expect(daemon).not.toContain('(?:local/)?apps')
    expect(daemon).not.toContain('isReservedLocalAppLifecyclePath')
    expect(daemonTest).toContain('client-spoofed-token')
    expect(daemonTest).toContain('/api/apps/demo-api/candidates/123/reports')
    expect(daemonTest).toContain('x-aiworker-mount-context')
    expect(daemonTest).toContain('x-aiworker-mount-signature')
    expect(daemonTest).toContain('set-cookie')
  })

  test('daemon worker collection surface does not preserve local broker aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')

    expect(daemon).toContain('app.get(\'/api/workers\'')
    expect(daemon).toContain('app.post(\'/api/workers\'')
    expect(daemon).not.toContain('app.get(\'/api/local/workers\'')
    expect(daemon).not.toContain('app.post(\'/api/local/workers\'')
  })

  test('daemon worker member surface does not preserve local broker aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')

    expect(daemon).toContain('app.get(\'/api/workers/:workerId\'')
    expect(daemon).toContain('app.patch(\'/api/workers/:workerId\'')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId\',')
    expect(daemon).not.toContain('app.patch(\'/api/local/workers/:workerId\',')
  })

  test('daemon worker overlay read is served by canonical worker config', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const webOverlayApi = readRepoFile('apps/web/src/features/local-workspace/api/worker-overlays.ts')

    expect(daemon).toContain('app.get(\'/api/workers/:workerId/config\'')
    expect(daemon).toContain('overlay: await workerOverlayResponse')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/overlay\'')
    expect(webOverlayApi).toContain(['/api/workers/', '{encodeURIComponent(workerId)}/config'].join('$'))
    expect(webOverlayApi).not.toContain('/api/local/workers/')
  })

  test('daemon capability surface does not preserve worker-local broker aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const soulAppRuntime = readRepoFile('packages/soul-app-runtime/src/index.ts')

    expect(daemon).toContain('app.get(\'/api/capabilities\'')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/capabilities\'')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/capabilities/:capabilityId\'')
    expect(soulAppRuntime).toContain('/api/capabilities?workerId=')
    expect(soulAppRuntime).not.toContain(['/api/local/workers/', '{workerId}/capabilities'].join('$'))
  })

  test('daemon workspace locator collection surface does not preserve local broker alias', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const daemonSchemas = readRepoFile('packages/host-daemon/src/modes/worker/schemas.ts')
    const soulAppRuntime = readRepoFile('packages/soul-app-runtime/src/index.ts')
    const mountedWorkspaceProxy = soulAppRuntime.slice(
      soulAppRuntime.indexOf('url.pathname === \'/api/workspaces\''),
      soulAppRuntime.indexOf('url.pathname === \'/api/sessions\''),
    )

    expect(daemon).toContain('app.get(\'/api/workspace-locators\'')
    expect(daemon).not.toContain('app.get(\'/api/local/workspaces\',')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/workspaces\',')
    expect(daemon).not.toContain('app.post(\'/api/local/workers/:workerId/workspaces\',')
    expect(daemonSchemas).toContain('POST /api/workspace-locators')
    expect(daemonSchemas).not.toContain('POST /api/local/workers/:workerId/workspaces')
    expect(mountedWorkspaceProxy).toContain('/api/workspace-locators?workerId=')
    expect(mountedWorkspaceProxy).not.toContain(['/api/local/workers/', '{workerId}/workspaces'].join('$'))
  })

  test('daemon workspace locator member surface does not preserve local broker aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')

    expect(daemon).toContain('app.get(\'/api/workspace-locators/:workspaceId\',')
    expect(daemon).toContain('app.patch(\'/api/workspace-locators/:workspaceId\',')
    expect(daemon).not.toContain('app.get(\'/api/local/workspaces/:workspaceId\',')
    expect(daemon).not.toContain('app.patch(\'/api/local/workspaces/:workspaceId\',')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/workspaces/:workspaceId\',')
    expect(daemon).not.toContain('app.patch(\'/api/local/workers/:workerId/workspaces/:workspaceId\',')
  })

  test('Web workspace locator API does not expose retired raw file helpers', () => {
    const workspaceApi = readRepoFile('apps/web/src/features/local-workspace/api/workspaces.ts')
    const workspaceApiIndex = readRepoFile('apps/web/src/features/local-workspace/api/index.ts')

    expect(workspaceApi).toContain('/api/workspace-locators')
    expect(workspaceApi).not.toContain('/api/local/workspaces/')
    expect(workspaceApi).not.toContain('export function readFile')
    expect(workspaceApi).not.toContain('export function writeFile')
    expect(workspaceApiIndex).not.toContain('readFile,')
    expect(workspaceApiIndex).not.toContain('writeFile,')
  })

  test('daemon session collection surface does not preserve local broker alias', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const soulAppRuntime = readRepoFile('packages/soul-app-runtime/src/index.ts')
    const mountedSessionProxy = soulAppRuntime.slice(
      soulAppRuntime.indexOf('url.pathname === \'/api/sessions\''),
      soulAppRuntime.indexOf('const sessionMatch'),
    )

    expect(daemon).toContain('app.get(\'/api/sessions\'')
    expect(daemon).toContain('app.post(\'/api/sessions\'')
    expect(daemon).not.toContain('app.get(\'/api/local/sessions\',')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/workspaces/:workspaceId/sessions\',')
    expect(daemon).not.toContain('app.post(\'/api/local/workers/:workerId/workspaces/:workspaceId/sessions\',')
    expect(daemon).not.toContain('app.get(\'/api/local/workspaces/:workspaceId/sessions\',')
    expect(daemon).not.toContain('app.post(\'/api/local/workspaces/:workspaceId/sessions\',')
    expect(mountedSessionProxy).toContain('/api/sessions?')
    expect(mountedSessionProxy).not.toContain(['/api/local/workers/', '{workerId}/workspaces/'].join('$'))
  })

  test('daemon session read surface does not preserve local broker aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')

    expect(daemon).toContain('app.get(\'/api/sessions/:sessionId\',')
    expect(daemon).not.toContain('app.get(\'/api/local/sessions/:sessionId\',')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/sessions/:sessionId\',')
  })

  test('daemon projection refresh surface does not preserve local broker alias', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const webProjectionApi = readRepoFile('apps/web/src/features/local-workspace/api/worker-overlays.ts')
    const projectWorkspaceProjection = webProjectionApi.slice(
      webProjectionApi.indexOf('export function projectWorkerWorkspaceOverlay'),
    )

    expect(daemon).toContain('app.post(\'/api/projections/:target/refresh\',')
    expect(daemon).not.toContain('app.post(\'/api/local/workers/:workerId/workspaces/:workspaceId/projection\',')
    expect(projectWorkspaceProjection).toContain(['/api/projections/', '{target}/refresh'].join('$'))
    expect(projectWorkspaceProjection).not.toContain('/api/local/workers/')
  })

  test('daemon engine target broker surface does not preserve local settings engines aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const webSettingsApi = readRepoFile('apps/web/src/features/local-workspace/api/settings.ts')
    const webWorkspaceDataApi = readRepoFile('apps/web/src/features/local-workspace/api/workspace-data.ts')

    expect(daemon).toContain('app.get(\'/api/engine/targets\',')
    expect(daemon).toContain('app.get(\'/api/engine/targets/:target/readiness\',')
    expect(daemon).toContain('app.post(\'/api/engine/targets/rescan\',')
    expect(daemon).toContain('app.post(\'/api/engine/targets/:target/test\',')
    expect(daemon).toContain('app.get(\'/api/info\',')
    expect(daemon).toContain('app.get(\'/api/settings\',')
    expect(daemon).toContain('app.patch(\'/api/settings\',')
    expect(daemon).not.toContain('/api/local/info')
    expect(daemon).not.toContain('/api/local/settings')
    expect(daemon).not.toContain('/api/local/settings/engines')
    expect(webSettingsApi).toContain('/api/settings')
    expect(webSettingsApi).toContain('/api/engine/targets/rescan')
    expect(webSettingsApi).toContain(['/api/engine/targets/', '{encodeURIComponent(engineId)}/test'].join('$'))
    expect(webSettingsApi).not.toContain('/api/local/settings')
    expect(webWorkspaceDataApi).toContain('/api/info')
    expect(webWorkspaceDataApi).toContain('/api/settings')
    expect(webWorkspaceDataApi).not.toContain('/api/local/info')
    expect(webWorkspaceDataApi).not.toContain('/api/local/settings')
    expect(webSettingsApi).not.toContain('/api/local/settings/engines')
  })

  test('mounted session events are derived without daemon local broker aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const soulAppRuntime = readRepoFile('packages/soul-app-runtime/src/index.ts')
    const mountedSessionEventsProxy = soulAppRuntime.slice(
      soulAppRuntime.indexOf('const sessionEventsMatch'),
      soulAppRuntime.indexOf('const sessionInvocationsMatch'),
    )

    expect(daemon).toContain('app.get(\'/api/sessions/:sessionId\',')
    expect(daemon).not.toContain('app.get(\'/api/local/sessions/:sessionId/events\',')
    expect(daemon).not.toContain('app.get(\'/api/local/workers/:workerId/sessions/:sessionId/events\',')
    expect(mountedSessionEventsProxy).toContain(['/api/sessions/', '{sessionEventsMatch[1]}'].join('$'))
    expect(mountedSessionEventsProxy).not.toContain('/api/local/sessions/')
  })

  test('Host runtime and UI app lifecycle APIs use archive naming internally', () => {
    const sources = [
      'apps/cli/src/aiworker.ts',
      'apps/web/src/features/i18n/types.ts',
      'apps/web/src/features/i18n/locales/en.ts',
      'apps/web/src/features/i18n/locales/zh-CN.ts',
      'apps/web/src/features/i18n/locales/de.ts',
      'apps/web/src/features/i18n/locales/ja.ts',
      'apps/web/src/features/settings/components/settings-dialog.tsx',
      'packages/host-daemon/src/modes/worker.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'packages/host-runtime/src/index.ts',
      'packages/host-runtime/src/soul-app/official.ts',
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/soul-protocol/src/soul-app/protocol.ts',
    ].map(path => [path, readRepoFile(path)] as const)
    const forbidden = [
      'disableApp(',
      'disableApp:',
      'disableSoulApp',
      'disable: (context: SoulAppScopedContext)',
    ]

    const findings = sources.flatMap(([path, source]) =>
      forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`),
    )

    expect(findings, 'app lifecycle APIs should use archive verbs while registry status may remain disabled').toEqual([])
  })

  test('Host identity grants name the broker API without local route namespace residue', () => {
    const identityProvider = readRepoFile('packages/host-runtime/src/host/identity-provider.ts')
    const identityProviderTest = readRepoFile('packages/host-runtime/src/host/identity-provider.test.ts')

    expect(identityProvider).toContain('target: \'api/broker\'')
    expect(identityProvider).not.toContain('target: \'api/local\'')
    expect(identityProviderTest).toContain('target: \'api/broker\'')
    expect(identityProviderTest).not.toContain('target: \'api/local\'')
  })

  test('CLI session start selects a capability without the retired skill option', () => {
    const cliSource = readRepoFile('apps/cli/src/aiworker.ts')
    const cliTests = [
      'apps/cli/src/aiworker.test.ts',
      'apps/cli/src/freeform-golden-path.test.ts',
      'tests/browser/freeform-cli-golden-path.spec.ts',
    ].map(path => [path, readRepoFile(path)] as const)

    const sourceForbidden = [
      '.option(\'--skill <id>\'',
      'skill?: string',
      'opts.skill',
      'skillId',
      'capability template id',
    ]
    const findings = [
      ...sourceForbidden
        .filter(snippet => cliSource.includes(snippet))
        .map(snippet => `apps/cli/src/aiworker.ts: ${snippet}`),
      ...cliTests.flatMap(([path, source]) => source.includes('\'--skill\'') ? [`${path}: '--skill'`] : []),
    ]

    expect(findings, 'CLI session start should use --capability and capability language only').toEqual([])
    expect(cliSource).toContain('.option(\'--capability <id>\'')
    expect(cliSource).toContain('opts.capability')
  })

  test('session creation surfaces do not accept Host-owned context text', () => {
    const sources = [
      'apps/cli/src/aiworker.ts',
      'packages/host-daemon/src/modes/worker/schemas.ts',
      'packages/host-daemon/src/modes/worker.ts',
      'packages/host-runtime/src/worker/runtime.ts',
      'packages/soul-protocol/src/local-workspace.ts',
      'packages/storage-sqlite/src/worker/index.ts',
    ].map(path => [path, readRepoFile(path)] as const)
    const forbidden = [
      '--context <text>',
      'Session context:',
      'session context',
      'session.context',
      'context?: string',
      'opts.context',
      'context: z.string().optional()',
      'context: z.string()',
      'context: body.context',
      'context: input.context',
    ]
    const findings = sources.flatMap(([path, source]) =>
      forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`),
    )

    expect(findings, 'Host session creation should carry locator metadata and invocation input, not free-form context content').toEqual([])
  })

  test('engine invocation prompts use capability language without retired template copy', () => {
    const sources = [
      'packages/host-runtime/src/worker/runtime.ts',
    ].map(path => [path, readRepoFile(path)] as const)
    const forbidden = [
      'Capability template:',
      'session template metadata',
    ]
    const findings = sources.flatMap(([path, source]) =>
      forbidden.filter(snippet => source.includes(snippet)).map(snippet => `${path}: ${snippet}`),
    )

    expect(findings, 'native engine prompt copy should not reintroduce retired template language').toEqual([])
  })

  test('engine bridge contract tests use generic capability descriptor refs', () => {
    const source = readRepoFile('packages/engine-bridge/src/bridge-contract.test.ts')
    const forbidden = [
      'capability/hr-review',
    ]

    const findings = forbidden
      .filter(snippet => source.includes(snippet))
      .map(snippet => `packages/engine-bridge/src/bridge-contract.test.ts: ${snippet}`)

    expect(findings, 'engine bridge tests should keep capability refs opaque and non-domain-specific').toEqual([])
  })

  test('local broker capability routes do not preserve retired template route aliases', () => {
    const activeSources = [
      'packages/host-daemon/src/modes/worker.ts',
      'packages/soul-app-runtime/src/index.ts',
      'apps/cli/scripts/smoke-dist-release.ts',
      'apps/web/src/features/local-workspace/api/workspace-data.ts',
      'apps/web/src/worker/__tests__/worker-studio.test.tsx',
    ]
    const forbidden = [
      'app.get(\'/api/local/capabilities\'',
      'url.endsWith(\'/api/local/capabilities\')',
      '/api/local/templates',
      '/api/local/workers/:workerId/templates',
      ['/api/local/workers/', '{workerId}/templates'].join('$'),
      '/api/templates',
      'templates/:templateId',
      '[\'template\', \'list\'',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'local broker routes should expose capability endpoints, not retired template aliases').toEqual([])
  })

  test('host daemon capability route tests name the Freeform capability fixture as a capability', () => {
    const daemonTest = readRepoFile('packages/host-daemon/src/modes/worker.local.test.ts')
    const helperStart = daemonTest.indexOf('async function createFreeformWorker')
    const helperEnd = daemonTest.indexOf('async function createWorkspaceAndSession')
    const createFreeformWorkerHelper = helperStart >= 0 && helperEnd > helperStart
      ? daemonTest.slice(helperStart, helperEnd)
      : daemonTest

    expect(daemonTest).not.toContain('FREEFORM_TEMPLATE')
    expect(daemonTest).toContain('FREEFORM_CAPABILITY')
    expect(createFreeformWorkerHelper).toContain('/api/workers')
    expect(createFreeformWorkerHelper).not.toContain('/api/local/workers')
  })

  test('host daemon workspace session fixture uses canonical broker routes', () => {
    const daemonTest = readRepoFile('packages/host-daemon/src/modes/worker.local.test.ts')
    const helperStart = daemonTest.indexOf('async function createWorkspaceLocator')
    const helperEnd = daemonTest.indexOf('function writePackagedFreeform')
    const createWorkspaceAndSessionHelper = helperStart >= 0 && helperEnd > helperStart
      ? daemonTest.slice(helperStart, helperEnd)
      : daemonTest

    expect(createWorkspaceAndSessionHelper).toContain('/api/workspace-locators')
    expect(createWorkspaceAndSessionHelper).toContain('/api/sessions')
    expect(createWorkspaceAndSessionHelper).not.toContain(['/api/local/workers/', '{workerId}/workspaces'].join('$'))
    expect(createWorkspaceAndSessionHelper).not.toContain(['/workspaces/', '{workspace.id}/sessions'].join('$'))
  })

  test('host daemon capability helpers do not preserve retired template helper names', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const forbidden = [
      'requireTemplateForWorker',
      'enrichTemplateMetadata',
    ]
    const findings = forbidden
      .filter(snippet => daemon.includes(snippet))
      .map(snippet => `packages/host-daemon/src/modes/worker.ts: ${snippet}`)

    expect(findings, 'daemon internals should use capability language for current broker helpers').toEqual([])
    expect(daemon).toContain('requireCapabilityForWorker')
    expect(daemon).toContain('enrichCapabilityMetadata')
  })

  test('Host-visible Soul defaults use capability language instead of template defaults', () => {
    const activeSources = [
      'packages/soul-protocol/src/soul-app/registry.ts',
      'packages/soul-protocol/src/soul-app/index.ts',
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'packages/soul-app-runtime/src/index.ts',
      'apps/web/src/features/local-workspace/model-types.ts',
      'apps/web/src/worker/__tests__/worker-studio.test.tsx',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return source.includes('defaultTemplates') ? [`${path}: defaultTemplates`] : []
    })

    expect(findings, 'Soul catalog defaults should expose defaultCapabilities, not defaultTemplates').toEqual([])
  })

  test('Host Soul catalog exposes capabilities instead of a template collection', () => {
    const activeSources = [
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'packages/soul-app-runtime/src/index.ts',
      'packages/soul-app-runtime/src/index.test.ts',
      'apps/web/src/worker/__tests__/worker-studio.test.tsx',
    ]
    const forbidden = [
      'templates: CapabilityTemplate[]',
      'templates: appTemplates',
      'listHostSoulCatalog().templates',
      'this.listCatalog().templates',
      'catalog.templates',
      'input.catalog.templates',
      'templates: [...app.projectedCapabilities]',
      'catalog: { apps: currentApps, souls: currentSouls, templates: currentTemplates }',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Host catalog should return a capabilities collection, not templates').toEqual([])
  })

  test('Web local workspace model exposes capabilities instead of templates', () => {
    const activeSources = [
      'apps/web/src/features/local-workspace/model-types.ts',
      'apps/web/src/features/local-workspace/api/types.ts',
      'apps/web/src/features/local-workspace/api/workspace-data.ts',
      'apps/web/src/features/local-workspace/components/workspace-card.tsx',
      'apps/web/src/features/settings/components/settings-dialog.tsx',
      'apps/web/src/features/i18n/display.test.ts',
      'apps/web/src/features/i18n/index.ts',
      'apps/web/src/worker/worker-studio.tsx',
      'apps/web/src/worker/studio/locator.ts',
      'apps/web/src/worker/studio/workspace-fallback.tsx',
    ]
    const forbidden = [
      'templates: CapabilityTemplate[]',
      'templates: WorkspaceTemplate[]',
      'LocalWorkspaceData[\'templates\']',
      'WorkspaceCardProps[\'template\']',
      'data.templates',
      'templates={data.templates}',
      'templates={templates}',
      'template={data.',
      'const templatedSoulIds',
      'CapabilityTemplate',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden.filter(snippet => source.includes(snippet)).map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Web should keep the Host-visible startable unit collection named capabilities').toEqual([])
  })

  test('Web local workspace model tests use generic soul ids instead of retired HR and QA identities', () => {
    const source = readRepoFile('apps/web/src/features/local-workspace/model.test.ts')
    const retiredFixtureSnippets = [
      'aiworker-hr',
      'aiworker-qa',
      'AIWorker HR',
      'AIWorker QA',
    ]

    const findings = retiredFixtureSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/features/local-workspace/model.test.ts: ${snippet}`)

    expect(findings, 'local workspace model tests should use neutral soul ids when proving Host-generic placeholder behavior').toEqual([])
  })

  test('Web local workspace dialog tests use generic descriptor fixtures instead of retired HR and QA identities', () => {
    const source = readRepoFile('apps/web/src/features/local-workspace/components/creation-dialogs.test.tsx')
    const retiredFixtureSnippets = [
      'aiworker-hr',
      'aiworker-qa',
      'AIWorker HR',
      'AIWorker QA',
      'Hiring Workspace',
    ]

    const findings = retiredFixtureSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/features/local-workspace/components/creation-dialogs.test.tsx: ${snippet}`)

    expect(findings, 'local workspace dialog tests should not use old app-local product identities as generic descriptor fixtures').toEqual([])
  })

  test('WorkerStudio capability fixtures use capability collection names', () => {
    const source = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const forbidden = [
      'const templates =',
      'currentTemplates',
      'templates.map',
      'capability templates',
      'capabilityTemplateHeading',
    ]
    const findings = forbidden
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx: ${snippet}`)

    expect(findings, 'WorkerStudio fixtures should name Host-visible startable units as capabilities').toEqual([])
    expect(source).toContain('const capabilities =')
    expect(source).toContain('currentCapabilities')
  })

  test('WorkerStudio primary capability fixture uses generic descriptor wording instead of person-profile residue', () => {
    const source = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const fixtureHeader = source.slice(0, source.indexOf('const themeMediaQuery'))
    const retiredCapabilitySnippets = [
      'HR_PERSON_PROFILE',
      '.person-profile',
      'person-profile',
      'Person Profile',
      'Create a source-backed HR profile snapshot.',
      'HR_HIRING_RISK',
      '.hiring-risk',
      'hiring-risk',
      'Hiring Risk',
      'Review hiring risk.',
    ]

    const findings = retiredCapabilitySnippets
      .filter(snippet => fixtureHeader.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx fixture header: ${snippet}`)

    expect(findings, 'WorkerStudio positive descriptor fixture should not keep the retired HR person-profile capability').toEqual([])
  })

  test('WorkerStudio tests use generic mounted Soul fixtures instead of retired HR QA workflow language', () => {
    const source = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const retiredFixtureSnippets = [
      'HR_SOUL_ID',
      'QA_SOUL_ID',
      'HR_',
      'PEOPLE_',
      'people-worker',
      'release-worker',
      'aiworker-demo-people',
      'aiworker-demo-release',
      'Demo People',
      'Demo Release',
      'Candidate',
      'candidate',
      'Interview',
      'interview',
      'Profile',
      'profile',
      'HR',
      'QA',
      'Release Gate',
      'release-gate',
      'onboarding',
      'offboarding',
      'Person context',
      'Employee context',
      'Departing employee',
      'Risk Review',
      'risk-review',
      'Role Rubric',
      'role-rubric',
      'CUSTOM_TEMPLATE_ID',
    ]

    const findings = retiredFixtureSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx: ${snippet}`)

    expect(findings, 'WorkerStudio tests should prove Host-generic mounted behavior without old HR/QA domain fixtures').toEqual([])
  })

  test('Web i18n helpers expose capability names instead of template helpers', () => {
    const activeSources = [
      'apps/web/src/features/i18n/index.ts',
      'apps/web/src/features/i18n/types.ts',
      'apps/web/src/features/i18n/display.test.ts',
      'apps/web/src/features/i18n/locales/en.ts',
      'apps/web/src/features/i18n/locales/zh-CN.ts',
      'apps/web/src/features/i18n/locales/ja.ts',
      'apps/web/src/features/i18n/locales/de.ts',
      'apps/web/src/features/settings/components/settings-dialog.tsx',
      'apps/web/src/features/local-workspace/components/workspace-card.tsx',
      'apps/web/src/worker/studio/locator.ts',
      'apps/web/src/worker/studio/workspace-fallback.tsx',
    ]
    const forbidden = [
      'displayTemplate',
      'BuiltinTemplateCopy',
      'templateCount',
      'Manifest Template',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden.filter(snippet => source.includes(snippet)).map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Web i18n helpers should describe capabilities instead of retired template helpers').toEqual([])
  })

  test('Web i18n display tests use generic descriptor fixtures instead of retired HR identity', () => {
    const source = readRepoFile('apps/web/src/features/i18n/display.test.ts')
    const retiredFixtureSnippets = [
      'aiworker-hr',
      'Manifest HR',
      'person-profile',
    ]

    const findings = retiredFixtureSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/features/i18n/display.test.ts: ${snippet}`)

    expect(findings, 'Web i18n display tests should prove generic descriptor projection without old HR/person fixtures').toEqual([])
  })

  test('Web shell copy schema uses capability keys for startable units', () => {
    const activeSources = [
      'apps/web/src/features/i18n/types.ts',
      'apps/web/src/features/i18n/locales/en.ts',
      'apps/web/src/features/i18n/locales/zh-CN.ts',
      'apps/web/src/features/i18n/locales/ja.ts',
      'apps/web/src/features/i18n/locales/de.ts',
      'apps/web/src/features/i18n/locales/local-shell-copy.test.ts',
      'apps/web/src/worker/studio/workspace-fallback.tsx',
    ]
    const forbidden = [
      'capabilityTemplate:',
      'common.templates',
      'createTabs.template',
      'topTabs.templates',
      'copy.create.capabilityTemplate',
      'templateName',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden.filter(snippet => source.includes(snippet)).map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'visible shell copy keys should use capability terminology').toEqual([])
  })

  test('runtime session metadata names capability display without skillName compatibility', () => {
    const activeSources = [
      'packages/soul-app-runtime/src/index.ts',
      'packages/host-runtime/src/worker/runtime.test.ts',
      'packages/host-runtime/src/worker/executor.test.ts',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return [
        ...source.includes('skillName') ? [`${path}: skillName`] : [],
        ...source.includes('CapabilityTemplate') ? [`${path}: CapabilityTemplate`] : [],
        ...source.includes('sessionMetadata: (capabilityTemplateId: string)') ? [`${path}: sessionMetadata capabilityTemplateId parameter`] : [],
        ...source.includes('sessionMetadata: capabilityTemplateId =>') ? [`${path}: sessionMetadata capabilityTemplateId lambda`] : [],
        ...source.includes('capabilities.find(item => item.id === capabilityTemplateId)') ? [`${path}: capabilityTemplateId lookup local`] : [],
        ...source.includes('capabilityName: capability?.name ?? capabilityTemplateId') ? [`${path}: capabilityTemplateId fallback local`] : [],
      ]
    })

    expect(findings, 'capability-derived session metadata should not be named as native engine skills').toEqual([])
  })

  test('Host runtime session fixtures stay generic instead of preserving retired domain workflow terms', () => {
    const activeSources = [
      'packages/host-runtime/src/worker/runtime.test.ts',
    ]
    const forbidden = [
      'candidate-screen',
      'candidate-profile',
      'Candidate Screen',
      'Screen candidate',
      'Candidate pool',
      'interview-brief',
      'Interview brief',
      'resume',
      'candidate',
      'employee',
      'alumni',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden.filter(snippet => source.includes(snippet)).map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Host runtime tests should use Freeform/protocol-generic fixtures, not retired HR workflow language').toEqual([])
  })

  test('session capability selection uses capabilityId outside historical migrations', () => {
    const protocol = readRepoFile('docs/protocol.md')
    const runtimeDoc = readRepoFile('docs/runtime.md')
    const activeSources = [
      'packages/soul-protocol/src/local-workspace.ts',
      'packages/storage-sqlite/src/worker/schema.ts',
      'packages/storage-sqlite/src/worker/index.ts',
      'packages/storage-sqlite/src/worker/index.test.ts',
      'packages/host-runtime/src/worker/runtime.ts',
      'packages/host-runtime/src/worker/runtime.test.ts',
      'packages/host-runtime/src/host/runtime.test.ts',
      'packages/host-daemon/src/modes/worker.ts',
      'packages/host-daemon/src/modes/worker/schemas.ts',
      'packages/host-daemon/src/modes/worker.local.test.ts',
      'packages/soul-app-runtime/src/index.ts',
      'packages/soul-app-runtime/src/index.test.ts',
      'apps/cli/src/aiworker.ts',
      'apps/cli/src/aiworker.test.ts',
      'apps/web/src/worker/studio/locator.ts',
      'apps/web/src/worker/studio/locator.test.ts',
      'apps/web/src/worker/studio/workspace-fallback.tsx',
      'apps/web/src/worker/__tests__/worker-studio.test.tsx',
      'apps/web/src/features/local-workspace/components/workspace-card.tsx',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
        .split('\n')
        .filter(line => !(path === 'packages/host-daemon/src/modes/worker.local.test.ts'
          && (line.includes('rejects legacy session create bodies that still send capabilityTemplateId')
            || line.includes('capabilityTemplateId: FREEFORM_CAPABILITY'))))
        .filter(line => !(path === 'packages/storage-sqlite/src/worker/index.test.ts'
          && line.includes('capability_template_id')))
        .join('\n')
      return [
        ...source.includes('capabilityTemplateId') ? [`${path}: capabilityTemplateId`] : [],
        ...source.includes('capability_template_id') ? [`${path}: capability_template_id`] : [],
      ]
    })

    expect(protocol).toContain('`capabilityId`')
    expect(runtimeDoc).toContain('`capabilityId`')
    expect(findings, 'current Host-facing session contracts and current SQLite schema should use capabilityId; historical migrations may contain the old column only as migration input').toEqual([])
  })

  test('Host runtime capability lookup APIs do not expose retired template helper names', () => {
    const activeSources = [
      'packages/host-runtime/src/index.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'packages/host-runtime/src/host/runtime.test.ts',
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/host-runtime/src/soul-app/registry.test.ts',
      'packages/host-daemon/src/modes/worker.ts',
      'apps/cli/src/aiworker.ts',
    ]
    const forbidden = [
      'findHostCapabilityTemplate',
      'listHostCapabilityTemplatesForSoul',
      'listCapabilityTemplates',
      'listCapabilityTemplatesForWorker',
      'requireCapabilityTemplateForWorker',
      ['Template ', '{id} does not belong'].join('$'),
      'TEMPLATE_NOT_AVAILABLE',
      'validates worker template ownership',
      'CapabilityTemplate',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden.filter(snippet => source.includes(snippet)).map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Host runtime should expose capability lookup helpers, not template helper aliases').toEqual([])
  })

  test('Host runtime tests use generic worker fixtures instead of retired HR worker ids', () => {
    const source = readRepoFile('packages/host-runtime/src/worker/runtime.test.ts')
    const retiredWorkerSnippets = [
      'worker-hr',
      'AIWorker HR',
      'HR Recruiting',
      'HR Talent',
      'soulId: \'hr\'',
      '"soulId": "hr"',
      'Hiring Workspace',
    ]

    const findings = retiredWorkerSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `packages/host-runtime/src/worker/runtime.test.ts: ${snippet}`)

    expect(findings, 'Host runtime tests should keep worker fixtures generic').toEqual([])
  })

  test('Soul protocol capability projection helpers do not expose retired template names', () => {
    const activeSources = [
      'packages/soul-protocol/src/soul-app/index.ts',
      'packages/soul-protocol/src/soul-app/registry.ts',
    ]
    const forbidden = [
      'CapabilityTemplate',
      'capabilityTemplateSchema',
      'projectSoulAppCapabilityTemplate',
      'projectSoulAppCapabilityTemplates',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden.filter(snippet => source.includes(snippet)).map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Soul protocol projection helpers should expose capabilities, not capability templates').toEqual([])
  })

  test('Soul protocol id utility tests use neutral slug examples', () => {
    const source = readRepoFile('packages/soul-protocol/src/lib/ids.test.ts')
    const retiredSlugSnippets = [
      'HR People Profile',
      'QA___Release',
      'hr-people-profile',
      'qa___release-gate',
    ]

    const findings = retiredSlugSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `packages/soul-protocol/src/lib/ids.test.ts: ${snippet}`)

    expect(findings, 'slug helper tests should not encode retired HR/QA fixture names').toEqual([])
  })

  test('Host-visible Soul catalog does not expose domain as a platform field', () => {
    const activeSources = [
      'packages/soul-protocol/src/soul-app/registry.ts',
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'apps/web/src/features/local-workspace/model-types.ts',
      'apps/web/src/features/i18n/index.ts',
      'apps/web/src/features/i18n/types.ts',
      'apps/web/src/features/local-workspace/components/creation-dialogs.tsx',
      'apps/web/src/features/settings/components/settings-dialog.tsx',
      'apps/web/src/worker/studio/first-run-soul-app-home.tsx',
    ]
    const forbidden = [
      'domain: zod.string',
      'domain: string',
      'domain: soul.domain',
      'soul.domain',
      'soulCopy.domain',
      'projectedSoul?.domain',
    ]

    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Host catalog should expose Soul App identity/description, not domain primitives').toEqual([])
  })

  test('Web local workspace model does not preserve removed protocol compat shims', () => {
    const compatPath = 'apps/web/src/features/local-workspace/types.compat.ts'
    const activeWebSources = listSourceFiles('apps/web/src')
      .filter(path => !/\.(?:test|spec)\.[cm]?[tj]sx?$/.test(path))
    const importFindings = activeWebSources.flatMap((path) => {
      const source = readRepoFile(path)
      return source.includes('types.compat')
        ? [`${path}: types.compat`]
        : []
    })

    expect(existsSync(join(repoRoot, compatPath)), `${compatPath} should be removed after the Thin Shell migration`).toBe(false)
    expect(importFindings, 'Web runtime source should derive local workspace model types from current protocol projections').toEqual([])
  })

  test('filesystem layout comments do not preserve retired review or memory ownership', () => {
    const source = readRepoFile('packages/fs-layout/src/index.ts')
    const forbiddenPatterns = [
      /review\s+policy/,
      /memory\s+namespace/,
    ]

    const findings = forbiddenPatterns.filter(pattern => pattern.test(source)).map(pattern => pattern.source)

    expect(findings, 'fs-layout must describe only Host filesystem responsibilities').toEqual([])
  })

  test('fs-layout scope API does not preserve project autodetect compatibility inputs', () => {
    const source = readRepoFile('packages/fs-layout/src/index.ts')
    const testSource = readRepoFile('packages/fs-layout/src/index.test.ts')
    const forbidden = [
      'cwd?: string',
      'disableProjectDetect?: boolean',
      'Deprecated compatibility input',
      'resolveProjectRoot',
      'resolveAiworkerScope({ cwd:',
    ]
    const findings = [
      ...forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `packages/fs-layout/src/index.ts: ${snippet}`),
      ...forbidden
        .filter(snippet => testSource.includes(snippet))
        .map(snippet => `packages/fs-layout/src/index.test.ts: ${snippet}`),
    ]

    expect(findings, 'fs-layout should expose only host-home resolution inputs after project autodetect removal').toEqual([])
  })

  test('fs-layout worker path tests use generic worker fixture ids', () => {
    const source = readRepoFile('packages/fs-layout/src/index.test.ts')
    const forbidden = [
      'hr-worker',
      'qa-worker',
    ]

    const findings = forbidden
      .filter(snippet => source.includes(snippet))
      .map(snippet => `packages/fs-layout/src/index.test.ts: ${snippet}`)

    expect(findings, 'fs-layout tests should not encode retired HR/QA worker fixture ids').toEqual([])
  })

  test('public package entrypoints no longer export legacy turn runtime surfaces', () => {
    const hostRuntimeEntrypoint = readRepoFile('packages/host-runtime/src/index.ts')
    const soulProtocolEntrypoint = readRepoFile('packages/soul-protocol/src/index.ts')
    const forbiddenExports = [
      ['packages/host-runtime/src/index.ts', 'StartLocalTurnInput', hostRuntimeEntrypoint],
      ['packages/host-runtime/src/index.ts', 'LocalTurnStartResult', hostRuntimeEntrypoint],
      ['packages/soul-protocol/src/index.ts', 'LocalTurn', soulProtocolEntrypoint],
      ['packages/soul-protocol/src/index.ts', 'LocalTurnStatus', soulProtocolEntrypoint],
      ['packages/soul-protocol/src/index.ts', 'localTurnSchema', soulProtocolEntrypoint],
      ['packages/soul-protocol/src/index.ts', 'localTurnStatusSchema', soulProtocolEntrypoint],
    ]

    const findings = forbiddenExports
      .filter(([, token, source]) => source.includes(token))
      .map(([path, token]) => `${path}: ${token}`)

    expect(findings, 'package entrypoints must expose session/invocation surfaces, not legacy turns').toEqual([])
  })

  test('local workspace protocol defines sessions and invocations without LocalTurn schemas', () => {
    const source = readRepoFile('packages/soul-protocol/src/local-workspace.ts')
    const forbidden = [
      'localTurnStatusSchema',
      'LocalTurnStatus',
      'localTurnSchema',
      'LocalTurn',
    ]
    const findings = forbidden
      .filter(snippet => source.includes(snippet))
      .map(snippet => `packages/soul-protocol/src/local-workspace.ts: ${snippet}`)

    expect(findings, 'local workspace protocol should not preserve turn records as a current contract').toEqual([])
    expect(source).toContain('localEngineInvocationSchema')
    expect(source).toContain('LocalEngineInvocation')
  })

  test('Soul App event protocol uses invocation events instead of turn callbacks', () => {
    const source = readRepoFile('packages/soul-protocol/src/soul-app/protocol.ts')

    expect(source).not.toContain('onTurnCompleted')
    expect(source).not.toContain('turnId: string')
    expect(source).toContain('onInvocationCompleted')
    expect(source).toContain('invocationId: string')
  })

  test('soul protocol public surface does not expose generic agent runtime providers', () => {
    const protocolEntrypoint = readRepoFile('packages/soul-protocol/src/index.ts')
    const providerFiles = listSourceFiles('packages/soul-protocol/src/providers')
    const forbiddenPublicExports = [
      'agentEventSchema',
      'AgentEvent',
      'AgentFinishReason',
      'AgentRunInput',
      'AgentTask',
      'AgentTaskStatus',
      'ChatMessage',
      'EngineSessionBinding',
      'ExecutorProvider',
      'ExecutorTool',
      'TokenUsage',
      'ToolAction',
      'ToolCall',
      'ToolStatus',
    ]
    const exportFindings = forbiddenPublicExports
      .filter(snippet => protocolEntrypoint.includes(snippet))
      .map(snippet => `packages/soul-protocol/src/index.ts: ${snippet}`)

    expect([...providerFiles, ...exportFindings], 'soul-protocol should not own generic agent runtime provider primitives').toEqual([])
  })

  test('soul protocol provider surface does not expose memory or governance providers', () => {
    const providerSources = listSourceFiles('packages/soul-protocol/src/providers')
      .map(path => [path, readRepoFile(path)] as const)
    const protocolSources = listSourceFiles('packages/soul-protocol/src')
      .map(path => [path, readRepoFile(path)] as const)
    const forbidden = [
      'BrainMemory',
      'BrainProvider',
      'BrainSkill',
      'BrainWatchEvent',
      'ExecutionEvent',
      'MemoryEntry',
      'MemoryFilter',
      'SkillMeta',
      'WriteMemoryInput',
      'listMemories',
      'searchMemories',
      'writeMemory',
    ]
    const findings = protocolSources.flatMap(([path, source]) =>
      forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`),
    )
    const governanceFindings = providerSources.flatMap(([path, source]) =>
      source.includes('governance') ? [`${path}: governance`] : [],
    )

    expect([...findings, ...governanceFindings], 'soul-protocol should not expose memory/governance provider primitives').toEqual([])
  })

  test('host runtime creates session invocations without legacy startTurn compatibility', () => {
    const runtime = readRepoFile('packages/host-runtime/src/worker/runtime.ts')
    const forbidden = [
      'StartLocalTurnInput',
      'LocalTurnStartResult',
      'async startTurn(',
      'createTurn(',
      'nextTurnSeq(',
      'updateTurn(',
      '/turns/${',
      'kind: \'turn\'',
      'Turn request:',
    ]
    const findings = forbidden
      .filter(snippet => runtime.includes(snippet))
      .map(snippet => `packages/host-runtime/src/worker/runtime.ts: ${snippet}`)

    expect(findings, 'runtime follow-up must be session invocation-native, with no turn compatibility writer').toEqual([])
    expect(runtime).toContain('async startInvocation(')
    expect(runtime).toContain('Invocation request:')
  })

  test('host daemon exposes session invocation follow-up without legacy message aliases', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const daemonTests = readRepoFile('packages/host-daemon/src/modes/worker.local.test.ts')
    const schemas = readRepoFile('packages/host-daemon/src/modes/worker/schemas.ts')
    const forbidden = [
      ['packages/host-daemon/src/modes/worker.ts', '/api/local/workers/:workerId/sessions/:sessionId/messages', daemon],
      ['packages/host-daemon/src/modes/worker.ts', '/api/local/workers/:workerId/workspaces/:workspaceId/sessions/stream', daemon],
      ['packages/host-daemon/src/modes/worker.ts', '/api/local/workspaces/:workspaceId/sessions/stream', daemon],
      ['packages/host-daemon/src/modes/worker.ts', 'createSessionMessageResponse', daemon],
      ['packages/host-daemon/src/modes/worker.ts', 'streamSessionInvocation', daemon],
      ['packages/host-daemon/src/modes/worker.ts', 'turnInput', daemon],
      ['packages/host-daemon/src/modes/worker/schemas.ts', 'createSessionMessageBodySchema', schemas],
      ['packages/host-daemon/src/modes/worker/schemas.ts', '/messages', schemas],
      ['packages/host-daemon/src/modes/worker/schemas.ts', 'sessions/stream', schemas],
    ]
    const findings = forbidden
      .filter(([, snippet, source]) => source.includes(snippet))
      .map(([path, snippet]) => `${path}: ${snippet}`)

    expect(findings, 'host daemon follow-up writes must route through session-level invocations only').toEqual([])
    expect(daemon).toContain('/api/sessions/:sessionId/invocations')
    expect(schemas).toContain('createSessionInvocationBodySchema')
    expect(daemonTests).toContain('records missing native resume refs through the session invocation broker route')
    expect(daemonTests).toContain('continues native resume refs through the session invocation broker route')
    expect(daemonTests).toContain('ENGINE_SESSION_REF_MISSING')
  })

  test('worker storage API does not keep transient turn helper records', () => {
    const storage = readRepoFile('packages/storage-sqlite/src/worker/index.ts')
    const forbidden = [
      'TurnRow',
      'transientTurns',
      'CreateTurnInput',
      'UpdateTurnInput',
      'createTurn',
      'getTurn',
      'updateTurn',
      'listTurns',
      'nextTurnSeq',
      'transient_turns',
    ]
    const findings = forbidden
      .filter(snippet => storage.includes(snippet))
      .map(snippet => `packages/storage-sqlite/src/worker/index.ts: ${snippet}`)

    expect(findings, 'storage should not emulate removed turns outside the current SQLite schema').toEqual([])
    expect(storage).toContain('createEngineInvocation')
    expect(storage).toContain('listEngineInvocations')
  })

  test('worker storage API does not expose legacy overlay write helpers', () => {
    const storage = readRepoFile('packages/storage-sqlite/src/worker/index.ts')
    const forbidden = [
      'WorkerOverlayAssetInput',
      'upsertWorkerOverlayAssets',
      'workerOverlayConfigKey',
    ]
    const findings = forbidden
      .filter(snippet => storage.includes(snippet))
      .map(snippet => `packages/storage-sqlite/src/worker/index.ts: ${snippet}`)

    expect(findings, 'worker overlay writes must use standard worker_config envelopes').toEqual([])
    expect(storage).toContain('upsertWorkerConfigValue')
  })

  test('WorkerStudio test harness does not accept legacy overlay write routes', () => {
    const workerOverlayConfigApi = readRepoFile('apps/web/src/features/local-workspace/api/worker-overlay-config.ts')
    const workerOverlayConfigTest = readRepoFile('apps/web/src/features/local-workspace/api/worker-overlay-config.test.ts')
    const workerStudioTest = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const forbidden = [
      'const requestBody = init?.body ? JSON.parse(String(init.body)) as { assets?: LocalWorkerOverlayAsset[] } : {}',
      'currentWorkerOverlayAssets = requestBody.assets?.map',
      'legacyWorkerOverlayConfigKey',
      'legacyWorkerOverlayConfigKeyForTest',
      'overlay%3Askill%3Acodex',
    ]
    const sources = [
      ['apps/web/src/features/local-workspace/api/worker-overlay-config.ts', workerOverlayConfigApi],
      ['apps/web/src/features/local-workspace/api/worker-overlay-config.test.ts', workerOverlayConfigTest],
      ['apps/web/src/worker/__tests__/worker-studio.test.tsx', workerStudioTest],
    ]
    const findings = sources.flatMap(([path, source]) =>
      forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`),
    )

    expect(findings, 'Web overlay config writes must use canonical worker_config keys only').toEqual([])
    expect(workerStudioTest).toContain('/api/workers/primary-worker/config/skill-overlay%3Abriefing-brief')
  })

  test('storage legacy discard fixtures use capability wording for custom capability ids', () => {
    const storageTest = readRepoFile('packages/storage-sqlite/src/worker/index.test.ts')
    const forbidden = [
      'custom-legacy-template',
      'Custom legacy template',
    ]
    const findings = forbidden
      .filter(snippet => storageTest.includes(snippet))
      .map(snippet => `packages/storage-sqlite/src/worker/index.test.ts: ${snippet}`)

    expect(findings, 'storage fixtures should not name custom capabilities as templates').toEqual([])
  })

  test('retired built-in Soul cleanup does not expose legacy-named current APIs', () => {
    const activeSources = [
      'packages/storage-sqlite/src/worker/index.ts',
      'packages/storage-sqlite/src/worker/index.test.ts',
      'packages/host-runtime/src/soul-app/official.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'packages/host-runtime/src/host/runtime.test.ts',
      'packages/host-runtime/src/index.ts',
      'packages/host-daemon/src/modes/worker.local.test.ts',
      'apps/cli/src/aiworker.test.ts',
    ]
    const forbidden = [
      'DiscardLegacySoulMetadata',
      'OfficialLegacyMetadataDiscard',
      'discardLegacySoulMetadata',
      'discardOfficialSoulAppLegacyMetadata',
      'legacyMetadataDiscard',
      'legacySoulIds',
    ]
    const findings = activeSources.flatMap((path) => {
      const source = readRepoFile(path)
      return forbidden
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'current cleanup surface should use retired built-in Soul naming, not legacy API names').toEqual([])
  })

  test('storage worker tests use generic non-legacy worker fixtures instead of retired HR worker ids', () => {
    const storageTest = readRepoFile('packages/storage-sqlite/src/worker/index.test.ts')
      .replace(/ {2}it\('discards legacy[\s\S]*?\n {2}\}\)/, '')
      .replace(/ {2}it\('repairs legacy[\s\S]*?\n {2}\}\)/, '')
    const retiredWorkerSnippets = [
      'worker-hr',
      'soulId: \'hr\'',
      'name: \'HR\'',
      'HR Recruiting',
      'HR Talent',
      '/tmp/hr',
      'Hiring workspace',
      '/tmp/hiring',
    ]

    const findings = retiredWorkerSnippets
      .filter(snippet => storageTest.includes(snippet))
      .map(snippet => `packages/storage-sqlite/src/worker/index.test.ts: ${snippet}`)

    expect(findings, 'storage tests should use generic worker fixtures except explicit legacy migration cases').toEqual([])
  })

  test('CLI tests use generic non-legacy worker and workspace fixtures', () => {
    const cliTest = readRepoFile('apps/cli/src/aiworker.test.ts')
      .replace(/ {2}function seedLegacyHrMetadata\(\) \{[\s\S]*?\n {2}\}/, '')
    const forbidden = [
      'hr-recruiting',
      'hr-claude',
      'hr-frozen',
      'hr-legacy-engine',
      'HR Recruiting',
      'HR Claude',
      'HR Frozen',
      'HR Legacy Engine',
      'Hiring',
      'role-search',
    ]

    const findings = forbidden
      .filter(snippet => cliTest.includes(snippet))
      .map(snippet => `apps/cli/src/aiworker.test.ts: ${snippet}`)

    expect(findings, 'CLI positive fixtures should not encode retired HR domain worker/workspace names').toEqual([])
  })

  test('governance kernel harness matrix uses neutral soul ids', () => {
    const source = readRepoFile('scripts/governance-kernel-harness.ts')
    const forbidden = [
      'hr-recruiting',
      'qa-reviewer',
    ]

    const findings = forbidden
      .filter(snippet => source.includes(snippet))
      .map(snippet => `scripts/governance-kernel-harness.ts: ${snippet}`)

    expect(findings, 'governance harness matrix should not preserve retired HR/QA fixture ids').toEqual([])
  })

  test('CLI follow-up command surface uses session invocation language only', () => {
    const cli = readRepoFile('apps/cli/src/aiworker.ts')
    const forbidden = [
      'resolveTurnEngineMetadata',
      'sendTurnCommand',
      'cli.command(\'turn send\'',
      'send a turn',
      'turn input',
      'turn send',
    ]
    const findings = forbidden
      .filter(snippet => cli.includes(snippet))
      .map(snippet => `apps/cli/src/aiworker.ts: ${snippet}`)

    expect(findings, 'CLI should route follow-ups through session invoke, not legacy turn send').toEqual([])
    expect(cli).toContain('cli.command(\'session invoke\'')
    expect(cli).toContain('create a session-level engine invocation')
  })

  test('host runtime event bus no longer exposes turn event kind', () => {
    const events = readRepoFile('packages/host-runtime/src/worker/events.ts')
    const forbidden = [
      '\'turn\'',
      'turnId?:',
    ]
    const findings = forbidden
      .filter(snippet => events.includes(snippet))
      .map(snippet => `packages/host-runtime/src/worker/events.ts: ${snippet}`)

    expect(findings, 'runtime bus should publish session and invocation events only').toEqual([])
    expect(events).toContain('\'session\' | \'event\'')
    expect(events).toContain('invocationId?: string')
  })

  test('local executor input is invocation-native without turnId', () => {
    const executor = readRepoFile('packages/host-runtime/src/worker/executor.ts')
    const runtime = readRepoFile('packages/host-runtime/src/worker/runtime.ts')
    const forbidden = [
      ['packages/host-runtime/src/worker/executor.ts', 'turnId', executor],
      ['packages/host-runtime/src/worker/runtime.ts', 'turnId: readNullableString(request.turnId)', runtime],
    ]
    const findings = forbidden
      .filter(([, snippet, source]) => source.includes(snippet))
      .map(([path, snippet]) => `${path}: ${snippet}`)

    expect(findings, 'local executor contract should receive invocation context only').toEqual([])
    expect(executor).toContain('invocationId: string')
    expect(executor).toContain('invocationRoot: string')
  })

  test('session event contracts are invocation-native without turnId compatibility', () => {
    const storage = readRepoFile('packages/storage-sqlite/src/worker/index.ts')
    const protocol = readRepoFile('packages/soul-protocol/src/local-workspace.ts')
    const runtime = readRepoFile('packages/host-runtime/src/worker/runtime.ts')
    const forbidden = [
      ['packages/storage-sqlite/src/worker/index.ts', 'turnId:', storage],
      ['packages/storage-sqlite/src/worker/index.ts', 'turnId?', storage],
      ['packages/storage-sqlite/src/worker/index.ts', 'eventJson.turnId', storage],
      ['packages/soul-protocol/src/local-workspace.ts', 'turnId:', protocol],
      ['packages/host-runtime/src/worker/runtime.ts', 'turnId: null', runtime],
      ['packages/host-runtime/src/worker/runtime.ts', 'turnId: string | null', runtime],
      ['packages/host-runtime/src/worker/runtime.ts', 'input.turnId', runtime],
    ]
    const findings = forbidden
      .filter(([, snippet, source]) => source.includes(snippet))
      .map(([path, snippet]) => `${path}: ${snippet}`)

    expect(findings, 'session event and bridge contexts should be keyed by invocation id only').toEqual([])
    expect(storage).toContain('invocationId: string')
    expect(protocol).toContain('invocationId: idSchema')
  })

  test('WorkerStudio test harness does not preserve transient turn fixtures', () => {
    const workerStudioTest = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const forbidden = [
      'LegacyTurnFixture',
      'turnRecord',
      'currentTurns',
      'turnId:',
      'const turnId',
      'event: turn',
      '/api/local/turns',
      '/api/local/sessions/session-1/turns',
      '/api/local/workers/hr-worker/sessions/session-1/messages',
      '/sessions/stream',
      '/api/sessions/session-1/invocations/stream',
      'turn: createdTurn',
      'turn: nextTurn',
    ]
    const findings = forbidden
      .filter(snippet => workerStudioTest.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx: ${snippet}`)

    expect(findings, 'Web tests should model app-owned mounted sessions through sessions/events only').toEqual([])
    expect(workerStudioTest).toContain('/api/sessions')
    expect(workerStudioTest).toContain('/api/sessions/session-1/invocations')
  })

  test('WorkerStudio test harness does not preserve local aggregate file and event feeds', () => {
    const workerStudioTest = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const forbidden = [
      '/api/local/files',
      '/api/local/artifacts',
      '/api/local/events',
      '/api/local/workspaces/',
      '/files/raw/',
      'currentArtifactRaw',
    ]
    const findings = forbidden
      .filter(snippet => workerStudioTest.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx: ${snippet}`)

    expect(findings, 'Web tests should rely on canonical session and invocation responses instead of retired local aggregate feeds').toEqual([])
  })

  test('host runtime tests seed invocation-native input refs only', () => {
    const runtimeTest = readRepoFile('packages/host-runtime/src/worker/runtime.test.ts')
    const forbidden = [
      '/turns/',
      'legacy-turn',
      'current turn preference',
    ]
    const findings = forbidden
      .filter(snippet => runtimeTest.includes(snippet))
      .map(snippet => `packages/host-runtime/src/worker/runtime.test.ts: ${snippet}`)

    expect(findings, 'runtime fixtures should not normalize old turn inputRef shapes').toEqual([])
    expect(runtimeTest).toContain('/invocations/')
  })

  test('WorkerStudio test harness does not accept legacy nested session create routes', () => {
    const workerStudioTest = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const forbidden = [
      '/api/local/workers/people-worker/workspaces/workspace-created/sessions',
      '/api/local/workspaces/workspace-created/sessions',
      'createdArtifact = { ...artifactRecord, id: \'artifact-created\', sessionId: \'session-created\'',
    ]
    const findings = forbidden
      .filter(snippet => workerStudioTest.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx: ${snippet}`)

    expect(findings, 'Web tests should not keep local nested session create compatibility once broker /api/sessions exists').toEqual([])
    expect(workerStudioTest).toContain('/api/sessions')
    expect(workerStudioTest).toContain('/api/sessions/session-1/invocations')
  })

  test('Freeform v1 has CLI-first and browser golden path gates', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>
    }
    const browserFreeformScript = rootPackage.scripts?.['test:browser:freeform'] ?? ''
    const freeformBuildScript = 'bun run --filter \'@zonease/aiworker-freeform\' build'
    const webBuildScript = 'bun run --filter \'@zonease/aiworker-web\' build'
    const browserProofs = [
      'tests/browser/freeform-cli-golden-path.spec.ts',
      'tests/browser/freeform-mounted-workbench.spec.ts',
    ]
    const freeformCliProof = readRepoFile('apps/cli/src/freeform-golden-path.test.ts')
    const freeformCliBrowserProof = readRepoFile('tests/browser/freeform-cli-golden-path.spec.ts')

    expect(existsSync(join(repoRoot, 'apps/cli/src/freeform-golden-path.test.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'tests/browser/freeform-cli-golden-path.spec.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'tests/browser/freeform-mounted-workbench.spec.ts'))).toBe(true)
    expect(rootPackage.scripts?.['test:cli']).toContain('bun run --filter \'@zonease/aiworker-freeform\' build')
    expect(rootPackage.scripts?.['test:cli']).toContain('apps/cli/src/freeform-golden-path.test.ts')
    expect(freeformCliProof).toContain('listSessionEvents')
    expect(freeformCliProof).toContain('type: \'tool\'')
    expect(freeformCliProof).toContain('phase: \'result\'')
    expect(freeformCliProof).toContain('invocation.usage.observed')
    expect(freeformCliProof).toContain('assertInvocationEventLogRefs')
    expect(freeformCliProof).toContain('assertInvocationExternalSessionRefs')
    expect(freeformCliProof).toContain('session\', \'archive')
    expect(freeformCliProof).toContain('assertArchivedSessionBlocksFollowUp')
    expect(freeformCliProof).toContain('assertRedactedEngineLogProof')
    expect(freeformCliProof).toContain('stderrLog')
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain(freeformBuildScript)
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain(webBuildScript)
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain('tests/browser/freeform-cli-golden-path.spec.ts')
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain('tests/browser/freeform-mounted-workbench.spec.ts')
    for (const proof of browserProofs) {
      expect(browserFreeformScript.indexOf(freeformBuildScript)).toBeLessThan(browserFreeformScript.indexOf(proof))
      expect(browserFreeformScript.indexOf(webBuildScript)).toBeLessThan(browserFreeformScript.indexOf(proof))
    }
    expect(freeformCliBrowserProof).toContain(`/api/engine/invocations/\${id}/events`)
    expect(freeformCliBrowserProof).toContain('assertInvocationEventProof')
    expect(freeformCliBrowserProof).toContain('invocation.output.delta')
    expect(freeformCliBrowserProof).toContain('invocation.tool.observed')
    expect(freeformCliBrowserProof).toContain('invocation.usage.observed')
    expect(freeformCliBrowserProof).toContain('readSessionFollowUpProofFromBrowser')
    expect(freeformCliBrowserProof).toContain(`/api/sessions/\${id}/invocations`)
    expect(freeformCliBrowserProof).toContain('assertBrowserSessionFollowUpProof')
    expect(freeformCliBrowserProof).toContain('assertInvocationExternalSessionRefProof')
    expect(freeformCliBrowserProof).toContain('reattached')
    expect(freeformCliBrowserProof).toContain(`/api/engine/invocations/\${id}/cancel`)
    expect(freeformCliBrowserProof).toContain('assertInvocationCancelProof')
    expect(freeformCliBrowserProof).toContain(`/api/engine/invocations/\${id}/reconcile`)
    expect(freeformCliBrowserProof).toContain('assertInvocationReconcileProof')
    expect(freeformCliBrowserProof).toContain('serialized.includes(\'/turns/\')')
    expect(freeformCliBrowserProof).toContain(`/api/sessions/\${id}/archive`)
    expect(freeformCliBrowserProof).toContain('assertSessionArchiveProof')
    expect(freeformCliBrowserProof).toContain(`/api/workers/\${workerId}/config/skill-overlay%3Afreeform-session`)
    expect(freeformCliBrowserProof).toContain('/api/projections/codex/refresh')
    expect(freeformCliBrowserProof).toContain(`/api/projections/receipts/\${workspaceId}`)
    expect(freeformCliBrowserProof).toContain('assertProjectionRefreshProof')
    expect(freeformCliBrowserProof).toContain('worker-overlay')
    expect(freeformCliBrowserProof).toContain(`/api/workspace-locators/\${workspaceId}/archive`)
    expect(freeformCliBrowserProof).toContain(`/api/workers/\${workerId}/archive`)
    expect(freeformCliBrowserProof).toContain('assertHostLifecycleArchiveProof')
    expect(freeformCliBrowserProof).toContain('WORKER_ARCHIVED')
  })

  test('dist release smoke reads installed apps through canonical app-installation route', () => {
    const smokeScript = readRepoFile('apps/cli/scripts/smoke-dist-release.ts')

    expect(smokeScript).toContain('/api/app-installation/apps')
    expect(smokeScript).toContain('/api/info')
    expect(smokeScript).not.toContain('/api/local/info')
    expect(smokeScript).not.toContain('/api/local/apps')
  })

  test('contract gate runs Host and Soul import boundary tests', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>
    }
    const contractScript = rootPackage.scripts?.['test:contracts'] ?? ''

    expect(contractScript).toContain('tests/architecture')
    expect(contractScript).toContain('scripts/check-soul-app-boundaries.test.ts')
  })

  test('release gate script tracks canonical testing docs', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>
    }
    const releaseGateCommands = documentedReleaseGateCommands()
    const releaseCheckScript = rootPackage.scripts?.['release:check'] ?? ''
    const testing = readRepoFile('docs/testing.md')

    expect(testing).toContain('bun run release:check')
    expect(testing).toContain('bun run smoke:dist-release')
    expect(testing).toContain('bun run smoke:standalone-release')
    expect(testing).toContain('bun run smoke:standalone-runtime')
    expect(testing).toContain('bun run smoke:npm-package')
    expect(releaseCheckScript).toBeTruthy()
    for (const command of releaseGateCommands)
      expect(releaseCheckScript).toContain(command)
    expect(releaseCheckScript.split(' && ')).toEqual(releaseGateCommands)
    expect(readRepoFile('scripts/check-doc-contract.ts')).toContain('release:check must match Current Release Gates exactly')
    expect(releaseCheckScript.indexOf('bun run build')).toBeLessThan(releaseCheckScript.indexOf('bun run smoke:dist-release'))
    expect(releaseCheckScript.indexOf('bun run build')).toBeLessThan(releaseCheckScript.indexOf('bun run smoke:standalone-release'))
    expect(releaseCheckScript.indexOf('bun run build')).toBeLessThan(releaseCheckScript.indexOf('bun run smoke:standalone-runtime'))
    expect(releaseCheckScript.indexOf('bun run build')).toBeLessThan(releaseCheckScript.indexOf('bun run smoke:npm-package'))
    expect(releaseCheckScript).not.toContain('tmp/refactor')
  })

  test('release smoke contract tests guard official Freeform descriptor refs', () => {
    const testing = readRepoFile('docs/testing.md')
    const releaseSmokeContractTests = [
      'apps/cli/scripts/smoke-dist-release.test.ts',
      'apps/cli/scripts/smoke-npm-package.test.ts',
      'apps/cli/scripts/smoke-standalone-release.test.ts',
      'apps/cli/scripts/smoke-standalone-runtime.test.ts',
    ]

    for (const testPath of releaseSmokeContractTests) {
      expect(testing).toContain(testPath)
      expect(existsSync(join(repoRoot, testPath))).toBe(true)
      expect(readRepoFile(testPath)).toContain('descriptor refs')
      expect(readRepoFile(testPath)).toContain('parseOfficialFreeformDescriptorJson')
    }
  })

  test('release packaging contract tests guard descriptor-only official apps', () => {
    const testing = readRepoFile('docs/testing.md')
    const releasePackagingContractTests = [
      'apps/cli/scripts/build-publish-manifest.test.ts',
      'apps/cli/scripts/package-release-bundles.test.ts',
    ]

    for (const testPath of releasePackagingContractTests) {
      expect(testing).toContain(testPath)
      expect(existsSync(join(repoRoot, testPath))).toBe(true)
    }

    const publishManifestTest = readRepoFile('apps/cli/scripts/build-publish-manifest.test.ts')
    const packageReleaseBundlesTest = readRepoFile('apps/cli/scripts/package-release-bundles.test.ts')

    expect(publishManifestTest).toContain('descriptor-only official Soul dist tree')
    expect(publishManifestTest).toContain('host-adapter')
    expect(publishManifestTest).toContain('AGENTS.test.ts')
    expect(packageReleaseBundlesTest).toContain('official descriptor Soul Apps')
    expect(packageReleaseBundlesTest).toContain('missing Drizzle metadata')
    expect(packageReleaseBundlesTest).toContain('descriptor-declared workbench assets are missing')
    expect(packageReleaseBundlesTest).toContain('descriptor-declared MCP assets are missing')
  })

  test('canonical testing docs track OpenAPI and redaction guardrails', () => {
    const testing = readRepoFile('docs/testing.md')
    const daemonTest = readRepoFile('packages/host-daemon/src/modes/worker.local.test.ts')

    expect(testing).toContain('OpenAPI and redaction contract tests')
    expect(testing).toContain('packages/host-daemon/src/modes/worker.local.test.ts')
    expect(testing).toContain('packages/storage-sqlite/src/worker/index.test.ts')
    expect(testing).toContain('packages/engine-bridge/src/bridge-contract.test.ts')
    expect(testing).toContain('packages/engine-projection/src/workspace-projection.test.ts')
    expect(daemonTest).toContain('target.request(\'/openapi.json\')')
    expect(daemonTest).toContain('\'/api/sessions/{sessionId}/invocations\'')
    expect(daemonTest).toContain('\'/api/local/info\'')
    expect(daemonTest).toContain('serializedOpenApi')
    expect(daemonTest).toContain('not.toContain(\'[mcp_servers\')')
    expect(daemonTest).toContain('not.toContain(\'mcpServers\')')
    expect(daemonTest).toContain('not.toContain(\'literal-secret\')')
    expect(daemonTest).toContain('not.toContain(\'sk-\')')
  })

  test('canonical testing docs track Freeform browser proof scope', () => {
    const testing = readRepoFile('docs/testing.md')

    expect(testing).toContain('-> verifies the first invocation and starts a session-level follow-up from browser context')
    expect(testing).toContain('-> shows bridge event refs to the mounted surface')
    expect(testing).toContain('-> cancels a queued invocation without changing session lifecycle')
    expect(testing).toContain('-> reattaches and reconciles engine bridge events')
    expect(testing).toContain('-> refreshes projection receipts from mounted context')
    expect(testing).toContain('-> applies worker config overlay and observes worker-overlay projection receipts')
    expect(testing).toContain('-> archives the session and rejects follow-up')
    expect(testing).toContain('-> archives workspace and worker lifecycle, blocking new work on archived worker')
  })

  test('tag release workflow runs the canonical release gate before publishing', () => {
    const releaseWorkflow = readRepoFile('.github/workflows/release.yml')
    const releaseCheckIndex = releaseWorkflow.indexOf('bun run release:check')
    const compileIndex = releaseWorkflow.indexOf('Compile single-file binaries')
    const publishIndex = releaseWorkflow.indexOf('npm publish --access public')
    const packageIndex = releaseWorkflow.indexOf('bun apps/cli/scripts/package-release-bundles.ts')
    const artifactSmokeIndex = releaseWorkflow.indexOf('bun apps/cli/scripts/smoke-release-artifacts.ts')
    const attachIndex = releaseWorkflow.indexOf('softprops/action-gh-release')

    expect(releaseCheckIndex).toBeGreaterThanOrEqual(0)
    expect(compileIndex).toBeGreaterThan(releaseCheckIndex)
    expect(publishIndex).toBeGreaterThanOrEqual(0)
    expect(packageIndex).toBeGreaterThanOrEqual(0)
    expect(packageIndex).toBeGreaterThan(compileIndex)
    expect(artifactSmokeIndex).toBeGreaterThan(packageIndex)
    expect(artifactSmokeIndex).toBeLessThan(publishIndex)
    expect(publishIndex).toBeLessThan(attachIndex)
  })

  test('standalone release bundles include descriptor-only official Soul Apps', () => {
    const releaseWorkflow = readRepoFile('.github/workflows/release.yml')
    const releasePackager = readRepoFile('apps/cli/scripts/package-release-bundles.ts')

    expect(releaseWorkflow).toContain('bun apps/cli/scripts/package-release-bundles.ts')
    expect(releaseWorkflow).toContain('bun apps/cli/scripts/smoke-release-artifacts.ts')
    expect(releasePackager).toContain('official-apps')
    expect(releasePackager.indexOf('official-apps')).toBeLessThan(releasePackager.indexOf('createTarball'))
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
      '/api/local/apps/$' + '{appId}/surfaces/$' + '{surfaceId}',
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
    const match = source.match(/function descriptorWorkbenchRoutes[\s\S]*?\n\}\n/)
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

  test('mounted child route tests use generic workbench paths instead of retired HR routes', () => {
    const source = readRepoFile('apps/web/src/worker/mounted-child-route.test.ts')
    const retiredRouteSnippets = [
      'aiworker-hr',
      'hr-home',
      '\'/hr',
      '/outside/release',
      'item-ben',
      'item-stella',
      'item-ada',
      'tab=review',
    ]

    const findings = retiredRouteSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/worker/mounted-child-route.test.ts: ${snippet}`)

    expect(findings, 'mounted child route tests should prove generic mounted routing without HR route fixtures').toEqual([])
  })

  test('micro-app runtime tests use generic workbench routes instead of retired HR routes', () => {
    const source = readRepoFile('apps/web/src/lib/micro-app-runtime.test.ts')
    const retiredRouteSnippets = [
      'aiworker-hr',
      'hr-home',
      '\'/hr',
      'aiworker-demo-people',
      'aiworker-demo-release',
      'item-ben',
      'item-stella',
      'item-ada',
      'tab=review',
    ]

    const findings = retiredRouteSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/lib/micro-app-runtime.test.ts: ${snippet}`)

    expect(findings, 'micro-app runtime tests should prove generic route plumbing without HR route fixtures').toEqual([])
  })

  test('mounted route preference tests use generic worker and route ids instead of retired HR routes', () => {
    const source = readRepoFile('apps/web/src/worker/studio/mounted-route-preferences.test.ts')
    const retiredRouteSnippets = [
      'worker-hr',
      'hr-profile',
    ]

    const findings = retiredRouteSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/worker/studio/mounted-route-preferences.test.ts: ${snippet}`)

    expect(findings, 'mounted route preference tests should use neutral worker ids and route ids').toEqual([])
  })

  test('Web worker tests use generic descriptor fixtures instead of retired HR and QA app ids', () => {
    const webWorkerTestSources = [
      'apps/web/src/worker/__tests__/worker-studio.test.tsx',
      'apps/web/src/worker/studio/locator.test.ts',
    ]
    const retiredFixtureSnippets = [
      'aiworker-hr',
      'aiworker-qa',
      'AIWorker HR',
      'AIWorker QA',
    ]

    const findings = webWorkerTestSources.flatMap((path) => {
      const source = readRepoFile(path)
      return retiredFixtureSnippets
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'Web Host tests should use generic descriptor fixtures, not old app-local product identities').toEqual([])
  })

  test('Web locator tests use neutral workspace names', () => {
    const source = readRepoFile('apps/web/src/worker/studio/locator.test.ts')
    const retiredWorkspaceSnippets = [
      'Hiring Workspace',
      'Hiring Pipeline',
      'aiworker-demo-people',
      'aiworker-demo-release',
      'people-worker',
      'release-worker',
      'People Workspace',
      'Release Workspace',
      'People Pipeline',
      'Profile Capability',
      'Screening Capability',
      'confidential compensation review',
      'HR Worker',
    ]

    const findings = retiredWorkspaceSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/worker/studio/locator.test.ts: ${snippet}`)

    expect(findings, 'locator tests should keep workspace names product-neutral').toEqual([])
  })

  test('WorkerStudio tests use neutral workspace fixture names', () => {
    const source = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const retiredWorkspaceSnippets = [
      'Hiring Workspace',
      'Second Hiring Workspace',
      '/tmp/hiring',
    ]

    const findings = retiredWorkspaceSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx: ${snippet}`)

    expect(findings, 'WorkerStudio tests should keep workspace names product-neutral').toEqual([])
  })

  test('WorkerStudio fetch mocks use neutral app-owned widget paths', () => {
    const source = readRepoFile('apps/web/src/worker/__tests__/worker-studio.test.tsx')
    const retiredWidgetSnippets = [
      'hr-people-widget',
    ]

    const findings = retiredWidgetSnippets
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/worker/__tests__/worker-studio.test.tsx: ${snippet}`)

    expect(findings, 'WorkerStudio app-owned widget mock paths should not preserve retired HR prefixes').toEqual([])
  })

  test('shared SessionComposer uses neutral selector terminology instead of retired template ids', () => {
    const sharedComposerSources = [
      'packages/ui/src/components/session-composer.tsx',
      'packages/ui/src/components/managed-session-composer.tsx',
      'packages/ui/src/components/session-composer.test.tsx',
    ]
    const retiredSelectorSnippets = [
      'selectedTemplateId',
      'templateOptions',
      'onTemplateChange',
      'templateLabel',
    ]

    const findings = sharedComposerSources.flatMap((path) => {
      const source = readRepoFile(path)
      return retiredSelectorSnippets
        .filter(snippet => source.includes(snippet))
        .map(snippet => `${path}: ${snippet}`)
    })

    expect(findings, 'shared composer primitives should not preserve retired capability-template terminology').toEqual([])
  })

  test('shared Web studio shell tests use neutral fixture copy', () => {
    const source = readRepoFile('apps/web/src/shared/__tests__/studio-collapsible-group.test.tsx')
    const forbidden = [
      'profile-section-candidates',
      'Candidates',
      'Candidate profiles',
      'Open profile',
      'QA (1)',
      'quality-assurance',
      'Hiring Workspace',
    ]

    const findings = forbidden
      .filter(snippet => source.includes(snippet))
      .map(snippet => `apps/web/src/shared/__tests__/studio-collapsible-group.test.tsx: ${snippet}`)

    expect(findings, 'shared studio shell tests should use neutral fixture labels').toEqual([])
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
