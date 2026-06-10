import type { OfficialSoulCatalogView } from '../packages/worker-runtime/src/soul-app/official-definitions'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { OFFICIAL_SOUL_CATALOG_VIEWS } from '../packages/worker-runtime/src/soul-app/official-definitions'

export interface OfficialSoulDistBuildDefinition {
  descriptorPath: string
  id: string
}

export interface OfficialSoulDistBuildResult {
  appId: string
  descriptorPath: string
  packageName: string
}

export interface OfficialSoulDistCommandContext {
  appId: string
  cwd: string
  packageName: string
}

export type OfficialSoulDistCommandRunner = (
  command: readonly string[],
  context: OfficialSoulDistCommandContext,
) => Promise<void>

export interface EnsureOfficialSoulDistsOptions {
  catalogView?: OfficialSoulCatalogView
  definitions?: readonly OfficialSoulDistBuildDefinition[]
  repoRoot?: string
  runCommand?: OfficialSoulDistCommandRunner
}

const defaultRepoRoot = resolve(import.meta.dirname, '..')

export async function ensureOfficialSoulDists(
  options: EnsureOfficialSoulDistsOptions = {},
): Promise<OfficialSoulDistBuildResult[]> {
  const repoRoot = options.repoRoot ?? defaultRepoRoot
  const definitions = options.definitions ?? definitionsForCatalogView(options.catalogView ?? 'shipped')
  const runCommand = options.runCommand ?? runCommandWithInheritedStdio
  const results: OfficialSoulDistBuildResult[] = []

  for (const definition of definitions) {
    const soulRoot = resolve(repoRoot, 'souls', definition.id)
    const packageName = await readSoulPackageName(soulRoot)
    await runCommand(['bun', 'run', '--filter', packageName, 'build'], {
      appId: definition.id,
      cwd: repoRoot,
      packageName,
    })

    const descriptorPath = resolve(repoRoot, definition.descriptorPath)
    try {
      await access(descriptorPath)
    }
    catch {
      throw new Error(`Official Soul build did not create descriptor for ${definition.id}: ${descriptorPath}`)
    }

    results.push({
      appId: definition.id,
      descriptorPath,
      packageName,
    })
  }

  return results
}

export function definitionsForCatalogView(view: OfficialSoulCatalogView): readonly OfficialSoulDistBuildDefinition[] {
  return OFFICIAL_SOUL_CATALOG_VIEWS[view]
}

function parseCatalogViewArg(argv: readonly string[]): OfficialSoulCatalogView {
  const index = argv.indexOf('--catalog-view')
  if (index === -1)
    return 'shipped'
  const value = argv[index + 1]
  if (value === 'dev-sampling' || value === 'shipped')
    return value
  throw new Error(`unsupported official Soul catalog view: ${value ?? '<missing>'}`)
}

async function readSoulPackageName(soulRoot: string): Promise<string> {
  const packagePath = resolve(soulRoot, 'package.json')
  const parsed = JSON.parse(await readFile(packagePath, 'utf8')) as { name?: unknown }
  if (typeof parsed.name !== 'string' || parsed.name.length === 0)
    throw new Error(`Official Soul package is missing a package name: ${packagePath}`)
  return parsed.name
}

async function runCommandWithInheritedStdio(
  command: readonly string[],
  context: OfficialSoulDistCommandContext,
): Promise<void> {
  const proc = Bun.spawn([...command], {
    cwd: context.cwd,
    stderr: 'inherit',
    stdout: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0)
    throw new Error(`Official Soul build failed for ${context.appId}: ${command.join(' ')} exited ${exitCode}`)
}

if (import.meta.main)
  await ensureOfficialSoulDists({ catalogView: parseCatalogViewArg(Bun.argv.slice(2)) })
