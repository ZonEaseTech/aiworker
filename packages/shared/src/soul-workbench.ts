import { z } from 'zod'

export const soulWorkbenchFallbackSchema = z.enum(['generic-worker-studio'])
export type SoulWorkbenchFallback = z.infer<typeof soulWorkbenchFallbackSchema>

export const soulWorkbenchObjectSchema = z.object({
  description: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
})
export type SoulWorkbenchObject = z.infer<typeof soulWorkbenchObjectSchema>

export const soulWorkbenchViewSchema = z.object({
  description: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
  region: z.enum(['rail', 'main', 'tray', 'review']),
})
export type SoulWorkbenchView = z.infer<typeof soulWorkbenchViewSchema>

export const soulWorkbenchActionSchema = z.object({
  description: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
  outputKind: z.string().min(1),
  prompt: z.string().min(1),
  scope: z.enum(['person', 'role', 'candidate', 'employee', 'alumni', 'pool', 'interview', 'artifact', 'lifecycle']),
  templateId: z.string().min(1),
})
export type SoulWorkbenchAction = z.infer<typeof soulWorkbenchActionSchema>

export const soulWorkbenchWorkspaceTypeSchema = z.object({
  description: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
  primary: z.boolean().default(false),
})
export type SoulWorkbenchWorkspaceType = z.infer<typeof soulWorkbenchWorkspaceTypeSchema>

export const soulWorkbenchDescriptorSchema = z.object({
  actions: z.array(soulWorkbenchActionSchema).min(1).readonly(),
  artifactKinds: z.array(z.string().min(1)).min(1).readonly(),
  description: z.string().min(1),
  fallback: soulWorkbenchFallbackSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  primaryObjects: z.array(soulWorkbenchObjectSchema).min(1).readonly(),
  reviewChecklist: z.array(z.string().min(1)).min(1).readonly(),
  soulId: z.string().min(1),
  version: z.string().min(1),
  views: z.array(soulWorkbenchViewSchema).min(1).readonly(),
  workspaceTypes: z.array(soulWorkbenchWorkspaceTypeSchema).min(1).readonly(),
})
export type SoulWorkbenchDescriptor = z.infer<typeof soulWorkbenchDescriptorSchema>

export const hrPeopleWorkbench = soulWorkbenchDescriptorSchema.parse({
  actions: [
    action('summarize-profile', 'Summarize profile', 'person', 'aiworker-hr.person-profile', 'person-profile', 'Create a source-backed HR profile snapshot for this person. Separate confirmed facts, missing evidence, risks, and human follow-up notes.'),
    action('prepare-next-step', 'Prepare next step', 'lifecycle', 'aiworker-hr.lifecycle-next-step', 'lifecycle-next-step', 'Prepare the next HR touchpoint for this person. Use the current lifecycle stage, evidence, open questions, and human-owned decision guardrails.'),
    action('extract-evidence', 'Extract evidence', 'person', 'aiworker-hr.candidate-screen', 'candidate-screen', 'Extract source-backed evidence from the supplied role packet, resume, employee notes, interview notes, or lifecycle records. Preserve missing evidence and do not infer protected-class attributes.'),
    action('draft-interview-kit', 'Draft interview kit', 'interview', 'aiworker-hr.interview-brief', 'interview-brief', 'Draft a structured interview kit with evidence-backed questions, focus signals, and scorecard guidance.'),
    action('draft-onboarding-plan', 'Draft onboarding plan', 'employee', 'aiworker-hr.onboarding-plan', 'onboarding-plan', 'Draft a 30/60/90 onboarding or check-in plan with evidence, owner placeholders, open risks, and review notes.'),
    action('prepare-offboarding-summary', 'Prepare offboarding summary', 'alumni', 'aiworker-hr.offboarding-summary', 'offboarding-summary', 'Prepare an offboarding or alumni handoff summary. Keep sensitive details minimized and separate confirmed facts from assumptions.'),
    action('build-evidence-matrix', 'Build evidence matrix', 'pool', 'aiworker-hr.evidence-matrix', 'evidence-matrix', 'Build an evidence matrix across people and role/lifecycle signals. Use source references and mark weak, missing, or conflicting evidence.'),
    action('check-risky-wording', 'Check risky wording', 'artifact', 'aiworker-hr.hiring-risk', 'hiring-risk', 'Review the current artifact for protected-class inference, unsupported personal judgments, privacy leakage, and unreviewed employment commitments.'),
  ],
  artifactKinds: ['person-profile', 'lifecycle-next-step', 'candidate-screen', 'interview-brief', 'onboarding-plan', 'offboarding-summary', 'evidence-matrix', 'hiring-risk'],
  description: 'People-first HR workbench for profile context, lifecycle moments, evidence, reviewable next steps, and memory candidates.',
  fallback: 'generic-worker-studio',
  id: 'hr-people-workbench',
  name: 'People Workbench',
  primaryObjects: [
    { description: 'A selected person profile with lifecycle stage, evidence coverage, open risks, and next step.', id: 'person-profile', label: 'Person Profile' },
    { description: 'A recruiting, onboarding, employee-care, or offboarding moment that needs a reviewable next artifact.', id: 'lifecycle-moment', label: 'Lifecycle Moment' },
    { description: 'Source-backed timeline of sessions, artifacts, reviews, and memory candidates for the person.', id: 'profile-timeline', label: 'Profile Timeline' },
    { description: 'People-level coverage view across candidates, employees, and alumni without automated ranking.', id: 'people-board', label: 'People Board' },
  ],
  reviewChecklist: [
    'Evidence is tied to role-related or lifecycle-relevant criteria and source references.',
    'Missing, weak, and conflicting signals are visible.',
    'Protected-class inference, unsupported personal judgments, and sensitive leakage are absent.',
    'Person-sensitive details are not promoted into durable memory without review.',
    'Hiring and employment decisions remain explicitly human-owned.',
  ],
  soulId: 'aiworker-hr',
  version: '0.1.0',
  views: [
    { description: 'Lifecycle filters, evidence inventory, and review guardrails.', id: 'lifecycle-rail', label: 'Lifecycle rail', region: 'rail' },
    { description: 'Flex poster wall of people profiles and their next HR moment.', id: 'profile-wall', label: 'Profile wall', region: 'main' },
    { description: 'Selected profile loop with next step, agent proposal, review, and memory status.', id: 'profile-loop-panel', label: 'Profile loop panel', region: 'tray' },
    { description: 'Artifact quality, privacy, compliance, and memory-candidate review.', id: 'review-panel', label: 'Review panel', region: 'review' },
  ],
  workspaceTypes: [
    { description: 'A people profile workspace that tracks a person through HR lifecycle moments.', id: 'people-profile', label: 'People Profile', primary: true },
    { description: 'A hiring role search with rubric, candidates, interviews, evidence matrix, and roundup packet.', id: 'role-search', label: 'Role Search', primary: false },
    { description: 'A focused candidate packet inside a recruiting loop.', id: 'candidate', label: 'Candidate', primary: false },
    { description: 'An active employee profile for onboarding, check-in, growth, or retention support.', id: 'employee', label: 'Employee', primary: false },
    { description: 'A departed employee or alumni profile for offboarding, handoff, or knowledge capture.', id: 'alumni', label: 'Alumni', primary: false },
    { description: 'A reusable pool of future candidate evidence.', id: 'talent-pool', label: 'Talent Pool', primary: false },
  ],
})

export const BUILTIN_SOUL_WORKBENCHES = [hrPeopleWorkbench] as const satisfies readonly SoulWorkbenchDescriptor[]

export function findSoulWorkbenchForSoul(soulId: string): SoulWorkbenchDescriptor | null {
  return BUILTIN_SOUL_WORKBENCHES.find(workbench => workbench.soulId === soulId) ?? null
}

export function hasSpecializedSoulWorkbench(soulId: string): boolean {
  return findSoulWorkbenchForSoul(soulId) !== null
}

function action(
  id: string,
  label: string,
  scope: SoulWorkbenchAction['scope'],
  templateId: string,
  outputKind: string,
  prompt: string,
): SoulWorkbenchAction {
  return { description: prompt, id, label, outputKind, prompt, scope, templateId }
}
