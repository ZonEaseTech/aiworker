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

export const qaSoulAppManifest = createSoulAppManifest(manifestJson)

export const QA_REFERENCE_APP_BOUNDARY = {
  hostMountedEntry: './host-adapter/mounted/host-mounted.ts',
  packageName: '@zonease/aiworker-qa',
  primaryWorkbench: 'Release Gate Workbench',
  standaloneEntry: './host-adapter/standalone/standalone.ts',
} as const

export const qaReferenceSoulApp: SoulAppDefinition = defineSoulApp({
  artifact: {
    async artifactSchemas() {
      return qaSoulAppManifest.artifactTypes
    },
    async extractMetadata(_context, artifact) {
      return {
        appId: qaSoulAppManifest.id,
        contentRef: artifact.contentRef,
        kind: artifact.type,
        releaseRisk: artifact.type === 'release-gate' ? 'gate-review' : 'coverage-review',
      }
    },
    async validateArtifact(_context, artifact) {
      return validateArtifactType(artifact.type)
    },
  },
  connector: {
    async declareConnectorNeeds() {
      return [
        ...qaSoulAppManifest.connectors.required,
        ...qaSoulAppManifest.connectors.optional,
      ]
    },
  },
  lifecycle: lifecycleHandlers('QA reference app ready.'),
  manifest: qaSoulAppManifest,
  review: {
    async createReviewRubric(_context, artifactType) {
      return {
        checks: [
          `Artifact type ${artifactType} maps test evidence to release risk.`,
          'Known defects, missing evidence, and residual risk are separated.',
          'Go/no-go recommendation is explicit and reviewable.',
        ],
        policyRef: qaSoulAppManifest.artifactTypes.find(type => type.id === artifactType)?.reviewPolicyRef,
      }
    },
    async proposeMemoryCandidate(context, review) {
      return {
        evidence: [{
          appId: context.appId,
          artifactId: review.artifactId,
          reviewId: review.reviewId,
          source: 'qa-reference-app',
        }],
        statement: 'Promote reviewed QA release gate guidance into the QA Soul namespace.',
      }
    },
  },
  runtime: {
    async prepareSessionContext(context, input) {
      const capability = resolveQaCapability(input.capabilityId)
      return sessionContext(context, capability, input.workspaceType)
    },
    async resolveCapability(_context, input) {
      return resolveQaCapability(input.capabilityId ?? input.intent)
    },
  },
  ui: {
    async artifactTypes() {
      return qaSoulAppManifest.artifactTypes
    },
    async capabilities() {
      return qaSoulAppManifest.capabilities
    },
    async ui() {
      return qaSoulAppManifest.ui
    },
    async workspaceTypes() {
      return qaSoulAppManifest.workspaceTypes
    },
  },
})

function resolveQaCapability(input?: string): SoulAppCapability {
  const id = normalizeCapabilityId(input) ?? qaSoulAppManifest.capabilities[0]!.id
  const capability = qaSoulAppManifest.capabilities.find(item => item.id === id)
  if (!capability)
    throw new Error(`QA capability not found: ${input}`)
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
      '# QA Soul App Context',
      `App: ${context.appId}`,
      `Workspace type: ${workspaceType}`,
      'Use release, test suite, defect evidence, regression matrix, and release gate language.',
    ].join('\n'),
    promptFragments: [
      `Use QA capability ${capability.name}.`,
      'Map test evidence and known defects to user-facing release risk.',
      'Return a reviewable QA business artifact, not a generic chat answer.',
    ],
    reviewRubric: [
      'Coverage maps to changed scope and user risk.',
      'Known blockers and residual risk are separate.',
      'Recommendation is explicit and actionable.',
    ],
  }
}

function validateArtifactType(type: string): SoulAppArtifactValidationResult {
  const known = qaSoulAppManifest.artifactTypes.some(item => item.id === type)
  return {
    issues: known ? [] : [{ message: `Unknown QA artifact type: ${type}`, severity: 'error' }],
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
