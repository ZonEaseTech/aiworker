import { readFileSync } from 'node:fs'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'

export const OFFICIAL_FREEFORM_APP_ID = 'aiworker-freeform'

export function parseOfficialFreeformDescriptorJson(text: string): ReturnType<typeof parseSoulDescriptorV1> {
  const descriptor = parseSoulDescriptorV1(JSON.parse(text))
  if (descriptor.identity.appId !== OFFICIAL_FREEFORM_APP_ID)
    throw new Error(`expected ${OFFICIAL_FREEFORM_APP_ID}`)
  return descriptor
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
