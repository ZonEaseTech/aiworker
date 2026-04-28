#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'

interface BundleSize {
  bytes: number
  gzipBytes: number
}

interface SizeBaseline {
  bundles: Record<'fleet' | 'worker', BundleSize>
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const webRoot = path.join(repoRoot, 'apps/web')
const webSrc = path.join(webRoot, 'src')
const sharedRoot = path.join(webSrc, 'shared')
const baselinePath = path.join(webRoot, 'bundle-size-baseline.json')

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'shared-cycles') {
    await checkSharedCycles()
    return
  }
  if (command === 'size-report') {
    await reportBundleSizes(args.includes('--write-baseline'))
    return
  }
  throw new Error(`unknown command: ${command ?? '(missing)'}`)
}

async function checkSharedCycles(): Promise<void> {
  const files = (await collectFiles(sharedRoot))
    .filter(file => /\.(?:ts|tsx)$/.test(file))
    .sort()
  const fileSet = new Set(files)
  const graph = new Map<string, string[]>()

  for (const file of files) {
    const deps = await readLocalSharedImports(file)
    graph.set(file, deps.filter(dep => fileSet.has(dep)).sort())
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const cycles: string[][] = []

  function visit(file: string) {
    if (visited.has(file))
      return
    if (visiting.has(file)) {
      const start = stack.indexOf(file)
      if (start !== -1)
        cycles.push([...stack.slice(start), file])
      return
    }
    visiting.add(file)
    stack.push(file)
    for (const dep of graph.get(file) ?? [])
      visit(dep)
    stack.pop()
    visiting.delete(file)
    visited.add(file)
  }

  for (const file of files)
    visit(file)

  if (cycles.length > 0) {
    console.error('shared import cycles detected:')
    for (const cycle of cycles) {
      console.error(`- ${cycle.map(rel).join(' -> ')}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`shared import cycle check passed (${files.length} files)`)
}

async function readLocalSharedImports(file: string): Promise<string[]> {
  const text = await readFile(file, 'utf8')
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const deps: string[] = []

  source.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const resolved = resolveSharedImport(file, node.moduleSpecifier.text)
      if (resolved)
        deps.push(resolved)
    }
  })

  return deps
}

function resolveSharedImport(fromFile: string, specifier: string): string | null {
  let base: string | null = null
  if (specifier.startsWith('@/shared/'))
    base = path.join(sharedRoot, specifier.slice('@/shared/'.length))
  else if (specifier === '@/shared')
    base = sharedRoot
  else if (specifier.startsWith('.'))
    base = path.resolve(path.dirname(fromFile), specifier)
  if (!base)
    return null

  const resolved = resolveSourceFile(base)
  if (!resolved)
    return null
  const relative = path.relative(sharedRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    return null
  return resolved
}

function resolveSourceFile(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]
  return candidates.find(candidate => existsSync(candidate)) ?? null
}

async function reportBundleSizes(writeBaseline: boolean): Promise<void> {
  const bundles: SizeBaseline['bundles'] = {
    fleet: await measureDir(path.join(webRoot, 'dist/fleet')),
    worker: await measureDir(path.join(webRoot, 'dist/worker')),
  }

  if (writeBaseline) {
    const body = `${JSON.stringify({ bundles }, null, 2)}\n`
    await writeFile(baselinePath, body, 'utf8')
    console.log(`wrote ${rel(baselinePath)}`)
  }

  const baseline = existsSync(baselinePath)
    ? JSON.parse(await readFile(baselinePath, 'utf8')) as SizeBaseline
    : null

  console.log('| bundle | bytes | gzip bytes | baseline bytes | baseline gzip | delta bytes | delta gzip |')
  console.log('|---|---:|---:|---:|---:|---:|---:|')
  for (const name of ['fleet', 'worker'] as const) {
    const current = bundles[name]
    const base = baseline?.bundles[name]
    console.log([
      `| ${name}`,
      current.bytes,
      current.gzipBytes,
      base?.bytes ?? 'n/a',
      base?.gzipBytes ?? 'n/a',
      base ? formatDelta(current.bytes, base.bytes) : 'n/a',
      base ? formatDelta(current.gzipBytes, base.gzipBytes) : 'n/a',
      '|',
    ].join(' | '))
  }

  if (!baseline) {
    throw new Error(`missing bundle size baseline: ${rel(baselinePath)}`)
  }

  const overLimit = (['fleet', 'worker'] as const).flatMap((name) => {
    const current = bundles[name]
    const base = baseline.bundles[name]
    return [
      { name, metric: 'bytes', pct: pctDelta(current.bytes, base.bytes) },
      { name, metric: 'gzipBytes', pct: pctDelta(current.gzipBytes, base.gzipBytes) },
    ].filter(item => item.pct > 20)
  })

  if (overLimit.length > 0) {
    for (const item of overLimit)
      console.error(`${item.name} ${item.metric} grew by ${item.pct.toFixed(1)}% (>20%)`)
    throw new Error('web bundle size increase exceeds the 20% review threshold')
  }
}

async function measureDir(dir: string): Promise<BundleSize> {
  if (!existsSync(dir))
    throw new Error(`missing build output: ${rel(dir)}; run web build first`)

  let bytes = 0
  let gzipBytes = 0
  for (const file of await collectFiles(dir)) {
    const body = await readFile(file)
    bytes += body.byteLength
    gzipBytes += gzipSync(body).byteLength
  }
  return { bytes, gzipBytes }
}

async function collectFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    for (const entry of await readdir(dir)) {
      const full = path.join(dir, entry)
      const info = await stat(full)
      if (info.isDirectory())
        await walk(full)
      else if (info.isFile())
        out.push(full)
    }
  }
  await walk(root)
  return out
}

function formatDelta(current: number, baseline: number): string {
  const pct = pctDelta(current, baseline)
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function pctDelta(current: number, baseline: number): number {
  if (baseline === 0)
    return current === 0 ? 0 : 100
  return ((current - baseline) / baseline) * 100
}

function rel(file: string): string {
  return path.relative(repoRoot, file)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
