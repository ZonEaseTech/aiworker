import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  artifact,
  buildSoul,
  commonWorkbench,
  extendWorkbench,
  nativeMcp,
  skill,
  validateSoul,
  workspaceAsset,
} from './index'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
})

describe('SDK descriptor build conventions', () => {
  test('keeps builder helpers as explicit build-time declarations', () => {
    expect(artifact({ id: 'note', schemaRef: 'product/artifacts/note.schema.json' })).toEqual({
      id: 'note',
      schemaRef: 'product/artifacts/note.schema.json',
    })
    expect(workspaceAsset({ source: 'engine/workspace' })).toEqual({ source: 'engine/workspace' })
    expect(skill({ id: 'freeform-session' })).toEqual({ id: 'freeform-session' })
    expect(nativeMcp({ file: 'engine/mcp/codex/config.toml', target: 'codex' })).toEqual({
      file: 'engine/mcp/codex/config.toml',
      target: 'codex',
    })
    expect(extendWorkbench(commonWorkbench(), { source: 'web/mounted/index.html' })).toEqual({
      mode: 'custom',
      source: 'web/mounted/index.html',
    })
  })

  test('builds a descriptor-only Freeform Soul from soul.config.ts and directory conventions', async () => {
    const rootDir = await createFreeformSoulFixture()

    const result = await buildSoul(rootDir)

    expect(result.descriptor.identity).toMatchObject({
      appId: 'aiworker-freeform',
      name: 'AIWorker Freeform',
      soulId: 'freeform',
      version: '0.1.0',
    })
    expect(result.descriptor.capabilities).toEqual([
      {
        id: 'default',
        name: 'Freeform Session',
        prompt: {
          ref: 'dist/product/capabilities/default/prompt.md',
          type: 'packaged-file',
        },
        purpose: 'Start an open-ended engine-backed AIWorker session inside a workspace locator.',
      },
    ])
    expect(result.descriptor.workbench).toEqual({
      entry: 'dist/web/workbench/index.html',
      mode: 'sdk-common',
      router: { mode: 'search' },
      type: 'micro-app',
    })
    expect(result.descriptor.engine).toEqual({
      mcp: {
        targets: {
          'claude-code': { file: 'dist/engine-assets/mcp/claude-code/.mcp.json' },
          'codex': { file: 'dist/engine-assets/mcp/codex/config.toml' },
        },
      },
      skills: { source: 'dist/engine-assets/skills' },
      workspaceAssets: { source: 'dist/engine-assets/workspace' },
    })
    expect(result.discovery.generatedSections).toEqual([
      'capabilities',
      'workbench',
      'engine.workspaceAssets',
      'engine.skills',
      'engine.mcp',
    ])
    expect(existsSync(join(rootDir, 'dist/soul.descriptor.json'))).toBe(true)
    expect(existsSync(join(rootDir, 'dist/web/workbench/index.html'))).toBe(true)
    const commonWorkbench = readFileSync(join(rootDir, 'dist/web/workbench/index.html'), 'utf8')
    expect(commonWorkbench).toContain('data-aiworker-bridge-event-refs="engine-invocations,engine-invocation-events"')
    expect(commonWorkbench).toContain('Bridge event refs')
    expect(existsSync(join(rootDir, 'dist/engine-assets/skills/freeform-session/SKILL.md'))).toBe(true)
  })

  test('allows author-owned native MCP literal secrets without copying them into descriptor or diagnostics', async () => {
    const rootDir = await createFreeformSoulFixture({
      codexMcp: `[mcp_servers.local]\ncommand = "node"\nargs = ["server.js"]\napi_key = "literal-test-secret"\n`,
    })

    const result = await buildSoul(rootDir)

    expect(JSON.stringify(result.descriptor)).not.toContain('literal-test-secret')
    expect(JSON.stringify(result.discovery)).not.toContain('literal-test-secret')
    expect(readFileSync(join(rootDir, 'dist/engine-assets/mcp/codex/config.toml'), 'utf8')).toContain('literal-test-secret')
  })

  test('validates conventions before Host ever reads Soul source at runtime', async () => {
    const rootDir = await createFreeformSoulFixture()

    const validation = await validateSoul(rootDir)

    expect(validation.status).toBe('valid')
    expect(validation.discovery.capabilities).toEqual([{ id: 'default', promptPath: 'product/capabilities/default/prompt.md' }])
    expect(validation.discovery.workbench).toEqual({ mode: 'sdk-common', source: 'sdk-common' })
    expect(validation.discovery.mcpTargets).toEqual([
      { file: 'engine/mcp/claude-code/.mcp.json', target: 'claude-code' },
      { file: 'engine/mcp/codex/config.toml', target: 'codex' },
    ])
  })
})

async function createFreeformSoulFixture(options: { codexMcp?: string } = {}): Promise<string> {
  const fixtureParent = join(import.meta.dir, '../../..', 'tmp')
  mkdirSync(fixtureParent, { recursive: true })
  const rootDir = mkdtempSync(join(fixtureParent, 'aiworker-freeform-sdk-'))
  tempRoots.push(rootDir)

  await mkdir(join(rootDir, 'product/capabilities/default'), { recursive: true })
  await mkdir(join(rootDir, 'engine/workspace'), { recursive: true })
  await mkdir(join(rootDir, 'engine/skills/freeform-session'), { recursive: true })
  await mkdir(join(rootDir, 'engine/mcp/codex'), { recursive: true })
  await mkdir(join(rootDir, 'engine/mcp/claude-code'), { recursive: true })
  await mkdir(join(rootDir, 'node_modules/@zonease'), { recursive: true })

  symlinkSync(join(import.meta.dir, '..'), join(rootDir, 'node_modules/@zonease/aiworker-soul-app-sdk'), 'dir')

  writeFileSync(join(rootDir, 'soul.config.ts'), `import { capability, defineSoul } from '@zonease/aiworker-soul-app-sdk'

export default defineSoul({
  appId: 'aiworker-freeform',
  capabilities: [
    capability({
      id: 'default',
      name: 'Freeform Session',
      purpose: 'Start an open-ended engine-backed AIWorker session inside a workspace locator.',
    }),
  ],
  id: 'aiworker-freeform',
  name: 'AIWorker Freeform',
  soulId: 'freeform',
  version: '0.1.0',
})
`)
  writeFileSync(join(rootDir, 'product/capabilities/default/prompt.md'), [
    'Operate inside the provided workspace root.',
    'Use projected skills and native MCP config when available.',
    'Report progress through the native engine.',
    'Avoid assuming a domain-specific workflow.',
    'Leave domain interpretation to the user or a future Soul App.',
    '',
  ].join('\n'))
  writeFileSync(join(rootDir, 'engine/workspace/AGENTS.md'), '# AIWorker Freeform Workspace\n')
  writeFileSync(join(rootDir, 'engine/skills/freeform-session/SKILL.md'), '# Freeform Session\n')
  writeFileSync(join(rootDir, 'engine/mcp/codex/config.toml'), options.codexMcp ?? '# Freeform Codex MCP placeholder\n')
  writeFileSync(join(rootDir, 'engine/mcp/claude-code/.mcp.json'), '{ "mcpServers": {} }\n')

  return rootDir
}
