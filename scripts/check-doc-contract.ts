import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface Issue {
  file: string
  message: string
}

const repoRoot = process.cwd()
const issues: Issue[] = []

const canonicalDocs = [
  'docs/architecture.md',
  'docs/protocol.md',
  'docs/runtime.md',
  'docs/soul-authoring.md',
  'docs/testing.md',
]

const activeDocs = ['AGENTS.md', ...canonicalDocs]

const forbiddenActiveDocPhrases = [
  'Host auth is provider-backed',
  'admission',
  'grant enforcement',
  'gateway',
  'fleet',
  'control-plane',
  'Host-owned proposal',
  'Host-owned review',
  'generic review/lesson ledger',
  'generic enablement security review',
]

for (const file of activeDocs) {
  if (!existsSync(abs(file)))
    issues.push({ file, message: 'active documentation file is missing' })
}

const expectedDocsEntries = [
  ...canonicalDocs.map(file => path.basename(file)),
  'superpowers',
].sort()
const actualDocsEntries = existsSync(abs('docs')) ? readdirSync(abs('docs')).sort() : []
if (JSON.stringify(actualDocsEntries) !== JSON.stringify(expectedDocsEntries)) {
  issues.push({
    file: 'docs',
    message: `docs tree must contain only canonical contract docs plus current Superpowers process artifacts: expected ${expectedDocsEntries.join(', ')}, found ${actualDocsEntries.join(', ')}`,
  })
}
const superpowersEntries = existsSync(abs('docs/superpowers')) ? readdirSync(abs('docs/superpowers')).sort() : []
if (JSON.stringify(superpowersEntries) !== JSON.stringify(['plans', 'specs'])) {
  issues.push({
    file: 'docs/superpowers',
    message: `Superpowers docs must use only plans/ and specs/ process directories, found ${superpowersEntries.join(', ')}`,
  })
}

requireIncludes('docs/architecture.md', [
  'Decision Coverage Index',
  'tmp/refactor decisions are evidence until promoted',
  'Host is shell / locator / mount / bridge',
  'CLI-first',
  'descriptor-only',
  'packages/core and packages/shared disappear',
  'apps/api` migrates to `packages/host-daemon',
  '`souls/aiworker-freeform` is the only strong v1 acceptance Soul',
])

requireIncludes('AGENTS.md', [
  'canonical docs',
  'Superpowers',
  'Host is shell / locator / mount / bridge',
  'CLI-first',
  'descriptor-only',
  'POST /api/sessions/:sessionId/invocations',
  'Author-owned native MCP files may contain literal secrets',
  'tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation',
  'shadcn',
])
requireMaxLines('AGENTS.md', 90)

forbidIncludes('AGENTS.md', [
  'docs/plan',
  'docs/task',
  'docs/superpowers',
  'docs/changelog.md',
  'docs/soul-app-developer.md',
  'aiworker-host-dev',
  'aiworker-soul-app-dev',
  'PMA requirement',
])

for (const file of ['README.md', 'README.zh-CN.md']) {
  requireIncludes(file, canonicalDocs)
  forbidIncludes(file, [
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
  ])
}

requireIncludes('docs/protocol.md', [
  'dist/soul.descriptor.json',
  'router-mode="search"',
  'POST   /api/sessions/:sessionId/invocations',
  'These are broker routes, not business product APIs.',
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
  'configValueJson envelope',
  'kind, target, enabled, sourceRef, checksum, options, updatedAt, updatedBy',
])
forbidIncludes('docs/protocol.md', [
  'host-adapter',
  'source exports',
])

requireIncludes('docs/runtime.md', [
  'session lifecycle: active | archived | deleted',
  'execution/process state belongs to engine_invocations',
  'POST /api/sessions/:sessionId/invocations',
  'B+ structured native engine bridge',
  'Host orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.',
  'Runtime skills, MCP, and entry-file CRUD',
  'ENGINE_SESSION_REF_MISSING',
  'ENGINE_CANCEL_FAILED',
  'PROJECTION_RECEIPT_STALE',
  'Allowed bridge event classes',
  'Delayed hard kill must never terminate a newer invocation.',
  'Author-owned native MCP files may contain literal secrets',
])

requireIncludes('docs/soul-authoring.md', [
  'souls/*',
  'soul.config.ts',
  'packages/soul-workbench',
  'author-owned native MCP files may contain literal secrets',
  '`souls/aiworker-freeform` is the v1 acceptance Soul',
  'Convention discovery',
  'product/capabilities/*/prompt.md',
  'engine/workspace/*',
  'engine/skills/*',
  'engine/mcp/codex/config.toml',
  'engine/mcp/claude-code/.mcp.json',
  'dist/engine-assets/',
])
forbidIncludes('docs/soul-authoring.md', [
  'product/api/index.ts',
  'product/artifacts/*',
  'dist/api/',
  '  web/\n  api/\n  engine-assets/',
])

requireIncludes('docs/testing.md', [
  'bun run test:contracts',
  'Contract tests are the primary guardrail',
  'The v1 browser proof is Freeform-only',
  'tests/browser/freeform-cli-golden-path.spec.ts',
  'Canonical Coverage Ledger',
  'docs+tests',
  'docs-only',
  'tests-only',
  'tmp-only',
  'tmp-only is not acceptable for closed hard decisions',
  'Protocol implementation contract',
  'Runtime and bridge contract',
  'Soul authoring contract',
])
for (const testPath of documentedTestingPaths()) {
  if (!existsSync(abs(testPath))) {
    issues.push({
      file: 'docs/testing.md',
      message: `listed test file does not exist: ${testPath}`,
    })
  }
}

for (const file of canonicalDocs) {
  forbidIncludes(file, [
    'GOALS.md',
    'aiworker-validate',
  ])
  forbidIncludes(file, forbiddenActiveDocPhrases)
}

const packageJson = JSON.parse(read('package.json')) as {
  engines?: Record<string, string>
  scripts?: Record<string, string>
  workspaces?: string[]
}
const cliPackageJson = JSON.parse(read('apps/cli/package.json')) as {
  engines?: Record<string, string>
}
const expectedReleaseGateCommands = [
  'bun run docs:check',
  'bun run test:contracts',
  'bun run test:protocol',
  'bun run test:cli',
  'bun run test:browser:freeform',
  'bun run typecheck',
  'bun run lint',
  'bun run build',
  'bun run smoke:dist-release',
  'bun run smoke:standalone-release',
  'bun run smoke:standalone-runtime',
  'bun run smoke:npm-package',
  'bun run test',
  'bun run check',
]
const releaseGateCommands = documentedReleaseGateCommands()
if (JSON.stringify(releaseGateCommands) !== JSON.stringify(expectedReleaseGateCommands)) {
  issues.push({
    file: 'docs/testing.md',
    message: `Current Release Gates must list exactly: ${expectedReleaseGateCommands.join(', ')}`,
  })
}
for (const command of releaseGateCommands) {
  const scriptName = command.match(/^bun run ([\w:-]+)$/)?.[1]
  if (!scriptName) {
    issues.push({ file: 'docs/testing.md', message: `Current Release Gates command is not a root bun script: ${command}` })
    continue
  }
  if (!packageJson.scripts?.[scriptName])
    issues.push({ file: 'package.json', message: `Current Release Gates references missing root script: ${scriptName}` })
}
const releaseCheckCommands = packageJson.scripts?.['release:check']?.split(' && ') ?? []
if (JSON.stringify(releaseCheckCommands) !== JSON.stringify(releaseGateCommands)) {
  issues.push({
    file: 'package.json',
    message: 'release:check must match Current Release Gates exactly',
  })
}
for (const testPath of documentedTestingPaths()) {
  for (const finding of documentedTestingCoverageFindings(testPath, packageJson)) {
    issues.push({
      file: 'docs/testing.md',
      message: finding,
    })
  }
}
const testingDoc = read('docs/testing.md')
for (const requiredReleaseExitText of [
  '## Release Exit Criteria',
  '`bun run release:check` must exactly aggregate the Current Release Gates',
  'Tag release handoff must run post-compile artifact proof after `release:check`',
  'bun apps/cli/scripts/package-release-bundles.ts',
  'bun apps/cli/scripts/smoke-release-artifacts.ts',
]) {
  if (!testingDoc.includes(requiredReleaseExitText)) {
    issues.push({
      file: 'docs/testing.md',
      message: 'Release Exit Criteria must document post-compile artifact proof',
    })
  }
}
if (!packageJson.workspaces?.includes('souls/*'))
  issues.push({ file: 'package.json', message: 'workspaces must include souls/*' })
const expectedNodeEngineRange = '>=20.19.0 <21 || >=22.12.0'
const expectedWorkflowNodeVersion = '24'
const releaseWorkflow = read('.github/workflows/release.yml')
const lintWorkflow = read('.github/workflows/lint.yml')
const releaseWorkflowReleaseCheckIndex = releaseWorkflow.indexOf('bun run release:check')
const releaseWorkflowCompileIndex = releaseWorkflow.indexOf('Compile single-file binaries')
const releaseWorkflowPackageIndex = releaseWorkflow.indexOf('bun apps/cli/scripts/package-release-bundles.ts')
const releaseWorkflowArtifactSmokeIndex = releaseWorkflow.indexOf('bun apps/cli/scripts/smoke-release-artifacts.ts')
const releaseWorkflowPublishIndex = releaseWorkflow.indexOf('npm publish --provenance --access public')
const releaseWorkflowAttachIndex = releaseWorkflow.indexOf('softprops/action-gh-release')
if (packageJson.engines?.node !== expectedNodeEngineRange)
  issues.push({ file: 'package.json', message: `root package must declare Node engine ${expectedNodeEngineRange}` })
if (cliPackageJson.engines?.node !== expectedNodeEngineRange)
  issues.push({ file: 'apps/cli/package.json', message: `published CLI package must declare Node engine ${expectedNodeEngineRange}` })
if (!releaseWorkflow.includes(`node-version: '${expectedWorkflowNodeVersion}'`))
  issues.push({ file: '.github/workflows/release.yml', message: 'GitHub workflows must use Node 24 for release reproducibility' })
if (!lintWorkflow.includes(`node-version: '${expectedWorkflowNodeVersion}'`))
  issues.push({ file: '.github/workflows/lint.yml', message: 'GitHub workflows must use Node 24 for release reproducibility' })
if (
  releaseWorkflowReleaseCheckIndex === -1
  || releaseWorkflowCompileIndex <= releaseWorkflowReleaseCheckIndex
  || releaseWorkflowPackageIndex <= releaseWorkflowCompileIndex
  || releaseWorkflowArtifactSmokeIndex <= releaseWorkflowPackageIndex
  || releaseWorkflowPublishIndex <= releaseWorkflowArtifactSmokeIndex
  || releaseWorkflowAttachIndex <= releaseWorkflowPublishIndex
) {
  issues.push({
    file: '.github/workflows/release.yml',
    message: 'tag release must run release:check, compile, package, smoke artifacts, publish, then attach release assets',
  })
}
const testContractsScript = packageJson.scripts?.['test:contracts'] ?? ''
if (!testContractsScript.includes('bun test tests/architecture'))
  issues.push({ file: 'package.json', message: 'test:contracts must run the refactor contract test' })
if (!testContractsScript.includes('scripts/check-soul-app-boundaries.test.ts'))
  issues.push({ file: 'package.json', message: 'test:contracts must run the Host/Soul import boundary test' })
if (packageJson.scripts?.['test:protocol'] !== 'bun run --filter \'@zonease/aiworker-soul-protocol\' test')
  issues.push({ file: 'package.json', message: 'test:protocol must run the soul-protocol package test' })
const testCliScript = packageJson.scripts?.['test:cli'] ?? ''
const testBrowserFreeformScript = packageJson.scripts?.['test:browser:freeform'] ?? ''
const freeformBuildScript = 'bun run --filter \'@zonease/aiworker-freeform\' build'
const webBuildScript = 'bun run --filter \'@zonease/aiworker-web\' build'
const browserFreeformProofs = [
  'tests/browser/freeform-cli-golden-path.spec.ts',
  'tests/browser/freeform-mounted-workbench.spec.ts',
]
if (!testCliScript.includes('apps/cli/src/freeform-golden-path.test.ts'))
  issues.push({ file: 'package.json', message: 'test:cli must include the Freeform CLI golden path test' })
if (!testCliScript.includes(freeformBuildScript))
  issues.push({ file: 'package.json', message: 'test:cli must rebuild the Freeform Soul App before CLI golden path tests' })
if (!testBrowserFreeformScript.includes(freeformBuildScript))
  issues.push({ file: 'package.json', message: 'test:browser:freeform must rebuild the Freeform Soul App before browser proofs' })
if (!testBrowserFreeformScript.includes(webBuildScript))
  issues.push({ file: 'package.json', message: 'test:browser:freeform must rebuild Host Web before browser proofs' })
for (const proof of browserFreeformProofs) {
  requireScriptBefore('test:browser:freeform', testBrowserFreeformScript, freeformBuildScript, proof)
  requireScriptBefore('test:browser:freeform', testBrowserFreeformScript, webBuildScript, proof)
}
if (!testBrowserFreeformScript.includes('tests/browser/freeform-cli-golden-path.spec.ts'))
  issues.push({ file: 'package.json', message: 'test:browser:freeform must include the Freeform CLI browser golden path proof' })
if (!testBrowserFreeformScript.includes('tests/browser/freeform-mounted-workbench.spec.ts'))
  issues.push({ file: 'package.json', message: 'test:browser:freeform must include the mounted workbench browser proof' })
if (packageJson.scripts?.['docs:check'] !== 'bun scripts/check-doc-contract.ts')
  issues.push({ file: 'package.json', message: 'docs:check must run scripts/check-doc-contract.ts' })
if (packageJson.scripts?.['ui:check'] !== 'bun scripts/check-web-ui-components.ts')
  issues.push({ file: 'package.json', message: 'ui:check must run scripts/check-web-ui-components.ts' })
if (!packageJson.scripts?.build?.includes('@zonease/aiworker-host-daemon'))
  issues.push({ file: 'package.json', message: 'build must include the final host-daemon package' })
if (packageJson.scripts?.build?.includes('@zonease/aiworker-api'))
  issues.push({ file: 'package.json', message: 'build must not reference retired apps/api package' })
if (!packageJson.scripts?.lint?.includes('bun run ui:check'))
  issues.push({ file: 'package.json', message: 'lint must include bun run ui:check' })
if (!packageJson.scripts?.lint?.includes('bun run docs:check'))
  issues.push({ file: 'package.json', message: 'lint must include bun run docs:check' })

if (issues.length > 0) {
  for (const issue of issues)
    console.error(`${issue.file}: ${issue.message}`)
  process.exit(1)
}

console.log(`docs contract ok (${activeDocs.length} active files, ${canonicalDocs.length} canonical docs)`)

function abs(file: string): string {
  return path.join(repoRoot, file)
}

function read(file: string): string {
  const filePath = abs(file)
  if (!existsSync(filePath))
    return ''
  return readFileSync(filePath, 'utf8')
}

function requireIncludes(file: string, needles: string[]): void {
  const content = read(file)
  for (const needle of needles) {
    if (!content.includes(needle))
      issues.push({ file, message: `missing required text ${JSON.stringify(needle)}` })
  }
}

function requireMaxLines(file: string, maxLines: number): void {
  const content = read(file).trimEnd()
  const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length
  if (lineCount > maxLines)
    issues.push({ file, message: `expected at most ${maxLines} lines, found ${lineCount}` })
}

function forbidIncludes(file: string, needles: string[]): void {
  const content = read(file)
  for (const needle of needles) {
    if (content.includes(needle))
      issues.push({ file, message: `contains forbidden active-route text ${JSON.stringify(needle)}` })
  }
}

function documentedTestingPaths(): string[] {
  const lines = read('docs/testing.md').split(/\r?\n/)
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
  const lines = read('docs/testing.md').split(/\r?\n/)
  const headingIndex = lines.findIndex(line => line.trim() === '## Current Release Gates')
  if (headingIndex === -1)
    return []

  const firstFenceIndex = lines.findIndex((line, index) => index > headingIndex && line.startsWith('```'))
  if (firstFenceIndex === -1)
    return []

  const closeFenceIndex = lines.findIndex((line, index) => index > firstFenceIndex && line.startsWith('```'))
  if (closeFenceIndex === -1)
    return []

  return lines
    .slice(firstFenceIndex + 1, closeFenceIndex)
    .map(line => line.trim())
    .filter(Boolean)
}

function documentedTestingCoverageFindings(testPath: string, rootPackageJson: { scripts?: Record<string, string> }): string[] {
  const scripts = rootPackageJson.scripts ?? {}
  const findings: string[] = []

  if (testPath.startsWith('tests/architecture/')) {
    if (!scripts['test:contracts']?.includes('tests/architecture'))
      findings.push(`listed architecture test is not covered by test:contracts: ${testPath}`)
    return findings
  }

  if (testPath === 'scripts/check-soul-app-boundaries.test.ts') {
    if (!scripts['test:contracts']?.includes(testPath))
      findings.push(`listed boundary test is not covered by test:contracts: ${testPath}`)
    return findings
  }

  if (testPath.startsWith('tests/browser/')) {
    if (!scripts['test:browser:freeform']?.includes(testPath))
      findings.push(`listed browser proof is not covered by test:browser:freeform: ${testPath}`)
    return findings
  }

  if (testPath === 'apps/cli/src/freeform-golden-path.test.ts' || testPath === 'apps/cli/src/aiworker.test.ts') {
    if (!scripts['test:cli']?.includes(testPath))
      findings.push(`listed CLI proof is not covered by test:cli: ${testPath}`)
  }

  if (testPath.startsWith('packages/soul-protocol/') && !scripts['test:protocol']?.includes('@zonease/aiworker-soul-protocol'))
    findings.push(`listed protocol test is not covered by test:protocol: ${testPath}`)

  const workspaceRoot = testPath.match(/^(?:apps|packages|souls)\/[^/]+/)?.[0]
  if (workspaceRoot) {
    if (scripts.test !== 'bun run --filter \'*\' test')
      findings.push(`listed workspace test is not covered by the root test release gate: ${testPath}`)

    const packageJsonPath = `${workspaceRoot}/package.json`
    if (!existsSync(abs(packageJsonPath))) {
      findings.push(`listed workspace test has no package.json for root test coverage: ${testPath}`)
      return findings
    }

    const workspacePackageJson = JSON.parse(read(packageJsonPath)) as { scripts?: Record<string, string> }
    if (!workspacePackageJson.scripts?.test)
      findings.push(`listed workspace test package has no test script for root test coverage: ${testPath}`)
    return findings
  }

  findings.push(`listed test file is not covered by a current release gate: ${testPath}`)
  return findings
}

function requireScriptBefore(scriptName: string, script: string, before: string, after: string): void {
  const beforeIndex = script.indexOf(before)
  const afterIndex = script.indexOf(after)
  if (beforeIndex === -1 || afterIndex === -1)
    return
  if (beforeIndex > afterIndex)
    issues.push({ file: 'package.json', message: `${scriptName} must run ${before} before ${after}` })
}
