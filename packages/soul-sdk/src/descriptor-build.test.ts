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
    expect(result.descriptor).not.toHaveProperty('capabilities')
    expect(result.descriptor).not.toHaveProperty('workbench')
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
      'engine.workspaceAssets',
      'engine.skills',
      'engine.mcp',
    ])
    expect(existsSync(join(rootDir, 'dist/soul.descriptor.json'))).toBe(true)
    // v1 builds no workbench bundle: the Worker owns and renders its Workbench.
    expect(existsSync(join(rootDir, 'dist/web/workbench'))).toBe(false)
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

  test('keeps app-owned API source out of convention discovery and build output', async () => {
    const rootDir = await createFreeformSoulFixture()
    await mkdir(join(rootDir, 'api/src'), { recursive: true })
    writeFileSync(join(rootDir, 'api/src/index.ts'), 'export function handler() { return new Response("ok") }\n')

    const validation = await validateSoul(rootDir)
    const result = await buildSoul(rootDir)

    expect(validation.discovery.generatedSections).not.toContain('api')
    expect(result.discovery.generatedSections).not.toContain('api')
    expect(result.descriptor).not.toHaveProperty('api')
    expect(JSON.stringify(result.descriptor)).not.toContain('api/src/index.ts')
    expect(existsSync(join(rootDir, 'dist/api'))).toBe(false)
  })

  test('redacts secret-like values from SDK validation diagnostics', async () => {
    const rootDir = await createFreeformSoulFixture()
    writeFileSync(join(rootDir, 'soul.config.ts'), `throw new Error('token=sk-sdk-config-secret')
`)

    const result = await validateSoul(rootDir)

    expect(result.status).toBe('invalid')
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_config',
        path: 'soul.config.ts',
      }),
    ]))
    const diagnostics = JSON.stringify(result.issues)
    expect(diagnostics).not.toContain('sk-sdk-config-secret')
    expect(diagnostics).toContain('[REDACTED]')
  })

  test('redacts extended provider token shapes from SDK validation diagnostics', async () => {
    // For the PEM block, the base64 key body is the secret, so the whole multiline
    // block (not just the header) must be masked from diagnostics.
    const pemBlock = '-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEAabcdef0123456789\\n-----END RSA PRIVATE KEY-----'
    const cases: Array<{ label: string, secret: string, leakSubstring: string }> = [
      { label: 'github-pat', secret: 'ghp_0123456789abcdefghijklmnopqrstuvwxyz', leakSubstring: 'ghp_0123456789abcdefghijklmnopqrstuvwxyz' },
      { label: 'github-oauth', secret: 'gho_0123456789abcdefghijklmnopqrstuvwxyz', leakSubstring: 'gho_0123456789abcdefghijklmnopqrstuvwxyz' },
      { label: 'github-fine-grained', secret: 'github_pat_0123456789abcdefghijklmnopqrstuvwxyz', leakSubstring: 'github_pat_0123456789abcdefghijklmnopqrstuvwxyz' },
      { label: 'aws-access-key', secret: 'AKIAIOSFODNN7EXAMPLE', leakSubstring: 'AKIAIOSFODNN7EXAMPLE' },
      { label: 'google-api-key', secret: 'AIzaSyA1234567890abcdefghijklmnopqrstuvw', leakSubstring: 'AIzaSyA1234567890abcdefghijklmnopqrstuvw' },
      { label: 'jwt', secret: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', leakSubstring: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U' },
      { label: 'pem-multiline', secret: pemBlock, leakSubstring: 'MIIEpAIBAAKCAQEAabcdef0123456789' },
    ]

    for (const { label, secret, leakSubstring } of cases) {
      const rootDir = await createFreeformSoulFixture()
      writeFileSync(join(rootDir, 'soul.config.ts'), `throw new Error('engine boot failed: ${secret}')\n`)

      const result = await validateSoul(rootDir)

      expect(result.status, label).toBe('invalid')
      const diagnostics = JSON.stringify(result.issues)
      expect(diagnostics, label).not.toContain(leakSubstring)
      expect(diagnostics, label).toContain('[REDACTED]')
    }
  })

  test('validates conventions before Host ever reads Soul source at runtime', async () => {
    const rootDir = await createFreeformSoulFixture()

    const validation = await validateSoul(rootDir)

    expect(validation.status).toBe('valid')
    expect(validation.discovery).not.toHaveProperty('capabilities')
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

  await mkdir(join(rootDir, 'engine/workspace'), { recursive: true })
  await mkdir(join(rootDir, 'engine/skills/freeform-session'), { recursive: true })
  await mkdir(join(rootDir, 'engine/mcp/codex'), { recursive: true })
  await mkdir(join(rootDir, 'engine/mcp/claude-code'), { recursive: true })
  await mkdir(join(rootDir, 'node_modules/@zonease'), { recursive: true })

  symlinkSync(join(import.meta.dir, '..'), join(rootDir, 'node_modules/@zonease/aiworker-soul-sdk'), 'dir')

  writeFileSync(join(rootDir, 'soul.config.ts'), `import { defineSoul } from '@zonease/aiworker-soul-sdk'

export default defineSoul({
  appId: 'aiworker-freeform',
  id: 'aiworker-freeform',
  name: 'AIWorker Freeform',
  soulId: 'freeform',
  version: '0.1.0',
})
`)
  writeFileSync(join(rootDir, 'engine/workspace/AGENTS.md'), '# AIWorker Freeform Workspace\n')
  writeFileSync(join(rootDir, 'engine/skills/freeform-session/SKILL.md'), '# Freeform Session\n')
  writeFileSync(join(rootDir, 'engine/mcp/codex/config.toml'), options.codexMcp ?? '# Freeform Codex MCP placeholder\n')
  writeFileSync(join(rootDir, 'engine/mcp/claude-code/.mcp.json'), '{ "mcpServers": {} }\n')

  return rootDir
}
