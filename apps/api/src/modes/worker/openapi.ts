import type { OpenAPIHono } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'

export function registerLocalOpenApiPaths(app: OpenAPIHono): void {
  const responseSchema = z.object({}).passthrough().openapi('LocalResponse')
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
    method: 'get' | 'post' | 'patch' | 'put'
    path: string
    summary: string
    tags: string[]
    created?: boolean
  }> = [
    { method: 'get', path: '/api/local/info', summary: 'Local daemon info', tags: ['info'] },
    { method: 'get', path: '/api/local/apps', summary: 'List Host Soul Apps', tags: ['apps'] },
    { method: 'post', path: '/api/local/apps/install', summary: 'Install Host Soul App manifest', tags: ['apps'], created: true },
    { method: 'get', path: '/api/local/apps/{appId}', summary: 'Show Host Soul App', tags: ['apps'] },
    { method: 'post', path: '/api/local/apps/{appId}/enable', summary: 'Enable Host Soul App', tags: ['apps'], created: true },
    { method: 'post', path: '/api/local/apps/{appId}/disable', summary: 'Disable Host Soul App', tags: ['apps'], created: true },
    { method: 'post', path: '/api/local/apps/{appId}/healthcheck', summary: 'Run Host Soul App static healthcheck', tags: ['apps'], created: true },
    { method: 'get', path: '/api/local/souls', summary: 'List projected Souls from installed apps', tags: ['catalog'] },
    { method: 'get', path: '/api/local/templates', summary: 'List projected capability templates from installed apps', tags: ['catalog'] },
    { method: 'get', path: '/api/local/apps/{appId}/surfaces/{surfaceId}', summary: 'Resolve a declared mounted Soul App UI surface', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/{path}', summary: 'Reserved mounted Soul App API namespace', tags: ['apps'] },
    { method: 'get', path: '/api/local/workers', summary: 'List Soul workers', tags: ['workers'] },
    { method: 'post', path: '/api/local/workers', summary: 'Create Soul worker', tags: ['workers'], created: true },
    { method: 'get', path: '/api/local/workers/{workerId}', summary: 'Show Soul worker', tags: ['workers'] },
    { method: 'patch', path: '/api/local/workers/{workerId}', summary: 'Update Soul worker', tags: ['workers'] },
    { method: 'get', path: '/api/local/workers/{workerId}/overlay', summary: 'Show worker runtime overlay', tags: ['workers'] },
    { method: 'put', path: '/api/local/workers/{workerId}/overlay', summary: 'Save worker runtime overlay', tags: ['workers'] },
    { method: 'post', path: '/api/local/workers/{workerId}/engine/invocations', summary: 'Create worker native engine invocation', tags: ['engine'], created: true },
    { method: 'post', path: '/api/local/workers/{workerId}/engine/invocations/stream', summary: 'Stream worker native engine invocation', tags: ['engine'], created: true },
    { method: 'get', path: '/api/local/workers/{workerId}/templates', summary: 'List worker capability templates', tags: ['templates'] },
    { method: 'get', path: '/api/local/workers/{workerId}/templates/{templateId}', summary: 'Show worker capability template', tags: ['templates'] },
    { method: 'get', path: '/api/local/workspaces', summary: 'List workspaces', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces', summary: 'List worker workspaces', tags: ['workspaces'] },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces', summary: 'Create worker workspace', tags: ['workspaces'], created: true },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}', summary: 'Show worker workspace', tags: ['workspaces'] },
    { method: 'patch', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}', summary: 'Update worker workspace', tags: ['workspaces'] },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/projection', summary: 'Project worker overlay into workspace', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}', summary: 'Show workspace', tags: ['workspaces'] },
    { method: 'patch', path: '/api/local/workspaces/{workspaceId}', summary: 'Update workspace', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/sessions', summary: 'List sessions', tags: ['sessions'] },
    { method: 'get', path: '/api/local/turns', summary: 'List turns', tags: ['turns'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions', summary: 'List worker workspace sessions', tags: ['sessions'] },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions', summary: 'Create worker workspace session', tags: ['sessions'], created: true },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions/stream', summary: 'Create worker workspace session with event stream', tags: ['sessions'], created: true },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/sessions', summary: 'List workspace sessions', tags: ['sessions'] },
    { method: 'post', path: '/api/local/workspaces/{workspaceId}/sessions', summary: 'Create workspace session', tags: ['sessions'], created: true },
    { method: 'post', path: '/api/local/workspaces/{workspaceId}/sessions/stream', summary: 'Create workspace session with event stream', tags: ['sessions'], created: true },
    { method: 'get', path: '/api/local/sessions/{sessionId}', summary: 'Show session', tags: ['sessions'] },
    { method: 'get', path: '/api/local/workers/{workerId}/sessions/{sessionId}', summary: 'Show worker session', tags: ['sessions'] },
    { method: 'get', path: '/api/local/workers/{workerId}/sessions/{sessionId}/events', summary: 'Replay worker session events', tags: ['events'] },
    { method: 'get', path: '/api/local/workers/{workerId}/sessions/{sessionId}/turns', summary: 'List worker session turns', tags: ['turns'] },
    { method: 'post', path: '/api/local/workers/{workerId}/sessions/{sessionId}/messages', summary: 'Create worker session message', tags: ['turns'], created: true },
    { method: 'post', path: '/api/local/workers/{workerId}/sessions/{sessionId}/messages/stream', summary: 'Create worker session message with event stream', tags: ['turns'], created: true },
    { method: 'get', path: '/api/local/sessions/{sessionId}/events', summary: 'Replay session events', tags: ['events'] },
    { method: 'get', path: '/api/local/sessions/{sessionId}/turns', summary: 'List session turns', tags: ['turns'] },
    { method: 'post', path: '/api/local/sessions/{sessionId}/turns', summary: 'Create session turn', tags: ['turns'], created: true },
    { method: 'get', path: '/api/local/settings', summary: 'Show settings', tags: ['settings'] },
    { method: 'patch', path: '/api/local/settings', summary: 'Update settings', tags: ['settings'] },
    { method: 'post', path: '/api/local/settings/engines/rescan', summary: 'Rescan engines', tags: ['settings'], created: true },
    { method: 'post', path: '/api/local/settings/engines/test', summary: 'Test engine', tags: ['settings'], created: true },
  ]

  for (const path of paths) {
    app.openAPIRegistry.registerPath({
      method: path.method,
      path: path.path,
      summary: path.summary,
      tags: path.tags,
      responses: path.created ? createdJson : okJson,
    })
  }
}
