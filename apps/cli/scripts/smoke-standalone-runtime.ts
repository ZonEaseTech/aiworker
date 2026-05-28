#!/usr/bin/env bun
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

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
    await run(['bun', 'build', '--compile', `--target=bun-${target}`, `--outfile=${bundle}`, 'apps/cli/src/aiworker.ts'])
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

    const doctor = await run([binary, 'doctor'], { env })
    assertStandaloneDoctor(doctor.stdout)
    await run([binary, 'app', 'bootstrap', 'official'], { env })
    const list = await run([binary, 'app', 'list'], { env })
    await assertPackagedFreeform(list.stdout, await realpath(resolve(tempDir, bundle, 'official-apps')))

    consola.success('[smoke-standalone-runtime] PASS: unpacked standalone binary boots with packaged migrations and official Soul Apps')
    return 0
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
    await cleanup()
  }
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

main()
  .then(code => process.exit(code))
  .catch(async (err) => {
    consola.error(`[smoke-standalone-runtime] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    await cleanup()
    process.exit(1)
  })
