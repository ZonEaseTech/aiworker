import type { BrainSkill } from '@zonease/aiworker-shared'
import type { CapabilitySkillDescriptor, RequiredContext, WorkerIntent } from './decisions'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveMcpJsonPath, resolveWorkerHome } from '@zonease/aiworker-fs-layout'

export interface BuiltinCapabilityDescriptor {
  description: string
  name: 'load_skill' | 'memory_search'
}

export interface McpToolDescriptor {
  description: string
  name: string
  server: string
}

export interface CapabilityRegistrySnapshot {
  builtins: BuiltinCapabilityDescriptor[]
  mcpTools: McpToolDescriptor[]
  skills: CapabilitySkillDescriptor[]
  toolsets: string[]
}

export interface CapabilityPlan {
  availableBuiltinCount: number
  availableMcpToolCount: number
  availableSkillCount: number
  availableToolsets: string[]
  deniedCapabilities: string[]
  reason: string
  selectedBuiltins: string[]
  selectedMcpTools: string[]
  selectedSkills: CapabilitySkillDescriptor[]
}

const DEFAULT_BUILTINS: BuiltinCapabilityDescriptor[] = [
  {
    name: 'load_skill',
    description: 'Load the full body of a selected skill on demand.',
  },
  {
    name: 'memory_search',
    description: 'Search long-term worker memory on demand.',
  },
]

export class CapabilityRegistry {
  constructor(private readonly deps: {
    workerId: string
  }) {}

  async snapshot(input: {
    skills: BrainSkill[]
  }): Promise<CapabilityRegistrySnapshot> {
    const [mcpTools, toolsets] = await Promise.all([
      readMcpTools(this.deps.workerId),
      readToolsets(this.deps.workerId),
    ])
    return {
      builtins: DEFAULT_BUILTINS,
      mcpTools,
      skills: input.skills.map(skill => ({
        description: skill.description,
        id: skill.id,
        name: skill.name,
        ...(skill.tags === undefined ? {} : { tags: skill.tags }),
        version: skill.version,
      })),
      toolsets,
    }
  }
}

export function planCapabilities(input: {
  intent: WorkerIntent
  promptSkillLimit: number
  registry: CapabilityRegistrySnapshot
  requiredContext: RequiredContext[]
}): CapabilityPlan {
  const required = new Set(input.requiredContext)
  const selectedBuiltins = input.registry.builtins
    .filter(capability => capability.name === 'load_skill'
      ? required.has('skill_load')
      : required.has('memory_search'))
    .map(capability => capability.name)
  const selectedMcpTools = required.has('mcp_tools')
    ? input.registry.mcpTools.map(tool => tool.name)
    : []
  const selectedSkills = selectSkills(input.registry.skills, input.intent, input.promptSkillLimit)
  return {
    availableBuiltinCount: input.registry.builtins.length,
    availableMcpToolCount: input.registry.mcpTools.length,
    availableSkillCount: input.registry.skills.length,
    availableToolsets: input.registry.toolsets,
    deniedCapabilities: [],
    reason: 'S2 observe-only capability registry; selections are recorded but not enforced.',
    selectedBuiltins,
    selectedMcpTools,
    selectedSkills,
  }
}

function selectSkills(skills: CapabilitySkillDescriptor[], intent: WorkerIntent, limit: number): CapabilitySkillDescriptor[] {
  if (intent === 'unknown' || intent === 'answer')
    return skills.slice(0, limit)
  const lowerIntent = intent.replace(/_/g, '-')
  const ranked = [...skills].sort((a, b) => skillScore(b, lowerIntent) - skillScore(a, lowerIntent))
  return ranked.slice(0, limit)
}

function skillScore(skill: CapabilitySkillDescriptor, lowerIntent: string): number {
  const haystack = [
    skill.name,
    skill.description,
    ...(skill.tags ?? []),
  ].join(' ').toLowerCase()
  if (haystack.includes(lowerIntent))
    return 2
  const intentTokens = lowerIntent.split('-')
  return intentTokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

async function readMcpTools(workerId: string): Promise<McpToolDescriptor[]> {
  const parsed = await readJsonObject(resolveMcpJsonPath(workerId))
  if (!parsed)
    return []
  const servers = recordValue(parsed.servers)
  if (!servers)
    return []

  const tools: McpToolDescriptor[] = []
  for (const [serverName, serverConfig] of Object.entries(servers)) {
    const config = recordValue(serverConfig)
    if (!config)
      continue
    const declaredTools = Array.isArray(config.tools) ? config.tools : []
    if (declaredTools.length === 0) {
      tools.push({
        description: stringValue(config.description) ?? `MCP server ${serverName}`,
        name: `mcp:${serverName}`,
        server: serverName,
      })
      continue
    }
    for (const item of declaredTools) {
      const tool = recordValue(item)
      if (!tool)
        continue
      const name = stringValue(tool.name)
      if (!name)
        continue
      tools.push({
        description: stringValue(tool.description) ?? `MCP tool ${name} from ${serverName}`,
        name,
        server: serverName,
      })
    }
  }
  return tools
}

async function readToolsets(workerId: string): Promise<string[]> {
  const parsed = await readJsonObject(path.join(resolveWorkerHome(workerId), 'toolsets.json'))
  if (!parsed)
    return []
  const defaults = Array.isArray(parsed.defaultToolsets) ? parsed.defaultToolsets : []
  return defaults.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    return recordValue(parsed)
  }
  catch {
    return null
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
