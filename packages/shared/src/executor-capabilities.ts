/**
 * Project executor overlay schema, persisted to `.aiworker/executor-capabilities.json`.
 *
 * The overlay records bootstrap hints / best-effort projections that AIWorker can
 * hand to engines supporting project-level config (Codex CLI, Claude Code CLI, ...).
 *
 * It is NOT the source of truth for an executor's effective capabilities, and it
 * is NOT a security or isolation boundary. Engines may load additional user/host
 * level MCP servers, skills, plugins, auth and native sessions outside AIWorker's
 * scope; AIWorker only declares the overlay, validates its shape, and best-effort
 * projects supported descriptors via the engine's own CLI.
 *
 * Some legacy export names contain "Native" / "Capability" — kept for compatibility;
 * treat them as overlay-level descriptors.
 */
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

/**
 * Project-level MCP overlay descriptor. Engines may also load user/host-level
 * MCP servers; this descriptor only declares what the project wants to advertise.
 */
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

/**
 * Overlay descriptor for non-MCP engine capabilities (engine plugin / engine
 * skill / engine policy). The legacy `Native` in the type name historically
 * referred to engine-native plumbing; today this is overlay metadata only.
 */
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

/**
 * Project executor overlay manifest (file: `.aiworker/executor-capabilities.json`).
 * The "manifest" suffix is historical; this is an overlay/hint container, not the
 * effective executor capability source of truth.
 */
export const executorCapabilityManifestSchema = z.object({
  engines: z.record(executorCapabilityEngineSchema, executorCapabilityEngineConfigSchema),
  schemaVersion: z.literal(1),
})

export type ExecutorCapabilityManifest = z.infer<typeof executorCapabilityManifestSchema>
