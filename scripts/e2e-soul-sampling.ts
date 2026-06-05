import { mkdirSync } from 'node:fs'
import process from 'node:process'

export type FindingKind = 'agents' | 'skill' | 'knowledge-template' | 'platform'

export interface SamplingCase {
  id: string
  prompt: string
  expectedEvidence: string
}

export interface SamplingSkill {
  id: string
  sourcePath: string
  cases: SamplingCase[]
}

export interface SamplingSoul {
  appId: string
  displayName: string
  agentsCases: SamplingCase[]
  skills: SamplingSkill[]
}

export interface ScoreDimension {
  id: string
  label: string
  evidence: string
}

export interface SamplingManifest {
  commit: string
  evidenceRoot: string
  home: string
  runId: string
  totals: {
    minAgentsCasesPerSoul: number
    minSkillCasesPerSkill: number
    skills: number
    souls: number
  }
  souls: SamplingSoul[]
  scoreDimensions: ScoreDimension[]
}

export interface BuildSamplingManifestInput {
  commit: string
  home: string
  runId: string
}

function makeCase(id: string, prompt: string, expectedEvidence: string): SamplingCase {
  return { id, prompt, expectedEvidence }
}

function makeSkill(appId: string, skillId: string, promptName: string): SamplingSkill {
  return {
    id: skillId,
    sourcePath: `souls/${appId}/engine/skills/${skillId}/SKILL.md`,
    cases: [
      makeCase(
        `${skillId}-happy-path`,
        `Use ${promptName} for a standard business request and produce the deliverable.`,
        'skill follows its own workflow and produces a concrete deliverable',
      ),
      makeCase(
        `${skillId}-clarify-boundary`,
        `Use ${promptName} for an incomplete request with boundary risk.`,
        'skill asks targeted clarifying questions and states safe assumptions',
      ),
    ],
  }
}

function makeAgentsCases(appId: string, domain: string): SamplingCase[] {
  return [
    makeCase(
      `${appId}-agents-routing`,
      `For the ${domain} Soul, route the user request to the right workflow and explain why.`,
      'AGENTS instructions route the task to the right skill or base workflow',
    ),
    makeCase(
      `${appId}-agents-assets`,
      `For the ${domain} Soul, list the knowledge, templates, and limits needed to finish the task.`,
      'AGENTS instructions surface assets, boundaries, and self-check points',
    ),
  ]
}

export const SCORE_DIMENSIONS: ScoreDimension[] = [
  {
    id: 'agents-direction',
    label: 'AGENTS direction',
    evidence: 'AGENTS.md gives clear role, routing, and boundary guidance',
  },
  {
    id: 'workflow-routing',
    label: 'Workflow routing',
    evidence: 'The Soul selects the appropriate skill or base workflow',
  },
  {
    id: 'clarification-and-assumptions',
    label: 'Clarification and assumptions',
    evidence: 'The response asks for missing critical inputs or states assumptions',
  },
  {
    id: 'asset-use',
    label: 'Asset use',
    evidence: 'Knowledge, playbooks, and templates are used when relevant',
  },
  {
    id: 'deliverable-completeness',
    label: 'Deliverable completeness',
    evidence: 'The final artifact is usable without hidden follow-up work',
  },
  {
    id: 'domain-depth',
    label: 'Domain depth',
    evidence: 'The answer reflects the Soul domain instead of generic advice',
  },
  {
    id: 'actionability',
    label: 'Actionability',
    evidence: 'The output contains concrete next steps, decisions, or artifacts',
  },
  {
    id: 'boundary-and-compliance',
    label: 'Boundary and compliance',
    evidence: 'The answer respects platform, domain, and safety constraints',
  },
  {
    id: 'self-check',
    label: 'Self-check',
    evidence: 'The response includes an appropriate review or validation pass',
  },
  {
    id: 'language-and-readability',
    label: 'Language and readability',
    evidence: 'The language is clear, concise, and suitable for the target user',
  },
]

export const OFFICIAL_SAMPLING_SOULS: SamplingSoul[] = [
  {
    appId: 'aiworker-freeform',
    displayName: 'AIWorker Freeform',
    agentsCases: makeAgentsCases('aiworker-freeform', 'general AI worker'),
    skills: [
      makeSkill('aiworker-freeform', 'freeform-session', 'freeform session'),
    ],
  },
  {
    appId: 'google-ads',
    displayName: 'Google Ads',
    agentsCases: makeAgentsCases('google-ads', 'local restaurant Google Ads'),
    skills: [
      makeSkill('google-ads', 'local-campaign-setup', 'local campaign setup'),
      makeSkill('google-ads', 'conversion-tracking', 'conversion tracking'),
      makeSkill('google-ads', 'client-onboarding', 'client onboarding'),
      makeSkill('google-ads', 'gbp-optimization', 'Google Business Profile optimization'),
      makeSkill('google-ads', 'ad-copy-local', 'local ad copy'),
      makeSkill('google-ads', 'client-performance-review', 'client performance review'),
    ],
  },
  {
    appId: 'hr-manager',
    displayName: 'HR Manager',
    agentsCases: makeAgentsCases('hr-manager', 'HR management'),
    skills: [
      makeSkill('hr-manager', 'compensation-offer', 'compensation offer'),
      makeSkill('hr-manager', 'onboarding-90day', '90-day onboarding'),
      makeSkill('hr-manager', 'competency-jd', 'competency-based JD'),
      makeSkill('hr-manager', 'structured-interview-kit', 'structured interview kit'),
      makeSkill('hr-manager', 'okr-goal-setting', 'OKR goal setting'),
    ],
  },
  {
    appId: 'product-manager',
    displayName: 'Product Manager',
    agentsCases: makeAgentsCases('product-manager', 'product management'),
    skills: [
      makeSkill('product-manager', 'metrics-framework', 'metrics framework'),
      makeSkill('product-manager', 'prd-writer', 'PRD writing'),
      makeSkill('product-manager', 'experiment-design', 'experiment design'),
      makeSkill('product-manager', 'backlog-prioritization', 'backlog prioritization'),
      makeSkill('product-manager', 'opportunity-assessment', 'opportunity assessment'),
    ],
  },
  {
    appId: 'software-support',
    displayName: 'Software Support',
    agentsCases: makeAgentsCases('software-support', 'software support'),
    skills: [
      makeSkill('software-support', 'ticket-triage', 'ticket triage'),
      makeSkill('software-support', 'troubleshooting-runbook', 'troubleshooting runbook'),
      makeSkill('software-support', 'incident-comms', 'incident communications'),
      makeSkill('software-support', 'kb-article', 'knowledge base article'),
    ],
  },
]

export function classifyFinding(text: string): FindingKind {
  if (/\bAGENTS\.md\b/i.test(text)) {
    return 'agents'
  }

  if (/\bSKILL\.md\b/i.test(text)) {
    return 'skill'
  }

  if (/\b(?:knowledge|playbook|templates?)\b/i.test(text)) {
    return 'knowledge-template'
  }

  if (/\b(?:descriptor|projection|cli|session|engine\s+bridge)\b/i.test(text)) {
    return 'platform'
  }

  return 'platform'
}

export function redactSamplingText(text: string): string {
  return text
    .replace(/\b(token=)\S+/gi, '$1[REDACTED]')
    .replace(/\b(phone=)\+?\d[\d -]{6,}\d/gi, '$1[REDACTED]')
    .replace(/\b(merchantId=)\S+/gi, '$1[REDACTED]')
    .replace(/\bsk-[\w-]+/g, '[REDACTED]')
}

export function buildSamplingManifest(input: BuildSamplingManifestInput): SamplingManifest {
  const skills = OFFICIAL_SAMPLING_SOULS.reduce((count, soul) => count + soul.skills.length, 0)
  const minAgentsCasesPerSoul = Math.min(
    ...OFFICIAL_SAMPLING_SOULS.map(soul => soul.agentsCases.length),
  )
  const minSkillCasesPerSkill = Math.min(
    ...OFFICIAL_SAMPLING_SOULS.flatMap(soul => soul.skills.map(skill => skill.cases.length)),
  )

  return {
    commit: input.commit,
    evidenceRoot: `tmp/e2e-soul-sampling/${input.runId}`,
    home: input.home,
    runId: input.runId,
    totals: {
      minAgentsCasesPerSoul,
      minSkillCasesPerSkill,
      skills,
      souls: OFFICIAL_SAMPLING_SOULS.length,
    },
    souls: OFFICIAL_SAMPLING_SOULS,
    scoreDimensions: SCORE_DIMENSIONS,
  }
}

export async function writeDryRunEvidence(manifest: SamplingManifest): Promise<{ manifestPath: string }> {
  mkdirSync(manifest.evidenceRoot, { recursive: true })

  const manifestPath = `${manifest.evidenceRoot}/manifest.json`
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return { manifestPath }
}

function defaultRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function currentCommit(): string {
  const result = Bun.spawnSync(['git', 'rev-parse', '--short=12', 'HEAD'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (!result.success) {
    return 'unknown'
  }

  return result.stdout.toString().trim() || 'unknown'
}

async function main(): Promise<void> {
  const command = process.argv[2]

  if (command !== 'dry-run' && command !== 'run') {
    console.error('Usage: bun scripts/e2e-soul-sampling.ts <dry-run|run>')
    process.exitCode = 1
    return
  }

  const runId = process.env.AIWORKER_E2E_RUN_ID ?? defaultRunId()
  const manifest = buildSamplingManifest({
    commit: process.env.AIWORKER_E2E_COMMIT ?? currentCommit(),
    home: process.env.AIWORKER_E2E_HOME ?? `tmp/e2e-soul-sampling-home/${runId}`,
    runId,
  })
  const evidence = await writeDryRunEvidence(manifest)

  console.log(JSON.stringify({
    command,
    dryRun: true,
    evidenceRoot: manifest.evidenceRoot,
    manifestPath: evidence.manifestPath,
    manifest,
  }, null, 2))
}

if (import.meta.main) {
  await main()
}
