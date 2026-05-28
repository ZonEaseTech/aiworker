#!/usr/bin/env bun
import { chmod, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'

import consola from 'consola'

import { packageReleaseBundles } from './package-release-bundles'
import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'

const TARGETS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const
const GENERATED_PATHS = [
  'release',
  ...TARGETS.flatMap(target => [
    `aiworker-${target}`,
    `aiworker-${target}.tar.gz`,
    `aiworker-${target}.tar.gz.sha256`,
  ]),
]

async function main(): Promise<number> {
  try {
    await cleanup()
    for (const target of TARGETS) {
      const binary = resolve(`aiworker-${target}`)
      await writeFile(binary, `#!/bin/sh\necho aiworker-${target}\n`)
      await chmod(binary, 0o755)
    }

    await packageReleaseBundles({ targets: TARGETS })

    for (const target of TARGETS) {
      const bundle = `aiworker-${target}`
      await assertExists(`release/${bundle}/aiworker`)
      await assertExists(`release/${bundle}/web/worker/index.html`)
      await assertExists(`release/${bundle}/drizzle`)
      await assertExists(`release/${bundle}/official-apps/aiworker-freeform/dist/soul.descriptor.json`)
      await assertStandaloneBundleOfficialFreeformDescriptor(`release/${bundle}/official-apps/aiworker-freeform`)
      await assertExists(`release/${bundle}/README.md`)
      await assertExists(`${bundle}.tar.gz`)
      await assertExists(`${bundle}.tar.gz.sha256`)
    }

    consola.success('[smoke-standalone-release] PASS: standalone bundles include packaged Host assets and official Soul Apps descriptor refs')
    return 0
  }
  finally {
    await cleanup()
  }
}

async function assertExists(path: string): Promise<void> {
  await stat(resolve(path))
}

async function assertStandaloneBundleOfficialFreeformDescriptor(freeformRoot: string): Promise<void> {
  const appRoot = resolve(freeformRoot)
  const descriptorPath = resolve(appRoot, 'dist', 'soul.descriptor.json')
  let descriptor: ReturnType<typeof parseOfficialFreeformDescriptorJson>
  try {
    descriptor = parseOfficialFreeformDescriptorJson(await readFile(descriptorPath, 'utf8'))
  }
  catch {
    throw new Error(`standalone bundle Freeform descriptor must use protocol soul/v1: ${descriptorPath}`)
  }
  await assertStandaloneBundleDescriptorRefs(appRoot, [
    { kind: 'file', ref: descriptor.workbench.entry },
    { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
    { kind: 'dir', ref: descriptor.engine.skills?.source },
    ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
  ])
}

async function assertStandaloneBundleDescriptorRefs(
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

async function cleanup(): Promise<void> {
  await Promise.all(GENERATED_PATHS.map(path => rm(resolve(path), { force: true, recursive: true })))
}

main()
  .then(code => process.exit(code))
  .catch((err) => {
    consola.error(`[smoke-standalone-release] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
