import { z } from 'zod'

export const brainConfigSchema = z.object({
  apiUrl: z.string(),
  homePath: z.string(),
})

export const executorConfigSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  apiKeySet: z.boolean(),
})

export const configResponseSchema = z.object({
  brain: brainConfigSchema,
  executor: executorConfigSchema,
})

export type ConfigResponse = z.infer<typeof configResponseSchema>
