import type { SoulAppEngineAssets } from '@zonease/aiworker-soul-protocol'

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
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'MCP workspace' },
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8')).resolves.toContain('uvx')
    await expect(readFile(path.join(workspaceRoot, '.agents', 'skills', 'demo-soul-app-candidate-profile', 'SKILL.md'), 'utf8')).resolves.toContain('Candidate Profile')
    await expect(stat(path.join(workspaceRoot, '.claude', 'skills', 'demo-soul-app-candidate-profile', 'SKILL.md'))).rejects.toThrow()
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      engineTarget: 'codex',
      kind: 'mcp-client',
      source: 'engine-assets/mcp-clients/codex/config.toml',
      target: '.codex/config.toml',
    }))
  })

  it('projects worker overlay entry files and MCP client config over baseline assets', async () => {
    const sourceRoot = tempRoot('overlay-source')
    const workspaceRoot = tempRoot('overlay-workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'Overlay workspace' },
      workerOverlayAssets: [
        {
          content: '# {{workspaceName}}\n\nOverlay entry file.\n',
          enabled: true,
          id: 'README.md',
          kind: 'entry-file',
          target: 'workspace',
        },
        {
          content: '# Extra Context\n',
          enabled: true,
          id: 'CONTEXT.md',
          kind: 'entry-file',
          target: 'workspace',
        },
        {
          content: 'command = "overlay-mcp"\n',
          enabled: true,
          id: 'codex-ats',
          kind: 'mcp-client',
          target: 'codex',
        },
      ],
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, 'README.md'), 'utf8')).resolves.toContain('Overlay entry file')
    await expect(readFile(path.join(workspaceRoot, 'CONTEXT.md'), 'utf8')).resolves.toContain('Extra Context')
    await expect(readFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8')).resolves.toContain('overlay-mcp')
    expect(receipt.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'workspace-file', source: 'worker-overlay', target: 'README.md' }),
      expect.objectContaining({ kind: 'workspace-file', source: 'worker-overlay', target: 'CONTEXT.md' }),
      expect.objectContaining({ engineTarget: 'codex', kind: 'mcp-client', source: 'worker-overlay', target: '.codex/config.toml' }),
    ]))
  })

  it('suppresses baseline assets when matching worker overlays are disabled', async () => {
    const sourceRoot = tempRoot('disabled-overlay-source')
    const workspaceRoot = tempRoot('disabled-overlay-workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'Disabled overlay workspace' },
      workerOverlayAssets: [
        {
          content: '# Disabled README\n',
          enabled: false,
          id: 'README.md',
          kind: 'entry-file',
          target: 'workspace',
        },
        {
          content: '# Disabled Candidate Profile\n',
          enabled: false,
          id: 'candidate-profile',
          kind: 'skill',
          target: 'codex',
        },
        {
          content: 'command = "disabled-mcp"\n',
          enabled: false,
          id: 'codex-ats',
          kind: 'mcp-client',
          target: 'codex',
        },
      ],
      workspaceRoot,
    })

    await expect(stat(path.join(workspaceRoot, 'README.md'))).rejects.toThrow()
    await expect(stat(path.join(workspaceRoot, '.agents', 'skills', 'demo-soul-app-candidate-profile', 'SKILL.md'))).rejects.toThrow()
    await expect(stat(path.join(workspaceRoot, '.codex', 'config.toml'))).rejects.toThrow()
    expect(receipt.projections).not.toContainEqual(expect.objectContaining({ target: 'README.md' }))
    expect(receipt.projections).not.toContainEqual(expect.objectContaining({ target: '.agents/skills/demo-soul-app-candidate-profile/SKILL.md' }))
    expect(receipt.projections).not.toContainEqual(expect.objectContaining({ target: '.codex/config.toml' }))
  })

  it('preserves existing non-namespaced engine files when reprojecting without prior ownership', async () => {
    const sourceRoot = tempRoot('preserve-source')
    const workspaceRoot = tempRoot('preserve-workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')
    await mkdir(path.join(workspaceRoot, '.codex'), { recursive: true })
    await writeFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'command = "user-owned-mcp"\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      preserveUnownedExistingTargets: true,
      sourceRoot,
      variables: { workspaceName: 'Preserve workspace' },
      workerOverlayAssets: [{
        content: 'command = "overlay-mcp"\n',
        enabled: true,
        id: 'codex-ats',
        kind: 'mcp-client',
        target: 'codex',
      }],
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8')).resolves.toContain('user-owned-mcp')
    expect(receipt.projections).not.toContainEqual(expect.objectContaining({ target: '.codex/config.toml' }))
  })

  it('rejects literal secrets in MCP client config sources', async () => {
    const sourceRoot = tempRoot('secret-source')
    const workspaceRoot = tempRoot('secret-workspace')
    await writeEngineAssetSource(sourceRoot, 'token = "sk-test-literal-secret"\n')

    await expect(projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
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
