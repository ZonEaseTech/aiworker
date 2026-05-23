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
  '@zonease/aiworker-api',
  '@zonease/aiworker-cli',
  '@zonease/aiworker-core',
  '@zonease/aiworker-fs-layout',
  '@zonease/aiworker-shared',
  '@zonease/aiworker-storage-sqlite',
  '@zonease/aiworker-web',
]

const SOUL_APP_PACKAGE_IMPORT_PREFIXES = [
  '@zonease/aiworker-hr',
  '@zonease/aiworker-qa',
]
const RAW_WEB_STORAGE_MESSAGE = 'Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.'

export function scanPrivateImports(rootDir: string): PrivateImportIssue[] {
  const issues: PrivateImportIssue[] = []
  for (const sourceDir of appSourceScanDirs(rootDir)) {
    for (const file of listSourceFiles(sourceDir)) {
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
  return ['host-adapter', 'product', 'runtime', 'src']
    .map(dir => path.join(rootDir, dir))
    .filter(dir => existsSync(dir))
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

function isForbiddenSoulAppImport(rootDir: string, importPath: string): boolean {
  if (HOST_PRIVATE_IMPORT_PREFIXES.some(prefix => importPath === prefix || importPath.startsWith(`${prefix}/`)))
    return true
  if (isSiblingSoulAppImport(rootDir, importPath))
    return true
  return [
    'apps/api',
    'apps/cli',
    'apps/web',
    'packages/core',
    'packages/fs-layout',
    'packages/shared',
    'packages/storage-sqlite',
  ].some(part => importPath.includes(part))
}

function isSiblingSoulAppImport(rootDir: string, importPath: string): boolean {
  const appDirName = path.basename(rootDir)
  const ownPackageName = `@zonease/${appDirName}`
  if (SOUL_APP_PACKAGE_IMPORT_PREFIXES.some(prefix =>
    prefix !== ownPackageName && (importPath === prefix || importPath.startsWith(`${prefix}/`)),
  )) {
    return true
  }
  if (!importPath.includes('apps/aiworker-'))
    return false
  const normalized = importPath.replaceAll('\\\\', '/')
  return !normalized.includes(`apps/${appDirName}/`)
}
