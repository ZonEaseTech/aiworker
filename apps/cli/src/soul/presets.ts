import { developerSoulPreset } from './presets/developer'
import { devopsSreSoulPreset } from './presets/devops-sre'
import { financeOpsSoulPreset } from './presets/finance-ops'
import { generalAssistantSoulPreset } from './presets/general-assistant'
import { hrRecruitingSoulPreset } from './presets/hr-recruiting'
import { productDesignerSoulPreset } from './presets/product-designer'
import { projectManagerSoulPreset } from './presets/project-manager'
import { qaReviewerSoulPreset } from './presets/qa-reviewer'
import { supportOperatorSoulPreset } from './presets/support-operator'

export type BuiltinSoulPresetId
  = | 'developer'
    | 'project-manager'
    | 'devops-sre'
    | 'product-designer'
    | 'qa-reviewer'
    | 'support-operator'
    | 'finance-ops'
    | 'hr-recruiting'
    | 'general-assistant'

export type InitSoulId = BuiltinSoulPresetId | typeof CUSTOMIZE_SOUL_ID

export interface SoulPresetDefinition {
  boundaries: readonly string[]
  communicationStyle: string
  description: string
  id: BuiltinSoulPresetId
  label: string
  outOfScope: string
  packs: readonly string[]
  responsibilities: readonly string[]
  riskPolicy: string
  toolsets: readonly string[]
}

export interface SelectedSoul {
  boundaries: readonly string[]
  communicationStyle: string
  description: string
  highRiskRequiresApproval: boolean
  id: InitSoulId
  label: string
  outOfScope: string
  packs: readonly string[]
  responsibilities: readonly string[]
  riskPolicy: string
  source: 'flag' | 'interactive'
  toolsets: readonly string[]
}

export const CUSTOMIZE_SOUL_ID = 'customize'

export const BUILTIN_SOUL_PRESETS: readonly SoulPresetDefinition[] = [
  developerSoulPreset,
  projectManagerSoulPreset,
  devopsSreSoulPreset,
  productDesignerSoulPreset,
  qaReviewerSoulPreset,
  supportOperatorSoulPreset,
  financeOpsSoulPreset,
  hrRecruitingSoulPreset,
  generalAssistantSoulPreset,
]

export function findBuiltinSoul(id: string): SoulPresetDefinition | undefined {
  return BUILTIN_SOUL_PRESETS.find(preset => preset.id === id)
}

export function supportedSoulIds(): string {
  return [...BUILTIN_SOUL_PRESETS.map(preset => preset.id), CUSTOMIZE_SOUL_ID].join(', ')
}

export function toSelectedSoul(preset: SoulPresetDefinition, source: SelectedSoul['source']): SelectedSoul {
  return {
    ...preset,
    highRiskRequiresApproval: true,
    source,
  }
}
