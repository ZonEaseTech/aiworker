#!/usr/bin/env bun
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

interface NpmPackEntry {
  filename?: string
}

const cliDistDir = resolve(import.meta.dirname, '..', 'dist')
const requiredPackageFiles = [
  'package/aiworker.js',
  'package/aiworker-bun.js',
  'package/package.json',
  'package/README.md',
  'package/drizzle/worker/meta/0000_snapshot.json',
  'package/web/worker/index.html',
  'package/official-apps/aiworker-freeform/dist/soul.descriptor.json',
]

async function main(): Promise<number> {
  const tempDir = await mkdtemp(join(tmpdir(), 'aiworker-npm-package-'))
  try {
    await assertDistPackageMetadata()
    const archivePath = await packDist(tempDir)
    const files = await listTarball(archivePath)
    for (const file of requiredPackageFiles) {
      if (!files.includes(file))
        throw new Error(`npm package is missing ${file}`)
    }
    for (const file of files) {
      if (file.includes('/node_modules/') || file.includes('/host-adapter/') || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
        throw new Error(`npm package includes non-release file: ${file}`)
    }
    consola.success('[smoke-npm-package] PASS: npm package tarball includes CLI, Host assets, and descriptor-only official Soul Apps')
    return 0
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function assertDistPackageMetadata(): Promise<void> {
  const pkg = JSON.parse(await readFile(resolve(cliDistDir, 'package.json'), 'utf8')) as {
    bin?: Record<string, unknown>
    files?: unknown
  }
  if (pkg.bin?.aiworker !== 'aiworker.js')
    throw new Error('dist package.json must expose bin.aiworker as aiworker.js')
  const files = Array.isArray(pkg.files) ? pkg.files : []
  for (const expected of ['aiworker.js', 'aiworker-bun.js', 'drizzle/', 'web/', 'official-apps/']) {
    if (!files.includes(expected))
      throw new Error(`dist package.json files must include ${expected}`)
  }
}

async function packDist(tempDir: string): Promise<string> {
  const output = await run(['npm', 'pack', '--json', '--pack-destination', tempDir], { cwd: cliDistDir })
  const entries = JSON.parse(output.stdout) as NpmPackEntry[]
  const filename = entries[0]?.filename
  if (!filename)
    throw new Error(`npm pack did not return a package filename: ${output.stdout}`)
  return resolve(tempDir, basename(filename))
}

async function listTarball(archivePath: string): Promise<string[]> {
  const output = await run(['tar', '-tzf', archivePath], { cwd: process.cwd() })
  return output.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

async function run(command: string[], options: { cwd: string }): Promise<{ stderr: string, stdout: string }> {
  const proc = spawn(command, {
    cwd: options.cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`${command.join(' ')} failed with ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  return { stderr, stdout }
}

main()
  .then(code => process.exit(code))
  .catch((err) => {
    consola.error(`[smoke-npm-package] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
