import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'

import { copyDir } from './build-publish-manifest'

const DEFAULT_TARGETS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const

export interface PackageReleaseBundlesOptions {
  rootDir?: string
  targets?: readonly string[]
}

export async function packageReleaseBundles(options: PackageReleaseBundlesOptions = {}): Promise<void> {
  const rootDir = resolve(options.rootDir ?? process.cwd())
  const targets = options.targets ?? DEFAULT_TARGETS
  const distDir = resolve(rootDir, 'apps/cli/dist')
  const releaseDir = resolve(rootDir, 'release')

  await mkdir(releaseDir, { recursive: true })
  for (const target of targets) {
    const bundle = `aiworker-${target}`
    const bundleDir = resolve(releaseDir, bundle)
    await rm(bundleDir, { recursive: true, force: true })
    await mkdir(bundleDir, { recursive: true })
    await copyFile(resolve(rootDir, bundle), resolve(bundleDir, 'aiworker'))
    await chmod(resolve(bundleDir, 'aiworker'), 0o755)
    await copyDir(resolve(distDir, 'web'), resolve(bundleDir, 'web'))
    await copyDir(resolve(distDir, 'drizzle'), resolve(bundleDir, 'drizzle'))
    await copyDir(resolve(distDir, 'official-apps'), resolve(bundleDir, 'official-apps'))
    await copyFile(resolve(distDir, 'README.md'), resolve(bundleDir, 'README.md'))
    await createTarball(rootDir, releaseDir, bundle)
    await writeChecksum(rootDir, `${bundle}.tar.gz`)
  }
}

async function createTarball(rootDir: string, releaseDir: string, bundle: string): Promise<void> {
  const proc = spawn(['tar', '-C', releaseDir, '-czf', resolve(rootDir, `${bundle}.tar.gz`), bundle], {
    stderr: 'pipe',
    stdout: 'ignore',
  })
  const [stderr, code] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`tar failed for ${bundle}: ${stderr}`)
}

async function writeChecksum(rootDir: string, archiveName: string): Promise<void> {
  const archivePath = resolve(rootDir, archiveName)
  const digest = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  await writeFile(resolve(rootDir, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`)
}

if (import.meta.main)
  await packageReleaseBundles()
