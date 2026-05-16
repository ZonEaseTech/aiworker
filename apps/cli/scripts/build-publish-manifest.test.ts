import { mkdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { copyDir, copyOfficialApp, patchOfficialAppManifest, shouldSkipOfficialAppResource } from './build-publish-manifest'

describe('CLI publish manifest builder', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-publish-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('copies release resources while excluding test-only files', async () => {
    const src = path.join(root, 'src')
    const dst = path.join(root, 'dst')
    mkdirSync(path.join(src, 'nested'), { recursive: true })
    await writeFile(path.join(src, 'keep.ts'), 'export const keep = true\n')
    await writeFile(path.join(src, 'index.test.ts'), 'throw new Error("not shipped")\n')
    await writeFile(path.join(src, 'nested', 'example.spec.tsx'), 'throw new Error("not shipped")\n')

    await copyDir(src, dst, { skip: shouldSkipOfficialAppResource })

    await expect(stat(path.join(dst, 'keep.ts'))).resolves.toBeTruthy()
    await expect(stat(path.join(dst, 'index.test.ts'))).rejects.toThrow()
    await expect(stat(path.join(dst, 'nested', 'example.spec.tsx'))).rejects.toThrow()
  })

  it('patches official app manifests to execute bundled dist entrypoints', async () => {
    const manifestPath = path.join(root, 'soul-app.manifest.json')
    await writeFile(manifestPath, JSON.stringify({
      api: {
        localService: { command: ['bun', 'host-adapter/mounted/host-mounted.ts'] },
      },
      modes: {
        hostMounted: { entry: './host-adapter/mounted/host-mounted.ts' },
        standalone: { entry: './host-adapter/standalone/standalone.ts' },
      },
    }))

    await patchOfficialAppManifest(manifestPath)

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      api: { localService: { command: string[] } }
      modes: { hostMounted: { entry: string }, standalone: { entry: string } }
    }
    expect(manifest.api.localService.command).toEqual(['bun', 'dist/host-mounted.js'])
    expect(manifest.modes.hostMounted.entry).toBe('./dist/host-mounted.js')
    expect(manifest.modes.standalone.entry).toBe('./dist/standalone.js')
  })

  it('copies an official app resource tree without copied tests', async () => {
    const appsRoot = path.join(root, 'apps')
    const officialAppsRoot = path.join(root, 'dist', 'official-apps')
    const appRoot = path.join(appsRoot, 'aiworker-demo')
    mkdirSync(path.join(appRoot, 'host-adapter', 'mounted'), { recursive: true })
    await writeFile(path.join(appRoot, 'soul-app.manifest.json'), JSON.stringify({
      api: {
        localService: { command: ['bun', 'host-adapter/mounted/host-mounted.ts'] },
      },
      modes: {
        hostMounted: { entry: './host-adapter/mounted/host-mounted.ts' },
        standalone: { entry: './host-adapter/standalone/standalone.ts' },
      },
    }))
    await writeFile(path.join(appRoot, 'host-adapter', 'mounted', 'host-mounted.ts'), 'export {}\n')
    await writeFile(path.join(appRoot, 'host-adapter', 'mounted', 'host-mounted.test.ts'), 'throw new Error("not shipped")\n')

    await copyOfficialApp('aiworker-demo', { appsRoot, officialAppsRoot })

    const copiedManifestPath = path.join(officialAppsRoot, 'aiworker-demo', 'soul-app.manifest.json')
    const copiedManifest = JSON.parse(await readFile(copiedManifestPath, 'utf8')) as {
      api: { localService: { command: string[] } }
    }
    expect(copiedManifest.api.localService.command).toEqual(['bun', 'dist/host-mounted.js'])
    await expect(stat(path.join(officialAppsRoot, 'aiworker-demo', 'host-adapter', 'mounted', 'host-mounted.ts'))).resolves.toBeTruthy()
    await expect(stat(path.join(officialAppsRoot, 'aiworker-demo', 'host-adapter', 'mounted', 'host-mounted.test.ts'))).rejects.toThrow()
  })
})
