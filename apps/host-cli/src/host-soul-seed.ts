import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import { listSoulReleases, publishSoulRelease } from '@zonease/aiworker-storage-sqlite/host'

// Dev convenience: when a freshly-served Host registry is empty, seed it from
// built Soul descriptors discovered under <dir>/*/dist/soul.descriptor.json.
// Requires the Host DB to already be initialized (createHostServer does this).
// No-op once anything is published, so manual `soul publish` is never overridden.
export function seedSoulReleasesFromDir(dir: string, log: (message: string) => void = () => {}): void {
  if (!existsSync(dir) || listSoulReleases().length > 0)
    return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue
    const descriptorPath = join(dir, entry.name, 'dist', 'soul.descriptor.json')
    if (!existsSync(descriptorPath))
      continue
    try {
      const descriptor = parseSoulDescriptorV1(JSON.parse(readFileSync(descriptorPath, 'utf8')))
      const identity = descriptor.identity as Record<string, unknown>
      if (typeof identity.id !== 'string' || typeof identity.name !== 'string')
        continue
      publishSoulRelease({ descriptor, name: identity.name, publishedBy: 'cli', soulId: identity.id, source: 'official' })
    }
    catch (error) {
      log(`seed soul release skipped (${entry.name}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
