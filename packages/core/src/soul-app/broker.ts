import type { HostedSoulApp, SoulAppPermission } from '@zonease/aiworker-shared'
import type { ArtifactRow, LessonRow, ReviewRow, SoulAppAuditEventRow, SoulAppStorageRecordRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { SoulAppConnectorProviderConfig } from './provider-registry'
import type { SoulAppSearchIndexUpsertInput } from './search-index'
import type { SoulAppStorageProvider } from './storage-provider'

import { randomUUID } from 'node:crypto'
import {
  appendSoulAppAuditEvent,
  createLesson,
  createReview,
  getSession,
  getWorker,
  getWorkspace,
  listArtifacts,
  listSoulAppAuditEvents,
} from '@zonease/aiworker-storage-sqlite/worker'

import { listSoulAppBrokerProviders } from './provider-registry'
import { getHostedSoulApp } from './registry'
import { querySoulAppSearchIndex, upsertSoulAppSearchIndexRecord } from './search-index'
import { createSqliteSoulAppStorageProvider } from './storage-provider'

export interface SoulAppBrokerContext {
  appId: string
  connectorProviders?: readonly SoulAppConnectorProviderConfig[]
  enabledConnectorIds?: readonly string[]
  now?: () => string
  operatorId?: string
  sessionId?: string
  storageProvider?: SoulAppStorageProvider
  workerId?: string
  workspaceId?: string
}

export interface SoulAppPermissionDecision {
  allowed: boolean
  code: 'allowed' | 'app_disabled' | 'app_not_found' | 'connector_not_enabled' | 'engine_owned_by_host' | 'permission_denied' | 'scope_mismatch' | 'scope_not_found'
  reason: string
}

type DeniedPermissionDecision = SoulAppPermissionDecision & { allowed: false }

export interface SoulAppBrokerDenied {
  decision: DeniedPermissionDecision
}

export interface SoulAppStoragePutOptions {
  namespace?: string
}

export interface SoulAppConnectorEvidenceResult {
  appId: string
  connectorId: string
  query: Record<string, unknown>
  records: Record<string, unknown>[]
  redacted: true
}

export interface SoulAppCreateReviewInput {
  artifactId?: string | null
  findingsJson?: Record<string, unknown>[]
  risksJson?: Record<string, unknown>[]
  sessionId?: string | null
  turnId?: string | null
  verdict?: ReviewRow['verdict']
  workspaceId: string
}

export interface SoulAppMemoryProposalInput {
  evidenceJson?: Record<string, unknown>[]
  sourceReviewId?: string | null
  statement: string
  workspaceId: string
}

export interface SoulAppEngineInvocationInput {
  prompt: string
}

export function createSoulAppBroker(context: SoulAppBrokerContext) {
  const storageProvider = context.storageProvider ?? createSqliteSoulAppStorageProvider()

  return {
    artifacts: {
      list(workspaceId = context.workspaceId): ArtifactRow[] | SoulAppBrokerDenied {
        const decision = decide(context, 'artifact', 'read', '*')
        recordDecision(context, decision, 'artifact', 'read', workspaceId ?? '*', { workspaceId })
        if (!decision.allowed)
          return denied(decision)
        return listArtifacts(workspaceId)
      },
    },
    audit: {
      list(): SoulAppAuditEventRow[] {
        return listSoulAppAuditEvents(context.appId)
      },
    },
    connectors: {
      readEvidence(connectorId: string, query: Record<string, unknown>): SoulAppConnectorEvidenceResult | SoulAppBrokerDenied {
        const decision = decide(context, 'connector', 'read', connectorId)
        recordDecision(context, decision, 'connector', 'read', connectorId, { query })
        if (!decision.allowed)
          return denied(decision)
        return {
          appId: context.appId,
          connectorId,
          query,
          records: [{
            appId: context.appId,
            connectorId,
            query,
            redacted: true,
            source: 'host-connector-broker',
          }],
          redacted: true,
        }
      },
    },
    engine: {
      createInvocation(input: SoulAppEngineInvocationInput): SoulAppBrokerDenied {
        const decision = deny('engine_owned_by_host', 'Soul Apps cannot create raw engine invocations; Host owns engine scheduling and audit.')
        recordDecision(context, decision, 'engine', 'create', 'invocation', { promptLength: input.prompt.length })
        return denied(decision)
      },
    },
    memory: {
      propose(input: SoulAppMemoryProposalInput): LessonRow | SoulAppBrokerDenied {
        const decision = decide(context, 'memory', 'propose', context.appId)
        recordDecision(context, decision, 'memory', 'propose', context.appId, {
          sourceReviewId: input.sourceReviewId ?? null,
          workspaceId: input.workspaceId,
        })
        if (!decision.allowed)
          return denied(decision)
        return createLesson({
          evidenceJson: [
            ...(input.evidenceJson ?? []),
            { appId: context.appId, namespace: context.appId, source: 'soul-app-broker' },
          ],
          id: `lesson_${randomUUID()}`,
          sourceReviewId: input.sourceReviewId ?? null,
          statement: input.statement,
          status: 'proposed',
          workspaceId: input.workspaceId,
        })
      },
    },
    permissions: {
      decide(kind: SoulAppPermission['kind'], action: SoulAppPermission['action'], target: string): SoulAppPermissionDecision {
        return decide(context, kind, action, target)
      },
      list(): readonly SoulAppPermission[] {
        return resolveApp(context)?.manifest.permissions ?? []
      },
    },
    providers: {
      list() {
        return listSoulAppBrokerProviders({
          connectors: context.connectorProviders,
        })
      },
    },
    reviews: {
      create(input: SoulAppCreateReviewInput): ReviewRow | SoulAppBrokerDenied {
        const decision = decide(context, 'review', 'create', 'review')
        recordDecision(context, decision, 'review', 'create', input.artifactId ?? 'review', {
          artifactId: input.artifactId ?? null,
          workspaceId: input.workspaceId,
        })
        if (!decision.allowed)
          return denied(decision)
        return createReview({
          artifactId: input.artifactId ?? null,
          findingsJson: input.findingsJson ?? [],
          id: `review_${randomUUID()}`,
          risksJson: input.risksJson ?? [],
          sessionId: input.sessionId ?? context.sessionId ?? null,
          turnId: input.turnId ?? null,
          verdict: input.verdict ?? 'needs_review',
          workspaceId: input.workspaceId,
        })
      },
    },
    search: {
      query(query: string) {
        const decision = decide(context, 'search', 'read', context.appId)
        recordDecision(context, decision, 'search', 'read', context.appId, { query })
        if (!decision.allowed)
          return denied(decision)
        return querySoulAppSearchIndex(context.appId, query)
      },
      upsert(id: string, input: SoulAppSearchIndexUpsertInput) {
        const decision = decide(context, 'search', 'write', context.appId)
        recordDecision(context, decision, 'search', 'write', id, {
          artifactId: input.artifactId ?? null,
          kind: input.kind,
          reviewId: input.reviewId ?? null,
          sessionId: input.sessionId ?? null,
          workspaceId: input.workspaceId ?? null,
        })
        if (!decision.allowed)
          return denied(decision)
        return upsertSoulAppSearchIndexRecord(context.appId, id, input, context.now?.())
      },
    },
    storage: {
      get(key: string): SoulAppStorageRecordRow | null | SoulAppBrokerDenied {
        const decision = decide(context, 'storage', 'read', context.appId)
        recordDecision(context, decision, 'storage', 'read', key, { key })
        if (!decision.allowed)
          return denied(decision)
        return storageProvider.get(context.appId, key)
      },
      list(): SoulAppStorageRecordRow[] | SoulAppBrokerDenied {
        const decision = decide(context, 'storage', 'read', context.appId)
        recordDecision(context, decision, 'storage', 'read', context.appId, {})
        if (!decision.allowed)
          return denied(decision)
        return storageProvider.list(context.appId)
      },
      put(key: string, valueJson: Record<string, unknown>, options: SoulAppStoragePutOptions = {}): SoulAppStorageRecordRow | SoulAppBrokerDenied {
        const namespace = options.namespace ?? context.appId
        const app = resolveApp(context)
        const namespaceDecision = app && namespace !== app.manifest.storage.namespace
          ? deny('permission_denied', `Requested storage namespace ${namespace} does not match app namespace ${app.manifest.storage.namespace}.`)
          : decide(context, 'storage', 'write', namespace)
        recordDecision(context, namespaceDecision, 'storage', 'write', namespace, { key, namespace })
        if (!namespaceDecision.allowed)
          return denied(namespaceDecision)
        return storageProvider.put({
          appId: context.appId,
          key,
          namespace,
          operatorId: context.operatorId ?? null,
          sessionId: context.sessionId ?? null,
          valueJson,
          workerId: context.workerId ?? null,
          workspaceId: context.workspaceId ?? null,
          at: context.now?.(),
        })
      },
    },
  }
}

function decide(
  context: SoulAppBrokerContext,
  kind: SoulAppPermission['kind'] | 'engine',
  action: SoulAppPermission['action'],
  target: string,
): SoulAppPermissionDecision {
  const app = resolveApp(context)
  if (!app)
    return deny('app_not_found', `Soul App is not installed: ${context.appId}`)
  if (app.status !== 'enabled')
    return deny('app_disabled', `Soul App is not enabled: ${context.appId}`)
  const scopeDecision = validateScope(context, app)
  if (scopeDecision)
    return scopeDecision
  if (kind === 'engine')
    return deny('engine_owned_by_host', 'Soul Apps cannot create raw engine invocations; Host owns engine scheduling and audit.')
  if (kind === 'connector' && !(context.enabledConnectorIds ?? []).includes(target))
    return deny('connector_not_enabled', `Connector is not enabled for brokered access: ${target}`)

  const allowed = app.manifest.permissions.some(permission =>
    permission.kind === kind
    && permission.action === action
    && permissionMatchesTarget(app, permission, target),
  )
  if (!allowed)
    return deny('permission_denied', `Soul App manifest does not declare ${kind}:${target}:${action}.`)

  return { allowed: true, code: 'allowed', reason: 'Permission is declared in the Soul App manifest and enforced by Host broker.' }
}

function validateScope(context: SoulAppBrokerContext, app: HostedSoulApp): SoulAppPermissionDecision | null {
  if (!context.workerId && !context.workspaceId && !context.sessionId)
    return null

  const worker = context.workerId ? getWorker(context.workerId) : null
  if (context.workerId && !worker)
    return deny('scope_not_found', `Worker scope was not found: ${context.workerId}`)
  if (worker && worker.soulId !== app.appId)
    return deny('scope_mismatch', `Worker ${worker.id} belongs to ${worker.soulId}, not ${app.appId}.`)

  const workspace = context.workspaceId ? getWorkspace(context.workspaceId) : null
  if (context.workspaceId && !workspace)
    return deny('scope_not_found', `Workspace scope was not found: ${context.workspaceId}`)
  if (workspace && context.workerId && workspace.workerId !== context.workerId)
    return deny('scope_mismatch', `Workspace ${workspace.id} belongs to worker ${workspace.workerId}, not ${context.workerId}.`)
  if (workspace && !context.workerId) {
    const workspaceWorker = getWorker(workspace.workerId)
    if (!workspaceWorker)
      return deny('scope_not_found', `Workspace worker was not found: ${workspace.workerId}`)
    if (workspaceWorker.soulId !== app.appId)
      return deny('scope_mismatch', `Workspace ${workspace.id} belongs to ${workspaceWorker.soulId}, not ${app.appId}.`)
  }

  const session = context.sessionId ? getSession(context.sessionId) : null
  if (context.sessionId && !session)
    return deny('scope_not_found', `Session scope was not found: ${context.sessionId}`)
  if (session && context.workerId && session.workerId !== context.workerId)
    return deny('scope_mismatch', `Session ${session.id} belongs to worker ${session.workerId}, not ${context.workerId}.`)
  if (session && context.workspaceId && session.workspaceId !== context.workspaceId)
    return deny('scope_mismatch', `Session ${session.id} belongs to workspace ${session.workspaceId}, not ${context.workspaceId}.`)
  if (session && !context.workerId) {
    const sessionWorker = getWorker(session.workerId)
    if (!sessionWorker)
      return deny('scope_not_found', `Session worker was not found: ${session.workerId}`)
    if (sessionWorker.soulId !== app.appId)
      return deny('scope_mismatch', `Session ${session.id} belongs to ${sessionWorker.soulId}, not ${app.appId}.`)
  }

  return null
}

function permissionMatchesTarget(app: HostedSoulApp, permission: SoulAppPermission, target: string): boolean {
  if (permission.target === target)
    return true
  if (permission.kind === 'review' && permission.action === 'create')
    return true
  if (permission.kind === 'artifact' && app.manifest.artifactTypes.some(type => type.id === target))
    return true
  if (permission.kind === 'memory' && target === app.manifest.memory.namespace)
    return true
  return false
}

function recordDecision(
  context: SoulAppBrokerContext,
  decision: SoulAppPermissionDecision,
  targetKind: string,
  action: string,
  target: string,
  requestJson: Record<string, unknown>,
): void {
  appendSoulAppAuditEvent({
    action,
    appId: context.appId,
    decision: decision.allowed ? 'allowed' : 'denied',
    operatorId: context.operatorId ?? null,
    reason: decision.reason,
    requestJson,
    sessionId: context.sessionId ?? null,
    target,
    targetKind,
    workerId: context.workerId ?? null,
    workspaceId: context.workspaceId ?? null,
    at: context.now?.(),
  })
}

function resolveApp(context: SoulAppBrokerContext): HostedSoulApp | null {
  return getHostedSoulApp(context.appId)
}

function deny(code: SoulAppPermissionDecision['code'], reason: string): SoulAppPermissionDecision & { allowed: false } {
  return { allowed: false, code, reason }
}

function denied(decision: SoulAppPermissionDecision): SoulAppBrokerDenied {
  return { decision: decision.allowed ? deny('permission_denied', 'Broker request was denied.') : decision as DeniedPermissionDecision }
}
