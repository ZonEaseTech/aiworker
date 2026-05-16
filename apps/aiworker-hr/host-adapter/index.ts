import type {
  SoulAppArtifactValidationResult,
  SoulAppCapability,
  SoulAppDefinition,
  SoulAppProtocolResult,
  SoulAppScopedContext,
  SoulAppSessionContext,
} from '@zonease/aiworker-soul-app-sdk'

import { createSoulAppManifest, defineSoulApp, parseNamespacedSoulAppCapabilityId } from '@zonease/aiworker-soul-app-sdk'

import manifestJson from '../soul-app.manifest.json' with { type: 'json' }

export const hrSoulAppManifest = createSoulAppManifest(manifestJson)

export const HR_REFERENCE_APP_BOUNDARY = {
  hostMountedEntry: './host-adapter/mounted/host-mounted.ts',
  packageName: '@zonease/aiworker-hr',
  primaryWorkbench: 'People/Profile Workbench',
  standaloneEntry: './host-adapter/standalone/standalone.ts',
} as const

export const hrReferenceSoulApp: SoulAppDefinition = defineSoulApp({
  artifact: {
    async artifactSchemas() {
      return hrSoulAppManifest.artifactTypes
    },
    async extractMetadata(_context, artifact) {
      return {
        appId: hrSoulAppManifest.id,
        contentRef: artifact.contentRef,
        kind: artifact.type,
        lifecycle: artifact.type === 'person-profile' ? 'people-profile' : 'recruiting',
      }
    },
    async validateArtifact(_context, artifact) {
      return validateArtifactType(artifact.type)
    },
  },
  connector: {
    async declareConnectorNeeds() {
      return [
        ...hrSoulAppManifest.connectors.required,
        ...hrSoulAppManifest.connectors.optional,
      ]
    },
  },
  lifecycle: lifecycleHandlers('HR reference app ready.'),
  manifest: hrSoulAppManifest,
  review: {
    async createReviewRubric(_context, artifactType) {
      return {
        checks: [
          `Artifact type ${artifactType} cites source evidence.`,
          'Missing candidate or employee facts are explicit.',
          'Human review notes separate risks, next actions, and memory candidates.',
        ],
        policyRef: hrSoulAppManifest.artifactTypes.find(type => type.id === artifactType)?.reviewPolicyRef,
      }
    },
    async proposeMemoryCandidate(context, review) {
      return {
        evidence: [{
          appId: context.appId,
          artifactId: review.artifactId,
          reviewId: review.reviewId,
          source: 'hr-reference-app',
        }],
        statement: 'Promote reviewed HR evidence handling guidance into the HR Soul namespace.',
      }
    },
  },
  runtime: {
    async prepareSessionContext(context, input) {
      const capability = resolveHrCapability(input.capabilityId)
      return sessionContext(context, capability, input.workspaceType)
    },
    async resolveCapability(_context, input) {
      return resolveHrCapability(input.capabilityId ?? input.intent)
    },
  },
  ui: {
    async artifactTypes() {
      return hrSoulAppManifest.artifactTypes
    },
    async capabilities() {
      return hrSoulAppManifest.capabilities
    },
    async ui() {
      return hrSoulAppManifest.ui
    },
    async workspaceTypes() {
      return hrSoulAppManifest.workspaceTypes
    },
  },
})

function resolveHrCapability(input?: string): SoulAppCapability {
  const id = normalizeCapabilityId(input) ?? hrSoulAppManifest.capabilities[0]!.id
  const capability = hrSoulAppManifest.capabilities.find(item => item.id === id)
  if (!capability)
    throw new Error(`HR capability not found: ${input}`)
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
      '# HR Soul App Context',
      `App: ${context.appId}`,
      `Workspace type: ${workspaceType}`,
      'Use people-profile, candidate-screen, review notes, and source-backed evidence language.',
    ].join('\n'),
    promptFragments: [
      `Use HR capability ${capability.name}.`,
      'Preserve candidate or employee evidence provenance and mark missing facts.',
      'Return a reviewable HR business artifact, not a generic chat answer.',
    ],
    reviewRubric: [
      'Evidence is source-backed.',
      'Risk and missing evidence are separated.',
      'Next action is concrete for a human HR reviewer.',
    ],
  }
}

function validateArtifactType(type: string): SoulAppArtifactValidationResult {
  const known = hrSoulAppManifest.artifactTypes.some(item => item.id === type)
  return {
    issues: known ? [] : [{ message: `Unknown HR artifact type: ${type}`, severity: 'error' }],
    ok: known,
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
