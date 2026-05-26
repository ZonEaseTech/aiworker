import { existsSync, readFileSync } from 'node:fs'
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

requireIncludes('docs/architecture.md', [
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
  'shadcn',
])
requireMaxLines('AGENTS.md', 90)

forbidIncludes('AGENTS.md', [
  'docs/plan',
  'docs/task',
  'aiworker-host-dev',
  'aiworker-soul-app-dev',
  'PMA requirement',
])

requireIncludes('docs/protocol.md', [
  'dist/soul.descriptor.json',
  'router-mode="search"',
  'POST   /api/sessions/:sessionId/invocations',
  'These are broker routes, not business product APIs.',
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
  'Author-owned native MCP files may contain literal secrets',
])

requireIncludes('docs/soul-authoring.md', [
  'souls/*',
  'soul.config.ts',
  'packages/soul-workbench',
  'author-owned native MCP files may contain literal secrets',
  '`souls/aiworker-freeform` is the v1 acceptance Soul',
])

requireIncludes('docs/testing.md', [
  'bun run test:contracts',
  'Contract tests are the primary guardrail',
  'The v1 browser proof is Freeform-only',
])

for (const file of canonicalDocs) {
  forbidIncludes(file, [
    'GOALS.md',
    'aiworker-validate',
  ])
  forbidIncludes(file, forbiddenActiveDocPhrases)
}

const packageJson = JSON.parse(read('package.json')) as {
  scripts?: Record<string, string>
  workspaces?: string[]
}
if (!packageJson.workspaces?.includes('souls/*'))
  issues.push({ file: 'package.json', message: 'workspaces must include souls/*' })
if (packageJson.scripts?.['test:contracts'] !== 'bun test tests/architecture/refactor-contract.test.ts')
  issues.push({ file: 'package.json', message: 'test:contracts must run the refactor contract test' })
if (packageJson.scripts?.['docs:check'] !== 'bun scripts/check-doc-contract.ts')
  issues.push({ file: 'package.json', message: 'docs:check must run scripts/check-doc-contract.ts' })
if (packageJson.scripts?.['ui:check'] !== 'bun scripts/check-web-ui-components.ts')
  issues.push({ file: 'package.json', message: 'ui:check must run scripts/check-web-ui-components.ts' })
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
