#!/usr/bin/env bun
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { packageReleaseBundles } from './package-release-bundles'

interface CommandResult {
  stderr: string
  stdout: string
}

interface AppListOutput {
  apps?: Array<{ appId?: string, sourceRef?: string }>
}

interface DoctorOutput {
  installation?: {
    resources?: {
      migrationsReady?: boolean
      officialAppsReady?: boolean
      officialFreeformDescriptorReady?: boolean
      workerWebReady?: boolean
    }
    source?: {
      kind?: string
    }
  }
}

const target = currentTarget()
const bundle = `aiworker-${target}`
const generatedPaths = [
  'release',
  bundle,
  `${bundle}.tar.gz`,
  `${bundle}.tar.gz.sha256`,
]

async function main(): Promise<number> {
  const tempDir = await mkdtemp(join(tmpdir(), 'aiworker-standalone-runtime-'))
  try {
    await cleanup()
    await run(['bun', 'build', '--compile', `--target=bun-${target}`, `--outfile=${bundle}`, 'apps/worker-cli/src/aiworker.ts'])
    const expectedVersion = await readDistPackageVersion()
    await packageReleaseBundles({ targets: [target] })
    await run(['tar', '-xzf', `${bundle}.tar.gz`, '-C', tempDir])

    const binary = resolve(tempDir, bundle, 'aiworker')
    const home = resolve(tempDir, 'home')
    const env = {
      ...process.env,
      AIWORKER_HOME: home,
      HOME: home,
      WORKER_DB_PATH: resolve(home, 'aiworker.db'),
    }
    delete env.WORKER_MIGRATIONS_FOLDER

    await assertStandaloneBinaryVersion(binary, expectedVersion)
    const doctor = await run([binary, 'doctor'], { env })
    assertStandaloneDoctor(doctor.stdout)
    await run([binary, 'app', 'bootstrap', 'official'], { env })
    const list = await run([binary, 'app', 'list'], { env })
    const officialAppsRoot = await realpath(resolve(tempDir, bundle, 'official-apps'))
    await assertPackagedFreeform(list.stdout, officialAppsRoot)
    await assertStandaloneOfficialFreeformDescriptor(officialAppsRoot)

    consola.success('[smoke-standalone-runtime] PASS: unpacked standalone binary boots with packaged migrations and the official Soul descriptor refs')
    return 0
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
    await cleanup()
  }
}

async function readDistPackageVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(resolve('apps/worker-cli/dist/package.json'), 'utf8')) as { version?: unknown }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0)
    throw new Error('standalone runtime smoke requires apps/worker-cli/dist/package.json with a version')
  return pkg.version
}

async function assertStandaloneBinaryVersion(binary: string, expectedVersion: string): Promise<void> {
  const version = await run([binary, '--version'])
  if (!reportsExpectedVersion(version.stdout, expectedVersion))
    throw new Error(`standalone binary must report dist package version ${expectedVersion}; got ${version.stdout.trim() || '<empty>'}`)
}

function reportsExpectedVersion(stdout: string, expectedVersion: string): boolean {
  const normalized = stdout.trim()
  return normalized === expectedVersion || normalized.includes(`aiworker/${expectedVersion}`)
}

function currentTarget(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  if (!platform || !arch)
    throw new Error(`unsupported standalone smoke platform: ${process.platform}-${process.arch}`)
  return `${platform}-${arch}`
}

function assertStandaloneDoctor(stdout: string): void {
  const body = JSON.parse(stdout) as DoctorOutput
  const installation = body.installation
  if (installation?.source?.kind !== 'github-tarball')
    throw new Error(`standalone doctor must report github-tarball install source: ${stdout}`)
  if (installation.resources?.officialAppsReady !== true)
    throw new Error(`standalone doctor must report packaged official apps ready: ${stdout}`)
  if (installation.resources?.officialFreeformDescriptorReady !== true)
    throw new Error(`standalone doctor must report packaged Freeform descriptor ready: ${stdout}`)
  if (installation.resources?.workerWebReady !== true)
    throw new Error(`standalone doctor must report packaged Worker Web ready: ${stdout}`)
  if (installation.resources?.migrationsReady !== true)
    throw new Error(`standalone doctor must report packaged migrations ready: ${stdout}`)
}

async function assertPackagedFreeform(stdout: string, expectedOfficialAppsRoot: string): Promise<void> {
  const body = JSON.parse(stdout) as AppListOutput
  const app = body.apps?.find(item => item.appId === 'aiworker-freeform')
  if (!app)
    throw new Error(`standalone app list is missing aiworker-freeform: ${stdout}`)
  const sourceRef = app.sourceRef ? await realpath(app.sourceRef) : ''
  const relativeSourceRef = relative(expectedOfficialAppsRoot, sourceRef)
  if (!relativeSourceRef || relativeSourceRef.startsWith('..') || isAbsolute(relativeSourceRef))
    throw new Error(`aiworker-freeform must resolve from packaged official-apps; got ${app.sourceRef}`)
}

async function assertStandaloneOfficialFreeformDescriptor(officialAppsRoot: string): Promise<void> {
  const freeformRoot = resolve(officialAppsRoot, 'aiworker-freeform')
  const descriptorPath = resolve(freeformRoot, 'dist', 'soul.descriptor.json')
  let descriptor: ReturnType<typeof parseOfficialFreeformDescriptorJson>
  try {
    descriptor = parseOfficialFreeformDescriptorJson(await readFile(descriptorPath, 'utf8'))
  }
  catch {
    throw new Error(`standalone Freeform descriptor must use protocol soul/v1: ${descriptorPath}`)
  }
  await assertStandaloneDescriptorRefs(freeformRoot, [
    { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
    { kind: 'dir', ref: descriptor.engine.skills?.source },
    ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
  ])
}

async function assertStandaloneDescriptorRefs(
  freeformRoot: string,
  refs: Array<{ kind: 'dir' | 'file', ref?: string }>,
): Promise<void> {
  await assertStandaloneDescriptorRefsForRoot(freeformRoot, refs)
}

export async function assertStandaloneDescriptorRefsForRoot(
  freeformRoot: string,
  refs: Array<{ kind: 'dir' | 'file', ref?: string }>,
): Promise<void> {
  for (const item of refs) {
    if (!item.ref)
      continue
    const resourcePath = resolve(freeformRoot, item.ref)
    const relativeResourcePath = relative(freeformRoot, resourcePath)
    if (!relativeResourcePath || relativeResourcePath.startsWith('..') || isAbsolute(relativeResourcePath))
      throw new Error(`standalone Freeform descriptor reference escapes package root: ${item.ref}`)
    try {
      const info = await stat(resourcePath)
      if (item.kind === 'dir' && !info.isDirectory())
        throw new Error('not a directory')
      if (item.kind === 'file' && !info.isFile())
        throw new Error('not a file')
    }
    catch {
      throw new Error(`standalone Freeform descriptor references missing ${item.kind}: ${resourcePath}`)
    }
  }
}

async function cleanup(): Promise<void> {
  await Promise.all(generatedPaths.map(path => rm(resolve(path), { force: true, recursive: true })))
}

async function run(command: string[], options: { env?: NodeJS.ProcessEnv } = {}): Promise<CommandResult> {
  const proc = spawn(command, {
    env: options.env ?? process.env,
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

if (import.meta.main) {
  main()
    .then(code => process.exit(code))
    .catch(async (err) => {
      consola.error(`[smoke-standalone-runtime] FAIL: ${err instanceof Error ? err.message : String(err)}`)
      await cleanup()
      process.exit(1)
    })
}
