import { mkdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { copyDir, copyOfficialApp, shouldSkipOfficialAppResource } from './build-publish-manifest'

describe('CLI publish manifest builder', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-publish-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('declares the Node runtime floor required by packaged Web assets', async () => {
    const pkg = JSON.parse(await readFile(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
      engines?: Record<string, string>
    }

    expect(pkg.engines?.node).toBe('>=20.19.0 <21 || >=22.12.0')
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

  it('copies a descriptor-only official Soul dist tree without source hooks or tests', async () => {
    const soulsRoot = path.join(root, 'souls')
    const officialAppsRoot = path.join(root, 'dist', 'official-apps')
    const appRoot = path.join(soulsRoot, 'aiworker-demo')
    mkdirSync(path.join(appRoot, 'dist', 'engine-assets', 'workspace'), { recursive: true })
    mkdirSync(path.join(appRoot, 'dist', 'host-adapter'), { recursive: true })
    await writeFile(path.join(appRoot, 'dist', 'soul.descriptor.json'), JSON.stringify({
      engine: {
        workspaceAssets: { source: 'dist/engine-assets/workspace' },
      },
      identity: {
        id: 'aiworker-demo',
        name: 'Demo',
      },
      protocol: 'soul/v1',
    }))
    await writeFile(path.join(appRoot, 'dist', 'engine-assets', 'workspace', 'AGENTS.md'), '# Demo\n')
    await writeFile(path.join(appRoot, 'dist', 'engine-assets', 'workspace', 'AGENTS.test.ts'), 'throw new Error("not shipped")\n')
    await writeFile(path.join(appRoot, 'dist', 'host-adapter', 'legacy.js'), 'throw new Error("not shipped")\n')

    await copyOfficialApp('aiworker-demo', { officialAppsRoot, soulsRoot })

    const copiedDescriptorPath = path.join(officialAppsRoot, 'aiworker-demo', 'dist', 'soul.descriptor.json')
    const copiedDescriptor = JSON.parse(await readFile(copiedDescriptorPath, 'utf8')) as {
      protocol: string
    }
    expect(copiedDescriptor.protocol).toBe('soul/v1')
    await expect(stat(path.join(officialAppsRoot, 'aiworker-demo', 'dist', 'engine-assets', 'workspace', 'AGENTS.md'))).resolves.toBeTruthy()
    await expect(stat(path.join(officialAppsRoot, 'aiworker-demo', 'dist', 'engine-assets', 'workspace', 'AGENTS.test.ts'))).rejects.toThrow()
    await expect(stat(path.join(officialAppsRoot, 'aiworker-demo', 'dist', 'host-adapter', 'legacy.js'))).rejects.toThrow()
  })
})
