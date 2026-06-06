import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { ensureOfficialSoulDists } from './official-soul-dist'

describe('official Soul dist builder', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aiworker-official-soul-dist-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('runs each official Soul package build before accepting descriptor output', async () => {
    const appRoot = join(root, 'souls', 'aiworker-demo')
    await mkdir(appRoot, { recursive: true })
    await writeFile(
      join(appRoot, 'package.json'),
      JSON.stringify({ name: '@zonease/aiworker-demo', scripts: { build: 'bun scripts/build.ts' } }),
    )

    const commands: string[][] = []
    const results = await ensureOfficialSoulDists({
      definitions: [{ descriptorPath: 'souls/aiworker-demo/dist/soul.descriptor.json', id: 'aiworker-demo' }],
      repoRoot: root,
      runCommand: async (command, context) => {
        commands.push([...command])
        expect(context).toMatchObject({
          appId: 'aiworker-demo',
          cwd: root,
          packageName: '@zonease/aiworker-demo',
        })
        await mkdir(join(appRoot, 'dist'), { recursive: true })
        await writeFile(join(appRoot, 'dist', 'soul.descriptor.json'), '{"protocol":"soul/v1"}\n')
      },
    })

    expect(commands).toEqual([
      ['bun', 'run', '--filter', '@zonease/aiworker-demo', 'build'],
    ])
    expect(results).toEqual([
      {
        appId: 'aiworker-demo',
        descriptorPath: join(root, 'souls/aiworker-demo/dist/soul.descriptor.json'),
        packageName: '@zonease/aiworker-demo',
      },
    ])
    expect(JSON.parse(await readFile(join(appRoot, 'dist', 'soul.descriptor.json'), 'utf8')).protocol).toBe('soul/v1')
  })

  it('fails when a Soul build does not produce its descriptor', async () => {
    const appRoot = join(root, 'souls', 'aiworker-demo')
    await mkdir(appRoot, { recursive: true })
    await writeFile(join(appRoot, 'package.json'), JSON.stringify({ name: '@zonease/aiworker-demo' }))

    await expect(ensureOfficialSoulDists({
      definitions: [{ descriptorPath: 'souls/aiworker-demo/dist/soul.descriptor.json', id: 'aiworker-demo' }],
      repoRoot: root,
      runCommand: async () => undefined,
    })).rejects.toThrow('Official Soul build did not create descriptor for aiworker-demo')
  })

  it('imports official Soul definitions without loading runtime registry dependencies', async () => {
    const source = await readFile(join(import.meta.dirname, 'official-soul-dist.ts'), 'utf8')

    expect(source).not.toMatch(/worker-runtime\/src\/soul-app\/official['"]/)
    expect(source).toContain('worker-runtime/src/soul-app/official-definitions')
  })
})
