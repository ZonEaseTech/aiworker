import { z } from 'zod'

export const verticalSoulStatusSchema = z.enum(['available', 'coming_soon'])
export type VerticalSoulStatus = z.infer<typeof verticalSoulStatusSchema>

export const capabilityTemplateSchema = z.object({
  description: z.string().min(1),
  id: z.string().min(1),
  inputHints: z.array(z.string().min(1)).readonly(),
  name: z.string().min(1),
  outputKind: z.string().min(1),
  prompt: z.string().min(1),
  reviewRubric: z.array(z.string().min(1)).readonly(),
  soulId: z.string().min(1),
})
export type CapabilityTemplate = z.infer<typeof capabilityTemplateSchema>

export const verticalSoulSchema = z.object({
  defaultTemplates: z.array(z.string().min(1)).readonly(),
  description: z.string().min(1),
  domain: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  status: verticalSoulStatusSchema,
})
export type VerticalSoul = z.infer<typeof verticalSoulSchema>

export const BUILTIN_VERTICAL_SOULS = [
  {
    defaultTemplates: ['person-profile', 'lifecycle-next-step', 'candidate-screen', 'interview-brief', 'onboarding-plan', 'offboarding-summary', 'evidence-matrix', 'hiring-risk'],
    description: 'People operations workspace for profiles, recruiting evidence, onboarding, employee touchpoints, offboarding, and HR risk.',
    domain: 'hr-people-ops',
    id: 'hr',
    name: 'HR',
    status: 'available',
  },
  {
    defaultTemplates: ['prd-draft', 'decision-record', 'roadmap-slice', 'status-report'],
    description: 'Product workspace for PRDs, decisions, roadmap slices, and stakeholder status.',
    domain: 'product-management',
    id: 'pm',
    name: 'PM',
    status: 'available',
  },
  {
    defaultTemplates: ['test-plan', 'regression-matrix', 'defect-triage', 'release-gate'],
    description: 'Quality workspace for test planning, regression evidence, defect triage, and release gates.',
    domain: 'quality-assurance',
    id: 'qa',
    name: 'QA',
    status: 'available',
  },
  {
    defaultTemplates: ['deploy-checklist', 'incident-review', 'runbook-update', 'capacity-summary'],
    description: 'Operations workspace for deploy readiness, incident review, runbook upkeep, and capacity summaries.',
    domain: 'devops-sre',
    id: 'devops',
    name: 'DevOps',
    status: 'available',
  },
  {
    defaultTemplates: [],
    description: 'Financial evidence review and month-end control workflows.',
    domain: 'finance-ops',
    id: 'finance',
    name: 'Finance',
    status: 'coming_soon',
  },
  {
    defaultTemplates: [],
    description: 'Contract, policy, and risk review workflows.',
    domain: 'legal-ops',
    id: 'legal',
    name: 'Legal',
    status: 'coming_soon',
  },
  {
    defaultTemplates: [],
    description: 'General operations triage, process notes, and team playbooks.',
    domain: 'business-ops',
    id: 'ops',
    name: 'Ops',
    status: 'coming_soon',
  },
] as const satisfies readonly VerticalSoul[]

const rubric = {
  evidence: 'Output cites the supplied context and labels missing evidence.',
  action: 'Next action is concrete, owned, and useful for a human reviewer.',
  risk: 'Risks and assumptions are separated from confirmed facts.',
}

export const BUILTIN_CAPABILITY_TEMPLATES = [
  template('hr', 'person-profile', 'Person Profile', 'person-profile', 'Create a source-backed HR profile snapshot with lifecycle stage, evidence, risks, and next steps.', ['Person context', 'Lifecycle stage', 'Relevant HR notes'], [rubric.evidence, rubric.risk, 'No protected-class inference or unsupported personal judgment.']),
  template('hr', 'lifecycle-next-step', 'Lifecycle Next Step', 'lifecycle-next-step', 'Prepare the next reviewable HR touchpoint for a person across recruiting, onboarding, employee care, or offboarding.', ['Person profile', 'Current lifecycle moment', 'Open questions'], [rubric.evidence, rubric.action, 'Decision and employment commitments remain human-owned.']),
  template('hr', 'candidate-screen', 'Candidate Screen', 'candidate-screen', 'Screen a candidate against a role and identify strengths, gaps, and follow-ups.', ['Role requirements', 'Resume or profile', 'Relevant notes'], [rubric.evidence, rubric.risk, 'No protected-class inference.']),
  template('hr', 'interview-brief', 'Interview Brief', 'interview-brief', 'Prepare a structured interviewer brief with evidence-backed questions.', ['Role stage', 'Candidate packet', 'Interview goals'], [rubric.evidence, rubric.action, 'Questions target missing signal.']),
  template('hr', 'role-rubric', 'Role Rubric', 'role-rubric', 'Turn role expectations into a hiring rubric and scoring guide.', ['Role description', 'Level expectations', 'Team constraints'], [rubric.action, 'Criteria are observable and role-related.', rubric.risk]),
  template('hr', 'onboarding-plan', 'Onboarding Plan', 'onboarding-plan', 'Draft a 30/60/90 onboarding or check-in plan with owners, evidence, risks, and follow-up prompts.', ['Employee profile', 'Role expectations', 'Team context'], [rubric.evidence, rubric.action, 'No private or unsupported employment claims.']),
  template('hr', 'offboarding-summary', 'Offboarding Summary', 'offboarding-summary', 'Prepare an offboarding or alumni handoff summary with knowledge-transfer notes, open actions, and privacy guardrails.', ['Departing employee context', 'Handoff notes', 'Open actions'], [rubric.evidence, rubric.action, 'Sensitive details are minimized and reviewed.']),
  template('hr', 'evidence-matrix', 'Evidence Matrix', 'evidence-matrix', 'Compare candidates against role signals with source-backed coverage, gaps, and conflicts.', ['Role rubric', 'Candidate evidence packets', 'Interview notes or scorecards'], [rubric.evidence, 'Coverage states strong, weak, missing, or conflict.', 'No candidate ranking without human review.']),
  template('hr', 'roundup-packet', 'Roundup Packet', 'roundup-packet', 'Prepare a hiring roundup packet with rubric snapshot, comparison, missing signals, and decision guardrails.', ['Role rubric', 'Evidence matrix', 'Scorecard summaries'], [rubric.evidence, rubric.risk, 'Decision placeholders remain human-owned.']),
  template('hr', 'hiring-risk', 'Hiring Risk', 'hiring-risk', 'Summarize hiring risks, uncertainty, and decision guardrails.', ['Candidate evidence', 'Scorecard notes', 'Decision constraints'], [rubric.evidence, rubric.risk, 'Decision remains human-owned.']),

  template('pm', 'prd-draft', 'PRD Draft', 'prd-draft', 'Draft a PRD from goals, user evidence, constraints, and success metrics.', ['Problem statement', 'User evidence', 'Constraints'], [rubric.action, 'Scope and non-goals are explicit.', rubric.risk]),
  template('pm', 'decision-record', 'Decision Record', 'decision-record', 'Capture options, tradeoffs, decision, and follow-up owners.', ['Decision context', 'Options considered', 'Stakeholder notes'], [rubric.evidence, rubric.action, 'Tradeoffs are balanced.']),
  template('pm', 'roadmap-slice', 'Roadmap Slice', 'roadmap-slice', 'Break a goal into a sequenced roadmap slice with dependencies.', ['Goal', 'Time horizon', 'Dependencies'], [rubric.action, rubric.risk, 'Milestones are inspectable.']),
  template('pm', 'status-report', 'Status Report', 'status-report', 'Produce a concise stakeholder status report with risks and next decisions.', ['Current status', 'Risks', 'Decisions needed'], [rubric.evidence, rubric.action, 'No vague summary filler.']),

  template('qa', 'test-plan', 'Test Plan', 'test-plan', 'Create a test plan matched to release scope and user-facing risk.', ['Release scope', 'Acceptance criteria', 'Known risks'], [rubric.action, 'Coverage maps to risk.', rubric.risk]),
  template('qa', 'regression-matrix', 'Regression Matrix', 'regression-matrix', 'Build a regression matrix with coverage, evidence, gaps, and recommendation.', ['Changed behavior', 'Existing tests', 'Release criteria'], [rubric.evidence, 'Gaps are visible.', rubric.risk]),
  template('qa', 'defect-triage', 'Defect Triage', 'defect-triage', 'Prioritize defects with reproduction evidence and release impact.', ['Bug reports', 'Logs/screenshots', 'Release target'], [rubric.evidence, rubric.action, 'Observed failure and suspected cause are separate.']),
  template('qa', 'release-gate', 'Release Gate', 'release-gate', 'Summarize release readiness, blockers, residual risk, and go/no-go recommendation.', ['Test evidence', 'Known defects', 'Release policy'], [rubric.evidence, rubric.risk, 'Recommendation is explicit.']),

  template('devops', 'deploy-checklist', 'Deploy Checklist', 'deploy-checklist', 'Prepare a deploy checklist with rollback, monitoring, and owner steps.', ['Change summary', 'Environment', 'Rollback plan'], [rubric.action, rubric.risk, 'Steps are operationally concrete.']),
  template('devops', 'incident-review', 'Incident Review', 'incident-review', 'Produce an incident review with timeline, impact, contributing factors, and actions.', ['Timeline', 'Signals', 'Impact notes'], [rubric.evidence, rubric.action, 'Blameless language and source boundaries.']),
  template('devops', 'runbook-update', 'Runbook Update', 'runbook-update', 'Convert new operational learning into a runbook update.', ['Current runbook', 'Observed gap', 'Operational context'], [rubric.action, 'Procedure is repeatable.', rubric.risk]),
  template('devops', 'capacity-summary', 'Capacity Summary', 'capacity-summary', 'Summarize capacity signals, thresholds, and scaling recommendations.', ['Metrics', 'Service context', 'Forecast horizon'], [rubric.evidence, rubric.risk, 'Recommendation states confidence.']),
] as const satisfies readonly CapabilityTemplate[]

function template(
  soulId: string,
  id: string,
  name: string,
  outputKind: string,
  description: string,
  inputHints: string[],
  reviewRubric: string[],
): CapabilityTemplate {
  return {
    description,
    id,
    inputHints,
    name,
    outputKind,
    prompt: `Use the ${name} capability template. Produce a ${outputKind} business artifact for the selected ${soulId.toUpperCase()} Soul project.`,
    reviewRubric,
    soulId,
  }
}

export function findVerticalSoul(id: string): VerticalSoul | undefined {
  return BUILTIN_VERTICAL_SOULS.find(soul => soul.id === id)
}

export function findCapabilityTemplate(id: string): CapabilityTemplate | undefined {
  return BUILTIN_CAPABILITY_TEMPLATES.find(template => template.id === id)
}

export function listCapabilityTemplatesForSoul(soulId: string): CapabilityTemplate[] {
  return BUILTIN_CAPABILITY_TEMPLATES.filter(template => template.soulId === soulId)
}
