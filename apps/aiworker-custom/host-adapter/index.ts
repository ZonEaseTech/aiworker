import type {
  SoulAppCapability,
  SoulAppDefinition,
  SoulAppProtocolResult,
  SoulAppScopedContext,
  SoulAppSessionContext,
} from '@zonease/aiworker-soul-app-sdk'

import { createSoulAppManifest, defineSoulApp, parseNamespacedSoulAppCapabilityId } from '@zonease/aiworker-soul-app-sdk'

import manifestJson from '../soul-app.manifest.json' with { type: 'json' }

export const customSoulAppManifest = createSoulAppManifest(manifestJson)

export const CUSTOM_REFERENCE_APP_BOUNDARY = {
  hostMountedEntry: './host-adapter/mounted/host-mounted.ts',
  packageName: '@zonease/aiworker-custom',
  primaryWorkbench: 'Custom Sandbox',
  standaloneEntry: './host-adapter/standalone/standalone.ts',
} as const

export const customReferenceSoulApp: SoulAppDefinition = defineSoulApp({
  connector: {
    async declareConnectorNeeds() {
      return []
    },
  },
  lifecycle: lifecycleHandlers('Custom Soul App ready.'),
  manifest: customSoulAppManifest,
  runtime: {
    async prepareSessionContext(context, input) {
      const capability = resolveCustomCapability(input.capabilityId)
      return sessionContext(context, capability, input.workspaceType)
    },
    async resolveCapability(_context, input) {
      return resolveCustomCapability(input.capabilityId ?? input.intent)
    },
  },
  ui: {
    async artifactTypes() {
      return manifestJson.artifactTypes
    },
    async capabilities() {
      return customSoulAppManifest.capabilities
    },
    async ui() {
      return customSoulAppManifest.ui
    },
    async workspaceTypes() {
      return customSoulAppManifest.workspaceTypes
    },
  },
})

function resolveCustomCapability(input?: string): SoulAppCapability {
  const id = normalizeCapabilityId(input) ?? customSoulAppManifest.capabilities[0]!.id
  const capability = customSoulAppManifest.capabilities.find(item => item.id === id)
  if (!capability)
    throw new Error(`Custom capability not found: ${input}`)
  return capability
}

function normalizeCapabilityId(input?: string): string | null {
  if (!input)
    return null
  return parseNamespacedSoulAppCapabilityId(input)?.capabilityId ?? input
}

function sessionContext(context: SoulAppScopedContext, capability: SoulAppCapability, workspaceType: string): SoulAppSessionContext {
  return {
    artifactTypes: capability.artifactTypes,
    capabilityId: capability.id,
    contextMarkdown: [
      '# AIWorker Custom Session Context',
      `App: ${context.appId}`,
      `Workspace type: ${workspaceType}`,
      'This is a free-form exploration workspace with no fixed domain constraints.',
      'Use available skills and MCP tools from the workspace.',
    ].join('\n'),
    promptFragments: [
      `Using Custom capability: ${capability.name}.`,
      'Adapt to the user request without assuming a fixed domain.',
      'Use available skills and MCP tools as appropriate.',
    ],
    reviewRubric: [
      'Output is relevant to the user request.',
      'Available skills were used according to their purpose.',
      'No secrets or credentials in output.',
    ],
  }
}

function lifecycleHandlers(message: string) {
  const ok = async (): Promise<SoulAppProtocolResult> => ({ message, ok: true })
  return {
    disable: ok,
    enable: ok,
    healthcheck: ok,
    install: ok,
    upgrade: ok,
  }
}
