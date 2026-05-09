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

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  brainBriefRequestSchema,
  DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET,
  estimateBrainBriefTokens,
  stripMarkdownFrontmatter,
} from '@zonease/aiworker-shared'

/**
 * Brain brief compiler (PLAN-102).
 *
 * Projects canonical brain state (`<brainHome>/SOUL.md`,
 * `MEMORY.md`, `ROLLUP.md`, scope manifest, Soul module, optionally artifact
 * registry + admission service) into a task-specific brief. The brief is a
 * **projection** — orchestrator stays on the existing coarse persona prompt;
 * Preview-only compiler for inspected run context.
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
/** BUG-060: per-file body cap when injecting task-matched memory bodies. */
const MEMORY_BODY_LIMIT_PER_FILE = 800
/** BUG-060: max memory body files injected per brief. */
const MEMORY_BODY_MAX_FILES = 4
/** BUG-060: minimum task-text length before attempting body retrieval. */
const MEMORY_BODY_MIN_TASK_LEN = 4

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

    // BUG-062: defense-in-depth — even if cac / a downstream caller forwards
    // `[undefined]` or whitespace-only entries, only proceed when at least
    // one ref is a non-empty string. Mirrors the CLI normalize pass so any
    // future entry point that bypasses the CLI still cannot produce the
    // literal "undefined: not found" artifact-summary line.
    const cleanRefs = (validated.artifactRefs ?? []).filter(
      (ref): ref is string => typeof ref === 'string' && ref.trim().length > 0,
    ).map(ref => ref.trim())
    if (cleanRefs.length > 0) {
      const summary = await this.buildArtifactSummary(cleanRefs)
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
      case 'soul':
        return this.tryReadFile('SOUL.md', 'soul-doc', id, SOUL_DOC_LIMIT)
      case 'memory':
        return this.buildMemorySection(id, ctx)
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
      const trimmed = stripMarkdownFrontmatter(raw)
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

  /**
   * BUG-060: brain memory recall fix.
   *
   * Old behaviour injected only `MEMORY.md` (the index). The LLM saw filenames
   * but never their content, so any "what does the project remember about X"
   * prompt confidently answered "no record". Compose a single `memory`
   * section combining: (1) the MEMORY.md index snapshot (existing), (2) up to
   * `MEMORY_BODY_MAX_FILES` task-matched body files from `<brainHome>/memories/`,
   * each truncated to `MEMORY_BODY_LIMIT_PER_FILE`. Matching is conservative:
   * lowercase keyword overlap between the user task and either the memory
   * file basename or the human title surfaced from the MEMORY.md index row.
   * No content-based search — that is left for a follow-up retrieval plan.
   */
  private async buildMemorySection(
    id: string,
    ctx: { validated: BrainBriefRequest },
  ): Promise<Omit<BrainBriefSection, 'protected' | 'tokens'> | null> {
    const indexSection = await this.tryReadFile('MEMORY.md', 'memory-doc', id, MEMORY_SNAPSHOT_LIMIT)
    const indexBody = indexSection?.body
    const memoriesDir = path.join(this.deps.brainHome, 'memories')
    const files = await this.listMemoryFiles(memoriesDir)
    const task = ctx.validated.task.trim()
    if (files.length === 0 || task.length < MEMORY_BODY_MIN_TASK_LEN) {
      // Either no memory bodies on disk, or task too short to risk a noisy
      // recall — fall back to the index-only behaviour.
      return indexSection ?? (files.length > 0
        ? { body: this.formatMemoryBodySection([], files), id, source: 'memory-doc' }
        : null)
    }
    const indexRows = parseMemoryIndexRows(indexBody ?? '')
    const matched = scoreMemoryMatches({ files, indexRows, task })
    const top = matched.slice(0, MEMORY_BODY_MAX_FILES)
    const bodies: { name: string, body: string }[] = []
    for (const candidate of top) {
      try {
        const raw = await readFile(path.join(memoriesDir, candidate.file), 'utf8')
        const trimmed = raw.trim()
        if (trimmed.length === 0)
          continue
        const sliced = trimmed.length > MEMORY_BODY_LIMIT_PER_FILE
          ? `${trimmed.slice(0, MEMORY_BODY_LIMIT_PER_FILE)}\n\n... (truncated; canonical source at memories/${candidate.file})`
          : trimmed
        bodies.push({ name: candidate.file, body: sliced })
      }
      catch {
        // Best-effort: a missing file simply gets dropped from the recall.
      }
    }
    const composed = this.formatMemorySectionWithBodies({ indexBody, bodies })
    if (composed === null && indexSection !== null)
      return indexSection
    if (composed === null)
      return null
    return { body: composed, id, source: 'memory-doc' }
  }

  private formatMemorySectionWithBodies(input: { indexBody: string | undefined, bodies: { name: string, body: string }[] }): string | null {
    const lines: string[] = []
    if (input.indexBody !== undefined && input.indexBody.length > 0)
      lines.push(input.indexBody)
    if (input.bodies.length > 0) {
      if (lines.length > 0)
        lines.push('')
      lines.push('# Memory body (task-matched)')
      for (const entry of input.bodies) {
        lines.push('')
        lines.push(`## memories/${entry.name}`)
        lines.push(entry.body)
      }
    }
    if (lines.length === 0)
      return null
    return lines.join('\n')
  }

  private formatMemoryBodySection(bodies: { name: string, body: string }[], files: readonly string[]): string {
    if (bodies.length === 0)
      return `# Memory body (task-matched)\n\n_No memory bodies matched. Available: ${files.length}._`
    return ''
  }

  private async listMemoryFiles(memoriesDir: string): Promise<string[]> {
    try {
      const entries = await readdir(memoriesDir)
      return entries.filter(name => name.endsWith('.md')).sort()
    }
    catch {
      return []
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

interface MemoryIndexRow {
  file: string
  title: string
}

/**
 * BUG-060: extract `<file, title>` pairs from MEMORY.md `- [Title](file.md) — note`
 * lines. Tolerant of trailing commentary and missing notes.
 */
export function parseMemoryIndexRows(indexBody: string): MemoryIndexRow[] {
  const rows: MemoryIndexRow[] = []
  const RE = /^\s*[-*]\s*\[([^\]]+)\]\(([^)]+\.md)\)/gm
  let match: RegExpExecArray | null = RE.exec(indexBody)
  while (match !== null) {
    const title = match[1]?.trim() ?? ''
    const file = match[2]?.trim() ?? ''
    if (file.length > 0)
      rows.push({ title, file: path.basename(file) })
    match = RE.exec(indexBody)
  }
  return rows
}

interface MemoryMatchCandidate {
  file: string
  score: number
}

/**
 * BUG-060: lowercase keyword overlap between task text and memory file
 * basename / index title. Conservative: filename match weight 2, title match
 * weight 3. Returns sorted descending; files with score 0 are excluded.
 */
export function scoreMemoryMatches(input: {
  files: readonly string[]
  indexRows: readonly MemoryIndexRow[]
  task: string
}): MemoryMatchCandidate[] {
  const taskTokens = tokenize(input.task)
  if (taskTokens.size === 0)
    return []
  const titleByFile = new Map<string, string>()
  for (const row of input.indexRows)
    titleByFile.set(row.file, row.title)
  const scored: MemoryMatchCandidate[] = []
  for (const file of input.files) {
    const baseTokens = tokenize(file.replace(/\.md$/i, ''))
    const titleTokens = tokenize(titleByFile.get(file) ?? '')
    const baseHits = countOverlap(taskTokens, baseTokens)
    const titleHits = countOverlap(taskTokens, titleTokens)
    const score = baseHits * 2 + titleHits * 3
    if (score > 0)
      scored.push({ file, score })
  }
  return scored.sort((a, b) => b.score - a.score)
}

function tokenize(text: string): Set<string> {
  if (text.trim().length === 0)
    return new Set()
  // Treat any non-alphanumeric / non-CJK character as a separator. Drop tokens
  // shorter than 2 chars to filter out noise like single letters / digits.
  // CJK chars survive since `[^\p{L}\p{N}]` is U-flag aware.
  const normalized = text.toLowerCase().normalize('NFKC')
  const parts = normalized.split(/[^\p{L}\p{N}]+/u)
  const STOPWORDS = new Set([
    'the',
    'and',
    'for',
    'with',
    'a',
    'an',
    'of',
    'to',
    'in',
    'on',
    'is',
    'are',
    'or',
    'how',
    'what',
    'why',
    'when',
    'where',
    '的',
    '了',
    '是',
    '吗',
    '呢',
    '我',
    '你',
    '他',
    '她',
    '它',
    '们',
    '请',
  ])
  const out = new Set<string>()
  for (const part of parts) {
    if (part.length < 2)
      continue
    if (STOPWORDS.has(part))
      continue
    out.add(part)
  }
  return out
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of b) {
    if (a.has(t))
      n += 1
  }
  return n
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
