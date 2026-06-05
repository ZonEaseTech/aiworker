/**
 * 写入路由 body schema 定义 + parseJsonBody helper。
 *
 * 设计原则：
 * - 不使用 .strict()：多余字段静默 strip，匹配原 `as T` 的忽略多余键行为。
 * - 必填字段 = 原 requireString() 强制校验的字段，使用 z.string().trim().min(1)。
 * - 其余字段一律 .optional()，当前类型允许 null 的用 .nullable().optional()。
 * - 枚举字段使用从 @zonease/aiworker-soul-descriptor 或 storage-sqlite schema 查到的确切枚举值。
 */

import type { Context } from 'hono'

import { localSettingsConfigSchema, localWorkerConfigValueInputSchema, localWorkerStatusSchema, localWorkspaceStatusSchema } from '@zonease/aiworker-soul-descriptor'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// parseJsonBody helper — standard broker write routes use safeParse+400.
// ---------------------------------------------------------------------------

export async function parseJsonBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
  code: string,
): Promise<{ ok: true, data: z.infer<T> } | { ok: false, response: Response }> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return {
      ok: false,
      response: c.json(
        { error: { code, message: 'Invalid request body.', issues: parsed.error.issues } },
        400,
      ),
    }
  }
  return { ok: true, data: parsed.data }
}

// ---------------------------------------------------------------------------
// POST /api/app-installation/install
// ---------------------------------------------------------------------------

export const installAppBodySchema = z.object({
  descriptor: z.unknown().optional(),
  descriptorPath: z.string().optional(),
})

// ---------------------------------------------------------------------------
// PATCH /api/workers/:workerId
// ---------------------------------------------------------------------------

export const patchWorkerBodySchema = z.object({
  defaultEngineId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1).optional(),
  // status 枚举值来自 @zonease/aiworker-soul-descriptor localWorkerStatusSchema：['active','archived']
  status: localWorkerStatusSchema.optional(),
})

// ---------------------------------------------------------------------------
// POST /api/workspace-locators
// ---------------------------------------------------------------------------

export const createWorkspaceBodySchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1),
  sourcePointers: z.array(z.record(z.string(), z.unknown())).optional(),
  type: z.string().optional(),
})

// No client-chosen `rootPath`: workspace roots are derived under the Worker home
// (`<worker-home>/workspaces/<workspaceId>`). The create body is just
// `{ workerId, name }` (plus optional type/metadata/sourcePointers).
export const createWorkspaceLocatorBodySchema = createWorkspaceBodySchema.extend({
  workerId: z.string().trim().min(1),
})

// ---------------------------------------------------------------------------
// PATCH /api/workspace-locators/:workspaceId
// 白名单字段（对应 Pick<WorkspaceRow, 'metadataJson' | 'name' | 'sourcePointersJson' | 'status'>）
// status 枚举值来自 @zonease/aiworker-soul-descriptor localWorkspaceStatusSchema：['active','archived']
// ---------------------------------------------------------------------------

export const patchWorkspaceBodySchema = z.object({
  metadataJson: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1).optional(),
  sourcePointersJson: z.array(z.record(z.string(), z.unknown())).optional(),
  status: localWorkspaceStatusSchema.optional(),
})

// ---------------------------------------------------------------------------
// PATCH /api/settings
// 复用已有的 localSettingsConfigSchema.partial()，不重造
// ---------------------------------------------------------------------------

export const patchSettingsBodySchema = localSettingsConfigSchema.partial()

// ---------------------------------------------------------------------------
// POST /api/sessions
// 对应 createWorkspaceSessionFromBody 内的 body：
// title 被 requireString 强制：必填
// 其余可选
// ---------------------------------------------------------------------------

export const createSessionBodySchema = z.object({
  context: z.never().optional(),
  engineId: z.string().nullable().optional(),
  input: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  title: z.string().trim().min(1),
})

export const createBrokerSessionBodySchema = createSessionBodySchema.extend({
  workerId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
})

// ---------------------------------------------------------------------------
// POST /api/sessions/:sessionId/invocations
// POST /api/engine/invocations
// 对应 createSessionInvocationResponse / createSessionInvocationFromBody 内的 body：
// input 被 requireString 强制：必填
// ---------------------------------------------------------------------------

export const createSessionInvocationBodySchema = z.object({
  input: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  waitForCompletion: z.boolean().optional(),
})

export const createBrokerEngineInvocationBodySchema = createSessionInvocationBodySchema.extend({
  engineCommand: z.string().nullable().optional(),
  engineId: z.string().nullable().optional(),
  sessionId: z.string().trim().min(1),
})

export const reconcileEngineInvocationBodySchema = z.object({
  diagnostic: z.string().optional(),
  handle: z.record(z.string(), z.unknown()).optional(),
  state: z.enum(['not_spawned', 'spawned', 'exited', 'killed', 'lost']).optional(),
})

export const patchSessionBodySchema = z.object({
  context: z.never().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['active', 'archived', 'deleted']).optional(),
  title: z.string().trim().min(1).optional(),
})

export const projectionRefreshBodySchema = z.object({
  workerId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
})

export const workerConfigValueBodySchema = localWorkerConfigValueInputSchema

// ---------------------------------------------------------------------------
// PUT /api/workers/:workerId/config/:configKey/content
// Editable overlay content travels transiently in the request body; it is
// written to the worker overlay FILE and never stored in the config envelope.
// `target` is accepted for API symmetry with the design but is advisory only
// (overlays are worker-scoped: applied to all workspaces on projection).
// ---------------------------------------------------------------------------

export const workerConfigContentBodySchema = z.object({
  content: z.string(),
  target: z.string().optional(),
})
