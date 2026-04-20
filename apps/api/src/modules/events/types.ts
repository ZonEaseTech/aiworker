import { z } from 'zod'

export const busEventSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
  timestamp: z.string(),
})

export const broadcastRequestSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown(),
})

export const broadcastResponseSchema = z.object({
  success: z.boolean(),
})

export const syncEventSchema = z.object({
  id: z.number(),
  type: z.string(),
  source: z.string(),
  target: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
})

export const recentEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

export const recentEventsResponseSchema = z.object({
  events: z.array(syncEventSchema),
  total: z.number(),
})

export type BusEventPayload = z.infer<typeof busEventSchema>
export type BroadcastRequest = z.infer<typeof broadcastRequestSchema>
export type SyncEventDto = z.infer<typeof syncEventSchema>
