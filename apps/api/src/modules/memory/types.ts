import { z } from 'zod'

export const memoryEntrySchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const memoryListResponseSchema = z.object({
  memories: z.array(memoryEntrySchema),
  total: z.number(),
})

export const memorySearchResponseSchema = z.object({
  results: z.array(memoryEntrySchema.extend({
    score: z.number(),
  })),
  query: z.string(),
})

export type MemoryEntry = z.infer<typeof memoryEntrySchema>
