import { z } from 'zod'

export const capabilityIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/)

export const capabilityValidationSeveritySchema = z.enum(['info', 'warning', 'error'])
export type CapabilityValidationSeverity = z.infer<typeof capabilityValidationSeveritySchema>

export const capabilityValidationStatusSchema = z.enum(['pending', 'pass', 'warn', 'fail'])
export type CapabilityValidationStatus = z.infer<typeof capabilityValidationStatusSchema>

export const capabilityManifestStatusSchema = z.enum(['draft', 'enabled', 'disabled'])
export type CapabilityManifestStatus = z.infer<typeof capabilityManifestStatusSchema>

export const capabilityValidationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().min(1).optional(),
  severity: capabilityValidationSeveritySchema,
})
export type CapabilityValidationIssue = z.infer<typeof capabilityValidationIssueSchema>

export const capabilityValidationResultSchema = z.object({
  checkedAt: z.string().min(1).optional(),
  issues: z.array(capabilityValidationIssueSchema),
  status: capabilityValidationStatusSchema,
})
export type CapabilityValidationResult = z.infer<typeof capabilityValidationResultSchema>

export const capabilityPackEntrySchema = z.object({
  id: capabilityIdSchema,
  status: capabilityManifestStatusSchema,
  validation: capabilityValidationResultSchema,
})
export type CapabilityPackEntry = z.infer<typeof capabilityPackEntrySchema>

export const toolPolicyActionSchema = z.enum(['auto', 'ask', 'deny'])
export type CapabilityToolPolicyAction = z.infer<typeof toolPolicyActionSchema>

export const policyRuleSchema = z.object({
  action: toolPolicyActionSchema,
  pattern: z.string().min(1),
  reason: z.string().min(1).optional(),
})
export type PolicyRule = z.infer<typeof policyRuleSchema>

export const policyManifestSchema = z.object({
  outOfScope: z.object({
    default: z.string().min(1).optional(),
    strategy: z.string().min(1).optional(),
  }).passthrough().refine(
    value => typeof value.default === 'string' || typeof value.strategy === 'string',
    'outOfScope requires either default or strategy',
  ),
  risk: z.object({
    highRiskRequiresApproval: z.boolean(),
    policy: z.string().min(1).optional(),
  }).passthrough(),
  schemaVersion: z.literal(1),
  soul: z.object({
    label: z.string().min(1).optional(),
    preset: capabilityIdSchema,
    source: z.string().min(1).optional(),
  }).passthrough().optional(),
  status: capabilityManifestStatusSchema,
  toolPolicy: z.object({
    default: toolPolicyActionSchema,
    rules: z.array(policyRuleSchema),
  }).passthrough().optional(),
})
export type PolicyManifest = z.infer<typeof policyManifestSchema>

export const toolsetDefinitionSchema = z.object({
  description: z.string().min(1).optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  tools: z.array(z.string().min(1)).optional(),
}).passthrough()
export type ToolsetDefinition = z.infer<typeof toolsetDefinitionSchema>

export const secretRefSchema = z.object({
  secretRef: z.string().min(1),
})
export type SecretRef = z.infer<typeof secretRefSchema>

export const mcpToolDescriptorSchema = z.object({
  description: z.string().min(1).optional(),
  inputSchema: z.record(z.unknown()).optional(),
  name: z.string().min(1),
}).passthrough()
export type McpToolDescriptorManifest = z.infer<typeof mcpToolDescriptorSchema>

export const mcpServerDescriptorSchema = z.object({
  args: z.array(z.string()).optional(),
  command: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  disabled: z.boolean().optional(),
  env: z.record(z.unknown()).optional(),
  headers: z.record(z.unknown()).optional(),
  tools: z.array(mcpToolDescriptorSchema).optional(),
  transport: z.enum(['stdio', 'streamable-http', 'sse']).optional(),
  url: z.string().min(1).optional(),
}).passthrough()
export type McpServerDescriptorManifest = z.infer<typeof mcpServerDescriptorSchema>

export const mcpDescriptorSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  servers: z.record(mcpServerDescriptorSchema),
})
export type McpDescriptorManifest = z.infer<typeof mcpDescriptorSchema>

export const brainCapabilitiesManifestSchema = z.object({
  defaultToolsets: z.array(capabilityIdSchema),
  mcp: mcpDescriptorSchema,
  packs: z.array(capabilityPackEntrySchema),
  schemaVersion: z.literal(1),
  soul: capabilityIdSchema.optional(),
  status: capabilityManifestStatusSchema,
  toolsets: z.record(toolsetDefinitionSchema).optional(),
  validation: capabilityValidationResultSchema.optional(),
})
export type BrainCapabilitiesManifest = z.infer<typeof brainCapabilitiesManifestSchema>

export const skillPermissionSchema = z.enum([
  'filesystem-read',
  'filesystem-write',
  'shell',
  'network',
  'browser',
  'mcp',
])
export type SkillPermission = z.infer<typeof skillPermissionSchema>

export const skillMetadataSchema = z.object({
  capabilities: z.array(z.string().min(1)).optional(),
  description: z.string().min(1),
  name: z.string().min(1),
  permissions: z.array(skillPermissionSchema).optional(),
  version: z.string().min(1).optional(),
}).passthrough()
export type SkillMetadata = z.infer<typeof skillMetadataSchema>
