import type { SoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSoulDescriptorV1, SOUL_DESCRIPTOR_V1_PROTOCOL } from '@zonease/aiworker-soul-descriptor'

export interface SoulConfig {
  description?: string
  id: string
  name: string
  version?: string
}

export interface SoulDiscovery {
  entryFiles: string[]
  mcpFiles: string[]
  skillDirs: string[]
  workspaceTemplateRoot: string
}

export interface SoulValidationIssue {
  code: string
  message: string
  path: string
}

export interface SoulValidationResult {
  discovery: SoulDiscovery
  issues: SoulValidationIssue[]
  status: 'invalid' | 'valid'
}

export interface SoulBuildResult {
  descriptor: SoulDescriptorV1
  discovery: SoulDiscovery
  outputPath: string
  status: 'built'
}

const SECRET_VALUE_RE = /\b(?:sk-[\w-]{8,}|Bearer\s+[\w.~+/-]{12,}|gh[pousr]_[\w-]{20,}|github_pat_[\w-]{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{20,})\b/g

export function defineSoul(input: SoulConfig): SoulConfig {
  return { ...input }
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
  if (resolved.issues.length)
    throw new Error(resolved.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))

  const outputRoot = path.join(rootDir, 'dist')
  const templateRoot = path.join(outputRoot, 'workspace-template')
  rmSync(outputRoot, { force: true, recursive: true })
  try {
    mkdirSync(templateRoot, { recursive: true })
    copyIfExists(path.join(rootDir, 'engine/workspace'), templateRoot)
    copyIfExists(path.join(rootDir, 'engine/skills'), path.join(templateRoot, 'skills'))
    copyMcpFiles(rootDir, templateRoot)
    assertNoLiteralSecretsInTemplate(templateRoot)

    const outputPath = path.join(outputRoot, 'soul.descriptor.json')
    writeFileSync(outputPath, `${JSON.stringify(resolved.descriptor, null, 2)}\n`)
    return { descriptor: resolved.descriptor, discovery: resolved.discovery, outputPath, status: 'built' }
  }
  catch (error) {
    rmSync(outputRoot, { force: true, recursive: true })
    throw error
  }
}

async function resolveSoul(rootDir: string): Promise<{ config: SoulConfig, descriptor: SoulDescriptorV1, discovery: SoulDiscovery, issues: SoulValidationIssue[] }> {
  const issues: SoulValidationIssue[] = []
  const config = await loadSoulConfig(rootDir, issues)
  const discovery = discoverSoul(rootDir)
  const descriptor = parseSoulDescriptorV1({
    protocol: SOUL_DESCRIPTOR_V1_PROTOCOL,
    identity: {
      ...(config.description ? { description: config.description } : {}),
      id: config.id,
      name: config.name,
      version: config.version ?? '0.0.0',
    },
    workspaceTemplate: {
      entryFiles: discovery.entryFiles,
      mcpFiles: discovery.mcpFiles,
      root: 'dist/workspace-template',
      skillDirs: discovery.skillDirs,
    },
  })
  return { config, descriptor, discovery, issues }
}

async function loadSoulConfig(rootDir: string, issues: SoulValidationIssue[]): Promise<SoulConfig> {
  const configPath = path.join(rootDir, 'soul.config.ts')
  if (!existsSync(configPath)) {
    issues.push({ code: 'missing_config', message: 'Soul config must exist at soul.config.ts.', path: 'soul.config.ts' })
    return { id: 'invalid-soul', name: 'Invalid Soul' }
  }
  try {
    const module = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`)
    const config = module.default as SoulConfig
    if (!config?.id || !config?.name)
      throw new Error('id and name are required')
    return defineSoul(config)
  }
  catch (error) {
    issues.push({ code: 'invalid_config', message: error instanceof Error ? error.message : String(error), path: 'soul.config.ts' })
    return { id: 'invalid-soul', name: 'Invalid Soul' }
  }
}

function discoverSoul(rootDir: string): SoulDiscovery {
  const workspaceRoot = path.join(rootDir, 'engine/workspace')
  const skillsRoot = path.join(rootDir, 'engine/skills')
  const mcpRoot = path.join(rootDir, 'engine/mcp')
  const entryFiles = listRelativeFiles(workspaceRoot).filter(file => ['AGENTS.md', 'CLAUDE.md'].includes(path.posix.basename(file)))
  const skillDirs = existsSync(skillsRoot)
    ? readdirSync(skillsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `skills/${entry.name}`).sort()
    : []
  const mcpFiles = listRelativeFiles(mcpRoot).map(file => `.aiworker-mcp/${file}`).sort()
  return { entryFiles, mcpFiles, skillDirs, workspaceTemplateRoot: 'dist/workspace-template' }
}

function copyMcpFiles(rootDir: string, templateRoot: string): void {
  const mcpRoot = path.join(rootDir, 'engine/mcp')
  if (existsSync(mcpRoot))
    cpSync(mcpRoot, path.join(templateRoot, '.aiworker-mcp'), { recursive: true })
}

function copyIfExists(from: string, to: string): void {
  if (existsSync(from))
    cpSync(from, to, { recursive: true })
}

function listRelativeFiles(root: string): string[] {
  if (!existsSync(root))
    return []
  const out: string[] = []
  const walk = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory())
        walk(path.join(dir, entry.name), rel)
      else if (entry.isFile())
        out.push(rel)
    }
  }
  walk(root)
  return out.sort()
}

function assertNoLiteralSecretsInTemplate(templateRoot: string): void {
  for (const rel of listRelativeFiles(templateRoot)) {
    const content = readFileSync(path.join(templateRoot, rel), 'utf8')
    if (SECRET_VALUE_RE.test(content)) {
      SECRET_VALUE_RE.lastIndex = 0
      throw new Error(`Soul workspace template must not contain literal provider secrets: ${rel}`)
    }
    SECRET_VALUE_RE.lastIndex = 0
  }
}
