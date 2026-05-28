import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'

import { copyDir } from './build-publish-manifest'
import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'

const DEFAULT_TARGETS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const
const REQUIRED_DIST_RESOURCES = [
  'web/worker/index.html',
  'drizzle/worker/meta/_journal.json',
  'official-apps/aiworker-freeform/dist/soul.descriptor.json',
  'README.md',
] as const
const FREEFORM_DESCRIPTOR_RESOURCE = 'official-apps/aiworker-freeform/dist/soul.descriptor.json'

export interface PackageReleaseBundlesOptions {
  rootDir?: string
  targets?: readonly string[]
}

export async function packageReleaseBundles(options: PackageReleaseBundlesOptions = {}): Promise<void> {
  const rootDir = resolve(options.rootDir ?? process.cwd())
  const targets = options.targets ?? DEFAULT_TARGETS
  const distDir = resolve(rootDir, 'apps/cli/dist')
  const releaseDir = resolve(rootDir, 'release')

  await assertRequiredDistResources(rootDir, distDir)
  await assertDescriptorV1(rootDir, distDir, FREEFORM_DESCRIPTOR_RESOURCE)
  await assertTargetBinaries(rootDir, targets)
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

async function assertTargetBinaries(rootDir: string, targets: readonly string[]): Promise<void> {
  for (const target of targets) {
    const binary = `aiworker-${target}`
    try {
      await stat(resolve(rootDir, binary))
    }
    catch {
      throw new Error(`missing release binary: ${binary}`)
    }
  }
}

async function assertDescriptorV1(rootDir: string, distDir: string, resource: string): Promise<void> {
  const resourcePath = resolve(distDir, resource)
  try {
    parseOfficialFreeformDescriptorJson(await readFile(resourcePath, 'utf8'))
  }
  catch (err) {
    const reason = err instanceof Error && err.message.includes('expected aiworker-freeform')
      ? 'is not the official Freeform descriptor'
      : 'is not descriptor v1'
    throw new Error(`invalid release resource: ${relative(rootDir, resourcePath)} ${reason}`)
  }
}

async function assertRequiredDistResources(rootDir: string, distDir: string): Promise<void> {
  for (const resource of REQUIRED_DIST_RESOURCES) {
    const resourcePath = resolve(distDir, resource)
    try {
      await stat(resourcePath)
    }
    catch {
      throw new Error(`missing release resource: ${relative(rootDir, resourcePath)}`)
    }
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
