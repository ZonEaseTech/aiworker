#!/usr/bin/env bun
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
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

interface AppListOutput {
  apps?: Array<{ appId?: string, sourceRef?: string }>
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
const officialFreeformPackageRoot = 'package/official-apps/aiworker-freeform'
const officialFreeformDescriptorPath = `${officialFreeformPackageRoot}/dist/soul.descriptor.json`

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
    await assertTarballOfficialFreeformDescriptor(archivePath, officialFreeformDescriptorPath, files)
    await assertInstalledPackageRuntime(tempDir, archivePath)
    consola.success('[smoke-npm-package] PASS: npm package installs, runs doctor, and bootstraps packaged official Soul Apps with descriptor refs')
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

async function assertTarballOfficialFreeformDescriptor(archivePath: string, descriptorPath: string, files: string[]): Promise<void> {
  const output = await run(['tar', '-xOzf', archivePath, descriptorPath], { cwd: process.cwd() })
  let descriptor: ReturnType<typeof parseOfficialFreeformDescriptorJson>
  try {
    descriptor = parseOfficialFreeformDescriptorJson(output.stdout)
  }
  catch {
    throw new Error(`npm package descriptor is not descriptor v1: ${descriptorPath}`)
  }
  assertTarballDescriptorRefs(files, officialFreeformPackageRoot, [
    { kind: 'file', ref: descriptor.workbench.entry },
    { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
    { kind: 'dir', ref: descriptor.engine.skills?.source },
    ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
  ])
}

function assertTarballDescriptorRefs(
  files: string[],
  appRoot: string,
  refs: Array<{ kind: 'dir' | 'file', ref?: string }>,
): void {
  for (const item of refs) {
    if (!item.ref)
      continue
    const packagedRef = `${appRoot}/${item.ref.replace(/^\/+/, '')}`
    const hasRef = item.kind === 'dir'
      ? files.some(file => file === packagedRef || file === `${packagedRef}/` || file.startsWith(`${packagedRef}/`))
      : files.includes(packagedRef)
    if (!hasRef)
      throw new Error(`npm package descriptor references missing ${item.kind}: ${packagedRef}`)
  }
}

async function assertInstalledPackageRuntime(tempDir: string, archivePath: string): Promise<void> {
  const installRoot = resolve(tempDir, 'install-root')
  await mkdir(installRoot, { recursive: true })
  await run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', archivePath], { cwd: installRoot })
  const home = resolve(tempDir, 'home')
  const bin = resolve(installRoot, 'node_modules/.bin/aiworker')
  const env = {
    ...process.env,
    AIWORKER_HOME: home,
    WORKER_DB_PATH: resolve(home, 'aiworker.db'),
  }
  const doctor = await run([bin, 'doctor'], {
    cwd: installRoot,
    env,
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

  await run([bin, 'app', 'bootstrap', 'official'], { cwd: installRoot, env })
  const list = await run([bin, 'app', 'list'], { cwd: installRoot, env })
  const officialAppsRoot = await realpath(resolve(installRoot, 'node_modules/@zonease/aiworker-cli/official-apps'))
  await assertPackagedFreeform(list.stdout, officialAppsRoot)
  await assertInstalledOfficialFreeformDescriptor(officialAppsRoot)
}

async function assertPackagedFreeform(stdout: string, expectedOfficialAppsRoot: string): Promise<void> {
  const body = JSON.parse(stdout) as AppListOutput
  const app = body.apps?.find(item => item.appId === 'aiworker-freeform')
  if (!app)
    throw new Error(`npm-installed app list is missing aiworker-freeform: ${stdout}`)
  const sourceRef = app.sourceRef ? await realpath(app.sourceRef) : ''
  const relativeSourceRef = relative(expectedOfficialAppsRoot, sourceRef)
  if (!relativeSourceRef || relativeSourceRef.startsWith('..') || isAbsolute(relativeSourceRef))
    throw new Error(`aiworker-freeform must resolve from npm packaged official-apps; got ${app.sourceRef}`)
}

async function assertInstalledOfficialFreeformDescriptor(officialAppsRoot: string): Promise<void> {
  const freeformRoot = resolve(officialAppsRoot, 'aiworker-freeform')
  const descriptorPath = resolve(freeformRoot, 'dist', 'soul.descriptor.json')
  let descriptor: ReturnType<typeof parseOfficialFreeformDescriptorJson>
  try {
    descriptor = parseOfficialFreeformDescriptorJson(await readFile(descriptorPath, 'utf8'))
  }
  catch {
    throw new Error(`npm-installed Freeform descriptor must use protocol soul/v1: ${descriptorPath}`)
  }
  await assertInstalledDescriptorRefs(freeformRoot, [
    { kind: 'file', ref: descriptor.workbench.entry },
    { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
    { kind: 'dir', ref: descriptor.engine.skills?.source },
    ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
  ])
}

async function assertInstalledDescriptorRefs(
  freeformRoot: string,
  refs: Array<{ kind: 'dir' | 'file', ref?: string }>,
): Promise<void> {
  for (const item of refs) {
    if (!item.ref)
      continue
    const resourcePath = resolve(freeformRoot, item.ref)
    const relativeResourcePath = relative(freeformRoot, resourcePath)
    if (!relativeResourcePath || relativeResourcePath.startsWith('..') || isAbsolute(relativeResourcePath))
      throw new Error(`npm-installed Freeform descriptor reference escapes package root: ${item.ref}`)
    try {
      const info = await stat(resourcePath)
      if (item.kind === 'dir' && !info.isDirectory())
        throw new Error('not a directory')
      if (item.kind === 'file' && !info.isFile())
        throw new Error('not a file')
    }
    catch {
      throw new Error(`npm-installed Freeform descriptor references missing ${item.kind}: ${resourcePath}`)
    }
  }
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
