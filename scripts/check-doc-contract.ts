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
  'PROTO-001',
  'IMPORT-001',
  'DATA-001',
  'BROKER-001',
  'DOC-001',
]

for (const file of activeDocs) {
  if (!existsSync(abs(file)))
    issues.push({ file, message: 'active documentation file is missing' })
}

const architecture = read('docs/architecture.md')
requireIncludes('docs/architecture.md', [
  '## Constraint Registry',
  'scripts/check-doc-contract.ts',
  '`docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are audit trail',
])

for (const id of registryIds) {
  if (!architecture.includes(`\`${id}\``))
    issues.push({ file: 'docs/architecture.md', message: `missing registry id ${id}` })
}

requireExact('CLAUDE.md', '@AGENTS.md')

requireIncludes('AGENTS.md', [
  'Constraint Registry',
  'aiworker-host-dev',
  'aiworker-soul-app-dev',
  '审计轨迹',
])

requireIncludes('README.md', [
  'Constraint Registry',
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

requireIncludes('docs/soul-app-developer.md', [
  'docs/architecture.md#constraint-registry',
  '`SOUL-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`DATA-001`',
  '`BROKER-001`',
])

requireIncludes('.agents/skills/aiworker-host-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  '`ARCH-001`',
  '`HOST-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`DATA-001`',
  '`BROKER-001`',
  '`DOC-001`',
])

requireIncludes('.agents/skills/aiworker-soul-app-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  '`ARCH-001`',
  '`SOUL-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`DATA-001`',
  '`BROKER-001`',
  '`DOC-001`',
])

for (const file of activeDocs) {
  forbidIncludes(file, [
    'GOALS.md',
    'aiworker-validate',
  ])
}

const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
if (packageJson.scripts?.['docs:check'] !== 'bun scripts/check-doc-contract.ts')
  issues.push({ file: 'package.json', message: 'docs:check must run scripts/check-doc-contract.ts' })
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

function forbidIncludes(file: string, needles: string[]): void {
  const content = read(file)
  for (const needle of needles) {
    if (content.includes(needle))
      issues.push({ file, message: `contains forbidden active-route text ${JSON.stringify(needle)}` })
  }
}
