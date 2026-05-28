#!/usr/bin/env bun
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'

interface NpmPackEntry {
  filename?: string
}

interface DoctorOutput {
  installation?: {
    resources?: {
      migrationsReady?: boolean
      officialAppsReady?: boolean
      officialFreeformDescriptorReady?: boolean
      workerWebReady?: boolean
    }
  }
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
    await assertTarballDescriptorV1(archivePath, 'package/official-apps/aiworker-freeform/dist/soul.descriptor.json')
    await assertInstalledPackageDoctor(tempDir, archivePath)
    consola.success('[smoke-npm-package] PASS: npm package installs, runs doctor, and includes Host assets plus descriptor-only official Soul Apps')
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

async function assertTarballDescriptorV1(archivePath: string, descriptorPath: string): Promise<void> {
  const output = await run(['tar', '-xOzf', archivePath, descriptorPath], { cwd: process.cwd() })
  try {
    parseOfficialFreeformDescriptorJson(output.stdout)
  }
  catch {
    throw new Error(`npm package descriptor is not descriptor v1: ${descriptorPath}`)
  }
}

async function assertInstalledPackageDoctor(tempDir: string, archivePath: string): Promise<void> {
  const installRoot = resolve(tempDir, 'install-root')
  await mkdir(installRoot, { recursive: true })
  await run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', archivePath], { cwd: installRoot })
  const home = resolve(tempDir, 'home')
  const doctor = await run([resolve(installRoot, 'node_modules/.bin/aiworker'), 'doctor'], {
    cwd: installRoot,
    env: {
      ...process.env,
      AIWORKER_HOME: home,
      WORKER_DB_PATH: resolve(home, 'aiworker.db'),
    },
  })
  const body = JSON.parse(doctor.stdout) as DoctorOutput
  const resources = body.installation?.resources
  if (resources?.officialAppsReady !== true)
    throw new Error(`installed npm package doctor must report packaged official apps ready: ${doctor.stdout}`)
  if (resources?.officialFreeformDescriptorReady !== true)
    throw new Error(`installed npm package doctor must report packaged Freeform descriptor ready: ${doctor.stdout}`)
  if (resources?.workerWebReady !== true)
    throw new Error(`installed npm package doctor must report packaged Worker Web ready: ${doctor.stdout}`)
  if (resources?.migrationsReady !== true)
    throw new Error(`installed npm package doctor must report packaged migrations ready: ${doctor.stdout}`)
}

async function run(command: string[], options: { cwd: string, env?: NodeJS.ProcessEnv }): Promise<{ stderr: string, stdout: string }> {
  const proc = spawn(command, {
    cwd: options.cwd,
    env: options.env,
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
