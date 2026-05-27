/** Local compat types for types removed from @zonease/aiworker-soul-protocol in the Thin Shell migration. */

export interface VerticalSoul {
  id: string
  name: string
  description: string
  status: string
  defaultCapabilities?: string[]
}

export interface WorkspaceCapability {
  id: string
  name: string
  description: string
  soulId: string
  outputKind: string
  inputHints: readonly string[]
  promptRef: string
}
