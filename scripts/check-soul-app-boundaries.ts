import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface SoulAppWorkspace {
  dir: string
  name: string
  packageName: string | null
  codeRoot: string
}

interface BoundaryIssue {
  file: string
  importPath: string
  message: string
}

const repoRoot = process.cwd()
const soulRoot = path.join(repoRoot, 'souls')
const completionAudit = process.argv.includes('--completion-audit')
const hostPrivatePackages = [
  '@zonease/aiworker-cli',
  '@zonease/aiworker-worker-runtime',
  '@zonease/aiworker-fs-layout',
  '@zonease/aiworker-worker-daemon',
  '@zonease/aiworker-soul-protocol',
  '@zonease/aiworker-storage-sqlite',
  '@zonease/aiworker-worker-web',
]
const forbiddenLegacyPackages = [
  '@zonease/aiworker-api',
  '@zonease/aiworker-core',
  '@zonease/aiworker-shared',
  '@zonease/aiworker-soul-app-workbench',
]
const hostPrivateRoots = [
  'apps/worker-cli',
  'apps/worker-web',
  'packages/fs-layout',
  'packages/worker-daemon',
  'packages/worker-runtime',
  'packages/soul-protocol',
  'packages/storage-sqlite',
]
const forbiddenLegacyRoots = [
  'apps/api',
  'packages/core',
  'packages/shared',
  'packages/soul-app-workbench',
]
const rawWebStorageMessage = 'Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.'
const forbiddenLegacyHostWebImports = ['@zonease/aiworker-soul-app-workbench']
const retiredHostWebSurfacePatterns: Array<{ message: string, pattern: RegExp }> = [
  {
    message: 'Host Web must not keep WorkspaceSessionComposer; session product UI belongs in Soul-owned mounted surfaces.',
    pattern: /\bWorkspaceSessionComposer\b/,
  },
  {
    message: 'Host Web must not keep Host-owned session turn clients; turns are started by the engine bridge or Soul-owned mounted UI.',
    pattern: /\b(?:createSessionTurn|continueSessionTurn)(?:Stream)?\b/,
  },
  {
    message: 'Host Web must not keep Host-owned MarkdownPreview session surfaces.',
    pattern: /\bMarkdownPreview\b/,
  },
  {
    message: 'Host Web must not keep Host-owned session progress surfaces.',
    pattern: /\bbuildSessionProgress\b/,
  },
]
export function discoverSoulApps(): SoulAppWorkspace[] {
  if (!existsSync(soulRoot))
    return []
  return readdirSync(soulRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(soulRoot, entry.name)
      return {
        dir,
        name: entry.name,
        packageName: readPackageName(dir),
        codeRoot: dir,
      }
    })
    .filter(app => hasSoulDeclaration(app.dir))
}

function countSoulDeclarations(): number {
  if (!existsSync(soulRoot))
    return 0
  return readdirSync(soulRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => hasSoulDeclaration(path.join(soulRoot, entry.name)))
    .length
}

export function discoveryTripwireError(manifestCount: number, discoveredCount: number): string | null {
  if (manifestCount > 0 && discoveredCount === 0)
    return `Boundary guard found ${manifestCount} Soul declaration(s) but discovered 0 scannable apps; the guard would scan nothing.`
  return null
}

function hasSoulDeclaration(dir: string): boolean {
  return existsSync(path.join(dir, 'soul.config.ts'))
    || existsSync(path.join(dir, 'dist/soul.descriptor.json'))
}

function readPackageName(dir: string): string | null {
  const packagePath = path.join(dir, 'package.json')
  if (!existsSync(packagePath))
    return null
  try {
    const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  }
  catch {
    return null
  }
}

function scanSoulAppImports(apps: SoulAppWorkspace[]): BoundaryIssue[] {
  const packageNames = new Map(apps.map(app => [app.packageName, app]).filter((entry): entry is [string, SoulAppWorkspace] => Boolean(entry[0])))
  const issues: BoundaryIssue[] = []
  for (const app of apps) {
    for (const file of listSourceFiles(app.codeRoot)) {
      if (isTestSourceFile(file))
        continue
      for (const importPath of importSpecifiers(readFileSync(file, 'utf8'))) {
        const siblingPackage = packageNames.get(packageRoot(importPath))
        if (siblingPackage && siblingPackage.name !== app.name) {
          issues.push(issue(file, importPath, 'Soul Apps must not import sibling app packages.'))
          continue
        }
        if (hostPrivatePackages.some(prefix => importPath === prefix || importPath.startsWith(`${prefix}/`))) {
          issues.push(issue(file, importPath, 'Soul App code must use the Soul App SDK instead of Host private packages.'))
          continue
        }
        if (forbiddenLegacyPackages.some(prefix => importPath === prefix || importPath.startsWith(`${prefix}/`))) {
          issues.push(issue(file, importPath, 'Soul App code must not import retired legacy Host packages or the retired Soul App workbench.'))
          continue
        }
        if (hostPrivateRoots.some(root => normalizedImport(importPath).includes(`${root}/`))) {
          issues.push(issue(file, importPath, 'Soul App code must not import Host app or package internals.'))
          continue
        }
        if (forbiddenLegacyRoots.some(root => normalizedImport(importPath).includes(`${root}/`))) {
          issues.push(issue(file, importPath, 'Soul App code must not import retired legacy Host app or package paths.'))
          continue
        }
        const resolved = resolveRelativeImport(file, importPath)
        if (!resolved)
          continue
        const siblingApp = apps.find(candidate => candidate.name !== app.name && isInside(resolved, candidate.codeRoot))
        if (siblingApp) {
          issues.push(issue(file, importPath, `Soul App ${app.name} must not import sibling app ${siblingApp.name}.`))
          continue
        }
        const hostRoot = hostPrivateRoots.find(root => isInside(resolved, path.join(repoRoot, root)))
        if (hostRoot)
          issues.push(issue(file, importPath, `Soul App ${app.name} must not import Host internals under ${hostRoot}.`))
        const legacyRoot = forbiddenLegacyRoots.find(root => isInside(resolved, path.join(repoRoot, root)))
        if (legacyRoot)
          issues.push(issue(file, importPath, `Soul App ${app.name} must not import retired legacy path ${legacyRoot}.`))
      }
    }
  }
  return issues
}

function scanHostImports(apps: SoulAppWorkspace[]): BoundaryIssue[] {
  const hostRoots = [
    path.join(repoRoot, 'apps/worker-cli'),
    path.join(repoRoot, 'apps/worker-web'),
    path.join(repoRoot, 'apps/host-cli'),
    path.join(repoRoot, 'apps/host-web'),
    path.join(repoRoot, 'packages'),
    path.join(repoRoot, 'scripts'),
  ].filter(existsSync)
  const issues: BoundaryIssue[] = []
  for (const root of hostRoots) {
    for (const file of listSourceFiles(root)) {
      if (apps.some(app => isInside(file, app.dir)))
        continue
      for (const importPath of importSpecifiers(readFileSync(file, 'utf8'))) {
        const normalized = normalizedImport(importPath)
        if (apps.some(app => normalized.includes(`souls/${app.name}/`))) {
          issues.push(issue(file, importPath, 'Host code must not import Soul App internals.'))
          continue
        }
        const resolved = resolveRelativeImport(file, importPath)
        if (resolved && apps.some(app => isInside(resolved, app.codeRoot)))
          issues.push(issue(file, importPath, 'Host code must not import Soul App internals.'))
      }
    }
  }
  return issues
}

function scanSoulAppWebStorageUsage(apps: SoulAppWorkspace[]): BoundaryIssue[] {
  const issues: BoundaryIssue[] = []
  for (const app of apps) {
    for (const file of listSourceFiles(app.codeRoot)) {
      if (isTestSourceFile(file))
        continue
      for (const symbol of rawWebStorageSymbols(readFileSync(file, 'utf8')))
        issues.push(issue(file, symbol, rawWebStorageMessage))
    }
  }
  return issues
}

function scanHostEmbeddedSoulRenderers(): BoundaryIssue[] {
  return listHostEmbeddedSoulRendererPaths()
    .map(rendererPath => ({
      file: rendererPath,
      importPath: 'host-renderer',
      message: 'Host Web must not add Soul-specific renderer directories; move domain UI into the owning Soul App product web or mounted surface boundary.',
    }))
}

function scanHostWebPackageImports(): BoundaryIssue[] {
  const webRoot = path.join(repoRoot, 'apps/worker-web')
  if (!existsSync(webRoot))
    return []
  const issues: BoundaryIssue[] = []
  for (const file of listSourceFiles(webRoot)) {
    for (const importPath of importSpecifiers(readFileSync(file, 'utf8'))) {
      if (forbiddenLegacyHostWebImports.includes(packageRoot(importPath))) {
        issues.push(issue(
          file,
          importPath,
          'Host Web must mount Soul workbench routes through descriptor-declared micro-app surfaces instead of importing the retired Soul App workbench package.',
        ))
      }
    }
  }
  return issues
}

function scanHostWebRetiredProductSurfaces(): BoundaryIssue[] {
  if (!completionAudit)
    return []
  const webRoot = path.join(repoRoot, 'apps/worker-web')
  if (!existsSync(webRoot))
    return []
  const issues: BoundaryIssue[] = []
  for (const file of listSourceFiles(webRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    if (isTestSourceFile(file))
      continue
    if (relative.includes('/features/session/')) {
      issues.push(issue(file, 'features/session', 'Host Web must not keep retired Host-owned session product feature files.'))
      continue
    }
    if (relative.endsWith('/worker/session-progress.ts')) {
      issues.push(issue(file, 'session-progress', 'Host Web must not keep retired Host-owned session progress files.'))
      continue
    }
    const content = readFileSync(file, 'utf8')
    for (const retired of retiredHostWebSurfacePatterns) {
      if (retired.pattern.test(content))
        issues.push(issue(file, retired.pattern.source, retired.message))
    }
  }
  return issues
}

function reportHostEmbeddedSoulRendererDebt(): void {
  const rendererPaths = listHostEmbeddedSoulRendererPaths()
  if (rendererPaths.length === 0)
    return

  if (completionAudit) {
    console.error('Soul App boundary completion audit blocked by Host-embedded Soul renderer paths:')
    for (const rendererPath of rendererPaths)
      console.error(`- ${rendererPath}: move domain UI into the owning Soul App product web or mounted surface boundary.`)
    process.exit(1)
  }
}

function listHostEmbeddedSoulRendererPaths(): string[] {
  const root = 'apps/worker-web/src/worker/souls'
  const rootAbs = path.join(repoRoot, root)
  if (!existsSync(rootAbs))
    return []

  const results: string[] = []
  const walk = (relativeDir: string) => {
    for (const entry of readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue
      const child = path.join(relativeDir, entry.name).replaceAll('\\', '/')
      if (child === `${root}/common`)
        continue
      if (existsSync(path.join(repoRoot, child, 'index.tsx')))
        results.push(child)
      walk(child)
    }
  }
  walk(root)
  return results.sort()
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'routeTree.gen.ts')
      continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (/\.[cm]?[jt]sx?$/.test(entry.name))
      files.push(fullPath)
  }
  return files
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

function resolveRelativeImport(file: string, importPath: string): string | null {
  if (!importPath.startsWith('.'))
    return null
  const base = path.resolve(path.dirname(file), importPath)
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile())
      return candidate
  }
  return base
}

function packageRoot(importPath: string): string {
  if (!importPath.startsWith('@')) {
    const [name] = importPath.split('/')
    return name ?? importPath
  }
  const [scope, name] = importPath.split('/')
  return scope && name ? `${scope}/${name}` : importPath
}

function issue(file: string, importPath: string, message: string): BoundaryIssue {
  return {
    file: path.relative(repoRoot, file),
    importPath,
    message,
  }
}

function normalizedImport(importPath: string): string {
  return importPath.replaceAll('\\', '/')
}

function isInside(filePath: string, dir: string): boolean {
  const relative = path.relative(dir, filePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function runChecks(): void {
  const soulApps = discoverSoulApps()
  const tripwire = discoveryTripwireError(countSoulDeclarations(), soulApps.length)
  if (tripwire) {
    console.error(tripwire)
    process.exit(1)
  }
  const issues: BoundaryIssue[] = [
    ...scanSoulAppImports(soulApps),
    ...scanHostImports(soulApps),
    ...scanSoulAppWebStorageUsage(soulApps),
    ...scanHostEmbeddedSoulRenderers(),
    ...scanHostWebPackageImports(),
    ...scanHostWebRetiredProductSurfaces(),
  ]

  if (issues.length > 0) {
    for (const issue of issues)
      console.error(`${issue.file}: ${issue.message} (${issue.importPath})`)
    process.exitCode = 1
  }

  reportHostEmbeddedSoulRendererDebt()
}

if (import.meta.main)
  runChecks()
