import { z } from 'zod'

export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  capabilities: z.array(z.string()),
  source: z.enum(['brain', 'executor', 'local']),
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
  status: z.enum(['added-brain', 'added-executor', 'modified', 'identical']),
  brainHash: z.string().optional(),
  executorHash: z.string().optional(),
})

export const diffResponseSchema = z.object({
  diff: z.array(diffEntrySchema),
  total: z.number(),
})

export const conflictSchema = z.object({
  id: z.number(),
  skillName: z.string(),
  brainHash: z.string(),
  executorHash: z.string(),
  resolution: z.enum(['pending', 'brain', 'executor', 'manual']),
  createdAt: z.string(),
})

export const conflictListResponseSchema = z.object({
  conflicts: z.array(conflictSchema),
  total: z.number(),
})

export const resolveConflictRequestSchema = z.object({
  resolution: z.enum(['brain', 'executor', 'manual']),
})

export const syncRequestSchema = z.object({
  direction: z.enum(['brain-to-executor', 'executor-to-brain', 'bidirectional']).default('bidirectional'),
})

export type Skill = z.infer<typeof skillSchema>
