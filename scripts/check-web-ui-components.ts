#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {
  componentCatalog,
  componentGovernanceRules,
  componentMigrationQueue,
} from '../packages/component/src/catalog'

interface Issue {
  file: string
  message: string
}

const repoRoot = process.cwd()
const checkAll = process.argv.includes('--all')
const issues: Issue[] = []
const sharedPackageName = '@zonease/aiworker-component'
const localOkPattern = /@aiworker-component-local-ok:\s*\S.{10,}/
const appLocalUiClassPattern = /\b(?:button|btn|card|chip|pill|badge)\b/i
const rawNativePrimitivePattern = /<\s*(?:dialog|select)\b/i
const unscopedSharedSelectorPattern = /^(?:button\.(?:primary|secondary|ghost)|\.(?:icon-btn|modal|seg-control|studio-select|count-pill|status-event-pill|studio-pill|session-progress-card))\b/

main()

function main(): void {
  validateCatalog()

  const changedFiles = checkAll ? listAllUiFiles() : listChangedFiles()
  for (const file of changedFiles) {
    if (!existsSync(abs(file)))
      continue
    if (isWebTsxFile(file))
      checkWebTsxFile(file)
    if (isWebCssFile(file))
      checkWebCssFile(file)
  }

  if (issues.length > 0) {
    console.error('web UI component governance check failed:')
    for (const issue of issues)
      console.error(`- ${issue.file}: ${issue.message}`)
    console.error(`\nShared catalog currently has ${componentCatalog.length} entries. Start from packages/component before adding app-local UI.`)
    process.exit(1)
  }

  const scope = checkAll ? 'full tree' : `${changedFiles.length} changed files`
  console.log(`web UI component governance ok (${scope}, ${componentCatalog.length} catalog entries)`)
}

function validateCatalog(): void {
  const preflight = componentGovernanceRules.find(rule => rule.id === 'component-library-preflight')
  if (!preflight) {
    issues.push({
      file: 'packages/component/src/catalog.ts',
      message: 'missing component-library-preflight governance rule',
    })
  }

  for (const item of componentMigrationQueue) {
    if (!item.target.startsWith('packages/component/')) {
      issues.push({
        file: 'packages/component/src/catalog.ts',
        message: `migration candidate "${item.candidate}" must target packages/component`,
      })
    }
    if (!existsSync(abs(item.source))) {
      issues.push({
        file: 'packages/component/src/catalog.ts',
        message: `migration source does not exist: ${item.source}`,
      })
    }
  }
}

function checkWebTsxFile(file: string): void {
  if (isTestFile(file))
    return

  const content = read(file)
  if (localOkPattern.test(content))
    return

  const importsSharedPackage = content.includes(sharedPackageName)
  const hasMigrationEntry = componentMigrationQueue.some(item => item.source === file)
  const localClassNames = classNameValues(content).filter(value => appLocalUiClassPattern.test(value))
  const usesRawNativePrimitive = rawNativePrimitivePattern.test(content)

  if (usesRawNativePrimitive && !importsSharedPackage) {
    issues.push({
      file,
      message: `raw select/dialog UI changed without importing ${sharedPackageName}; use a shared primitive or add @aiworker-component-local-ok with a reason`,
    })
  }

  if (localClassNames.length > 0 && !importsSharedPackage && !hasMigrationEntry) {
    issues.push({
      file,
      message: `changed local button/card/chip-style classes (${sample(localClassNames)}) without shared component import or migration queue entry`,
    })
  }
}

function checkWebCssFile(file: string): void {
  const content = read(file)
  if (localOkPattern.test(content))
    return

  const unscopedOverrides = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => unscopedSharedSelectorPattern.test(line))

  if (unscopedOverrides.length > 0) {
    issues.push({
      file,
      message: `changed CSS overrides shared component selectors (${sample(unscopedOverrides)}); move the style to packages/component or add @aiworker-component-local-ok with a reason`,
    })
  }
}

function classNameValues(content: string): string[] {
  const values: string[] = []
  const patterns = [
    /className\s*=\s*["']([^"']+)["']/g,
    /className\s*=\s*\{\s*["']([^"']+)["']\s*\}/g,
    /className\s*=\s*\{\s*`([^`]+)`\s*\}/g,
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[1]
      if (value)
        values.push(value)
    }
  }
  return [...new Set(values)]
}

function listChangedFiles(): string[] {
  return unique([
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--', 'apps/web/src', 'packages/component/src']),
    ...gitLines(['ls-files', '--others', '--exclude-standard', '--', 'apps/web/src', 'packages/component/src']),
  ]).filter(file => isRelevantFile(file))
}

function listAllUiFiles(): string[] {
  return [
    ...listFiles('apps/web/src'),
    ...listFiles('packages/component/src'),
  ].filter(file => isRelevantFile(file))
}

function listFiles(root: string): string[] {
  if (!existsSync(abs(root)))
    return []

  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(abs(dir), { withFileTypes: true })) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'routeTree.gen.ts')
        continue
      const child = path.posix.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(child)
        continue
      }
      if (entry.isFile())
        files.push(child)
    }
  }
  walk(root)
  return files
}

function gitLines(args: string[]): string[] {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  }
  catch {
    return []
  }
}

function read(file: string): string {
  return readFileSync(abs(file), 'utf8')
}

function abs(file: string): string {
  return path.join(repoRoot, file)
}

function isRelevantFile(file: string): boolean {
  return isWebTsxFile(file) || isWebCssFile(file) || file === 'packages/component/src/catalog.ts'
}

function isWebTsxFile(file: string): boolean {
  return file.startsWith('apps/web/src/') && file.endsWith('.tsx') && isFile(file)
}

function isWebCssFile(file: string): boolean {
  return file.startsWith('apps/web/src/') && file.endsWith('.css') && isFile(file)
}

function isTestFile(file: string): boolean {
  return /(?:^|\/)__tests__\//.test(file) || /\.(?:test|spec)\.tsx?$/.test(file)
}

function isFile(file: string): boolean {
  try {
    return statSync(abs(file)).isFile()
  }
  catch {
    return false
  }
}

function sample(values: string[]): string {
  return values.slice(0, 3).map(value => JSON.stringify(value)).join(', ')
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.replaceAll('\\', '/')))].sort()
}
