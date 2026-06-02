#!/usr/bin/env bun
import { chmod, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'

import consola from 'consola'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { packageReleaseBundles } from './package-release-bundles'
import { verifyReleaseArtifacts } from './smoke-release-artifacts'

const TARGETS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const

export interface RunStandaloneReleaseSmokeOptions {
  binaryTextForTarget?: (target: string, version: string) => string
  rootDir?: string
  targets?: readonly string[]
}

export async function runStandaloneReleaseSmoke(options: RunStandaloneReleaseSmokeOptions = {}): Promise<void> {
  const rootDir = resolve(options.rootDir ?? process.cwd())
  const targets = options.targets ?? TARGETS
  try {
    await cleanup(rootDir, targets)
    const version = await readDistPackageVersion(rootDir)
    for (const target of targets) {
      const binary = resolve(rootDir, `aiworker-${target}`)
      const binaryText = options.binaryTextForTarget?.(target, version)
        ?? `#!/bin/sh\necho ${target === currentTarget() ? `aiworker/${version} ${target} node-v24.3.0` : `aiworker-${target}`}\n`
      await writeFile(binary, binaryText)
      await chmod(binary, 0o755)
    }

    await packageReleaseBundles({ rootDir, targets })
    await verifyReleaseArtifacts({ rootDir, targets })

    for (const target of targets) {
      const bundle = `aiworker-${target}`
      await assertExists(rootDir, `release/${bundle}/aiworker`)
      await assertExists(rootDir, `release/${bundle}/web/worker/index.html`)
      await assertExists(rootDir, `release/${bundle}/drizzle`)
      await assertExists(rootDir, `release/${bundle}/official-apps/aiworker-freeform/dist/soul.descriptor.json`)
      await assertStandaloneBundleOfficialFreeformDescriptor(rootDir, `release/${bundle}/official-apps/aiworker-freeform`)
      await assertExists(rootDir, `release/${bundle}/README.md`)
      await assertExists(rootDir, `${bundle}.tar.gz`)
      await assertExists(rootDir, `${bundle}.tar.gz.sha256`)
    }
  }
  finally {
    await cleanup(rootDir, targets)
  }
}

async function main(): Promise<number> {
  await runStandaloneReleaseSmoke()
  consola.success('[smoke-standalone-release] PASS: standalone bundles include packaged Host assets and official Soul Apps descriptor refs')
  return 0
}

async function readDistPackageVersion(rootDir: string): Promise<string> {
  const pkg = JSON.parse(await readFile(resolve(rootDir, 'apps/worker-cli/dist/package.json'), 'utf8')) as { version?: unknown }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0)
    throw new Error('standalone release smoke requires apps/worker-cli/dist/package.json with a version')
  return pkg.version
}

function currentTarget(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  return platform && arch ? `${platform}-${arch}` : ''
}

async function assertExists(rootDir: string, path: string): Promise<void> {
  await stat(resolve(rootDir, path))
}

async function assertStandaloneBundleOfficialFreeformDescriptor(rootDir: string, freeformRoot: string): Promise<void> {
  const appRoot = resolve(rootDir, freeformRoot)
  const descriptorPath = resolve(appRoot, 'dist', 'soul.descriptor.json')
  let descriptor: ReturnType<typeof parseOfficialFreeformDescriptorJson>
  try {
    descriptor = parseOfficialFreeformDescriptorJson(await readFile(descriptorPath, 'utf8'))
  }
  catch {
    throw new Error(`standalone bundle Freeform descriptor must use protocol soul/v1: ${descriptorPath}`)
  }
  await assertStandaloneBundleDescriptorRefs(appRoot, [
    { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
    { kind: 'dir', ref: descriptor.engine.skills?.source },
    ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
  ])
}

export async function assertStandaloneBundleDescriptorRefs(
  appRoot: string,
  refs: Array<{ kind: 'dir' | 'file', ref?: string }>,
): Promise<void> {
  for (const item of refs) {
    if (!item.ref)
      continue
    const resourcePath = resolve(appRoot, item.ref)
    const relativeResourcePath = relative(appRoot, resourcePath)
    if (!relativeResourcePath || relativeResourcePath.startsWith('..') || isAbsolute(relativeResourcePath))
      throw new Error(`standalone bundle Freeform descriptor reference escapes package root: ${item.ref}`)
    try {
      const info = await stat(resourcePath)
      if (item.kind === 'dir' && !info.isDirectory())
        throw new Error('not a directory')
      if (item.kind === 'file' && !info.isFile())
        throw new Error('not a file')
    }
    catch {
      throw new Error(`standalone bundle Freeform descriptor references missing ${item.kind}: ${resourcePath}`)
    }
  }
}

function generatedPaths(targets: readonly string[]): string[] {
  return [
    'release',
    ...targets.flatMap(target => [
      `aiworker-${target}`,
      `aiworker-${target}.tar.gz`,
      `aiworker-${target}.tar.gz.sha256`,
    ]),
  ]
}

async function cleanup(rootDir: string, targets: readonly string[]): Promise<void> {
  await Promise.all(generatedPaths(targets).map(path => rm(resolve(rootDir, path), { force: true, recursive: true })))
}

if (import.meta.main) {
  main()
    .then(code => process.exit(code))
    .catch((err) => {
      consola.error(`[smoke-standalone-release] FAIL: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
