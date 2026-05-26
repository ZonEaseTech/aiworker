import type {
  HostedSoulApp,
  SoulAppEngineAssets,
  SoulAppEngineTarget,
  SoulAppHealthStatus,
  SoulAppInstallSourceKind,
  SoulAppManifest,
  SoulAppManifestValidationIssue,
  SoulDescriptorV1,
} from '@zonease/aiworker-soul-protocol'
import type { SoulAppRow } from '@zonease/aiworker-storage-sqlite/worker'

import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  buildHostedSoulApp,
  parseSoulDescriptorV1,
  projectSoulAppCapabilityTemplates,
  projectSoulAppSoul,
} from '@zonease/aiworker-soul-protocol'
import {
  getSoulApp,
  listSoulApps,
  updateSoulAppLifecycle,
  upsertSoulApp,
} from '@zonease/aiworker-storage-sqlite/worker'

// -- inlined from deleted shared types --
interface CapabilityTemplate {
  description: string
  id: string
  inputHints: readonly string[]
  name: string
  outputKind: string
  promptRef: string
  reviewRubricRef: string | null
  soulId: string
}

interface VerticalSoul {
  defaultTemplates: readonly string[]
  description: string
  domain: string
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

export interface HostSoulCatalog {
  apps: HostedSoulApp[]
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
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
    manifestDigest: digestDescriptor(descriptor),
    manifestJson: descriptor,
    validationIssuesJson: result.issues,
    healthStatus: result.status === 'valid' ? 'unknown' : 'fail',
    healthMessage: result.status === 'valid' ? null : issueSummary(result.issues),
    at: now(context),
  })
  return hostedSoulAppFromRow(row)
}

export function enableSoulApp(appId: string, context: SoulAppRegistryContext = {}): HostedSoulApp {
  const row = requireSoulApp(appId)
  const descriptor = parseSoulDescriptorV1(row.manifestJson)
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
  const descriptor = parseSoulDescriptorV1(row.manifestJson)
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
  const descriptor = parseSoulDescriptorV1(row.manifestJson)
  const manifest = runtimeManifestForDescriptor(descriptor)
  return buildHostedSoulApp({
    healthMessage: row.healthMessage,
    healthStatus: row.healthStatus,
    descriptor,
    descriptorDigest: row.manifestDigest,
    manifest,
    manifestDigest: row.manifestDigest,
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

function validateDescriptor(_descriptor: SoulDescriptorV1, _context: SoulAppRegistryContext): { issues: SoulAppManifestValidationIssue[], status: 'invalid' | 'valid' } {
  const issues: SoulAppManifestValidationIssue[] = []
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

function runtimeManifestForDescriptor(descriptor: SoulDescriptorV1): SoulAppManifest {
  const appId = descriptor.identity.appId as string
  const soulId = descriptor.identity.soulId as string
  const version = descriptor.identity.version as string
  const capabilities = descriptor.capabilities.map((capability) => {
    const record = capability as Record<string, unknown>
    const id = String(record.id)
    const name = typeof record.name === 'string' ? record.name : id
    const prompt = record.prompt && typeof record.prompt === 'object' ? record.prompt as Record<string, unknown> : {}
    return {
      description: typeof record.purpose === 'string' ? record.purpose : name,
      id,
      name,
      outputKind: 'session',
      promptRef: typeof prompt.ref === 'string' ? prompt.ref : `dist/product/capabilities/${id}/prompt.md`,
      version: '0.1.0',
      workspaceTypes: ['workspace'],
    }
  })
  const engineAssets = engineAssetsForDescriptor(descriptor)
  return {
    api: {
      entry: descriptor.api?.entry ?? 'dist/api/index.js',
      ...(descriptor.api
        ? {
            localService: {
              command: ['bun', descriptor.api.entry.replace(/^dist\//, '')],
              healthPath: '/health',
            },
            routePrefix: `/api/apps/${appId}`,
          }
        : {}),
    },
    capabilities,
    compatibility: {
      host: { minVersion: '0.0.0' },
      sdk: { minVersion: '0.0.0' },
    },
    connectors: {
      optional: [],
      required: [],
    },
    description: String(descriptor.identity.description ?? descriptor.identity.name),
    engineAssets,
    exports: {},
    healthcheck: {
      kind: 'protocol-handler',
      ref: 'descriptor.static',
      timeoutMs: 5000,
    },
    id: appId,
    modes: {
      hostMounted: { supported: true },
      standalone: { supported: false },
    },
    name: String(descriptor.identity.name),
    pack: {
      refs: [{
        id: appId,
        ref: 'dist/soul.descriptor.json',
        source: 'embedded',
        version,
      }],
    },
    permissions: [{
      action: 'mount',
      kind: 'ui',
      reason: 'Mount the descriptor-declared Soul workbench.',
      target: `${appId}-workbench`,
    }],
    protocol: 'soul-app/v1',
    soul: {
      description: String(descriptor.identity.description ?? descriptor.identity.name),
      domain: soulId,
      id: soulId,
      name: String(descriptor.identity.name),
      version,
    },
    storage: {
      migrations: [],
      namespace: appId,
    },
    ui: {
      artifactPreviews: [],
      panels: [],
      routes: [{
        entry: descriptor.workbench.entry,
        id: 'workbench',
        label: 'Workbench',
        path: '/workbench',
        surface: {
          entry: '/micro-app/workbench',
          renderer: 'micro-app',
          scope: 'app',
        },
      }],
      workspaceWidgets: [],
    },
    version,
    workspaceTypes: [{
      defaultCapabilityIds: capabilities.map(capability => capability.id),
      description: 'Opaque workspace locator owned by the Soul App.',
      id: 'workspace',
      name: 'Workspace',
    }],
  }
}

function engineAssetsForDescriptor(descriptor: SoulDescriptorV1): SoulAppEngineAssets {
  const mcpClients = Object.entries(descriptor.engine.mcp?.targets ?? {})
    .flatMap(([target, entry]) => {
      if (!isSoulAppEngineTarget(target))
        return []
      return [{
        source: path.posix.dirname(entry.file.replace(/^dist\//, '')),
        target,
      }]
    })
  return {
    workspace: {
      source: descriptor.engine.workspaceAssets?.source.replace(/^dist\//, '') ?? 'engine-assets/workspace',
    },
    ...(descriptor.engine.skills
      ? {
          skills: {
            source: descriptor.engine.skills.source.replace(/^dist\//, ''),
            targets: ['codex', 'claude-code'],
          },
        }
      : {}),
    ...(mcpClients.length > 0 ? { mcpClients } : {}),
  }
}

function isSoulAppEngineTarget(value: string): value is SoulAppEngineTarget {
  return value === 'codex' || value === 'claude-code'
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
