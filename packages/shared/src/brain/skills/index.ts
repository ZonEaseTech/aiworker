/// <reference path="../../soul/assets.d.ts" />

import type { BrainSkillPack } from '../skill-pack'

import developerCodebaseOrientationSkillMd from '../../soul/packs/developer/skills/codebase-orientation/SKILL.md' with { type: 'text' }
import devopsSreIncidentTriageSkillMd from '../../soul/packs/devops-sre/skills/incident-triage/SKILL.md' with { type: 'text' }
import financeOpsFinancialEvidenceReviewSkillMd from '../../soul/packs/finance-ops/skills/financial-evidence-review/SKILL.md' with { type: 'text' }
import generalAssistantGeneralTaskFramingSkillMd from '../../soul/packs/general-assistant/skills/general-task-framing/SKILL.md' with { type: 'text' }
import hrRecruitingCandidateScreeningSkillMd from '../../soul/packs/hr-recruiting/skills/candidate-screening/SKILL.md' with { type: 'text' }
import productDesignerDesignCritiqueSkillMd from '../../soul/packs/product-designer/skills/design-critique/SKILL.md' with { type: 'text' }
import projectManagerDeliveryRiskReviewSkillMd from '../../soul/packs/project-manager/skills/delivery-risk-review/SKILL.md' with { type: 'text' }
import qaReviewerRegressionReviewSkillMd from '../../soul/packs/qa-reviewer/skills/regression-review/SKILL.md' with { type: 'text' }
import supportOperatorSupportCaseTriageSkillMd from '../../soul/packs/support-operator/skills/support-case-triage/SKILL.md' with { type: 'text' }
import { createBrainSkillPack } from '../skill-pack'
import kernelBrainAdmissionSkillMd from './kernel/brain-admission/SKILL.md' with { type: 'text' }
import kernelExecutorQualityReviewSkillMd from './kernel/executor-quality-review/SKILL.md' with { type: 'text' }

export const kernelBrainAdmissionSkillPack = createBrainSkillPack({
  expectedId: 'kernel.brain-admission',
  skillMd: kernelBrainAdmissionSkillMd,
  sourcePath: 'packages/shared/src/brain/skills/kernel/brain-admission/SKILL.md',
})

export const kernelExecutorQualityReviewSkillPack = createBrainSkillPack({
  expectedId: 'kernel.executor-quality-review',
  skillMd: kernelExecutorQualityReviewSkillMd,
  sourcePath: 'packages/shared/src/brain/skills/kernel/executor-quality-review/SKILL.md',
})

export const developerCodebaseOrientationSkillPack = createBrainSkillPack({
  expectedId: 'developer.codebase-orientation',
  skillMd: developerCodebaseOrientationSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/developer/skills/codebase-orientation/SKILL.md',
})

export const devopsSreIncidentTriageSkillPack = createBrainSkillPack({
  expectedId: 'devops-sre.incident-triage',
  skillMd: devopsSreIncidentTriageSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/devops-sre/skills/incident-triage/SKILL.md',
})

export const financeOpsFinancialEvidenceReviewSkillPack = createBrainSkillPack({
  expectedId: 'finance-ops.financial-evidence-review',
  skillMd: financeOpsFinancialEvidenceReviewSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/finance-ops/skills/financial-evidence-review/SKILL.md',
})

export const generalAssistantGeneralTaskFramingSkillPack = createBrainSkillPack({
  expectedId: 'general-assistant.general-task-framing',
  skillMd: generalAssistantGeneralTaskFramingSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/general-assistant/skills/general-task-framing/SKILL.md',
})

export const hrRecruitingCandidateScreeningSkillPack = createBrainSkillPack({
  expectedId: 'hr-recruiting.candidate-screening',
  skillMd: hrRecruitingCandidateScreeningSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/hr-recruiting/skills/candidate-screening/SKILL.md',
})

export const productDesignerDesignCritiqueSkillPack = createBrainSkillPack({
  expectedId: 'product-designer.design-critique',
  skillMd: productDesignerDesignCritiqueSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/product-designer/skills/design-critique/SKILL.md',
})

export const projectManagerDeliveryRiskReviewSkillPack = createBrainSkillPack({
  expectedId: 'project-manager.delivery-risk-review',
  skillMd: projectManagerDeliveryRiskReviewSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/project-manager/skills/delivery-risk-review/SKILL.md',
})

export const qaReviewerRegressionReviewSkillPack = createBrainSkillPack({
  expectedId: 'qa-reviewer.regression-review',
  skillMd: qaReviewerRegressionReviewSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/qa-reviewer/skills/regression-review/SKILL.md',
})

export const supportOperatorSupportCaseTriageSkillPack = createBrainSkillPack({
  expectedId: 'support-operator.support-case-triage',
  skillMd: supportOperatorSupportCaseTriageSkillMd,
  sourcePath: 'packages/shared/src/soul/packs/support-operator/skills/support-case-triage/SKILL.md',
})

export const BUILTIN_KERNEL_BRAIN_SKILL_PACKS = [
  kernelBrainAdmissionSkillPack,
  kernelExecutorQualityReviewSkillPack,
] as const

export const BUILTIN_SOUL_BRAIN_SKILL_PACKS_BY_SOUL_ID = {
  'developer': [developerCodebaseOrientationSkillPack],
  'devops-sre': [devopsSreIncidentTriageSkillPack],
  'finance-ops': [financeOpsFinancialEvidenceReviewSkillPack],
  'general-assistant': [generalAssistantGeneralTaskFramingSkillPack],
  'hr-recruiting': [hrRecruitingCandidateScreeningSkillPack],
  'product-designer': [productDesignerDesignCritiqueSkillPack],
  'project-manager': [projectManagerDeliveryRiskReviewSkillPack],
  'qa-reviewer': [qaReviewerRegressionReviewSkillPack],
  'support-operator': [supportOperatorSupportCaseTriageSkillPack],
} as const

export function findBuiltinSoulBrainSkillPacks(soulId: string): readonly BrainSkillPack[] {
  return BUILTIN_SOUL_BRAIN_SKILL_PACKS_BY_SOUL_ID[soulId as keyof typeof BUILTIN_SOUL_BRAIN_SKILL_PACKS_BY_SOUL_ID] ?? []
}
