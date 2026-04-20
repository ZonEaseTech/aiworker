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

export type Skill = z.infer<typeof skillSchema>
