#!/usr/bin/env bun
import { chmod, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import consola from 'consola'

import { packageReleaseBundles } from './package-release-bundles'

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
      await assertExists(`release/${bundle}/README.md`)
      await assertExists(`${bundle}.tar.gz`)
      await assertExists(`${bundle}.tar.gz.sha256`)
    }

    consola.success('[smoke-standalone-release] PASS: standalone bundles include packaged Host assets and descriptor-only official Soul Apps')
    return 0
  }
  finally {
    await cleanup()
  }
}

async function assertExists(path: string): Promise<void> {
  await stat(resolve(path))
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
