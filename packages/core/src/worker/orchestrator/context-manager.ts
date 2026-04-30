import type { BrainProvider, BrainSkill, ChatMessage, WorkerConfig } from '@zonease/aiworker-shared'

import { readFile } from 'node:fs/promises'
import {
  resolveAgentMdPath,
  resolveMemoryIndexPath,
  resolveRollupMdPath,
  resolveSoulMdPath,
  resolveUserMdPath,
} from '@zonease/aiworker-fs-layout'

import {
  assembleTokenBudgetContext,
  resolveContextBudget,
} from './context'

export const DEFAULT_SYSTEM_PROMPT_SKILL_LIMIT = 10
const SYSTEM_PROMPT_FILE_MAX_CHARS = 6_000

export interface ProjectPersonaDocs {
  agent: string | null
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

export class ContextManager {
  constructor(private readonly deps: {
    brain: BrainProvider
    workerId: string
  }) {}

  async buildSystemPrompt(input: {
    priorSummary: string | null
    skillLimit?: number
  }): Promise<SystemPromptResult> {
    const skillLimit = input.skillLimit ?? DEFAULT_SYSTEM_PROMPT_SKILL_LIMIT
    const [skills, persona] = await Promise.all([
      this.deps.brain.listSkills().catch(() => []),
      this.loadProjectPersonaDocs(),
    ])
    const promptSkills = skills.slice(0, skillLimit)
    const lines = [
      `You are worker ${this.deps.workerId}.`,
      'Respond concisely and helpfully.',
    ]
    appendSystemPromptSection(lines, 'Project agent instructions', persona.agent)
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

  private async loadProjectPersonaDocs(): Promise<ProjectPersonaDocs> {
    const workerId = this.deps.workerId
    const [agent, soul, user, memory, rollup] = await Promise.all([
      readPromptFile(resolveAgentMdPath(workerId)),
      readPromptFile(resolveSoulMdPath(workerId)),
      readPromptFile(resolveUserMdPath(workerId)),
      readPromptFile(resolveMemoryIndexPath(workerId)),
      readPromptFile(resolveRollupMdPath(workerId)),
    ])
    return { agent, memory, rollup, soul, user }
  }
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
    const content = (await readFile(filePath, 'utf8')).trim()
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

function appendSystemPromptSection(lines: string[], title: string, content: string | null): void {
  if (content && content.trim().length > 0)
    lines.push(`${title}:\n${content.trim()}`)
}
