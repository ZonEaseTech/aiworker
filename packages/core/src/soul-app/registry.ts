import type { CapabilityTemplate, HostedSoulApp, SoulAppHealthStatus, SoulAppInstallSourceKind, SoulAppManifest, SoulAppManifestValidationIssue, VerticalSoul } from '@zonease/aiworker-shared'
import type { SoulAppRow } from '@zonease/aiworker-storage-sqlite/worker'

import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  buildHostedSoulApp,
  projectSoulAppCapabilityTemplates,
  projectSoulAppSoul,
  soulAppManifestSchema,
  validateSoulAppManifest,
} from '@zonease/aiworker-shared'
import {
  getSoulApp,
  listSoulApps,
  updateSoulAppLifecycle,
  upsertSoulApp,
} from '@zonease/aiworker-storage-sqlite/worker'

const SEMVER_RE = /^\d+\.\d+\.\d+$/
const DEFAULT_MANIFEST_FILENAME = 'soul-app.manifest.json'

export interface SoulAppRegistryContext {
  availableConnectorIds?: readonly string[]
  enabledConnectorIds?: readonly string[]
  hostVersion?: string
  now?: () => string
}

export interface SoulAppInstallInput {
  manifest: SoulAppManifest | unknown
  sourceKind: SoulAppInstallSourceKind
  sourceRef: string
}

export interface HostSoulCatalog {
  apps: HostedSoulApp[]
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
}

export async function installSoulAppFromPath(manifestPath: string, context: SoulAppRegistryContext = {}): Promise<HostedSoulApp> {
  const filePath = await resolveManifestPath(manifestPath)
  const content = await readFile(filePath, 'utf8')
  return installSoulAppManifest({
    manifest: parseManifestContent(content, filePath),
    sourceKind: 'manifest-path',
    sourceRef: filePath,
  }, context)
}

export function installSoulAppManifest(input: SoulAppInstallInput, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const manifest = soulAppManifestSchema.parse(input.manifest)
  const result = validateSoulAppManifest(manifest, validationOptions(context, manifest.id))
  const row = upsertSoulApp({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    protocol: manifest.protocol,
    soulId: manifest.soul.id,
    status: result.status === 'valid' ? 'installed' : 'error',
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    manifestDigest: digestManifest(manifest),
    manifestJson: manifest,
    validationIssuesJson: result.issues,
    healthStatus: result.status === 'valid' ? 'unknown' : 'fail',
    healthMessage: result.status === 'valid' ? null : issueSummary(result.issues),
    at: now(context),
  })
  return hostedSoulAppFromRow(row)
}

export function enableSoulApp(appId: string, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const row = requireSoulApp(appId)
  const result = validateSoulAppManifest(row.manifestJson, validationOptions(context, row.id))
  if (result.status !== 'valid') {
    const failed = updateSoulAppLifecycle({
      id: row.id,
      status: 'error',
      validationIssuesJson: result.issues,
      healthStatus: 'fail',
      healthMessage: issueSummary(result.issues),
      lastHealthcheckAt: now(context),
      at: now(context),
    })
    return hostedSoulAppFromRow(failed)
  }
  const health = staticHealthcheck(row.manifestJson, context)
  const enabled = updateSoulAppLifecycle({
    id: row.id,
    status: 'enabled',
    validationIssuesJson: [],
    healthStatus: health.status,
    healthMessage: health.message,
    lastHealthcheckAt: now(context),
    at: now(context),
  })
  return hostedSoulAppFromRow(enabled)
}

export function disableSoulApp(appId: string, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const row = requireSoulApp(appId)
  const disabled = updateSoulAppLifecycle({
    id: row.id,
    status: 'disabled',
    healthStatus: 'unknown',
    healthMessage: 'Soul App is disabled. Existing metadata is retained for audit.',
    at: now(context),
  })
  return hostedSoulAppFromRow(disabled)
}

export function runSoulAppHealthcheck(appId: string, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const row = requireSoulApp(appId)
  const result = validateSoulAppManifest(row.manifestJson, validationOptions(context, row.id))
  if (result.status !== 'valid') {
    const failed = updateSoulAppLifecycle({
      id: row.id,
      status: 'error',
      validationIssuesJson: result.issues,
      healthStatus: 'fail',
      healthMessage: issueSummary(result.issues),
      lastHealthcheckAt: now(context),
      at: now(context),
    })
    return hostedSoulAppFromRow(failed)
  }
  const health = row.status === 'disabled'
    ? { message: 'Soul App is disabled. Existing metadata is retained for audit.', status: 'warn' as const }
    : staticHealthcheck(row.manifestJson, context)
  const checked = updateSoulAppLifecycle({
    id: row.id,
    status: row.status === 'error' ? 'installed' : row.status,
    validationIssuesJson: [],
    healthStatus: health.status,
    healthMessage: health.message,
    lastHealthcheckAt: now(context),
    at: now(context),
  })
  return hostedSoulAppFromRow(checked)
}

export function listHostedSoulApps(): HostedSoulApp[] {
  return listSoulApps().map(row => hostedSoulAppFromRow(row))
}

export function getHostedSoulApp(appId: string): HostedSoulApp | null {
  const row = getSoulApp(appId)
  return row ? hostedSoulAppFromRow(row) : null
}

export function listHostSoulCatalog(): HostSoulCatalog {
  const apps = listHostedSoulApps()
  const appSouls = apps.map(app => projectSoulAppSoul(app.manifest, app.status === 'enabled' ? 'available' : 'coming_soon'))
  const appTemplates = apps
    .filter(app => app.status === 'enabled')
    .flatMap(app => projectSoulAppCapabilityTemplates(app.manifest))
  return {
    apps,
    souls: appSouls,
    templates: appTemplates,
  }
}

export function findHostSoul(id: string): VerticalSoul | undefined {
  return listHostSoulCatalog().souls.find(soul => soul.id === id)
}

export function findHostCapabilityTemplate(id: string): CapabilityTemplate | undefined {
  return listHostSoulCatalog().templates.find(template => template.id === id)
}

export function listHostCapabilityTemplatesForSoul(soulId: string): CapabilityTemplate[] {
  return listHostSoulCatalog().templates.filter(template => template.soulId === soulId)
}

export function hostedSoulAppFromRow(row: SoulAppRow): HostedSoulApp {
  return buildHostedSoulApp({
    healthMessage: row.healthMessage,
    healthStatus: row.healthStatus,
    manifest: row.manifestJson,
    manifestDigest: row.manifestDigest,
    sourceKind: row.sourceKind,
    sourceRef: row.sourceRef,
    status: row.status,
    validationIssues: row.validationIssuesJson,
  })
}

async function resolveManifestPath(inputPath: string): Promise<string> {
  const resolved = path.resolve(inputPath)
  const info = await stat(resolved)
  if (info.isDirectory())
    return path.join(resolved, DEFAULT_MANIFEST_FILENAME)
  if (info.isFile())
    return resolved
  throw new Error(`Soul App manifest path is not a file: ${inputPath}`)
}

function validationOptions(context: SoulAppRegistryContext, currentAppId?: string) {
  return {
    availableConnectorIds: context.availableConnectorIds,
    existingStorageNamespaces: listSoulApps()
      .filter(row => row.id !== currentAppId)
      .map(row => row.manifestJson.storage.namespace),
    hostVersion: context.hostVersion && SEMVER_RE.test(context.hostVersion) ? context.hostVersion : undefined,
  }
}

function staticHealthcheck(manifest: SoulAppManifest, context: SoulAppRegistryContext): { message: string, status: SoulAppHealthStatus } {
  const enabledConnectors = new Set(context.enabledConnectorIds ?? [])
  if (enabledConnectors.size > 0) {
    const missing = manifest.connectors.required.filter(connector => !enabledConnectors.has(connector.id))
    if (missing.length > 0)
      return { message: `Required connectors are not enabled: ${missing.map(connector => connector.id).join(', ')}`, status: 'warn' }
  }
  return { message: 'Static manifest validation passed. No Soul App code was executed.', status: 'pass' }
}

function digestManifest(manifest: SoulAppManifest): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}

function parseManifestContent(content: string, filePath: string): unknown {
  try {
    return JSON.parse(content)
  }
  catch (err) {
    throw new Error(`Soul App manifest is not valid JSON at ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function issueSummary(issues: readonly SoulAppManifestValidationIssue[]): string {
  return issues.map(issue => `${issue.code}: ${issue.message}`).join('; ') || 'Soul App manifest validation failed.'
}

function requireSoulApp(appId: string): SoulAppRow {
  const row = getSoulApp(appId)
  if (!row)
    throw new Error(`Soul App not found: ${appId}`)
  return row
}

function now(context: SoulAppRegistryContext): string {
  return context.now?.() ?? new Date().toISOString()
}
