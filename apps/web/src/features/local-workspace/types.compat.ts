/** Local compat types for types removed from @zonease/aiworker-soul-protocol in the Thin Shell migration. */

export interface VerticalSoul {
  id: string
  name: string
  description: string
  domain: string
  status: string
  defaultTemplates?: string[]
}

export interface CapabilityTemplate {
  id: string
  name: string
  description: string
  soulId: string
  outputKind: string
  inputHints: readonly string[]
  promptRef: string
  reviewRubricRef: string | null
}
