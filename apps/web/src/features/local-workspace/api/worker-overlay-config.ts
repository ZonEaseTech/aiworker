import type { LocalWorkerConfigKind, LocalWorkerConfigTarget, LocalWorkerOverlayAsset } from '@zonease/aiworker-soul-protocol'
import type { WorkerConfigSaveBody } from './types'

import { archiveWorkerConfigValue, saveWorkerConfigValue } from './worker-config'

interface WorkerOverlayConfigEntry {
  body: WorkerConfigSaveBody
  configKey: string
}

export async function saveWorkerOverlayConfigValues(workerId: string, previousAssets: LocalWorkerOverlayAsset[], nextAssets: LocalWorkerOverlayAsset[]): Promise<void> {
  const previousEntries = workerOverlayConfigEntries(previousAssets)
  const nextEntries = workerOverlayConfigEntries(nextAssets)
  const nextKeys = new Set(nextEntries.map(entry => entry.configKey))

  for (const entry of nextEntries) {
    await saveWorkerConfigValue(workerId, entry.configKey, entry.body)
  }

  for (const entry of previousEntries) {
    if (!nextKeys.has(entry.configKey))
      await archiveWorkerConfigValue(workerId, entry.configKey)
  }
}

function workerOverlayConfigEntries(assets: LocalWorkerOverlayAsset[]): WorkerOverlayConfigEntry[] {
  const groups = new Map<string, LocalWorkerOverlayAsset[]>()
  for (const asset of assets.filter(isOverlayAsset)) {
    const configKey = workerOverlayConfigKey(asset)
    groups.set(configKey, [...groups.get(configKey) ?? [], asset])
  }

  return [...groups.entries()].map(([configKey, group]) => ({
    body: workerOverlayConfigBody(group),
    configKey,
  }))
}

function isOverlayAsset(asset: LocalWorkerOverlayAsset): boolean {
  return asset.source !== 'baseline'
}

function workerOverlayConfigBody(assets: LocalWorkerOverlayAsset[]): WorkerConfigSaveBody {
  const first = assets[0]
  if (!first)
    throw new Error('Worker overlay config entry requires at least one asset.')

  return {
    checksum: first.checksum ?? null,
    enabled: assets.some(asset => asset.enabled),
    kind: workerOverlayConfigKind(first),
    options: workerOverlayConfigOptions(first),
    sourceRef: first.sourceRef,
    target: workerOverlayConfigTarget(first, assets),
    updatedBy: 'web',
  }
}

function workerOverlayConfigKind(asset: LocalWorkerOverlayAsset): LocalWorkerConfigKind {
  if (asset.kind === 'entry-file')
    return 'entry-file-overlay'
  if (asset.kind === 'mcp-client')
    return 'mcp-overlay'
  return 'skill-overlay'
}

function workerOverlayConfigOptions(asset: LocalWorkerOverlayAsset): Record<string, unknown> {
  const options: Record<string, unknown> = {}
  if (Object.keys(asset.metadataJson).length > 0)
    options.metadataJson = asset.metadataJson
  if (Object.keys(asset.optionsJson).length > 0)
    options.optionsJson = asset.optionsJson
  if (asset.kind === 'entry-file')
    options.targetPath = asset.id
  if (asset.kind === 'skill')
    options.replaces = `descriptor://engine/skills/${asset.id}`
  return options
}

function workerOverlayConfigTarget(asset: LocalWorkerOverlayAsset, assets: LocalWorkerOverlayAsset[]): LocalWorkerConfigTarget {
  if (asset.kind === 'entry-file')
    return 'all'

  const targets = new Set(assets.map(item => item.target))
  if (targets.has('codex') && targets.has('claude-code'))
    return 'all'
  if (targets.has('codex'))
    return 'codex'
  if (targets.has('claude-code'))
    return 'claude-code'
  return 'none'
}

function workerOverlayConfigKey(asset: LocalWorkerOverlayAsset): string {
  return `${workerOverlayConfigKind(asset)}:${asset.id}`
}
