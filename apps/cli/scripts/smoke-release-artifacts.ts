#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix, relative, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'

const DEFAULT_TARGETS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const
const FREEFORM_ROOT = 'official-apps/aiworker-freeform'
const FREEFORM_DESCRIPTOR = `${FREEFORM_ROOT}/dist/soul.descriptor.json`
const REQUIRED_BUNDLE_ENTRIES = [
  'aiworker',
  'web/worker/index.html',
  'drizzle/worker/meta/_journal.json',
  FREEFORM_DESCRIPTOR,
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
    const verboseEntries = await tarVerboseEntries(rootDir, archive)
    for (const entry of REQUIRED_BUNDLE_ENTRIES) {
      const archivedPath = `${bundle}/${entry}`
      if (!entries.has(archivedPath))
        throw new Error(`release artifact ${archive} is missing ${archivedPath}`)
    }
    assertExecutableBinary(archive, `${bundle}/aiworker`, verboseEntries)
    await smokeCurrentTargetBinary(rootDir, archive, target)
    await assertOfficialFreeformDescriptorRefs(rootDir, archive, bundle, entries)
  }
}

async function assertOfficialFreeformDescriptorRefs(
  rootDir: string,
  archive: string,
  bundle: string,
  entries: Set<string>,
): Promise<void> {
  const descriptorText = await tarFile(rootDir, archive, `${bundle}/${FREEFORM_DESCRIPTOR}`)
  let descriptor: ReturnType<typeof parseOfficialFreeformDescriptorJson>
  try {
    descriptor = parseOfficialFreeformDescriptorJson(descriptorText)
  }
  catch {
    throw new Error(`release artifact ${archive} official Freeform descriptor must use protocol soul/v1`)
  }

  const refs = [
    { kind: 'file', ref: descriptor.workbench.entry },
    { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
    { kind: 'dir', ref: descriptor.engine.skills?.source },
    ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
  ]
  const appRoot = `${bundle}/${FREEFORM_ROOT}`
  for (const item of refs) {
    if (!item.ref)
      continue
    const archivedPath = posix.normalize(posix.join(appRoot, item.ref))
    const relativeRef = posix.relative(appRoot, archivedPath)
    if (!relativeRef || relativeRef.startsWith('..') || posix.isAbsolute(relativeRef))
      throw new Error(`release artifact ${archive} descriptor reference escapes official app root: ${item.ref}`)
    if (item.kind === 'file' && !entries.has(archivedPath))
      throw new Error(`release artifact ${archive} descriptor references missing file: ${archivedPath}`)
    if (item.kind === 'dir' && !hasDirectoryEntry(entries, archivedPath))
      throw new Error(`release artifact ${archive} descriptor references missing dir: ${archivedPath}`)
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

async function tarVerboseEntries(rootDir: string, archive: string): Promise<string[]> {
  const proc = spawn(['tar', '-tvzf', resolve(rootDir, archive)], {
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
  return stdout.split(/\r?\n/).filter(Boolean)
}

async function tarFile(rootDir: string, archive: string, file: string): Promise<string> {
  const proc = spawn(['tar', '-xOzf', resolve(rootDir, archive), file], {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`tar read failed for ${archive}:${file}: ${stderr}`)
  return stdout
}

function assertExecutableBinary(archive: string, file: string, verboseEntries: readonly string[]): void {
  const entry = verboseEntries.find(line => line.endsWith(file))
  const mode = entry?.split(/\s+/, 1)[0]
  if (!mode || mode[3] !== 'x')
    throw new Error(`release artifact ${archive} binary is not executable: ${file}`)
}

async function smokeCurrentTargetBinary(rootDir: string, archive: string, target: string): Promise<void> {
  if (target !== currentTarget())
    return

  const bundle = `aiworker-${target}`
  const tempDir = await mkdtemp(join(tmpdir(), 'aiworker-release-artifact-smoke-'))
  try {
    await runTar(['-xzf', resolve(rootDir, archive), '-C', tempDir, `${bundle}/aiworker`], archive)
    await runBinarySmoke(resolve(tempDir, bundle, 'aiworker'), archive, `${bundle}/aiworker`)
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function currentTarget(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  return platform && arch ? `${platform}-${arch}` : ''
}

async function runTar(args: string[], archive: string): Promise<void> {
  const proc = spawn(['tar', ...args], {
    stderr: 'pipe',
    stdout: 'ignore',
  })
  const [stderr, code] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`tar extract failed for ${archive}: ${stderr}`)
}

async function runBinarySmoke(binary: string, archive: string, archivedFile: string): Promise<void> {
  const proc = spawn([binary, '--version'], {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`release artifact ${archive} binary smoke failed: ${archivedFile} --version exited ${code}`)
  if (stdout.trim().length === 0)
    throw new Error(`release artifact ${archive} binary smoke failed: ${archivedFile} --version produced no output${stderr ? `: ${stderr}` : ''}`)
}

function hasDirectoryEntry(entries: Set<string>, directory: string): boolean {
  const prefix = `${directory}/`
  for (const entry of entries) {
    if (entry === directory || entry.startsWith(prefix))
      return true
  }
  return false
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
