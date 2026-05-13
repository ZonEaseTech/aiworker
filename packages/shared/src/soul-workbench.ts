import { z } from 'zod'

export {
  BUILTIN_SOUL_WORKBENCHES,
  findSoulWorkbenchForSoul,
  hasSpecializedSoulWorkbench,
  hrPeopleWorkbench,
} from './soul-workbench-catalog'

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
