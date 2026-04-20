import { z } from 'zod'

export const memoryEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()),
  filePath: z.string(),
  hash: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const memoryIndexEntrySchema = z.object({
  title: z.string(),
  filename: z.string(),
  description: z.string(),
})

export const memoryIndexSchema = z.object({
  entries: z.array(memoryIndexEntrySchema),
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

export const memoryDetailResponseSchema = memoryEntrySchema

export const memoryIndexResponseSchema = memoryIndexSchema

export const writeMemoryInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  type: z.enum(['user', 'feedback', 'project', 'reference']).default('user'),
  content: z.string().min(1),
})

export const writeFeedbackInputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  source: z.string().optional(),
})

export const writeMemoryResponseSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  success: z.boolean(),
})

export type MemoryEntry = z.infer<typeof memoryEntrySchema>
export type MemoryIndexEntry = z.infer<typeof memoryIndexEntrySchema>
export type MemoryIndex = z.infer<typeof memoryIndexSchema>
export type WriteMemoryInput = z.infer<typeof writeMemoryInputSchema>
export type WriteFeedbackInput = z.infer<typeof writeFeedbackInputSchema>
