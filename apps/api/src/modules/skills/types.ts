import { z } from 'zod'

export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  capabilities: z.array(z.string()),
  source: z.enum(['hermes', 'openclaw', 'local']),
})

export const skillListResponseSchema = z.object({
  skills: z.array(skillSchema),
  total: z.number(),
})

export const skillDetailResponseSchema = skillSchema

export const syncResponseSchema = z.object({
  status: z.enum(['started', 'completed']),
  synced: z.number(),
  conflicts: z.number(),
})

export const diffEntrySchema = z.object({
  name: z.string(),
  status: z.enum(['added-hermes', 'added-openclaw', 'modified', 'identical']),
  hermesHash: z.string().optional(),
  openclawHash: z.string().optional(),
})

export const diffResponseSchema = z.object({
  diff: z.array(diffEntrySchema),
  total: z.number(),
})

export const conflictSchema = z.object({
  id: z.number(),
  skillName: z.string(),
  hermesHash: z.string(),
  openclawHash: z.string(),
  resolution: z.enum(['pending', 'hermes', 'openclaw', 'manual']),
  createdAt: z.string(),
})

export const conflictListResponseSchema = z.object({
  conflicts: z.array(conflictSchema),
  total: z.number(),
})

export const resolveConflictRequestSchema = z.object({
  resolution: z.enum(['hermes', 'openclaw', 'manual']),
})

export const syncRequestSchema = z.object({
  direction: z.enum(['hermes-to-openclaw', 'openclaw-to-hermes', 'bidirectional']).default('bidirectional'),
})

export type Skill = z.infer<typeof skillSchema>
