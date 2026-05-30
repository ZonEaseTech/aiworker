import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface PrivateImportIssue {
  file: string
  importPath: string
  message: string
}

export interface WebStorageIssue {
  file: string
  message: string
  symbol: string
}

export const HOST_PRIVATE_IMPORT_PREFIXES = [
  '@zonease/aiworker-cli',
  '@zonease/aiworker-worker-runtime',
  '@zonease/aiworker-fs-layout',
  '@zonease/aiworker-worker-daemon',
  '@zonease/aiworker-soul-protocol',
  '@zonease/aiworker-storage-sqlite',
  '@zonease/aiworker-web',
]

const FORBIDDEN_LEGACY_IMPORT_PREFIXES = [
  '@zonease/aiworker-api',
  '@zonease/aiworker-core',
  '@zonease/aiworker-shared',
  '@zonease/aiworker-soul-app-workbench',
]

const ALLOWED_SHARED_PACKAGES = new Set([
  '@zonease/aiworker-soul-app-sdk',
  '@zonease/aiworker-soul-app-runtime',
  '@zonease/aiworker-soul-workbench',
  '@zonease/aiworker-ui',
])

const CURRENT_HOST_PRIVATE_ROOTS = [
  'apps/cli',
  'apps/web',
  'packages/fs-layout',
  'packages/worker-daemon',
  'packages/worker-runtime',
  'packages/soul-protocol',
  'packages/storage-sqlite',
]

const FORBIDDEN_LEGACY_ROOTS = [
  'apps/api',
  'packages/core',
  'packages/shared',
  'packages/soul-app-workbench',
]

const RAW_WEB_STORAGE_MESSAGE = 'Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.'

export function scanPrivateImports(rootDir: string): PrivateImportIssue[] {
  const issues: PrivateImportIssue[] = []
  for (const sourceDir of appSourceScanDirs(rootDir)) {
    for (const file of listSourceFiles(sourceDir)) {
      // 跳过测试文件(与 CI gate 的 scanSoulAppImports 行为一致)
      if (isTestSourceFile(file))
        continue
      const content = readFileSync(file, 'utf8')
      for (const importPath of importSpecifiers(content)) {
        if (!isForbiddenSoulAppImport(rootDir, importPath))
          continue
        issues.push({
          file: path.relative(rootDir, file),
          importPath,
          message: 'Soul Apps must use @zonease/aiworker-soul-app-sdk instead of Host private packages or sibling Soul Apps.',
        })
      }
    }
  }
  return issues
}

export function scanRawWebStorageUsage(rootDir: string): WebStorageIssue[] {
  const issues: WebStorageIssue[] = []
  for (const sourceDir of appSourceScanDirs(rootDir)) {
    for (const file of listSourceFiles(sourceDir)) {
      if (isTestSourceFile(file))
        continue
      const content = readFileSync(file, 'utf8')
      for (const symbol of rawWebStorageSymbols(content)) {
        issues.push({
          file: path.relative(rootDir, file),
          message: RAW_WEB_STORAGE_MESSAGE,
          symbol,
        })
      }
    }
  }
  return issues
}

function appSourceScanDirs(rootDir: string): string[] {
  return [rootDir]
}

function rawWebStorageSymbols(content: string): string[] {
  const matches: Array<{ index: number, symbol: string }> = []
  const clearPattern = /\b(?:window\.)?(?:localStorage|sessionStorage)\.clear\s*\(/g
  for (const match of content.matchAll(clearPattern)) {
    if (match.index !== undefined)
      matches.push({ index: match.index, symbol: match[0].replace(/\s*\($/, '') })
  }
  const storagePattern = /\b(?:window\.)?(?:localStorage|sessionStorage)\b/g
  for (const match of content.matchAll(storagePattern)) {
    if (match.index === undefined)
      continue
    const symbol = match[0]
    const after = content.slice(match.index + symbol.length)
    if (after.match(/^\s*\.clear\s*\(/))
      continue
    matches.push({ index: match.index, symbol })
  }
  return matches
    .sort((left, right) => left.index - right.index)
    .filter((match, index, items) => items.findIndex(item => item.index === match.index && item.symbol === match.symbol) === index)
    .map(match => match.symbol)
}

function isTestSourceFile(file: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === 'dist')
      continue
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (/\.[cm]?[jt]sx?$/.test(item.name))
      files.push(fullPath)
  }
  return files
}

function importSpecifiers(content: string): string[] {
  const specs: string[] = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const spec = match[1]
      if (spec)
        specs.push(spec)
    }
  }
  return [...new Set(specs)]
}

function normalizedImport(importPath: string): string {
  return importPath.replaceAll('\\', '/')
}

function isForbiddenSoulAppImport(rootDir: string, importPath: string): boolean {
  if (HOST_PRIVATE_IMPORT_PREFIXES.some(prefix => importPath === prefix || importPath.startsWith(`${prefix}/`)))
    return true
  if (FORBIDDEN_LEGACY_IMPORT_PREFIXES.some(prefix => importPath === prefix || importPath.startsWith(`${prefix}/`)))
    return true
  if (isSiblingSoulAppImport(rootDir, importPath))
    return true
  // #4: @scope パッケージは HOST_PRIVATE_IMPORT_PREFIXES / sibling 判定で処理済み。
  // path-root 部分文字列ヒューリスティックは非 @scope import(相対パス等)にのみ適用し、
  // @acme/packages/shared/types のような第三者 scoped パッケージの誤検知を防ぐ。
  if (!importPath.startsWith('@')) {
    const normalized = normalizedImport(importPath)
    if ([...CURRENT_HOST_PRIVATE_ROOTS, ...FORBIDDEN_LEGACY_ROOTS].some(root => normalized.includes(`${root}/`))) {
      return true
    }
  }
  return false
}

// #3: package.json の name フィールドを読む(CI gate の readPackageName と同じ戦略)
// 読み取れない場合は @zonease/<dirname> にフォールバック
function readOwnPackageName(rootDir: string): string {
  const packagePath = path.join(rootDir, 'package.json')
  if (existsSync(packagePath)) {
    try {
      const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown }
      if (typeof parsed.name === 'string' && parsed.name.length > 0)
        return parsed.name
    }
    catch {
      // フォールバックへ
    }
  }
  return `@zonease/${path.basename(rootDir)}`
}

function isSiblingSoulAppImport(rootDir: string, importPath: string): boolean {
  // #3: ディレクトリ名ではなく package.json の name で自身を判定
  const ownPackageName = readOwnPackageName(rootDir)
  const normalized = normalizedImport(importPath)
  const scopeMatch = normalized.match(/^(@zonease\/aiworker-[^/]+)/)
  if (scopeMatch && scopeMatch[1] !== ownPackageName && !ALLOWED_SHARED_PACKAGES.has(scopeMatch[1]!))
    return true
  if (normalized.includes('souls/aiworker-'))
    return !normalized.includes(`souls/${path.basename(rootDir)}/`)
  if (normalized.includes('apps/aiworker-'))
    return true
  return false
}
