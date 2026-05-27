import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { parseSoulDescriptorV1 } from '../../packages/soul-protocol/src/index'

const repoRoot = join(import.meta.dir, '..', '..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function readJson<T>(path: string): T {
  return JSON.parse(readRepoFile(path)) as T
}

describe('Freeform mounted workbench contract', () => {
  test('Freeform resolves to one SDK common micro-app workbench using search routing', () => {
    const descriptor = parseSoulDescriptorV1(readJson('souls/aiworker-freeform/dist/soul.descriptor.json'))

    expect(descriptor.workbench).toEqual({
      entry: 'dist/web/workbench/index.html',
      mode: 'sdk-common',
      router: { mode: 'search' },
      type: 'micro-app',
    })

    const commonWorkbench = readRepoFile('souls/aiworker-freeform/dist/web/workbench/index.html')
    expect(commonWorkbench).toContain('data-aiworker-common-workbench="true"')
    expect(commonWorkbench).toContain('data-module="bridge-event-stream"')
  })

  test('Host daemon mount resolver is locator-driven and does not expose source paths', () => {
    const source = readRepoFile('packages/host-daemon/src/modes/worker.ts')

    expect(source).toContain('app.get(\'/api/mount/workbench\'')
    expect(source).toContain('c.req.query(\'workerId\')')
    expect(source).toContain('c.req.query(\'workspaceId\')')
    expect(source).toContain('c.req.query(\'sessionId\')')
    expect(source).toContain('routerMode')
    expect(source).toContain('\'search\'')
    expect(source).not.toContain('appId and surfaceId are required until descriptor workbench resolution lands')
    expect(source).not.toContain('sourcePath')
    expect(source).not.toContain('host-adapter')
  })

  test('Host Web mounts production Soul workbenches through micro-app search routing', () => {
    const source = readRepoFile('apps/web/src/worker/studio/mounted-surface.tsx')

    expect(source).toContain('data-slot="soul-app-mounted-micro-app"')
    expect(source).toContain('router-mode="search"')
    expect(source).not.toContain('router-mode="pure"')
    expect(source).not.toContain('setBaseAppRouter')
    expect(source).not.toContain('router-mode="native"')
    expect(source).not.toContain('router-mode="native-scope"')
  })

  test('mounted surface scopes stay protocol-generic and do not encode review domain concepts', () => {
    const daemon = readRepoFile('packages/host-daemon/src/modes/worker.ts')
    const web = readRepoFile('apps/web/src/worker/studio/mounted-surface.tsx')
    const protocol = readRepoFile('packages/soul-protocol/src/soul-app/manifest.ts')
    const microAppProtocol = readRepoFile('packages/soul-protocol/src/soul-app/micro-app.ts')

    expect(protocol).toContain('zod.enum([\'app\', \'workspace\', \'session\', \'artifact\'])')
    for (const source of [daemon, web, microAppProtocol]) {
      expect(source).not.toContain('\'review\'')
      expect(source).not.toContain('\'review-panel\'')
      expect(source).not.toContain('reviewId:')
    }
  })
})
