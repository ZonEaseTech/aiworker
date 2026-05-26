import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface Issue {
  file: string
  message: string
}

const repoRoot = process.cwd()
const issues: Issue[] = []

const activeDocs = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'README.zh-CN.md',
  'docs/architecture.md',
  'docs/cli.md',
  'docs/deployment.md',
  'docs/executor-engines.md',
  'docs/soul-app-developer.md',
  '.agents/skills/aiworker-host-dev/SKILL.md',
  '.agents/skills/aiworker-soul-app-dev/SKILL.md',
]

const registryIds = [
  'ARCH-001',
  'HOST-001',
  'SOUL-001',
  'CONFIG-001',
  'PROTO-001',
  'IMPORT-001',
  'MOUNT-001',
  'DATA-001',
  'ENGINE-001',
  'UI-001',
  'DOC-001',
]

const forbiddenActiveDocPhrases = [
  'Host auth is provider-backed',
  'broker',
  'admission',
  'governance',
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

const architecture = read('docs/architecture.md')
requireIncludes('docs/architecture.md', [
  'AIWorker = Local Shell + Engine Bridge for Soul Apps',
  '## Constraint Registry',
  'start, shell, locate, mount and bridge',
  'Host 不拥有领域工作流',
  'scripts/check-doc-contract.ts',
  '`docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are audit trail',
])

for (const id of registryIds) {
  if (!architecture.includes(`\`${id}\``))
    issues.push({ file: 'docs/architecture.md', message: `missing registry id ${id}` })
}

requireExact('CLAUDE.md', '@AGENTS.md')

requireIncludes('AGENTS.md', [
  'Local Shell + Engine Bridge',
  'start / shell / locate / mount / bridge',
  'Constraint Registry',
  'Worker Configuration',
  'aiworker-host-dev',
  'aiworker-soul-app-dev',
  'shadcn',
  'Component Library Preflight',
  'bun run ui:check',
  '可复用 UI 归入 `packages/ui`',
  '审计轨迹',
])

requireIncludes('README.md', [
  'Local Shell + Engine Bridge',
  'AIWorker -> Soul App -> workspace -> session -> app-owned work',
  'Constraint Registry',
  'Worker Configuration',
  '.agents/skills/aiworker-host-dev/SKILL.md',
  '.agents/skills/aiworker-soul-app-dev/SKILL.md',
])

requireIncludes('README.zh-CN.md', [
  '当前中文入口只保留指针',
  'docs/architecture.md#constraint-registry',
])

forbidIncludes('README.zh-CN.md', [
  'turn',
  'durable org memory',
  'embedded AIWorker core runtime',
  'host -> local daemon',
])

forbidIncludes('docs/architecture.md', [
  '`BROKER-001`',
  '`OPERATOR-001`',
])

requireIncludes('docs/soul-app-developer.md', [
  '# Soul App Developer Quickstart (Frozen)',
  'This file is a frozen quickstart during product shaping.',
  'It is not an architecture contract.',
  'The only active Host/Soul App contract is `docs/architecture.md#constraint-registry`.',
  'Do not expand Host/Soul boundary, descriptor, MCP, provider, permission, review, memory, Worker Configuration or configuration semantics here.',
  'aiworker app create <app-id> --dir <target-dir>',
  'aiworker app validate <target-dir>',
  'aiworker app smoke <target-dir>',
  'soul-app.manifest.json',
  'engine-assets/',
  'product/',
  'host-adapter/',
])
requireMaxLines('docs/soul-app-developer.md', 80)
forbidIncludes('docs/soul-app-developer.md', [
  '## Agent Workflow',
  '## Engine Assets Projection',
  '## MCP Client',
  '## MCP Client And Server Declarations',
  '## Smoke',
  '## Design Boundary',
  '## Contribution Checklist',
  'generic worker-scoped options',
  'Host can display',
  'MCP plumbing',
  'permission hints',
  'review verdict',
  'memory promotion',
])

requireIncludes('.agents/skills/aiworker-host-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  'This skill is a route helper, not a parallel architecture contract.',
  'Read these registry IDs in `docs/architecture.md` before Host changes:',
  '`ARCH-001`',
  '`HOST-001`',
  '`CONFIG-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`MOUNT-001`',
  '`DATA-001`',
  '`ENGINE-001`',
  '`UI-001`',
  '`DOC-001`',
  'Use `aiworker-soul-app-dev` when the change belongs to app-owned domain work.',
  'bun run docs:check',
  'bun run crg:update',
])

requireIncludes('.agents/skills/aiworker-soul-app-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  'This skill is a route helper, not a parallel architecture contract.',
  'Read `docs/soul-app-developer.md` only as a frozen quickstart for commands and package shape.',
  '`ARCH-001`',
  '`SOUL-001`',
  '`CONFIG-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`MOUNT-001`',
  '`DATA-001`',
  '`ENGINE-001`',
  '`DOC-001`',
  'Use `aiworker-host-dev` when the change belongs to Host platform behavior.',
  'aiworker app validate <app-path>',
  'aiworker app smoke <app-path>',
])

for (const file of activeDocs) {
  forbidIncludes(file, [
    'GOALS.md',
    'aiworker-validate',
  ])
  forbidIncludes(file, forbiddenActiveDocPhrases)
}

const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
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

console.log(`docs contract ok (${activeDocs.length} active files, ${registryIds.length} registry ids)`)

function abs(file: string): string {
  return path.join(repoRoot, file)
}

function read(file: string): string {
  const filePath = abs(file)
  if (!existsSync(filePath))
    return ''
  return readFileSync(filePath, 'utf8')
}

function requireExact(file: string, expected: string): void {
  const actual = read(file).trim()
  if (actual !== expected)
    issues.push({ file, message: `expected exact content ${JSON.stringify(expected)}` })
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
