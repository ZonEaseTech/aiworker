import type { SoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import { SECRET_FORMAT_ALTERNATION } from '@zonease/aiworker-engine-bridge'

const SECRET_ASSIGNMENT_RE = /(["']?[\w-]*(?:api[_-]?key|authorization|password|secret|token)[\w-]*["']?\s*[:=]\s*["']?)([^"'\s]+)/gi
// Value-format alternation (PEM/JWT/ghp_/gho_/github_pat_/AKIA/AIza) sourced from
// the shared engine-bridge constant. Bearer/sk- bare tokens appended for diagnostic
// redaction coverage. Used with .replace() so 'gi' flags are correct.
const SECRET_VALUE_RE = new RegExp(`${SECRET_FORMAT_ALTERNATION}|\\b(?:Bearer\\s+[\\w.~+/-]{12,}|sk-[\\w-]{8,})\\b`, 'gi')

export type SoulBuildStatus = 'built' | 'failed'
export type SoulValidationStatus = 'invalid' | 'valid'

export interface SoulConfig {
  description?: string
  id: string
  name: string
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
  generatedSections: string[]
  mcpTargets: Array<{ file: string, target: string }>
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
  return { ...input }
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
      message: redactDiagnosticMessage(error instanceof Error ? error.message : 'Generated descriptor is invalid.'),
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
    if (!config.id || !config.name)
      throw new Error('id and name are required')
    return defineSoul(config)
  }
  catch (error) {
    issues.push({
      code: 'invalid_config',
      message: redactDiagnosticMessage(error instanceof Error ? error.message : String(error)),
      path: 'soul.config.ts',
    })
    return null
  }
}

function discoverSoul(rootDir: string): SoulDiscovery {
  const mcpTargets = discoverMcpTargets(rootDir)
  const generatedSections: string[] = []

  if (existsSync(join(rootDir, 'engine/workspace')))
    generatedSections.push('engine.workspaceAssets')
  if (existsSync(join(rootDir, 'engine/skills')))
    generatedSections.push('engine.skills')
  if (mcpTargets.length > 0)
    generatedSections.push('engine.mcp')

  return {
    generatedSections,
    mcpTargets,
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

function redactDiagnosticMessage(message: string): string {
  return message
    .replace(SECRET_ASSIGNMENT_RE, '$1[REDACTED]')
    .replace(SECRET_VALUE_RE, '[REDACTED]')
}

function createDescriptor(config: SoulConfig, discovery: SoulDiscovery): SoulDescriptorV1 {
  return parseSoulDescriptorV1({
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
    identity: {
      description: config.description,
      id: config.id,
      name: config.name,
    },
    protocol: 'soul/v1',
  })
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
  }
}

function fallbackDescriptor(): SoulDescriptorV1 {
  return parseSoulDescriptorV1({
    engine: {},
    identity: {},
    protocol: 'soul/v1',
  })
}

function toPortablePath(path: string): string {
  return path.split('\\').join('/')
}
