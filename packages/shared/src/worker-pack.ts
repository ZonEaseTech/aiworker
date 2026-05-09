import { z } from 'zod'

const WORKER_PACK_ID_RE = /^[a-z][a-z0-9-]*$/

export const workerPackIdSchema = z.string().min(1).regex(WORKER_PACK_ID_RE, 'worker pack id must be kebab-case')

export const workerPackTemplateSchema = z.object({
  description: z.string().min(1),
  id: z.string().min(1),
  prompt: z.string().min(1),
  title: z.string().min(1),
})
export type WorkerPackTemplate = z.infer<typeof workerPackTemplateSchema>

export const workerPackSchema = z.object({
  artifactKinds: z.array(z.string().min(1)).min(1).readonly(),
  defaultReviewChecklist: z.array(z.string().min(1)).min(1).readonly(),
  description: z.string().min(1),
  domain: z.string().min(1),
  domainMd: z.string().min(1),
  id: workerPackIdSchema,
  label: z.string().min(1),
  skillMd: z.string().min(1),
  workOrderTemplates: z.array(workerPackTemplateSchema).min(1).readonly(),
}).superRefine((pack, ctx) => {
  if (!pack.skillMd.includes('# ')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'skillMd must contain a markdown heading',
      path: ['skillMd'],
    })
  }
  if (!pack.domainMd.includes('# ')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'domainMd must contain a markdown heading',
      path: ['domainMd'],
    })
  }
})
export type WorkerPack = z.infer<typeof workerPackSchema>

export class WorkerPackRegistry {
  private readonly packs = new Map<string, WorkerPack>()

  register(pack: WorkerPack): void {
    const parsed = workerPackSchema.parse(pack)
    if (this.packs.has(parsed.id))
      throw new Error(`WorkerPackRegistry: duplicate worker pack id "${parsed.id}"`)
    this.packs.set(parsed.id, parsed)
  }

  get(id: string): WorkerPack | undefined {
    return this.packs.get(id)
  }

  require(id: string): WorkerPack {
    const pack = this.get(id)
    if (!pack)
      throw new Error(`WorkerPackRegistry: unknown worker pack id "${id}"`)
    return pack
  }

  list(): readonly WorkerPack[] {
    return Array.from(this.packs.values())
  }

  ids(): readonly string[] {
    return Array.from(this.packs.keys())
  }
}

export function createWorkerPackRegistry(packs: Iterable<WorkerPack> = []): WorkerPackRegistry {
  const registry = new WorkerPackRegistry()
  for (const pack of packs)
    registry.register(pack)
  return registry
}

export const BUILTIN_WORKER_PACKS = [
  {
    artifactKinds: ['patch-plan', 'code-review-report', 'verification-report'],
    defaultReviewChecklist: [
      'Evidence is grounded in repository files and commands.',
      'Risks and verification gaps are explicit.',
      'Recommended next action is concrete and scoped.',
    ],
    description: 'Codebase analysis, implementation planning, and verification reports for software workspaces.',
    domain: 'software-workspace',
    domainMd: `# Developer Domain

## Inputs

- Repository files, diffs, tests, logs, issues, and operator constraints.

## Output Language

- Use concrete file paths, commands, risks, and verification status.
- Separate confirmed evidence from inference.
- Keep scope bounded to the requested workspace unless the operator expands it.
`,
    id: 'developer',
    label: 'Developer',
    skillMd: `# Developer Worker Skill

## Work Loop

1. Read the relevant code, tests, configuration, and docs.
2. State the current behavior and the smallest useful change.
3. Produce a patch plan, implementation, or review report.
4. Verify with focused commands before broad gates.
5. Record artifact paths, evidence, and remaining risks.

## Boundaries

- Do not invent repository conventions before reading them.
- Do not treat project management metadata as the product output.
`,
    workOrderTemplates: [
      {
        description: 'Review a local change for correctness, risks, and missing tests.',
        id: 'review-change',
        prompt: 'Review the current change. Lead with bugs, risks, and missing verification. Include file/line evidence.',
        title: 'Review current change',
      },
      {
        description: 'Plan a scoped implementation from repository evidence.',
        id: 'implementation-plan',
        prompt: 'Investigate the requested implementation and produce a scoped plan with risks and verification commands.',
        title: 'Plan implementation',
      },
    ],
  },
  {
    artifactKinds: ['candidate-screen', 'interview-brief', 'risk-summary'],
    defaultReviewChecklist: [
      'Assessment is tied to role requirements and supplied evidence.',
      'Sensitive candidate data is minimized in summaries.',
      'Unverified assumptions are labeled as follow-up questions.',
    ],
    description: 'Candidate screening, interview preparation, and recruiting evidence summaries.',
    domain: 'hr-recruiting',
    domainMd: `# HR Recruiting Domain

## Inputs

- Job requirements, candidate materials, interview notes, scorecards, and hiring constraints.

## Output Language

- Compare evidence against the role rubric.
- Avoid unsupported claims about the candidate.
- Keep private candidate data out of durable summaries unless explicitly needed.
`,
    id: 'hr-recruiting',
    label: 'HR Recruiting',
    skillMd: `# HR Recruiting Worker Skill

## Work Loop

1. Identify the role, stage, and decision needed.
2. Extract evidence from the supplied candidate materials.
3. Map evidence to strengths, risks, and missing signals.
4. Produce a structured screen, interview brief, or follow-up list.
5. Mark low-confidence judgments for human review.

## Boundaries

- Do not infer protected-class attributes.
- Do not turn screening into an automated final hiring decision.
`,
    workOrderTemplates: [
      {
        description: 'Screen a candidate against a role rubric.',
        id: 'candidate-screen',
        prompt: 'Screen this candidate against the role requirements. Return strengths, risks, missing evidence, and interview follow-ups.',
        title: 'Candidate screen',
      },
    ],
  },
  {
    artifactKinds: ['prd-draft', 'roadmap-brief', 'delivery-risk-report'],
    defaultReviewChecklist: [
      'Problem, user, and success metric are explicit.',
      'Dependencies and delivery risks are separated from product judgment.',
      'Next milestone is actionable.',
    ],
    description: 'Product planning, PRD drafting, roadmap synthesis, and delivery risk review.',
    domain: 'product-delivery',
    domainMd: `# Project Manager Domain

## Inputs

- Goals, stakeholder notes, roadmap constraints, customer evidence, and delivery status.

## Output Language

- Tie scope to measurable outcomes.
- Distinguish decision, risk, dependency, and open question.
- Prefer ordered next steps over broad status summaries.
`,
    id: 'project-manager',
    label: 'Project Manager',
    skillMd: `# Project Manager Worker Skill

## Work Loop

1. Clarify the decision, audience, and time horizon.
2. Extract goals, constraints, dependencies, and open questions.
3. Produce a PRD, roadmap brief, or delivery risk artifact.
4. Highlight tradeoffs and the next operator decision.
5. Keep speculative strategy out of the committed artifact.

## Boundaries

- Do not hide uncertainty behind confident roadmap language.
- Do not turn planning artifacts into executor implementation logic.
`,
    workOrderTemplates: [
      {
        description: 'Draft a concise PRD from goals and evidence.',
        id: 'prd-draft',
        prompt: 'Draft a PRD from the supplied goals and evidence. Include problem, users, scope, non-goals, risks, metrics, and next decisions.',
        title: 'Draft PRD',
      },
    ],
  },
  {
    artifactKinds: ['qa-audit', 'regression-matrix', 'defect-triage'],
    defaultReviewChecklist: [
      'Coverage matches the changed behavior and user-facing risk.',
      'Defects include reproduction evidence.',
      'Residual risk is stated after verification.',
    ],
    description: 'QA audits, regression planning, acceptance checks, and defect triage.',
    domain: 'quality-assurance',
    domainMd: `# QA Reviewer Domain

## Inputs

- Requirements, test runs, bug reports, logs, screenshots, and release criteria.

## Output Language

- Separate observed failure from suspected cause.
- Preserve reproduction steps and environment details.
- Tie coverage recommendations to risk.
`,
    id: 'qa-reviewer',
    label: 'QA Reviewer',
    skillMd: `# QA Reviewer Worker Skill

## Work Loop

1. Identify the release surface and risk areas.
2. Gather existing test evidence and known gaps.
3. Produce a regression matrix, QA audit, or defect triage artifact.
4. Prioritize blockers before polish issues.
5. Close with residual risk and release recommendation.

## Boundaries

- Do not mark unverified behavior as passed.
- Do not expand QA scope without naming the tradeoff.
`,
    workOrderTemplates: [
      {
        description: 'Create a focused regression matrix for a change or release.',
        id: 'regression-matrix',
        prompt: 'Build a regression matrix for this change. Include coverage, risk, test evidence, missing checks, and release recommendation.',
        title: 'Regression matrix',
      },
    ],
  },
] as const satisfies readonly WorkerPack[]

export const BUILTIN_WORKER_PACK_REGISTRY = createWorkerPackRegistry(BUILTIN_WORKER_PACKS)

export function createBuiltinWorkerPackRegistry(): WorkerPackRegistry {
  return createWorkerPackRegistry(BUILTIN_WORKER_PACKS)
}

export function findBuiltinWorkerPack(id: string): WorkerPack | undefined {
  return BUILTIN_WORKER_PACK_REGISTRY.get(id)
}

export function supportedWorkerPackIds(): string {
  return BUILTIN_WORKER_PACK_REGISTRY.ids().join(', ')
}
