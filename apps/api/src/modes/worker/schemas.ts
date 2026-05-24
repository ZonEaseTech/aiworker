/**
 * 写入路由 body schema 定义 + parseJsonBody helper。
 *
 * 设计原则：
 * - 不使用 .strict()：多余字段静默 strip，匹配原 `as T` 的忽略多余键行为。
 * - 必填字段 = 原 requireString() 强制校验的字段，使用 z.string().trim().min(1)。
 * - 其余字段一律 .optional()，当前类型允许 null 的用 .nullable().optional()。
 * - 枚举字段使用从 @zonease/aiworker-shared 或 storage-sqlite schema 查到的确切枚举值。
 */

import type { Context } from 'hono'

import { localSettingsConfigSchema, localWorkerStatusSchema, localWorkspaceStatusSchema } from '@zonease/aiworker-shared'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// parseJsonBody helper — 镜像 PUT /overlay 的 safeParse+400 模式
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
// POST /api/local/apps/install
// ---------------------------------------------------------------------------

export const installAppBodySchema = z.object({
  manifest: z.unknown().optional(),
  manifestPath: z.string().optional(),
})

// ---------------------------------------------------------------------------
// POST /api/local/workers
// ---------------------------------------------------------------------------

export const createWorkerBodySchema = z.object({
  defaultEngineId: z.string().nullable().optional(),
  id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1),
  soulId: z.string().trim().min(1),
})

// ---------------------------------------------------------------------------
// PATCH /api/local/workers/:workerId
// ---------------------------------------------------------------------------

export const patchWorkerBodySchema = z.object({
  defaultEngineId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1).optional(),
  // status 枚举值来自 @zonease/aiworker-shared localWorkerStatusSchema：['active','paused','disabled']
  status: localWorkerStatusSchema.optional(),
})

// ---------------------------------------------------------------------------
// POST /api/local/workers/:workerId/workspaces
// ---------------------------------------------------------------------------

export const createWorkspaceBodySchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1),
  sourcePointers: z.array(z.record(z.string(), z.unknown())).optional(),
  type: z.string().optional(),
})

// ---------------------------------------------------------------------------
// PATCH /api/local/workers/:workerId/workspaces/:workspaceId
// PATCH /api/local/workspaces/:workspaceId
// 白名单字段（对应 Pick<WorkspaceRow, 'metadataJson' | 'name' | 'sourcePointersJson' | 'status'>）
// status 枚举值来自 @zonease/aiworker-shared localWorkspaceStatusSchema：['active','archived']
// ---------------------------------------------------------------------------

export const patchWorkspaceBodySchema = z.object({
  metadataJson: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1).optional(),
  sourcePointersJson: z.array(z.record(z.string(), z.unknown())).optional(),
  status: localWorkspaceStatusSchema.optional(),
})

// ---------------------------------------------------------------------------
// PATCH /api/local/settings
// 复用已有的 localSettingsConfigSchema.partial()，不重造
// ---------------------------------------------------------------------------

export const patchSettingsBodySchema = localSettingsConfigSchema.partial()

// ---------------------------------------------------------------------------
// POST /api/local/settings/engines/test
// ---------------------------------------------------------------------------

export const testEngineBodySchema = z.object({
  engineId: z.string().optional(),
})

// ---------------------------------------------------------------------------
// 引擎调用 POST /api/local/workers/:workerId/engine/invocations[/stream]
// 对应 NativeEngineInvocationRequest 接口
// cwd 被 requireString 强制：必填
// args 被 readStringArray 消费：string[] 可选
// engineCommand/engineId 被 readOptionalString 消费：nullable optional
// input 直接 typeof body.input === 'string'：optional
// ---------------------------------------------------------------------------

export const nativeEngineInvocationBodySchema = z.object({
  args: z.array(z.string()).optional(),
  cwd: z.string().trim().min(1),
  engineCommand: z.string().nullable().optional(),
  engineId: z.string().nullable().optional(),
  input: z.string().optional(),
})

// ---------------------------------------------------------------------------
// POST /api/local/workers/:workerId/workspaces/:workspaceId/sessions[/stream]
// POST /api/local/workspaces/:workspaceId/sessions[/stream]
// 对应 createWorkspaceSessionResponse 内的 body：
// title 被 requireString 强制：必填
// 其余可选
// ---------------------------------------------------------------------------

export const createSessionBodySchema = z.object({
  capabilityTemplateId: z.string().optional(),
  context: z.string().optional(),
  input: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  title: z.string().trim().min(1),
})

// ---------------------------------------------------------------------------
// POST /api/local/workers/:workerId/sessions/:sessionId/messages[/stream]
// POST /api/local/sessions/:sessionId/turns[/stream]
// 对应 createSessionMessageResponse 内的 body：
// input 被 requireString 强制：必填
// ---------------------------------------------------------------------------

export const createSessionMessageBodySchema = z.object({
  input: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
