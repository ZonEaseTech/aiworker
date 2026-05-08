import type { BrainMemory, BrainProvider, BrainSkill, BrainSkillBody, ChatMessage, WorkerConfig } from '@zonease/aiworker-shared'

import { readFile } from 'node:fs/promises'

import {
  resolveMemoryIndexPath,
  resolveRollupMdPath,
  resolveSoulMdPath,
  resolveUserMdPath,
} from '@zonease/aiworker-fs-layout'
import { stripMarkdownFrontmatter } from '@zonease/aiworker-shared'

import {
  assembleTokenBudgetContext,
  resolveContextBudget,
} from './context'

export const DEFAULT_SYSTEM_PROMPT_SKILL_LIMIT = 10
const SYSTEM_PROMPT_FILE_MAX_CHARS = 6_000
const SYSTEM_PROMPT_MEMORY_LIMIT = 5
const SYSTEM_PROMPT_MEMORY_MAX_CHARS = 3_000
const SYSTEM_PROMPT_SKILL_BODY_MAX_CHARS = 6_000

export interface ProjectPersonaDocs {
  memory: string | null
  rollup: string | null
  soul: string | null
  user: string | null
}

export interface SystemPromptResult {
  availableSkills: BrainSkill[]
  persona: ProjectPersonaDocs
  promptSkillLimit: number
  promptSkills: BrainSkill[]
  systemPrompt: string
}

export interface LoadedBrainSkillBody {
  body: string
  description: string
  id: string
  name: string
  truncated: boolean
  version: string
}

export interface BrainSkillLoadError {
  id: string
  reason: string
}

export interface BrainSkillBodyLoadResult {
  errors: BrainSkillLoadError[]
  loaded: LoadedBrainSkillBody[]
}

export interface LoadedBrainMemory {
  content: string
  id: string
  score: number | null
  title: string
  truncated: boolean
  updatedAt: string
}

export interface BrainMemorySearchError {
  query: string
  reason: string
}

export interface BrainMemorySearchResult {
  errors: BrainMemorySearchError[]
  loaded: LoadedBrainMemory[]
}

export class ContextManager {
  constructor(private readonly deps: {
    brain: BrainProvider
    workerId: string
  }) {}

  async buildSystemPrompt(input: {
    includeBrainSkills?: boolean
    priorSummary: string | null
    skillLimit?: number
  }): Promise<SystemPromptResult> {
    const includeBrainSkills = input.includeBrainSkills ?? true
    const skillLimit = input.skillLimit ?? DEFAULT_SYSTEM_PROMPT_SKILL_LIMIT
    const [skills, persona] = await Promise.all([
      includeBrainSkills ? this.deps.brain.listSkills().catch(() => []) : Promise.resolve([]),
      this.loadProjectPersonaDocs(),
    ])
    const promptSkills = skills.slice(0, skillLimit)
    const lines = [
      `You are worker ${this.deps.workerId}.`,
      'Respond concisely and helpfully.',
    ]
    appendSystemPromptSection(lines, 'Project soul / voice', persona.soul)
    appendSystemPromptSection(lines, 'Project user profile', persona.user)
    appendSystemPromptSection(lines, 'Project memory index', persona.memory)
    appendSystemPromptSection(lines, 'Project continuity rollup', persona.rollup)
    if (input.priorSummary && input.priorSummary.trim().length > 0)
      lines.push(`Conversation summary so far: ${input.priorSummary.trim()}`)
    if (promptSkills.length > 0) {
      lines.push('Available brain skills:')
      for (const s of promptSkills)
        lines.push(`- ${s.name}: ${s.description}`)
    }
    return {
      availableSkills: skills,
      persona,
      promptSkillLimit: skillLimit,
      promptSkills,
      systemPrompt: lines.join('\n'),
    }
  }

  async loadSkillBodies(input: {
    skillIds: string[]
  }): Promise<BrainSkillBodyLoadResult> {
    const ids = unique(input.skillIds).slice(0, DEFAULT_SYSTEM_PROMPT_SKILL_LIMIT)
    if (ids.length === 0)
      return { errors: [], loaded: [] }

    if (!this.deps.brain.loadSkill) {
      return {
        errors: ids.map(id => ({ id, reason: 'brain-provider-load-skill-unavailable' })),
        loaded: [],
      }
    }

    const loaded: LoadedBrainSkillBody[] = []
    const errors: BrainSkillLoadError[] = []
    for (const id of ids) {
      try {
        const skill = await this.deps.brain.loadSkill(id)
        if (skill === null) {
          errors.push({ id, reason: 'skill-not-found' })
          continue
        }
        loaded.push(toLoadedBrainSkillBody(skill))
      }
      catch (err) {
        errors.push({ id, reason: err instanceof Error ? err.message : String(err) })
      }
    }
    return { errors, loaded }
  }

  async searchMemories(input: {
    query: string
  }): Promise<BrainMemorySearchResult> {
    const query = input.query.trim()
    if (query.length === 0)
      return { errors: [], loaded: [] }

    try {
      const memories = await this.deps.brain.searchMemories(query)
      return {
        errors: [],
        loaded: uniqueById(memories)
          .slice(0, SYSTEM_PROMPT_MEMORY_LIMIT)
          .map(toLoadedBrainMemory)
          .filter(memory => memory.content.length > 0),
      }
    }
    catch (err) {
      return {
        errors: [{ query, reason: err instanceof Error ? err.message : String(err) }],
        loaded: [],
      }
    }
  }

  private async loadProjectPersonaDocs(): Promise<ProjectPersonaDocs> {
    const workerId = this.deps.workerId
    const [soul, user, memory, rollup] = await Promise.all([
      readPromptFile(resolveSoulMdPath(workerId)),
      readPromptFile(resolveUserMdPath(workerId)),
      readPromptFile(resolveMemoryIndexPath(workerId)),
      readPromptFile(resolveRollupMdPath(workerId)),
    ])
    return { memory, rollup, soul, user }
  }
}

export function appendLoadedBrainMemories(systemPrompt: string, loaded: LoadedBrainMemory[]): string {
  if (loaded.length === 0)
    return systemPrompt
  const lines = [
    systemPrompt,
    'Loaded brain memories:',
    'These are Project Brain memory snippets loaded for this turn. They are not executor-native tools or plugins.',
  ]
  for (const memory of loaded) {
    const score = memory.score === null ? '' : `, score=${memory.score}`
    lines.push(`### ${memory.title} (${memory.id}${score}, updated=${memory.updatedAt})`)
    lines.push(memory.content)
    if (memory.truncated)
      lines.push('... truncated ...')
  }
  return lines.join('\n')
}

export function appendLoadedBrainSkillBodies(systemPrompt: string, loaded: LoadedBrainSkillBody[]): string {
  if (loaded.length === 0)
    return systemPrompt
  const lines = [
    systemPrompt,
    'Loaded brain skill bodies:',
    'These are Project Brain instructions loaded for this turn. They are not executor-native tools or plugins.',
  ]
  for (const skill of loaded) {
    lines.push(`### ${skill.name} (${skill.id}, v${skill.version})`)
    lines.push(skill.body)
    if (skill.truncated)
      lines.push('... truncated ...')
  }
  return lines.join('\n')
}

export class RunContextComposer {
  constructor(private readonly deps: {
    config: WorkerConfig
    loadBudgetHistory: (conversationId: string, maxHistoryMessages: number | undefined) => Promise<ChatMessage[]>
    loadHistoryWindow: (conversationId: string) => Promise<ChatMessage[]>
  }) {}

  async compose(input: {
    conversationId: string
    systemPrompt: string
  }): Promise<ChatMessage[]> {
    const systemMessage: ChatMessage = { role: 'system', content: input.systemPrompt }
    const budget = resolveContextBudget(this.deps.config.orchestrator, this.deps.config.executor)
    if (!budget) {
      const history = await this.deps.loadHistoryWindow(input.conversationId)
      return [systemMessage, ...history]
    }

    const historyNewestFirst = await this.deps.loadBudgetHistory(input.conversationId, budget.maxHistoryMessages)
    return assembleTokenBudgetContext({
      systemMessage,
      historyNewestFirst,
      budget,
    }).messages
  }
}

async function readPromptFile(filePath: string): Promise<string | null> {
  try {
    const content = stripMarkdownFrontmatter(await readFile(filePath, 'utf8'))
    if (content.length === 0)
      return null
    return content.length <= SYSTEM_PROMPT_FILE_MAX_CHARS
      ? content
      : `${content.slice(0, SYSTEM_PROMPT_FILE_MAX_CHARS)}\n... truncated ...`
  }
  catch {
    return null
  }
}

function toLoadedBrainSkillBody(skill: BrainSkillBody): LoadedBrainSkillBody {
  const trimmed = skill.body.trim()
  const truncated = trimmed.length > SYSTEM_PROMPT_SKILL_BODY_MAX_CHARS
  return {
    body: truncated ? trimmed.slice(0, SYSTEM_PROMPT_SKILL_BODY_MAX_CHARS) : trimmed,
    description: skill.description,
    id: skill.id,
    name: skill.name,
    truncated,
    version: skill.version,
  }
}

function toLoadedBrainMemory(memory: BrainMemory): LoadedBrainMemory {
  const trimmed = memory.content.trim()
  const truncated = trimmed.length > SYSTEM_PROMPT_MEMORY_MAX_CHARS
  const title = typeof memory.metadata.title === 'string' && memory.metadata.title.trim().length > 0
    ? memory.metadata.title.trim()
    : memory.id
  return {
    content: truncated ? trimmed.slice(0, SYSTEM_PROMPT_MEMORY_MAX_CHARS) : trimmed,
    id: memory.id,
    score: typeof memory.score === 'number' && Number.isFinite(memory.score) ? memory.score : null,
    title,
    truncated,
    updatedAt: memory.updatedAt,
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(value => value.trim().length > 0)))
}

function uniqueById(memories: BrainMemory[]): BrainMemory[] {
  const seen = new Set<string>()
  const uniqueMemories: BrainMemory[] = []
  for (const memory of memories) {
    if (seen.has(memory.id))
      continue
    seen.add(memory.id)
    uniqueMemories.push(memory)
  }
  return uniqueMemories
}

function appendSystemPromptSection(lines: string[], title: string, content: string | null): void {
  if (content && content.trim().length > 0)
    lines.push(`${title}:\n${content.trim()}`)
}
