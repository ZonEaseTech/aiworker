#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

interface BundleSize {
  bytes: number
  gzipBytes: number
}

interface SizeBaseline {
  bundles: Record<'worker', BundleSize>
}

const criticalStudioSelectors = [
  '.entry-shell',
  '.entry-side',
  '.newproj',
  '.entry-main',
  '.tab-panel-toolbar',
  '.design-card',
  '.artifact-rail',
  '.soul-option',
  '.template-option',
  '.modal-settings',
  '.settings-autosave',
  '.agent-card',
] as const

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const webRoot = path.join(repoRoot, 'apps/web')
const baselinePath = path.join(webRoot, 'bundle-size-baseline.json')

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'studio-css') {
    await checkStudioCss()
    return
  }
  if (command === 'size-report') {
    await reportBundleSizes(args.includes('--write-baseline'))
    return
  }
  throw new Error(`unknown command: ${command ?? '(missing)'}`)
}

async function reportBundleSizes(writeBaseline: boolean): Promise<void> {
  const bundles: SizeBaseline['bundles'] = {
    worker: await measureDir(path.join(webRoot, 'dist/worker')),
  }

  if (writeBaseline) {
    const body = `${JSON.stringify({ bundles }, null, 2)}\n`
    await writeFile(baselinePath, body, 'utf8')
    console.log(`wrote ${rel(baselinePath)}`)
  }

  const baseline = existsSync(baselinePath)
    ? normalizeBaseline(JSON.parse(await readFile(baselinePath, 'utf8')) as Partial<SizeBaseline>)
    : null

  console.log('| bundle | bytes | gzip bytes | baseline bytes | baseline gzip | delta bytes | delta gzip |')
  console.log('|---|---:|---:|---:|---:|---:|---:|')
  for (const name of ['worker'] as const) {
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

  if (!baseline)
    throw new Error(`missing bundle size baseline: ${rel(baselinePath)}`)

  const overLimit = (['worker'] as const).flatMap((name) => {
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

async function checkStudioCss(): Promise<void> {
  const assetsDir = path.join(webRoot, 'dist/worker/assets')
  if (!existsSync(assetsDir))
    throw new Error(`missing worker build assets directory ${rel(assetsDir)}`)

  const cssFiles = (await collectFiles(assetsDir))
    .filter(file => file.endsWith('.css'))
    .sort()
  if (cssFiles.length === 0)
    throw new Error(`no CSS assets found in ${rel(assetsDir)}`)

  const css = (await Promise.all(cssFiles.map(file => readFile(file, 'utf8')))).join('\n')
  const missing = criticalStudioSelectors.filter(selector => !hasCssSelector(css, selector))
  if (missing.length > 0)
    throw new Error(`worker studio CSS missing ${missing.join(', ')} in ${cssFiles.map(rel).join(', ')}`)

  console.log(`worker studio CSS check passed (${cssFiles.map(rel).join(', ')})`)
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

function normalizeBaseline(input: Partial<SizeBaseline>): SizeBaseline | null {
  const worker = input.bundles?.worker
  if (!worker)
    return null
  return { bundles: { worker } }
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

function hasCssSelector(css: string, selector: string): boolean {
  return new RegExp(`${escapeRegExp(selector)}(?=[\\s,{:.#>+~\\[])`).test(css)
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rel(file: string): string {
  return path.relative(repoRoot, file)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
