import { z } from 'zod'

export const localBriefStatusSchema = z.enum(['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'])
export type LocalBriefStatus = z.infer<typeof localBriefStatusSchema>

export const localRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export type LocalRunStatus = z.infer<typeof localRunStatusSchema>

export const localRunEventTypeSchema = z.enum([
  'status',
  'assistant_delta',
  'tool',
  'file_change',
  'artifact',
  'review',
  'lesson',
  'error',
  'log',
])
export type LocalRunEventType = z.infer<typeof localRunEventTypeSchema>

export const localFileKindSchema = z.enum(['file', 'directory', 'generated', 'uploaded'])
export type LocalFileKind = z.infer<typeof localFileKindSchema>

export const localFileSourceSchema = z.enum(['user', 'run', 'system'])
export type LocalFileSource = z.infer<typeof localFileSourceSchema>

export const localArtifactStatusSchema = z.enum(['available', 'missing', 'archived'])
export type LocalArtifactStatus = z.infer<typeof localArtifactStatusSchema>

export const localReviewVerdictSchema = z.enum(['pass', 'warn', 'fail', 'needs_review'])
export type LocalReviewVerdict = z.infer<typeof localReviewVerdictSchema>

export const localLessonStatusSchema = z.enum(['proposed', 'accepted', 'rejected'])
export type LocalLessonStatus = z.infer<typeof localLessonStatusSchema>

export const localJsonObjectSchema = z.record(z.string(), z.unknown())
export type LocalJsonObject = z.infer<typeof localJsonObjectSchema>

const timestampSchema = z.string().min(1)
const idSchema = z.string().min(1)

export const localWorkspaceSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  rootPath: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalWorkspace = z.infer<typeof localWorkspaceSchema>

export const localBriefSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  status: localBriefStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalBrief = z.infer<typeof localBriefSchema>

export const localRunSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  briefId: idSchema.nullable(),
  status: localRunStatusSchema,
  executor: z.string().min(1),
  prompt: z.string().min(1),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  metadataJson: localJsonObjectSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalRun = z.infer<typeof localRunSchema>

export const localRunEventSchema = z.object({
  id: z.number().int().positive(),
  runId: idSchema,
  seq: z.number().int().nonnegative(),
  type: localRunEventTypeSchema,
  payloadJson: localJsonObjectSchema,
  createdAt: timestampSchema,
})
export type LocalRunEvent = z.infer<typeof localRunEventSchema>

export const localFileSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  path: z.string().min(1),
  kind: localFileKindSchema,
  size: z.number().int().nonnegative().nullable(),
  mtime: z.number().int().nonnegative().nullable(),
  hash: z.string().nullable(),
  source: localFileSourceSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalFile = z.infer<typeof localFileSchema>

export const localArtifactSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  runId: idSchema.nullable(),
  path: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  status: localArtifactStatusSchema,
  metadataJson: localJsonObjectSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalArtifact = z.infer<typeof localArtifactSchema>

export const localReviewSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  runId: idSchema.nullable(),
  artifactId: idSchema.nullable(),
  verdict: localReviewVerdictSchema,
  findingsJson: z.array(localJsonObjectSchema),
  risksJson: z.array(localJsonObjectSchema),
  createdAt: timestampSchema,
})
export type LocalReview = z.infer<typeof localReviewSchema>

export const localLessonSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  sourceReviewId: idSchema.nullable(),
  statement: z.string().min(1),
  evidenceJson: z.array(localJsonObjectSchema),
  status: localLessonStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalLesson = z.infer<typeof localLessonSchema>

export const localSettingSchema = z.object({
  key: z.string().min(1),
  valueJson: localJsonObjectSchema,
  updatedAt: timestampSchema,
})
export type LocalSetting = z.infer<typeof localSettingSchema>

