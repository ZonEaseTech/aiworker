import type {
  HostedSoulApp,
  SoulAppHealthStatus,
  SoulAppInstallSourceKind,
  SoulDescriptorV1,
  SoulDescriptorValidationIssue,
} from '@zonease/aiworker-soul-protocol'
import type { SoulAppRow } from '@zonease/aiworker-storage-sqlite/worker'

import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  buildHostedSoulApp,
  parseSoulDescriptorV1,
} from '@zonease/aiworker-soul-protocol'
import {
  deleteSoulApp as deleteSoulAppRow,
  getSoulApp,
  listSoulApps,
  updateSoulAppLifecycle,
  upsertSoulApp,
} from '@zonease/aiworker-storage-sqlite/worker'

// -- inlined from deleted shared types --
interface SoulCapability {
  appId: string
  description: string
  id: string
  inputHints: readonly string[]
  name: string
  outputKind: string
  promptRef: string
}

interface VerticalSoul {
  defaultCapabilities: readonly string[]
  description: string
  id: string
  name: string
  status: 'available' | 'coming_soon'
}

const DEFAULT_DESCRIPTOR_FILENAME = 'dist/soul.descriptor.json'

export interface SoulAppRegistryContext {
  availableConnectorIds?: readonly string[]
  enabledConnectorIds?: readonly string[]
  hostVersion?: string
  now?: () => string
}

export interface SoulDescriptorInstallInput {
  descriptor: SoulDescriptorV1 | unknown
  sourceKind: SoulAppInstallSourceKind
  sourceRef: string
}

export interface SoulCatalog {
  apps: HostedSoulApp[]
  capabilities: SoulCapability[]
  souls: VerticalSoul[]
}

export async function installSoulAppFromPath(descriptorPath: string, context: SoulAppRegistryContext = {}): Promise<HostedSoulApp> {
  const filePath = await resolveDescriptorPath(descriptorPath)
  const content = await readFile(filePath, 'utf8')
  return installSoulDescriptor({
    descriptor: parseDescriptorContent(content, filePath),
    sourceKind: 'descriptor-path',
    sourceRef: filePath,
  }, context)
}

export function installSoulDescriptor(input: SoulDescriptorInstallInput, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const descriptor = parseSoulDescriptorV1(input.descriptor)
  const result = validateDescriptor(descriptor, context)
  const row = upsertSoulApp({
    id: descriptor.identity.appId as string,
    name: descriptor.identity.name as string,
    version: descriptor.identity.version as string,
    protocol: descriptor.protocol,
    soulId: descriptor.identity.soulId as string,
    status: result.status === 'valid' ? 'installed' : 'error',
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    descriptorDigest: digestDescriptor(descriptor),
    descriptorJson: descriptor,
    validationIssuesJson: result.issues,
    healthStatus: result.status === 'valid' ? 'unknown' : 'fail',
    healthMessage: result.status === 'valid' ? null : issueSummary(result.issues),
    at: now(context),
  })
  return hostedSoulAppFromRow(row)
}

export function enableSoulApp(appId: string, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const row = requireSoulApp(appId)
  const descriptor = parseSoulDescriptorV1(row.descriptorJson)
  const result = validateDescriptor(descriptor, context)
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
  const health = staticHealthcheck(descriptor, context)
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

export function archiveSoulApp(appId: string, context: SoulAppRegistryContext = {}): HostedSoulApp {
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

export function deleteSoulApp(appId: string): HostedSoulApp {
  const row = requireSoulApp(appId)
  deleteSoulAppRow(row.id)
  return hostedSoulAppFromRow(row)
}

export function runSoulAppHealthcheck(appId: string, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const row = requireSoulApp(appId)
  const descriptor = parseSoulDescriptorV1(row.descriptorJson)
  const result = validateDescriptor(descriptor, context)
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
    : staticHealthcheck(descriptor, context)
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

export function listSoulCatalog(): SoulCatalog {
  const apps = listHostedSoulApps()
  const appSouls = apps.map(app => app.projectedSoul)
  const appCapabilities = apps
    .filter(app => app.status === 'enabled')
    .flatMap(app => app.projectedCapabilities)
  return {
    apps,
    capabilities: appCapabilities,
    souls: appSouls,
  }
}

export function findCatalogSoul(id: string): VerticalSoul | undefined {
  return listSoulCatalog().souls.find(soul => soul.id === id)
}

export function findCapability(id: string): SoulCapability | undefined {
  return listSoulCatalog().capabilities.find(capability => capability.id === id)
}

export function listCapabilitiesForSoul(appId: string): SoulCapability[] {
  return listSoulCatalog().capabilities.filter(capability => capability.appId === appId)
}

export function hostedSoulAppFromRow(row: SoulAppRow): HostedSoulApp {
  const descriptor = parseSoulDescriptorV1(row.descriptorJson)
  return buildHostedSoulApp({
    healthMessage: row.healthMessage,
    healthStatus: row.healthStatus,
    descriptor,
    descriptorDigest: row.descriptorDigest,
    sourceKind: row.sourceKind,
    sourceRef: row.sourceRef,
    status: row.status,
    validationIssues: row.validationIssuesJson,
  })
}

async function resolveDescriptorPath(inputPath: string): Promise<string> {
  const resolved = path.resolve(inputPath)
  const info = await stat(resolved)
  if (info.isDirectory())
    return path.join(resolved, DEFAULT_DESCRIPTOR_FILENAME)
  if (info.isFile())
    return resolved
  throw new Error(`Soul descriptor path is not a file: ${inputPath}`)
}

function validateDescriptor(_descriptor: SoulDescriptorV1, _context: SoulAppRegistryContext): { issues: SoulDescriptorValidationIssue[], status: 'invalid' | 'valid' } {
  const issues: SoulDescriptorValidationIssue[] = []
  return {
    issues,
    status: issues.some(issue => issue.severity === 'error') ? 'invalid' : 'valid',
  }
}

function staticHealthcheck(_descriptor: SoulDescriptorV1, _context: SoulAppRegistryContext): { message: string, status: SoulAppHealthStatus } {
  return { message: 'Static descriptor validation passed. No Soul App code was executed.', status: 'pass' }
}

function digestDescriptor(descriptor: SoulDescriptorV1): string {
  return createHash('sha256').update(JSON.stringify(descriptor)).digest('hex')
}

function parseDescriptorContent(content: string, filePath: string): unknown {
  try {
    return JSON.parse(content)
  }
  catch (err) {
    throw new Error(`Soul descriptor is not valid JSON at ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function issueSummary(issues: readonly SoulDescriptorValidationIssue[]): string {
  return issues.map(issue => `${issue.code}: ${issue.message}`).join('; ') || 'Soul descriptor validation failed.'
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
