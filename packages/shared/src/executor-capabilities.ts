import { z } from 'zod'

import { secretRefSchema } from './capabilities'

export const executorCapabilityEngineSchema = z.enum(['codex', 'claude-code'])
export type ExecutorCapabilityEngine = z.infer<typeof executorCapabilityEngineSchema>

export const executorCapabilityScopeSchema = z.enum(['project'])
export type ExecutorCapabilityScope = z.infer<typeof executorCapabilityScopeSchema>

export const executorMcpTransportSchema = z.enum(['stdio', 'streamable-http', 'sse'])
export type ExecutorMcpTransport = z.infer<typeof executorMcpTransportSchema>

export const executorSecretValueSchema = z.union([
  z.string().min(1),
  secretRefSchema,
])
export type ExecutorSecretValue = z.infer<typeof executorSecretValueSchema>

export const executorMcpServerDescriptorSchema = z.object({
  args: z.array(z.string()).optional(),
  command: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  disabled: z.boolean().optional(),
  env: z.record(executorSecretValueSchema).optional(),
  headers: z.record(executorSecretValueSchema).optional(),
  scope: executorCapabilityScopeSchema,
  transport: executorMcpTransportSchema,
  url: z.string().min(1).optional(),
}).passthrough()

export type ExecutorMcpServerDescriptor = z.infer<typeof executorMcpServerDescriptorSchema>

export const executorCapabilityEngineConfigSchema = z.object({
  mcp: z.record(executorMcpServerDescriptorSchema).optional(),
  plugins: z.record(z.unknown()).optional(),
  skills: z.record(z.unknown()).optional(),
}).passthrough()

export type ExecutorCapabilityEngineConfig = z.infer<typeof executorCapabilityEngineConfigSchema>

export const executorCapabilityManifestSchema = z.object({
  engines: z.record(executorCapabilityEngineSchema, executorCapabilityEngineConfigSchema),
  schemaVersion: z.literal(1),
})

export type ExecutorCapabilityManifest = z.infer<typeof executorCapabilityManifestSchema>
