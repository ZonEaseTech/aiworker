import type { BrainSkillPack, SoulModule } from '@zonease/aiworker-shared'

import {
  BUILTIN_SOUL_MODULES,
  createBuiltinSoulRegistry,
  findBuiltinSoulPack,
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
  agentMd: string
  brainSkillPacks: readonly BrainSkillPack[]
  boundaries: readonly string[]
  communicationStyle: string
  description: string
  id: BuiltinSoulPresetId
  label: string
  outOfScope: string
  packs: readonly string[]
  responsibilities: readonly string[]
  riskPolicy: string
  soulMd: string
  toolsets: readonly string[]
  /** BUG-063: Soul-specific guidance for vague / underspecified prompts. */
  vagueContextStrategy: string
}

export interface SelectedSoul {
  agentMd?: string
  brainSkillPacks?: readonly BrainSkillPack[]
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
  soulMd?: string
  source: 'flag' | 'interactive'
  toolsets: readonly string[]
  /** BUG-063: see SoulPresetDefinition.vagueContextStrategy. */
  vagueContextStrategy: string
}

/**
 * BUG-063: shared fallback for Soul modules / interactive paths that did not
 * yet declare a domain-specific clarifying-question prompt. Built-in presets
 * all override this with a tighter, persona-specific guidance string.
 */
export const DEFAULT_VAGUE_CONTEXT_STRATEGY
  = '不直接调用工具探索；先一句话反问关键缺失：用户的目标 / 输入或证据 / 时间或资源约束 / 期望产出形态。'

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
  const pack = findBuiltinSoulPack(id)
  if (!pack)
    throw new Error(`missing file-first Soul pack for built-in id "${id}"`)
  return {
    agentMd: pack.agentMd,
    brainSkillPacks: pack.brainSkillPacks,
    boundaries: module.initProjection.boundaries,
    communicationStyle: module.riskPolicy.communicationStyle,
    description: module.manifest.description,
    id,
    label: module.manifest.label,
    outOfScope: module.riskPolicy.outOfScopeStrategy,
    packs: module.initProjection.packs,
    responsibilities: module.initProjection.responsibilities,
    riskPolicy: module.riskPolicy.riskNotes,
    soulMd: pack.soulMd,
    toolsets: module.initProjection.toolsets,
    vagueContextStrategy: module.riskPolicy.vagueContextStrategy ?? DEFAULT_VAGUE_CONTEXT_STRATEGY,
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
