#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

const DEFAULT_TARGETS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const
const REQUIRED_BUNDLE_ENTRIES = [
  'aiworker',
  'web/worker/index.html',
  'drizzle/worker/meta/_journal.json',
  'official-apps/aiworker-freeform/dist/soul.descriptor.json',
  'README.md',
] as const

export interface VerifyReleaseArtifactsOptions {
  rootDir?: string
  targets?: readonly string[]
}

export async function verifyReleaseArtifacts(options: VerifyReleaseArtifactsOptions = {}): Promise<void> {
  const rootDir = resolve(options.rootDir ?? process.cwd())
  const targets = options.targets ?? DEFAULT_TARGETS

  for (const target of targets) {
    const bundle = `aiworker-${target}`
    const archive = `${bundle}.tar.gz`
    await assertChecksum(rootDir, archive)
    const entries = await tarEntries(rootDir, archive)
    for (const entry of REQUIRED_BUNDLE_ENTRIES) {
      const archivedPath = `${bundle}/${entry}`
      if (!entries.has(archivedPath))
        throw new Error(`release artifact ${archive} is missing ${archivedPath}`)
    }
  }
}

async function assertChecksum(rootDir: string, archive: string): Promise<void> {
  const archivePath = resolve(rootDir, archive)
  const checksumPath = resolve(rootDir, `${archive}.sha256`)
  try {
    await stat(archivePath)
    await stat(checksumPath)
  }
  catch {
    throw new Error(`missing release artifact or checksum: ${archive}`)
  }

  const checksumText = await readFile(checksumPath, 'utf8')
  const [expected, filename] = checksumText.trim().split(/\s+/)
  if (filename !== archive)
    throw new Error(`release checksum ${relative(rootDir, checksumPath)} must name ${archive}`)
  const actual = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  if (expected !== actual)
    throw new Error(`release checksum mismatch for ${archive}`)
}

async function tarEntries(rootDir: string, archive: string): Promise<Set<string>> {
  const proc = spawn(['tar', '-tzf', resolve(rootDir, archive)], {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`tar list failed for ${archive}: ${stderr}`)
  return new Set(stdout.split(/\r?\n/).map(line => line.replace(/\/$/, '')).filter(Boolean))
}

if (import.meta.main) {
  verifyReleaseArtifacts()
    .then(() => {
      consola.success('[smoke-release-artifacts] PASS: release tarballs and checksums are attach-ready')
    })
    .catch((err) => {
      consola.error(`[smoke-release-artifacts] FAIL: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
