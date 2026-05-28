import { readFileSync } from 'node:fs'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'

export const OFFICIAL_FREEFORM_APP_ID = 'aiworker-freeform'
const OFFICIAL_FREEFORM_SOUL_ID = 'freeform'
const OFFICIAL_FREEFORM_NAME = 'AIWorker Freeform'
const OFFICIAL_FREEFORM_CAPABILITY_ID = 'default'
const OFFICIAL_FREEFORM_CAPABILITY_NAME = 'Freeform Session'

export function parseOfficialFreeformDescriptorJson(text: string): ReturnType<typeof parseSoulDescriptorV1> {
  const descriptor = parseSoulDescriptorV1(JSON.parse(text))
  if (descriptor.identity.appId !== OFFICIAL_FREEFORM_APP_ID)
    throw new Error(`expected ${OFFICIAL_FREEFORM_APP_ID}`)
  if (descriptor.identity.soulId !== OFFICIAL_FREEFORM_SOUL_ID || descriptor.identity.name !== OFFICIAL_FREEFORM_NAME)
    throw new Error('expected official Freeform identity')
  const defaultCapability = descriptor.capabilities.find(isOfficialFreeformDefaultCapability)
  if (defaultCapability?.name !== OFFICIAL_FREEFORM_CAPABILITY_NAME)
    throw new Error('expected official Freeform default capability')
  return descriptor
}

function isOfficialFreeformDefaultCapability(capability: unknown): capability is { id: string, name: string } {
  return typeof capability === 'object'
    && capability !== null
    && 'id' in capability
    && 'name' in capability
    && capability.id === OFFICIAL_FREEFORM_CAPABILITY_ID
    && typeof capability.name === 'string'
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
