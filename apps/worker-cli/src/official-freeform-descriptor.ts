import { readFileSync } from 'node:fs'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'

export const OFFICIAL_FREEFORM_APP_ID = 'aiworker-freeform'
const OFFICIAL_FREEFORM_NAME = 'AIWorker Freeform'
const OFFICIAL_FREEFORM_MCP_REFS = {
  'claude-code': 'dist/engine-assets/mcp/claude-code/.mcp.json',
  'codex': 'dist/engine-assets/mcp/codex/config.toml',
} as const

export function parseOfficialFreeformDescriptorJson(text: string): ReturnType<typeof parseSoulDescriptorV1> {
  const descriptor = parseSoulDescriptorV1(JSON.parse(text))
  if (descriptor.identity.id !== OFFICIAL_FREEFORM_APP_ID)
    throw new Error(`expected ${OFFICIAL_FREEFORM_APP_ID}`)
  if (descriptor.identity.name !== OFFICIAL_FREEFORM_NAME)
    throw new Error('expected official Freeform identity')
  if (!hasOfficialFreeformMcpTargets(descriptor.engine.mcp?.targets))
    throw new Error('expected official Freeform native MCP targets')
  return descriptor
}

function hasOfficialFreeformMcpTargets(targets: unknown): boolean {
  if (typeof targets !== 'object' || targets === null)
    return false

  const targetRecord = targets as Record<string, unknown>
  for (const [target, file] of Object.entries(OFFICIAL_FREEFORM_MCP_REFS)) {
    if (!(target in targetRecord))
      return false
    const value = targetRecord[target]
    if (typeof value !== 'object' || value === null || !('file' in value) || value.file !== file)
      return false
  }

  return true
}

export function isOfficialFreeformDescriptorJson(text: string): boolean {
  try {
    parseOfficialFreeformDescriptorJson(text)
    return true
  }
  catch {
    return false
  }
}

export function isOfficialFreeformDescriptorFile(descriptorPath: string): boolean {
  try {
    return isOfficialFreeformDescriptorJson(readFileSync(descriptorPath, 'utf8'))
  }
  catch {
    return false
  }
}
