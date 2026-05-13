import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface SoulAppWorkspace {
  dir: string
  name: string
  packageName: string | null
  srcDir: string
}

interface BoundaryIssue {
  file: string
  importPath: string
  message: string
}

const repoRoot = process.cwd()
const appRoot = path.join(repoRoot, 'apps')
const hostPrivatePackages = [
  '@zonease/aiworker-api',
  '@zonease/aiworker-cli',
  '@zonease/aiworker-core',
  '@zonease/aiworker-shared',
  '@zonease/aiworker-storage-sqlite',
  '@zonease/aiworker-web',
]
const hostPrivateRoots = [
  'apps/api',
  'apps/cli',
  'apps/web',
  'packages/core',
  'packages/shared',
  'packages/storage-sqlite',
]

const soulApps = discoverSoulApps()
const issues: BoundaryIssue[] = [
  ...scanSoulAppImports(soulApps),
  ...scanHostImports(soulApps),
]

if (issues.length > 0) {
  for (const issue of issues)
    console.error(`${issue.file}: ${issue.message} (${issue.importPath})`)
  process.exitCode = 1
}

function discoverSoulApps(): SoulAppWorkspace[] {
  if (!existsSync(appRoot))
    return []
  return readdirSync(appRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(appRoot, entry.name)
      return {
        dir,
        name: entry.name,
        packageName: readPackageName(dir),
        srcDir: path.join(dir, 'src'),
      }
    })
    .filter(app => existsSync(path.join(app.dir, 'soul-app.manifest.json')) && existsSync(app.srcDir))
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
    for (const file of listSourceFiles(app.srcDir)) {
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
        if (hostPrivateRoots.some(root => normalizedImport(importPath).includes(`${root}/`))) {
          issues.push(issue(file, importPath, 'Soul App code must not import Host app or package internals.'))
          continue
        }
        const resolved = resolveRelativeImport(file, importPath)
        if (!resolved)
          continue
        const siblingApp = apps.find(candidate => candidate.name !== app.name && isInside(resolved, candidate.srcDir))
        if (siblingApp) {
          issues.push(issue(file, importPath, `Soul App ${app.name} must not import sibling app ${siblingApp.name}.`))
          continue
        }
        const hostRoot = hostPrivateRoots.find(root => isInside(resolved, path.join(repoRoot, root)))
        if (hostRoot)
          issues.push(issue(file, importPath, `Soul App ${app.name} must not import Host internals under ${hostRoot}.`))
      }
    }
  }
  return issues
}

function scanHostImports(apps: SoulAppWorkspace[]): BoundaryIssue[] {
  const hostRoots = [
    path.join(repoRoot, 'apps/api'),
    path.join(repoRoot, 'apps/cli'),
    path.join(repoRoot, 'apps/web'),
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
        if (apps.some(app => normalized.includes(`apps/${app.name}/src/`))) {
          issues.push(issue(file, importPath, 'Host code must not import Soul App src internals.'))
          continue
        }
        const resolved = resolveRelativeImport(file, importPath)
        if (resolved && apps.some(app => isInside(resolved, app.srcDir)))
          issues.push(issue(file, importPath, 'Host code must not import Soul App src internals.'))
      }
    }
  }
  return issues
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
