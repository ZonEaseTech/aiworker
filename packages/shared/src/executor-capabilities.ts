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
  bearerTokenEnvVar: z.string().min(1).optional(),
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

export const executorNativeCapabilityValidationSchema = z.object({
  issues: z.array(z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: z.enum(['error', 'warning']),
  })).optional(),
  status: z.enum(['pending', 'pass', 'warn', 'fail']),
}).passthrough()

export const executorNativeCapabilityDescriptorSchema = z.object({
  disabled: z.boolean().optional(),
  scope: executorCapabilityScopeSchema.optional(),
  source: z.object({
    ref: z.string().min(1).optional(),
    type: z.enum(['engine-cli', 'path', 'registry', 'url', 'manual']),
  }).passthrough().optional(),
  status: z.enum(['draft', 'declared', 'validated', 'projected']).optional(),
  validation: executorNativeCapabilityValidationSchema.optional(),
}).passthrough()

export type ExecutorNativeCapabilityDescriptor = z.infer<typeof executorNativeCapabilityDescriptorSchema>

export const executorCapabilityEngineConfigSchema = z.object({
  mcp: z.record(executorMcpServerDescriptorSchema).optional(),
  plugins: z.record(executorNativeCapabilityDescriptorSchema).optional(),
  policies: z.record(executorNativeCapabilityDescriptorSchema).optional(),
  skills: z.record(executorNativeCapabilityDescriptorSchema).optional(),
}).passthrough()

export type ExecutorCapabilityEngineConfig = z.infer<typeof executorCapabilityEngineConfigSchema>

export const executorCapabilityManifestSchema = z.object({
  engines: z.record(executorCapabilityEngineSchema, executorCapabilityEngineConfigSchema),
  schemaVersion: z.literal(1),
})

export type ExecutorCapabilityManifest = z.infer<typeof executorCapabilityManifestSchema>
