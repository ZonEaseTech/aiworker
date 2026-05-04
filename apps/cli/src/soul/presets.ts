import type { SoulModule } from '@zonease/aiworker-shared'

import {
  BUILTIN_SOUL_MODULES,
  createBuiltinSoulRegistry,
} from '@zonease/aiworker-shared'

/**
 * CLI projection of `SoulModule` for `aiworker init` and `aiworker soul list/show`.
 *
 * Soul module data lives in `@zonease/aiworker-shared` so that core / API / web
 * can consume the same registry. This file is the CLI-side projection — it
 * derives a flatter shape from `SoulModule.initProjection` + `riskPolicy` +
 * `manifest`, plus the legacy `customize` interactive form.
 */

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

export const CUSTOMIZE_SOUL_ID = 'customize' as const
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

const BUILTIN_PRESET_IDS: ReadonlySet<BuiltinSoulPresetId> = new Set([
  'developer',
  'project-manager',
  'devops-sre',
  'product-designer',
  'qa-reviewer',
  'support-operator',
  'finance-ops',
  'hr-recruiting',
  'general-assistant',
])

function isBuiltinPresetId(id: string): id is BuiltinSoulPresetId {
  return BUILTIN_PRESET_IDS.has(id as BuiltinSoulPresetId)
}

function projectModuleToPreset(module: SoulModule): SoulPresetDefinition {
  const id = module.manifest.id
  if (!isBuiltinPresetId(id))
    throw new Error(`unsupported Soul module id "${id}" — projection layer expects a built-in id`)
  return {
    boundaries: module.initProjection.boundaries,
    communicationStyle: module.riskPolicy.communicationStyle,
    description: module.manifest.description,
    id,
    label: module.manifest.label,
    outOfScope: module.riskPolicy.outOfScopeStrategy,
    packs: module.initProjection.packs,
    responsibilities: module.initProjection.responsibilities,
    riskPolicy: module.riskPolicy.riskNotes,
    toolsets: module.initProjection.toolsets,
  }
}

export const BUILTIN_SOUL_PRESETS: readonly SoulPresetDefinition[] = BUILTIN_SOUL_MODULES.map(projectModuleToPreset)

const BUILTIN_SOUL_REGISTRY = createBuiltinSoulRegistry()

export function findBuiltinSoul(id: string): SoulPresetDefinition | undefined {
  if (!isBuiltinPresetId(id))
    return undefined
  const module = BUILTIN_SOUL_REGISTRY.get(id)
  return module ? projectModuleToPreset(module) : undefined
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
