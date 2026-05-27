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

  test('runtime doc promotes projection, assets CRUD, and bridge hard rules', () => {
    const runtime = readRepoFile('docs/runtime.md')

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
    expect(protocol).toContain('strips client credentials before proxying')
    expect(protocol).toContain('strips app-owned cookies plus Host mount credentials before returning')
  })

  test('capability template projections stay generic and do not expose review rubric fields', () => {
    const activeSources = [
      'packages/soul-protocol/src/soul-app/registry.ts',
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'packages/soul-app-runtime/src/index.ts',
      'apps/web/src/features/local-workspace/types.compat.ts',
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

  test('local broker capability routes do not preserve retired template route aliases', () => {
    const activeSources = [
      'packages/host-daemon/src/modes/worker.ts',
      'packages/soul-app-runtime/src/index.ts',
      'apps/cli/scripts/smoke-dist-release.ts',
      'apps/web/src/features/local-workspace/api/workspace-data.ts',
      'apps/web/src/worker/__tests__/worker-studio.test.tsx',
    ]
    const forbidden = [
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

    expect(daemonTest).not.toContain('FREEFORM_TEMPLATE')
    expect(daemonTest).toContain('FREEFORM_CAPABILITY')
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
      'apps/web/src/features/local-workspace/types.compat.ts',
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
      'apps/web/src/features/local-workspace/types.compat.ts',
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

  test('session capability selection uses capabilityId outside the legacy SQLite column name', () => {
    const protocol = readRepoFile('docs/protocol.md')
    const runtimeDoc = readRepoFile('docs/runtime.md')
    const activeSources = [
      'packages/soul-protocol/src/local-workspace.ts',
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
        .join('\n')
      return source.includes('capabilityTemplateId') ? [`${path}: capabilityTemplateId`] : []
    })

    expect(protocol).toContain('`capabilityId`')
    expect(runtimeDoc).toContain('`capabilityId`')
    expect(findings, 'current Host-facing session contracts should use capabilityId; only the SQLite column name may stay legacy').toEqual([])
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

  test('Host-visible Soul catalog does not expose domain as a platform field', () => {
    const activeSources = [
      'packages/soul-protocol/src/soul-app/registry.ts',
      'packages/host-runtime/src/soul-app/registry.ts',
      'packages/host-runtime/src/host/runtime.ts',
      'apps/web/src/features/local-workspace/types.compat.ts',
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

  test('filesystem layout comments do not preserve retired review or memory ownership', () => {
    const source = readRepoFile('packages/fs-layout/src/index.ts')
    const forbiddenPatterns = [
      /review\s+policy/,
      /memory\s+namespace/,
    ]

    const findings = forbiddenPatterns.filter(pattern => pattern.test(source)).map(pattern => pattern.source)

    expect(findings, 'fs-layout must describe only Host filesystem responsibilities').toEqual([])
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
    expect(workerStudioTest).toContain('/api/local/sessions')
    expect(workerStudioTest).toContain('/api/local/events')
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

    expect(existsSync(join(repoRoot, 'apps/cli/src/freeform-golden-path.test.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'tests/browser/freeform-cli-golden-path.spec.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'tests/browser/freeform-mounted-workbench.spec.ts'))).toBe(true)
    expect(rootPackage.scripts?.['test:cli']).toContain('bun run --filter \'@zonease/aiworker-freeform\' build')
    expect(rootPackage.scripts?.['test:cli']).toContain('apps/cli/src/freeform-golden-path.test.ts')
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain(freeformBuildScript)
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain(webBuildScript)
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain('tests/browser/freeform-cli-golden-path.spec.ts')
    expect(rootPackage.scripts?.['test:browser:freeform']).toContain('tests/browser/freeform-mounted-workbench.spec.ts')
    for (const proof of browserProofs) {
      expect(browserFreeformScript.indexOf(freeformBuildScript)).toBeLessThan(browserFreeformScript.indexOf(proof))
      expect(browserFreeformScript.indexOf(webBuildScript)).toBeLessThan(browserFreeformScript.indexOf(proof))
    }
  })

  test('contract gate runs Host and Soul import boundary tests', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>
    }
    const contractScript = rootPackage.scripts?.['test:contracts'] ?? ''

    expect(contractScript).toContain('tests/architecture')
    expect(contractScript).toContain('scripts/check-soul-app-boundaries.test.ts')
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
