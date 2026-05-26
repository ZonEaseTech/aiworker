import type { SoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'

export type SoulBuildStatus = 'built' | 'failed'
export type SoulValidationStatus = 'invalid' | 'valid'

export interface SoulConfig {
  appId?: string
  api?: SoulDescriptorV1['api']
  capabilities?: SoulCapabilityConfig[]
  compatibility?: Partial<SoulDescriptorV1['compatibility']>
  configuration?: Partial<SoulDescriptorV1['configuration']>
  description?: string
  external?: Record<string, unknown>
  extensions?: Record<string, unknown>
  health?: Record<string, unknown>
  id: string
  name: string
  soulId?: string
  version: string
  workbench?: SoulWorkbenchConfig
}

export interface SoulCapabilityConfig {
  id: string
  name?: string
  purpose?: string
}

export interface SoulWorkbenchConfig {
  mode?: 'custom' | 'sdk-common'
  source?: string
}

export interface SoulArtifactConfig {
  id: string
  name?: string
  schemaRef?: string
}

export interface SoulWorkspaceAssetConfig {
  source: string
}

export interface SoulSkillConfig {
  id: string
  source?: string
}

export interface SoulNativeMcpConfig {
  file: string
  target: string
}

export interface SoulDiscovery {
  capabilities: Array<{ id: string, promptPath: string }>
  generatedSections: string[]
  mcpTargets: Array<{ file: string, target: string }>
  workbench: { mode: 'custom' | 'sdk-common', source: string }
}

export interface SoulValidationIssue {
  code: string
  message: string
  path: string
}

export interface SoulValidationResult {
  discovery: SoulDiscovery
  issues: SoulValidationIssue[]
  status: SoulValidationStatus
}

export interface SoulBuildResult {
  descriptor: SoulDescriptorV1
  discovery: SoulDiscovery
  outputPath: string
  status: SoulBuildStatus
}

interface ResolvedSoul {
  config: SoulConfig
  descriptor: SoulDescriptorV1
  discovery: SoulDiscovery
}

export function defineSoul(input: SoulConfig): SoulConfig {
  return {
    ...input,
    appId: input.appId ?? input.id,
    soulId: input.soulId ?? input.id,
  }
}

export function capability(input: SoulCapabilityConfig): SoulCapabilityConfig {
  return input
}

export function commonWorkbench(options: SoulWorkbenchConfig = {}): SoulWorkbenchConfig {
  return {
    mode: 'sdk-common',
    source: 'sdk-common',
    ...options,
  }
}

export function extendWorkbench(base: SoulWorkbenchConfig, extension: SoulWorkbenchConfig): SoulWorkbenchConfig {
  return {
    ...base,
    ...extension,
    mode: extension.mode ?? 'custom',
  }
}

export function artifact(input: SoulArtifactConfig): SoulArtifactConfig {
  return input
}

export function workspaceAsset(input: SoulWorkspaceAssetConfig): SoulWorkspaceAssetConfig {
  return input
}

export function skill(input: SoulSkillConfig): SoulSkillConfig {
  return input
}

export function nativeMcp(input: SoulNativeMcpConfig): SoulNativeMcpConfig {
  return input
}

export async function validateSoul(rootDir: string): Promise<SoulValidationResult> {
  const resolved = await resolveSoul(rootDir)
  return {
    discovery: resolved.discovery,
    issues: resolved.issues,
    status: resolved.issues.length === 0 ? 'valid' : 'invalid',
  }
}

export async function buildSoul(rootDir: string): Promise<SoulBuildResult> {
  const resolved = await resolveSoul(rootDir)
  if (resolved.issues.length > 0) {
    throw new Error(resolved.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))
  }

  const outputRoot = join(rootDir, 'dist')
  rmSync(outputRoot, { force: true, recursive: true })
  mkdirSync(outputRoot, { recursive: true })

  copyCapabilities(rootDir, resolved.discovery.capabilities)
  writeWorkbench(rootDir, resolved.discovery.workbench)
  copyEngineAssets(rootDir, resolved.discovery)

  const outputPath = join(outputRoot, 'soul.descriptor.json')
  writeFileSync(outputPath, `${JSON.stringify(resolved.descriptor, null, 2)}\n`)

  return {
    descriptor: resolved.descriptor,
    discovery: resolved.discovery,
    outputPath,
    status: 'built',
  }
}

async function resolveSoul(rootDir: string): Promise<ResolvedSoul & { issues: SoulValidationIssue[] }> {
  const issues: SoulValidationIssue[] = []
  const config = await loadSoulConfig(rootDir, issues)
  const discovery = discoverSoul(rootDir)

  if (discovery.capabilities.length === 0) {
    issues.push({
      code: 'missing_capability',
      message: 'Soul must define at least one product/capabilities/*/prompt.md file.',
      path: 'product/capabilities',
    })
  }

  for (const target of discovery.mcpTargets) {
    validateNativeMcp(rootDir, target, issues)
  }

  const descriptor = config && issues.length === 0
    ? createDescriptor(config, discovery)
    : fallbackDescriptor()

  try {
    parseSoulDescriptorV1(descriptor)
  }
  catch (error) {
    issues.push({
      code: 'invalid_descriptor',
      message: error instanceof Error ? error.message : 'Generated descriptor is invalid.',
      path: 'dist/soul.descriptor.json',
    })
  }

  return {
    config: config ?? fallbackConfig(),
    descriptor,
    discovery,
    issues,
  }
}

async function loadSoulConfig(rootDir: string, issues: SoulValidationIssue[]): Promise<SoulConfig | null> {
  const configPath = join(rootDir, 'soul.config.ts')
  if (!existsSync(configPath)) {
    issues.push({
      code: 'missing_config',
      message: 'Soul config must exist at soul.config.ts.',
      path: 'soul.config.ts',
    })
    return null
  }

  try {
    const module = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`)
    const config = module.default as SoulConfig | undefined
    if (!config || typeof config !== 'object')
      throw new Error('default export must be a Soul config object')
    if (!config.id || !config.name || !config.version)
      throw new Error('id, name, and version are required')
    return defineSoul(config)
  }
  catch (error) {
    issues.push({
      code: 'invalid_config',
      message: error instanceof Error ? error.message : String(error),
      path: 'soul.config.ts',
    })
    return null
  }
}

function discoverSoul(rootDir: string): SoulDiscovery {
  const capabilities = discoverCapabilities(rootDir)
  const workbench = discoverWorkbench(rootDir)
  const mcpTargets = discoverMcpTargets(rootDir)
  const generatedSections = ['capabilities', 'workbench']

  if (existsSync(join(rootDir, 'engine/workspace')))
    generatedSections.push('engine.workspaceAssets')
  if (existsSync(join(rootDir, 'engine/skills')))
    generatedSections.push('engine.skills')
  if (mcpTargets.length > 0)
    generatedSections.push('engine.mcp')

  return {
    capabilities,
    generatedSections,
    mcpTargets,
    workbench,
  }
}

function discoverCapabilities(rootDir: string): Array<{ id: string, promptPath: string }> {
  const capabilitiesDir = join(rootDir, 'product/capabilities')
  if (!existsSync(capabilitiesDir))
    return []

  return readdirSync(capabilitiesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      id: entry.name,
      promptPath: toPortablePath(relative(rootDir, join(capabilitiesDir, entry.name, 'prompt.md'))),
    }))
    .filter(item => existsSync(join(rootDir, item.promptPath)))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function discoverWorkbench(rootDir: string): SoulDiscovery['workbench'] {
  if (existsSync(join(rootDir, 'web/mounted/index.html'))) {
    return {
      mode: 'custom',
      source: 'web/mounted/index.html',
    }
  }

  if (existsSync(join(rootDir, 'product/workbench/index.tsx'))) {
    return {
      mode: 'custom',
      source: 'product/workbench/index.tsx',
    }
  }

  return {
    mode: 'sdk-common',
    source: 'sdk-common',
  }
}

function discoverMcpTargets(rootDir: string): Array<{ file: string, target: string }> {
  const mcpRoot = join(rootDir, 'engine/mcp')
  if (!existsSync(mcpRoot))
    return []

  const targets: Array<{ file: string, target: string }> = []
  for (const entry of readdirSync(mcpRoot, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue
    const targetDir = join(mcpRoot, entry.name)
    for (const fileName of ['config.toml', '.mcp.json']) {
      const filePath = join(targetDir, fileName)
      if (existsSync(filePath)) {
        targets.push({
          file: toPortablePath(relative(rootDir, filePath)),
          target: entry.name,
        })
      }
    }
  }

  return targets.sort((left, right) => left.target.localeCompare(right.target))
}

function validateNativeMcp(rootDir: string, target: { file: string, target: string }, issues: SoulValidationIssue[]): void {
  const content = readFileSync(join(rootDir, target.file), 'utf8')
  if (target.file.endsWith('.json')) {
    try {
      JSON.parse(content)
    }
    catch {
      issues.push({
        code: 'invalid_mcp_json',
        message: `Native MCP JSON for ${target.target} is invalid.`,
        path: target.file,
      })
    }
    return
  }

  if (target.file.endsWith('.toml') && typeof Bun !== 'undefined' && Bun.TOML) {
    try {
      Bun.TOML.parse(content)
    }
    catch {
      issues.push({
        code: 'invalid_mcp_toml',
        message: `Native MCP TOML for ${target.target} is invalid.`,
        path: target.file,
      })
    }
  }
}

function createDescriptor(config: SoulConfig, discovery: SoulDiscovery): SoulDescriptorV1 {
  const capabilityConfigs = new Map((config.capabilities ?? []).map(item => [item.id, item]))
  const capabilities = discovery.capabilities.map((item) => {
    const configured = capabilityConfigs.get(item.id)
    return {
      id: item.id,
      name: configured?.name ?? titleize(item.id),
      prompt: {
        ref: `dist/${item.promptPath}`,
        type: 'packaged-file',
      },
      ...(configured?.purpose ? { purpose: configured.purpose } : {}),
    }
  })

  return parseSoulDescriptorV1({
    api: config.api ?? null,
    capabilities,
    compatibility: {
      engines: ['codex', 'claude-code'],
      host: '>=1.0.0',
      sdk: '>=1.0.0',
      ...config.compatibility,
    },
    configuration: {
      defaults: {
        engine: 'codex',
      },
      features: {
        engine: true,
        mcp: true,
        skills: true,
        workbench: true,
        workspaceAssets: true,
      },
      scope: 'worker',
      version: '1',
      ...config.configuration,
    },
    engine: {
      ...(discovery.generatedSections.includes('engine.workspaceAssets')
        ? { workspaceAssets: { source: 'dist/engine-assets/workspace' } }
        : {}),
      ...(discovery.generatedSections.includes('engine.skills')
        ? { skills: { source: 'dist/engine-assets/skills' } }
        : {}),
      ...(discovery.mcpTargets.length > 0
        ? {
            mcp: {
              targets: Object.fromEntries(discovery.mcpTargets.map(item => [
                item.target,
                { file: `dist/engine-assets/mcp/${item.target}/${basename(item.file)}` },
              ])),
            },
          }
        : {}),
    },
    extensions: config.extensions ?? {},
    external: config.external ?? {},
    health: config.health ?? {
      ready: true,
      type: 'static',
    },
    identity: {
      appId: config.appId ?? config.id,
      description: config.description,
      name: config.name,
      soulId: config.soulId ?? config.id,
      version: config.version,
    },
    protocol: 'soul/v1',
    workbench: {
      entry: 'dist/web/workbench/index.html',
      mode: config.workbench?.mode ?? discovery.workbench.mode,
      router: {
        mode: 'search',
      },
      type: 'micro-app',
    },
  })
}

function copyCapabilities(rootDir: string, capabilities: SoulDiscovery['capabilities']): void {
  for (const item of capabilities) {
    copyDirectory(
      join(rootDir, 'product/capabilities', item.id),
      join(rootDir, 'dist/product/capabilities', item.id),
    )
  }
}

function writeWorkbench(rootDir: string, workbench: SoulDiscovery['workbench']): void {
  const outputPath = join(rootDir, 'dist/web/workbench/index.html')
  mkdirSync(join(rootDir, 'dist/web/workbench'), { recursive: true })

  if (workbench.source === 'web/mounted/index.html') {
    copyDirectory(join(rootDir, 'web/mounted'), join(rootDir, 'dist/web/workbench'))
    return
  }

  writeFileSync(outputPath, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AIWorker Soul Workbench</title>
</head>
<body>
  <main data-aiworker-common-workbench="true" data-aiworker-bridge-event-refs="engine-invocations,engine-invocation-events">
    <h1>AIWorker Common Workbench</h1>
    <section data-module="worker-configuration-summary">
      <h2>Worker configuration summary</h2>
    </section>
    <section data-module="engine-target-readiness">
      <h2>Engine target readiness</h2>
    </section>
    <section data-module="skills-overlay-summary">
      <h2>Skills overlay summary</h2>
    </section>
    <section data-module="mcp-overlay-summary">
      <h2>MCP overlay summary</h2>
    </section>
    <section data-module="entry-workspace-files-summary">
      <h2>Entry workspace files summary</h2>
    </section>
    <section data-module="session-controls">
      <h2>Session controls</h2>
    </section>
    <section data-module="bridge-event-stream">
      <h2>Bridge event refs</h2>
      <p>engine_invocations / engine invocation events</p>
    </section>
    <section data-module="projection-receipt-status">
      <h2>Projection receipt status</h2>
    </section>
    <section data-module="archive-controls">
      <h2>Archive controls</h2>
    </section>
  </main>
</body>
</html>
`)
}

function copyEngineAssets(rootDir: string, discovery: SoulDiscovery): void {
  if (discovery.generatedSections.includes('engine.workspaceAssets')) {
    copyDirectory(join(rootDir, 'engine/workspace'), join(rootDir, 'dist/engine-assets/workspace'))
  }
  if (discovery.generatedSections.includes('engine.skills')) {
    copyDirectory(join(rootDir, 'engine/skills'), join(rootDir, 'dist/engine-assets/skills'))
  }
  if (discovery.generatedSections.includes('engine.mcp')) {
    copyDirectory(join(rootDir, 'engine/mcp'), join(rootDir, 'dist/engine-assets/mcp'))
  }
}

function copyDirectory(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  cpSync(source, destination, { force: true, recursive: true })
}

function fallbackConfig(): SoulConfig {
  return {
    id: 'invalid',
    name: 'Invalid Soul',
    version: '0.0.0',
  }
}

function fallbackDescriptor(): SoulDescriptorV1 {
  return parseSoulDescriptorV1({
    api: null,
    capabilities: [],
    compatibility: {},
    configuration: {},
    engine: {},
    extensions: {},
    external: {},
    health: {},
    identity: {},
    protocol: 'soul/v1',
    workbench: {
      entry: 'dist/web/workbench/index.html',
      type: 'micro-app',
    },
  })
}

function titleize(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function toPortablePath(path: string): string {
  return path.split('\\').join('/')
}
