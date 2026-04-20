import { z } from 'zod'

export const executionLogSchema = z.object({
  id: z.number(),
  issueId: z.string(),
  toolName: z.string(),
  params: z.record(z.unknown()).nullable(),
  result: z.record(z.unknown()).nullable(),
  duration: z.number().nullable(),
  conversationId: z.string().nullable(),
  createdAt: z.string(),
})

export const executionListResponseSchema = z.object({
  logs: z.array(executionLogSchema),
  total: z.number(),
})

export const executionDetailResponseSchema = executionLogSchema

export const executionStatsResponseSchema = z.object({
  total: z.number(),
  byTool: z.record(z.number()),
  averageDurationMs: z.number().nullable(),
})

export const executionListQuerySchema = z.object({
  conversationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ExecutionLog = z.infer<typeof executionLogSchema>
export type ExecutionListQuery = z.infer<typeof executionListQuerySchema>
