import type { z } from 'zod'

import { z as zod } from 'zod'

export const soulAppBrokerProviderKindSchema = zod.enum(['audit', 'connector', 'secret', 'storage'])
export type SoulAppBrokerProviderKind = z.infer<typeof soulAppBrokerProviderKindSchema>

export const soulAppBrokerProviderStatusSchema = zod.enum(['active', 'disabled', 'not_configured', 'planned'])
export type SoulAppBrokerProviderStatus = z.infer<typeof soulAppBrokerProviderStatusSchema>

export const soulAppBrokerProviderSchema = zod.object({
  appScoped: zod.boolean(),
  capabilities: zod.array(zod.string().min(1)).readonly(),
  configured: zod.boolean(),
  description: zod.string().min(1),
  enabled: zod.boolean(),
  id: zod.string().min(1),
  kind: soulAppBrokerProviderKindSchema,
  label: zod.string().min(1),
  local: zod.boolean(),
  notes: zod.array(zod.string().min(1)).readonly().optional(),
  status: soulAppBrokerProviderStatusSchema,
})
export type SoulAppBrokerProvider = z.infer<typeof soulAppBrokerProviderSchema>

export const soulAppBrokerProviderRegistrySummarySchema = zod.object({
  activeCount: zod.number().int().nonnegative(),
  configuredCount: zod.number().int().nonnegative(),
  plannedCount: zod.number().int().nonnegative(),
  providerCount: zod.number().int().nonnegative(),
})
export type SoulAppBrokerProviderRegistrySummary = z.infer<typeof soulAppBrokerProviderRegistrySummarySchema>

export const soulAppBrokerProviderRegistrySchema = zod.object({
  providers: zod.array(soulAppBrokerProviderSchema).readonly(),
  summary: soulAppBrokerProviderRegistrySummarySchema,
})
export type SoulAppBrokerProviderRegistry = z.infer<typeof soulAppBrokerProviderRegistrySchema>
