import type { SoulAppEngineAssets } from '@zonease/aiworker-soul-protocol'

import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import { cleanupWorkspaceProjectionReceipt, computeWorkspaceProjectionFreshnessMarker, listBaselineAssets, projectEngineAssetsToWorkspace, resolveSoulAppEngineTarget } from './index'

describe('workspace engine asset projection', () => {
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
      source: 'engine-assets/mcp/codex/config.toml',
      target: '.codex/config.toml',
    }))
  })

  it('honors descriptor-declared engine asset source paths', async () => {
    const sourceRoot = tempRoot('custom-source')
    const workspaceRoot = tempRoot('custom-workspace')
    await mkdir(path.join(sourceRoot, 'custom-assets', 'workspace'), { recursive: true })
    await mkdir(path.join(sourceRoot, 'custom-assets', 'skills', 'custom-skill'), { recursive: true })
    await mkdir(path.join(sourceRoot, 'custom-assets', 'mcp', 'codex'), { recursive: true })
    await writeFile(path.join(sourceRoot, 'custom-assets', 'workspace', 'GUIDE.md'), '# {{workspaceName}} Guide\n')
    await writeFile(path.join(sourceRoot, 'custom-assets', 'skills', 'custom-skill', 'SKILL.md'), '# Custom Skill\n')
    await writeFile(path.join(sourceRoot, 'custom-assets', 'mcp', 'codex', 'config.toml'), 'command = "custom-mcp"\n')

    const engineAssets: SoulAppEngineAssets = {
      mcpClients: [{ source: './custom-assets/mcp/codex', target: 'codex' }],
      skills: {
        source: './custom-assets/skills',
        targets: ['codex'],
      },
      workspace: {
        source: './custom-assets/workspace',
      },
    }
    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets,
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'Custom workspace' },
      workspaceRoot,
    })
    const baselineAssets = await listBaselineAssets({ appId: 'demo-soul-app', engineAssets, sourceRoot })

    await expect(readFile(path.join(workspaceRoot, 'GUIDE.md'), 'utf8')).resolves.toContain('Custom workspace Guide')
    await expect(readFile(path.join(workspaceRoot, '.agents', 'skills', 'demo-soul-app-custom-skill', 'SKILL.md'), 'utf8')).resolves.toContain('Custom Skill')
    await expect(readFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8')).resolves.toContain('custom-mcp')
    expect(receipt.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'custom-assets/workspace/GUIDE.md', target: 'GUIDE.md' }),
      expect.objectContaining({ source: 'custom-assets/skills/custom-skill/SKILL.md' }),
      expect.objectContaining({ source: 'custom-assets/mcp/codex/config.toml' }),
    ]))
    expect(baselineAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'entry-file', sourceRef: 'custom-assets/workspace/GUIDE.md' }),
      expect.objectContaining({ kind: 'skill', sourceRef: 'custom-assets/skills/custom-skill/SKILL.md' }),
      expect.objectContaining({ kind: 'mcp-client', sourceRef: 'custom-assets/mcp/codex/config.toml' }),
    ]))
  })

  it('rejects descriptor engine asset sources that escape the source root', async () => {
    const sourceRoot = tempRoot('source-escape-source')
    const workspaceRoot = tempRoot('source-escape-workspace')

    await expect(projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: {
        workspace: { source: '../outside-workspace' },
      },
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: {},
      workspaceRoot,
    })).rejects.toThrow('Engine asset source must be relative')

    await expect(listBaselineAssets({
      appId: 'demo-soul-app',
      engineAssets: {
        workspace: { source: '/outside-workspace' },
      },
      sourceRoot,
    })).rejects.toThrow('Engine asset source must be relative')
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

  it('projects author-owned MCP client config secrets but keeps receipts metadata-only', async () => {
    const sourceRoot = tempRoot('secret-source')
    const workspaceRoot = tempRoot('secret-workspace')
    await writeEngineAssetSource(sourceRoot, 'token = "sk-test-literal-secret"\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: {},
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8')).resolves.toContain('sk-test-literal-secret')
    await expect(readFile(path.join(workspaceRoot, '.aiworker', 'projections.json'), 'utf8')).resolves.not.toContain('sk-test-literal-secret')
    expect(JSON.stringify(receipt)).not.toContain('sk-test-literal-secret')
    expect(receipt.projections).toContainEqual(expect.objectContaining({
      engineTarget: 'codex',
      kind: 'mcp-client',
      source: 'engine-assets/mcp/codex/config.toml',
      target: '.codex/config.toml',
    }))
  })

  it('rejects literal secrets in worker overlay MCP client config', async () => {
    const sourceRoot = tempRoot('secret-overlay-source')
    const workspaceRoot = tempRoot('secret-overlay-workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')

    await expect(projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: {},
      workerOverlayAssets: [{
        content: 'token = "sk-test-literal-secret"\n',
        enabled: true,
        id: 'codex-ats',
        kind: 'mcp-client',
        target: 'codex',
      }],
      workspaceRoot,
    })).rejects.toThrow('MCP client config must not contain literal secrets')
  })

  it('allows secret references in worker overlay MCP client config', async () => {
    const sourceRoot = tempRoot('secretref-overlay-source')
    const workspaceRoot = tempRoot('secretref-overlay-workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: {},
      workerOverlayAssets: [{
        content: 'api_key = "secretref:codex/default-profile"\n',
        enabled: true,
        id: 'codex-ats',
        kind: 'mcp-client',
        target: 'codex',
      }],
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, '.codex', 'config.toml'), 'utf8')).resolves.toContain('secretref:codex/default-profile')
    expect(JSON.stringify(receipt)).not.toContain('secretref:codex/default-profile')
  })

  it('records freshness markers without copying overlay content into receipts', async () => {
    const sourceRoot = tempRoot('freshness-source')
    const workspaceRoot = tempRoot('freshness-workspace')
    const changedWorkspaceRoot = tempRoot('freshness-changed-workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'Fresh workspace' },
      workerOverlayAssets: [{
        content: 'api_key = "secretref:codex/default-profile"\n',
        enabled: true,
        id: 'codex-ats',
        kind: 'mcp-client',
        target: 'codex',
      }],
      workspaceRoot,
    })
    const changedReceipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:01.000Z',
      sourceRoot,
      variables: { workspaceName: 'Fresh workspace' },
      workerOverlayAssets: [{
        content: 'api_key = "secretref:codex/changed-profile"\n',
        enabled: true,
        id: 'codex-ats',
        kind: 'mcp-client',
        target: 'codex',
      }],
      workspaceRoot: changedWorkspaceRoot,
    })
    const receiptJson = await readFile(path.join(workspaceRoot, '.aiworker', 'projections.json'), 'utf8')

    expect(receipt.freshnessMarker).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(changedReceipt.freshnessMarker).not.toBe(receipt.freshnessMarker)
    expect(receiptJson).toContain(`"freshnessMarker": "${receipt.freshnessMarker}"`)
    expect(receiptJson).not.toContain('secretref:codex/default-profile')
  })

  it('lets a reserved projection-overlay config participate in the freshness marker but project no file', async () => {
    const sourceRoot = tempRoot('reserved-overlay-source')
    const baselineWorkspaceRoot = tempRoot('reserved-overlay-baseline')
    const reservedWorkspaceRoot = tempRoot('reserved-overlay-changed')
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')

    const baseInput = {
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex' as const,
      sourceRoot,
      variables: { workspaceName: 'Reserved overlay workspace' },
    }
    // A reserved projection-overlay crafted to look like it could add a file
    // (real workspace-asset sourceRef plus a targetPath). Reserved means engine
    // projection emits no file but the marker must still move.
    const reservedOverlayConfigs = [{
      checksum: 'sha256:reserved-projection-overlay',
      enabled: true,
      kind: 'projection-overlay',
      options: { targetPath: 'RESERVED.md' },
      sourceRef: 'descriptor://engine/workspaceAssets/AGENTS.md',
      target: 'codex',
    }]

    const baseline = await projectEngineAssetsToWorkspace({ ...baseInput, now: '2026-05-16T00:00:00.000Z', workspaceRoot: baselineWorkspaceRoot })
    const reserved = await projectEngineAssetsToWorkspace({ ...baseInput, now: '2026-05-16T00:00:01.000Z', reservedOverlayConfigs, workspaceRoot: reservedWorkspaceRoot })

    // Participates in the freshness marker.
    expect(reserved.freshnessMarker).not.toBe(baseline.freshnessMarker)
    // No projected-file change: identical projection targets and no RESERVED.md.
    expect(reserved.projections.map(entry => entry.target).sort()).toEqual(baseline.projections.map(entry => entry.target).sort())
    await expect(stat(path.join(reservedWorkspaceRoot, 'RESERVED.md'))).rejects.toThrow()

    // Direct freshness API: reserved config moves the marker; an empty reserved
    // set is a byte-identical no-op (no freshness regression for normal workers).
    const markerNoField = await computeWorkspaceProjectionFreshnessMarker(baseInput)
    const markerEmptyReserved = await computeWorkspaceProjectionFreshnessMarker({ ...baseInput, reservedOverlayConfigs: [] })
    const markerReserved = await computeWorkspaceProjectionFreshnessMarker({ ...baseInput, reservedOverlayConfigs })
    expect(markerEmptyReserved).toBe(markerNoField)
    expect(markerReserved).not.toBe(markerNoField)
  })

  it('cleans up only receipt-owned workspace projection files', async () => {
    const sourceRoot = tempRoot('cleanup-source')
    const workspaceRoot = tempRoot('cleanup-workspace')
    await writeEngineAssetSource(sourceRoot, 'command = "cleanup-mcp"\n')
    await mkdir(path.join(workspaceRoot, '.codex'), { recursive: true })
    await writeFile(path.join(workspaceRoot, '.codex', 'user-owned.toml'), 'command = "keep-me"\n')
    await writeFile(path.join(workspaceRoot, 'business.md'), '# User work\n')

    const receipt = await projectEngineAssetsToWorkspace({
      appId: 'demo-soul-app',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'Cleanup workspace' },
      workspaceRoot,
    })

    const result = await cleanupWorkspaceProjectionReceipt({ receipt, workspaceRoot })

    expect(result.cleanedTargets).toEqual(receipt.projections.map(item => item.target))
    await expect(stat(path.join(workspaceRoot, 'README.md'))).rejects.toThrow()
    await expect(stat(path.join(workspaceRoot, '.agents', 'skills', 'demo-soul-app-candidate-profile', 'SKILL.md'))).rejects.toThrow()
    await expect(stat(path.join(workspaceRoot, '.codex', 'config.toml'))).rejects.toThrow()
    await expect(readFile(path.join(workspaceRoot, '.codex', 'user-owned.toml'), 'utf8')).resolves.toContain('keep-me')
    await expect(readFile(path.join(workspaceRoot, 'business.md'), 'utf8')).resolves.toContain('User work')
  })

  it('rejects cleanup receipt targets that escape the workspace root', async () => {
    const workspaceRoot = tempRoot('cleanup-escape-workspace')

    await expect(cleanupWorkspaceProjectionReceipt({
      receipt: {
        appId: 'demo-soul-app',
        freshnessMarker: `sha256:${'0'.repeat(64)}`,
        generatedAt: '2026-05-16T00:00:00.000Z',
        projections: [{
          appId: 'demo-soul-app',
          generatedAt: '2026-05-16T00:00:00.000Z',
          kind: 'workspace-file',
          sha256: '0'.repeat(64),
          source: 'engine-assets/workspace/README.md',
          target: '../outside.md',
        }],
        version: 1,
      },
      workspaceRoot,
    })).rejects.toThrow('Projection target escapes workspace root')
  })

  it('rejects projected write targets that escape the workspace root', async () => {
    const sourceRoot = tempRoot('write-escape-source')
    const containerRoot = tempRoot('write-escape-container')
    const workspaceRoot = path.join(containerRoot, 'workspace')
    const escapedSkillPath = path.join(containerRoot, 'outside-candidate-profile', 'SKILL.md')
    await mkdir(workspaceRoot, { recursive: true })
    await writeEngineAssetSource(sourceRoot, 'command = "baseline-mcp"\n')

    await expect(projectEngineAssetsToWorkspace({
      appId: '../../../outside',
      engineAssets: mcpEngineAssets(['codex']),
      engineTarget: 'codex',
      now: '2026-05-16T00:00:00.000Z',
      sourceRoot,
      variables: { workspaceName: 'Escape workspace' },
      workspaceRoot,
    })).rejects.toThrow('Projection target escapes workspace root')
    await expect(stat(escapedSkillPath)).rejects.toThrow()
  })
})

async function writeEngineAssetSource(sourceRoot: string, codexConfig: string): Promise<void> {
  await mkdir(path.join(sourceRoot, 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'engine-assets', 'skills', 'candidate-profile'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n')
  await writeFile(path.join(sourceRoot, 'engine-assets', 'skills', 'candidate-profile', 'SKILL.md'), '# Candidate Profile\n')
  await writeFile(path.join(sourceRoot, 'engine-assets', 'mcp', 'codex', 'config.toml'), codexConfig)
}

function mcpEngineAssets(targets: NonNullable<SoulAppEngineAssets['skills']>['targets']): SoulAppEngineAssets {
  return {
    mcpClients: [{ source: './engine-assets/mcp/codex', target: 'codex' }],
    skills: {
      source: './engine-assets/skills',
      targets,
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  }
}
