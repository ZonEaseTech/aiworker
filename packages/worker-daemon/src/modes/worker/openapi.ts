import type { OpenAPIHono } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { localWorkerConfigValueInputSchema } from '@zonease/aiworker-soul-descriptor'

export function registerLocalOpenApiPaths(app: OpenAPIHono): void {
  const responseSchema = z.object({}).passthrough().openapi('LocalResponse')
  // envelope shape (kind/target/updatedBy enums, options, checksum, sourceRef) 由
  // packages/soul-descriptor 单一来源定义；这里只挂 OpenAPI 元数据，避免与 protocol drift。
  const workerConfigValueInputSchema = localWorkerConfigValueInputSchema.openapi('WorkerConfigValueInput', {
    description: 'SDK-standard configValueJson envelope. Values must use refs and non-secret operational options; do not send literal secrets, full native MCP files, Soul domain records, business state, or artifact content.',
    example: {
      checksum: 'sha256:freeform-session-overlay',
      enabled: true,
      kind: 'skill-overlay',
      options: {
        replaces: 'descriptor://engine/skills/freeform-session',
      },
      sourceRef: 'descriptor://engine/skills/freeform-session',
      target: 'codex',
      updatedBy: 'web',
    },
  })
  const workerConfigRequest = {
    body: {
      content: {
        'application/json': {
          schema: workerConfigValueInputSchema,
        },
      },
      required: true,
    },
  } as const
  const okJson = {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: responseSchema } },
    },
  } as const
  const createdJson = {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: responseSchema } },
    },
  } as const

  const paths: Array<{
    method: 'delete' | 'get' | 'options' | 'patch' | 'post' | 'put'
    path: string
    summary: string
    tags: string[]
    created?: boolean
  }> = [
    { method: 'post', path: '/api/app-installation/install', summary: 'Install Soul descriptor', tags: ['app-installation'], created: true },
    { method: 'get', path: '/api/app-installation/apps', summary: 'List installed Soul Apps', tags: ['app-installation'] },
    { method: 'get', path: '/api/app-installation/apps/{appId}', summary: 'Show installed Soul App', tags: ['app-installation'] },
    { method: 'post', path: '/api/app-installation/apps/{appId}/enable', summary: 'Enable installed Soul App as worker', tags: ['app-installation'], created: true },
    { method: 'post', path: '/api/app-installation/apps/{appId}/archive', summary: 'Archive installed Soul App metadata', tags: ['app-installation'], created: true },
    { method: 'delete', path: '/api/app-installation/apps/{appId}', summary: 'Delete installed Soul App metadata', tags: ['app-installation'] },
    { method: 'get', path: '/api/info', summary: 'Show local broker info', tags: ['broker'] },
    { method: 'get', path: '/api/settings', summary: 'Show local broker settings', tags: ['settings'] },
    { method: 'patch', path: '/api/settings', summary: 'Update local broker settings', tags: ['settings'] },
    { method: 'post', path: '/api/workers', summary: 'Create Soul worker', tags: ['workers'], created: true },
    { method: 'get', path: '/api/workers', summary: 'List Soul workers', tags: ['workers'] },
    { method: 'get', path: '/api/workers/{workerId}', summary: 'Show Soul worker', tags: ['workers'] },
    { method: 'patch', path: '/api/workers/{workerId}', summary: 'Update Soul worker metadata', tags: ['workers'] },
    { method: 'post', path: '/api/workers/{workerId}/archive', summary: 'Archive Soul worker', tags: ['workers'], created: true },
    { method: 'delete', path: '/api/workers/{workerId}', summary: 'Delete Soul worker metadata', tags: ['workers'] },
    { method: 'get', path: '/api/workers/{workerId}/config', summary: 'Get worker-scoped Host config', tags: ['worker-config'] },
    { method: 'put', path: '/api/workers/{workerId}/config/{configKey}', summary: 'Replace worker-scoped Host config value', tags: ['worker-config'] },
    { method: 'patch', path: '/api/workers/{workerId}/config/{configKey}', summary: 'Patch worker-scoped Host config value', tags: ['worker-config'] },
    { method: 'post', path: '/api/workers/{workerId}/config/{configKey}/archive', summary: 'Archive worker-scoped Host config value', tags: ['worker-config'], created: true },
    { method: 'get', path: '/api/workers/{workerId}/config/{configKey}/content', summary: 'Read effective overlay asset content (baseline or worker overlay; MCP redacted)', tags: ['worker-config'] },
    { method: 'put', path: '/api/workers/{workerId}/config/{configKey}/content', summary: 'Write editable overlay asset content to the worker overlay file', tags: ['worker-config'] },
    { method: 'post', path: '/api/workspace-locators', summary: 'Create workspace locator for a worker', tags: ['workspace-locators'], created: true },
    { method: 'get', path: '/api/workspace-locators', summary: 'List workspace locators, optionally filtered by workerId', tags: ['workspace-locators'] },
    { method: 'get', path: '/api/workspace-locators/{workspaceId}', summary: 'Show workspace locator', tags: ['workspace-locators'] },
    { method: 'patch', path: '/api/workspace-locators/{workspaceId}', summary: 'Update workspace locator metadata', tags: ['workspace-locators'] },
    { method: 'post', path: '/api/workspace-locators/{workspaceId}/archive', summary: 'Archive workspace locator', tags: ['workspace-locators'], created: true },
    { method: 'delete', path: '/api/workspace-locators/{workspaceId}', summary: 'Delete workspace locator metadata', tags: ['workspace-locators'] },
    { method: 'post', path: '/api/sessions', summary: 'Create AIWorker session with worker/workspace locator context', tags: ['sessions'], created: true },
    { method: 'get', path: '/api/sessions', summary: 'List AIWorker sessions, optionally filtered by workerId/workspaceId', tags: ['sessions'] },
    { method: 'get', path: '/api/sessions/{sessionId}', summary: 'Show AIWorker session', tags: ['sessions'] },
    { method: 'patch', path: '/api/sessions/{sessionId}', summary: 'Update AIWorker session lifecycle metadata', tags: ['sessions'] },
    { method: 'post', path: '/api/sessions/{sessionId}/archive', summary: 'Archive AIWorker session', tags: ['sessions'], created: true },
    { method: 'delete', path: '/api/sessions/{sessionId}', summary: 'Delete AIWorker session metadata', tags: ['sessions'] },
    { method: 'post', path: '/api/sessions/{sessionId}/invocations', summary: 'Create session-level engine invocation', tags: ['sessions', 'engine'], created: true },
    { method: 'get', path: '/api/engine/targets', summary: 'List engine targets', tags: ['engine'] },
    { method: 'get', path: '/api/engine/targets/{target}/readiness', summary: 'Read engine target readiness', tags: ['engine'] },
    { method: 'post', path: '/api/engine/targets/rescan', summary: 'Rescan engine target readiness', tags: ['engine'], created: true },
    { method: 'post', path: '/api/engine/targets/{target}/test', summary: 'Test engine target readiness', tags: ['engine'], created: true },
    { method: 'post', path: '/api/engine/invocations', summary: 'Create low-level engine invocation', tags: ['engine'], created: true },
    { method: 'get', path: '/api/engine/invocations/{invocationId}', summary: 'Show engine invocation', tags: ['engine'] },
    { method: 'get', path: '/api/engine/invocations/{invocationId}/events', summary: 'Read engine invocation events', tags: ['engine'] },
    { method: 'post', path: '/api/engine/invocations/{invocationId}/cancel', summary: 'Cancel engine invocation', tags: ['engine'], created: true },
    { method: 'post', path: '/api/engine/invocations/{invocationId}/reconcile', summary: 'Reconcile engine invocation process state', tags: ['engine'], created: true },
    { method: 'post', path: '/api/projections/{target}/refresh', summary: 'Refresh engine projection', tags: ['projections'], created: true },
    { method: 'get', path: '/api/projections/receipts/{receiptId}', summary: 'Show projection receipt', tags: ['projections'] },
    { method: 'post', path: '/api/projections/receipts/{receiptId}/cleanup', summary: 'Clean up receipt-owned projection files', tags: ['projections'], created: true },
  ]

  for (const path of paths) {
    app.openAPIRegistry.registerPath({
      method: path.method,
      path: path.path,
      ...(path.path === '/api/workers/{workerId}/config/{configKey}' && ['patch', 'put'].includes(path.method)
        ? { request: workerConfigRequest }
        : {}),
      summary: path.summary,
      tags: path.tags,
      responses: path.created ? createdJson : okJson,
    })
  }
}
