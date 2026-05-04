import type {
  BrainBrief,
  BrainBriefDroppedSection,
  BrainBriefRequest,
  BrainBriefSection,
  BrainBriefSectionSource,
  ScopeManifest,
  SoulModule,
  SoulRegistry,
} from '@zonease/aiworker-shared'
import type { BrainAdmissionService } from '../admission'
import type { BrainArtifactRegistry } from '../artifacts'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  brainBriefRequestSchema,
  DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET,
  estimateBrainBriefTokens,
} from '@zonease/aiworker-shared'

/**
 * Brain brief compiler (PLAN-102).
 *
 * Projects canonical brain state (`<brainHome>/AGENT.md`, `SOUL.md`,
 * `MEMORY.md`, `ROLLUP.md`, scope manifest, Soul module, optionally artifact
 * registry + admission service) into a task-specific brief. The brief is a
 * **projection** — orchestrator stays on the existing coarse persona prompt;
 * `aiworker brain brief` is preview-only.
 *
 * Section ids come from `Soul.briefHooks.defaultSections`. Token budget
 * truncation favours `Soul.briefHooks.protectedSections` (e.g. `risk-policy`,
 * `compliance`, `audit-evidence`) — protected sections are forcibly retained
 * even when the budget is tight; non-protected sections are dropped first.
 */

export interface BrainBriefCompilerDeps {
  brainHome: string
  soulRegistry: SoulRegistry
  scopeManifestReader?: () => Promise<ScopeManifest | null>
  artifactRegistry?: BrainArtifactRegistry
  admissionService?: BrainAdmissionService
  estimateTokens?: (text: string) => number
  now?: () => Date
}

const MEMORY_SNAPSHOT_LIMIT = 1200
const ROLLUP_SNAPSHOT_LIMIT = 1200
const SOUL_DOC_LIMIT = 1500

const SOUL_SKELETON_SOURCE_HINTS: Record<string, BrainBriefSectionSource> = {
  'audit-evidence': 'admission-summary',
  'compliance': 'soul-skeleton',
  'design-decisions': 'soul-skeleton',
  'incident-timeline': 'admission-summary',
  'open-tasks': 'soul-skeleton',
  'open-tickets': 'soul-skeleton',
  'recent-changes': 'admission-summary',
  'verification-matrix': 'soul-skeleton',
}

const SOUL_SKELETON_BODIES: Record<string, string> = {
  'audit-evidence': '# Audit evidence\n\n- _Skeleton placeholder._ PLAN-103 will surface applied admissions and confidential-tier artifact summaries here.',
  'compliance': '# Compliance reminders\n\n- 任何录用 / 拒信 / 薪酬变更必须人工确认。\n- 候选人敏感信息默认不在 brief 中外泄；详细数据通过 brain admission flow 调取。',
  'design-decisions': '# Design decisions\n\n- _Skeleton placeholder._ PLAN-103 will project applied design-doc artifacts here.',
  'incident-timeline': '# Incident timeline\n\n- _Skeleton placeholder._ PLAN-103 will project applied runbook / incident-record artifacts here.',
  'open-tasks': '# Open tasks\n\n- _Skeleton placeholder._ PLAN-103 will surface task-card artifacts and pending admissions here.',
  'open-tickets': '# Open tickets\n\n- _Skeleton placeholder._ PLAN-103 will project ticket / escalation-note artifacts here.',
  'recent-changes': '# Recent changes\n\n- _Skeleton placeholder._ PLAN-103 will project recent applied admissions + changelog-entry artifacts here.',
  'verification-matrix': '# Verification matrix\n\n- _Skeleton placeholder._ PLAN-103 will project verification-matrix / regression-report artifacts here.',
}

export class BrainBriefCompiler {
  private readonly estimate: (text: string) => number

  constructor(private readonly deps: BrainBriefCompilerDeps) {
    this.estimate = deps.estimateTokens ?? estimateBrainBriefTokens
  }

  async compile(request: BrainBriefRequest): Promise<BrainBrief> {
    const validated = brainBriefRequestSchema.parse(request)

    const scopeManifest = this.deps.scopeManifestReader
      ? await this.deps.scopeManifestReader()
      : null

    const soulId = validated.soulId
      ?? scopeManifest?.primarySoul
      ?? 'general-assistant'
    const soul = this.deps.soulRegistry.require(soulId)

    const tokensBudget = validated.tokenBudget ?? DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET
    const protectedIds = new Set(soul.briefHooks.protectedSections)
    const candidateIds = soul.briefHooks.defaultSections

    const builtSections: BrainBriefSection[] = []
    const warnings: string[] = []

    for (const id of candidateIds) {
      const built = await this.buildSection(id, { scopeManifest, soul, validated })
      if (built !== null) {
        const tokens = this.estimate(built.body)
        builtSections.push({
          ...built,
          protected: protectedIds.has(id),
          tokens,
        })
      }
    }

    if (validated.artifactRefs && validated.artifactRefs.length > 0) {
      const summary = await this.buildArtifactSummary(validated.artifactRefs)
      if (summary !== null) {
        builtSections.push({
          ...summary,
          protected: false,
          tokens: this.estimate(summary.body),
        })
      }
      else {
        warnings.push('artifact-summary section skipped: no BrainArtifactRegistry wired into the compiler')
      }
    }

    const ordered = candidateIds
      .map(id => builtSections.find(section => section.id === id))
      .filter((section): section is BrainBriefSection => section !== undefined)

    const extras = builtSections.filter(section => !candidateIds.includes(section.id))
    const orderedSections = [...ordered, ...extras]

    const accepted: BrainBriefSection[] = []
    const dropped: BrainBriefDroppedSection[] = []
    let used = 0

    const protectedFirst = [...orderedSections].sort((a, b) => Number(b.protected) - Number(a.protected))

    for (const section of protectedFirst) {
      if (used + section.tokens <= tokensBudget) {
        accepted.push(section)
        used += section.tokens
      }
      else if (section.protected) {
        accepted.push(section)
        used += section.tokens
        warnings.push(`protected section "${section.id}" forced inclusion (token budget overflowed by ${used - tokensBudget})`)
      }
      else {
        dropped.push({
          estimatedTokens: section.tokens,
          id: section.id,
          reason: 'token budget exceeded',
        })
      }
    }

    const acceptedById = new Map(accepted.map(section => [section.id, section]))
    const finalSections: BrainBriefSection[] = []
    for (const section of orderedSections) {
      const includedSection = acceptedById.get(section.id)
      if (includedSection !== undefined)
        finalSections.push(includedSection)
    }

    const compiledAt = (this.deps.now ? this.deps.now() : new Date()).toISOString()
    const scopeId = validated.scopeId ?? scopeManifest?.id

    const brief: BrainBrief = {
      compiledAt,
      droppedSections: dropped,
      sections: finalSections,
      soulId,
      task: validated.task,
      tokensBudget,
      tokensUsed: used,
      warnings,
    }
    if (scopeId !== undefined)
      brief.scopeId = scopeId
    if (validated.executor !== undefined)
      brief.executor = validated.executor
    return brief
  }

  private async buildSection(
    id: string,
    ctx: {
      scopeManifest: ScopeManifest | null
      soul: SoulModule
      validated: BrainBriefRequest
    },
  ): Promise<Omit<BrainBriefSection, 'protected' | 'tokens'> | null> {
    switch (id) {
      case 'agent':
        return this.tryReadFile('AGENT.md', 'agent-doc', id, SOUL_DOC_LIMIT)
      case 'soul':
        return this.tryReadFile('SOUL.md', 'soul-doc', id, SOUL_DOC_LIMIT)
      case 'memory':
        return this.tryReadFile('MEMORY.md', 'memory-doc', id, MEMORY_SNAPSHOT_LIMIT)
      case 'rollup':
        return this.tryReadFile('ROLLUP.md', 'rollup-doc', id, ROLLUP_SNAPSHOT_LIMIT)
      case 'risk-policy':
        return {
          body: synthRiskPolicyMarkdown(ctx.soul, ctx.scopeManifest),
          id,
          source: 'risk-policy',
        }
      default: {
        const skeletonBody = SOUL_SKELETON_BODIES[id]
        if (skeletonBody !== undefined) {
          return {
            body: skeletonBody,
            id,
            source: SOUL_SKELETON_SOURCE_HINTS[id] ?? 'soul-skeleton',
          }
        }
        return null
      }
    }
  }

  private async tryReadFile(
    filename: string,
    source: BrainBriefSectionSource,
    id: string,
    sliceLimit: number,
  ): Promise<Omit<BrainBriefSection, 'protected' | 'tokens'> | null> {
    try {
      const raw = await readFile(path.join(this.deps.brainHome, filename), 'utf8')
      const trimmed = raw.trim()
      if (trimmed.length === 0)
        return null
      const body = trimmed.length > sliceLimit
        ? `${trimmed.slice(0, sliceLimit)}\n\n... (truncated; canonical source at ${filename})`
        : trimmed
      return { body, id, source }
    }
    catch {
      return null
    }
  }

  private async buildArtifactSummary(
    refs: readonly string[],
  ): Promise<Omit<BrainBriefSection, 'protected' | 'tokens'> | null> {
    if (this.deps.artifactRegistry === undefined)
      return null
    const lines: string[] = ['# Referenced artifacts (redacted)']
    let resolvedAny = false
    for (const ref of refs) {
      const artifact = this.deps.artifactRegistry.get(ref)
      if (artifact === null) {
        lines.push(`- ${ref}: not found in brain artifact registry`)
        continue
      }
      resolvedAny = true
      lines.push(`- ${artifact.id} (${artifact.type}, ${artifact.sensitivity}, ${artifact.status}): ${artifact.summary ?? '<no summary>'}`)
    }
    if (!resolvedAny && refs.length > 0)
      lines.push('  _All requested artifacts were missing or unreadable._')
    return {
      body: lines.join('\n'),
      id: 'artifact-summary',
      source: 'artifact-summary',
    }
  }
}

export function createBrainBriefCompiler(deps: BrainBriefCompilerDeps): BrainBriefCompiler {
  return new BrainBriefCompiler(deps)
}

function synthRiskPolicyMarkdown(soul: SoulModule, scopeManifest: ScopeManifest | null): string {
  const lines: string[] = ['# Risk policy & scope guardrails']
  lines.push(`- Soul: ${soul.manifest.id} (${soul.manifest.label})`)
  lines.push(`- Communication style: ${soul.riskPolicy.communicationStyle}`)
  lines.push(`- High-risk approval required: ${soul.riskPolicy.highRiskRequiresApproval}`)
  lines.push(`- Risk notes: ${soul.riskPolicy.riskNotes}`)
  lines.push(`- Out-of-scope strategy: ${soul.riskPolicy.outOfScopeStrategy}`)
  if (scopeManifest !== null) {
    lines.push(`- Scope kind: ${scopeManifest.kind}`)
    if (scopeManifest.privacy !== undefined)
      lines.push(`- Scope privacy: ${scopeManifest.privacy}`)
    if (scopeManifest.approval !== undefined)
      lines.push(`- Scope approval policy: ${scopeManifest.approval}`)
    if (scopeManifest.retention !== undefined)
      lines.push(`- Retention hint: ${scopeManifest.retention}`)
  }
  else {
    lines.push('- Scope manifest: missing (run `aiworker init --soul <id>` or hand-edit `.aiworker/scope.json`)')
  }
  return lines.join('\n')
}
