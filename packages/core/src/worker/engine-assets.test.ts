import type { SoulAppEngineAssets } from '@zonease/aiworker-shared'

import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import { projectEngineAssetsToWorkspace, resolveSoulAppEngineTarget } from './engine-assets'

describe('engine asset projection', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-engine-assets-${label}-`))
    roots.push(root)
    return root
  }

  it('resolves supported Soul App engine targets from engine ids', () => {
    expect(resolveSoulAppEngineTarget('codex')).toBe('codex')
    expect(resolveSoulAppEngineTarget('codex/default')).toBe('codex')
    expect(resolveSoulAppEngineTarget('claude-code')).toBe('claude-code')
    expect(resolveSoulAppEngineTarget('claude-code/default')).toBe('claude-code')
    expect(resolveSoulAppEngineTarget('http')).toBeNull()
    expect(resolveSoulAppEngineTarget(null)).toBeNull()
  })

  it('projects selected MCP client config and configured native skill targets', async () => {
    const sourceRoot = tempRoot('source')
    const workspaceRoot = tempRoot('workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "uvx"\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'aiworker-hr',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'MCP workspace' },
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8')).resolves.toContain('uvx')
    await expect(readFile(path.join(workspaceRoot, '.agents', 'skills', 'aiworker-hr-candidate-profile', 'SKILL.md'), 'utf8')).resolves.toContain('Candidate Profile')
    await expect(stat(path.join(workspaceRoot, '.claude', 'skills', 'aiworker-hr-candidate-profile', 'SKILL.md'))).rejects.toThrow()
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      engineTarget: 'codex',
      kind: 'mcp-client',
      source: 'engine-assets/mcp-clients/codex/config.toml',
      target: '.codex/config.toml',
    }))
  })

  it('rejects literal secrets in MCP client config sources', async () => {
    const sourceRoot = tempRoot('secret-source')
    const workspaceRoot = tempRoot('secret-workspace')
    await writeEngineAssetSource(sourceRoot, 'token = "sk-test-literal-secret"\n')

    await expect(projectEngineAssetsToWorkspace({
      appId: 'aiworker-hr',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: {},
      workspaceRoot,
    })).rejects.toThrow('MCP client config must not contain literal secrets')
  })
})

async function writeEngineAssetSource(sourceRoot: string, codexConfig: string): Promise<void> {
  await mkdir(path.join(sourceRoot, 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'engine-assets', 'skills', 'candidate-profile'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'engine-assets', 'mcp-clients', 'codex'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n')
  await writeFile(path.join(sourceRoot, 'engine-assets', 'skills', 'candidate-profile', 'SKILL.md'), '# Candidate Profile\n')
  await writeFile(path.join(sourceRoot, 'engine-assets', 'mcp-clients', 'codex', 'config.toml'), codexConfig)
}

function mcpEngineAssets(targets: NonNullable<SoulAppEngineAssets['skills']>['targets']): SoulAppEngineAssets {
  return {
    mcpClients: [{ source: './engine-assets/mcp-clients/codex', target: 'codex' }],
    skills: {
      source: './engine-assets/skills',
      targets,
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  }
}
