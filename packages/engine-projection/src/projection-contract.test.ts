import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import * as engineProjection from './index'

type EngineTarget = 'codex' | 'claude-code'

interface ProjectionReceipt {
  projectedFiles: Array<{
    checksum: string
    kind: string
    sourceRef: string
    status: string
    target: EngineTarget
    targetPath: string
  }>
  freshnessMarker: string
}

type ProjectEngineAssets = (input: {
  descriptor: ReturnType<typeof descriptorFor>
  descriptorRoot: string
  target: EngineTarget
  workerConfig: ReturnType<typeof workerConfigFor>
  workspaceRoot: string
}) => Promise<ProjectionReceipt>

type CleanupReceipt = (input: {
  receipt: ProjectionReceipt
  workspaceRoot: string
}) => Promise<void>

type ComputeProjectionFreshnessMarker = (input: {
  descriptor: ReturnType<typeof descriptorFor>
  target: EngineTarget
  workerConfig: ReturnType<typeof workerConfigFor>
}) => string

describe('engine-projection contract', () => {
  const roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { force: true, recursive: true })
    roots.length = 0
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-engine-projection-${label}-`))
    roots.push(root)
    return root
  }

  test.each([
    {
      expectedMcpPath: '.codex/config.toml',
      expectedSkillPath: '.agents/skills/aiworker-freeform-freeform-session/SKILL.md',
      target: 'codex' as const,
    },
    {
      expectedMcpPath: '.mcp.json',
      expectedSkillPath: '.claude/skills/aiworker-freeform-freeform-session/SKILL.md',
      target: 'claude-code' as const,
    },
  ])('projects descriptor assets and worker overlays to $target native paths', async ({ expectedMcpPath, expectedSkillPath, target }) => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const descriptorRoot = await writeDescriptorAssets(tempRoot(`${target}-descriptor`))
    const workspaceRoot = tempRoot(`${target}-workspace`)

    const receipt = await projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      target,
      workerConfig: workerConfigFor(target),
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, 'AGENTS.md'), 'utf8')).resolves.toContain('Freeform workspace instructions')
    await expect(readFile(path.join(workspaceRoot, 'templates', 'note.md'), 'utf8')).resolves.toContain('workspace template')
    await expect(readFile(path.join(workspaceRoot, expectedSkillPath), 'utf8')).resolves.toContain('Freeform Session')
    await expect(readFile(path.join(workspaceRoot, expectedMcpPath), 'utf8')).resolves.toContain('literal-test-secret')

    expect(receipt.projectedFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'workspace-asset',
        sourceRef: 'descriptor://engine/workspaceAssets/AGENTS.md',
        status: 'projected',
        target,
        targetPath: 'AGENTS.md',
      }),
      expect.objectContaining({
        kind: 'skill',
        sourceRef: 'descriptor://engine/skills/freeform-session',
        status: 'projected',
        target,
        targetPath: expectedSkillPath,
      }),
      expect.objectContaining({
        kind: 'native-mcp-file',
        sourceRef: `descriptor://engine/mcp/${target}`,
        status: 'projected',
        target,
        targetPath: expectedMcpPath,
      }),
    ]))
    expect(receipt.projectedFiles.every(file => file.checksum.startsWith('sha256:'))).toBe(true)
  })

  test('receipt records metadata only and redacts native MCP secrets and skill bodies', async () => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const descriptorRoot = await writeDescriptorAssets(tempRoot('receipt-descriptor'))
    const workspaceRoot = tempRoot('receipt-workspace')

    const receipt = await projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      target: 'codex',
      workerConfig: workerConfigFor('codex'),
      workspaceRoot,
    })

    const receiptJson = JSON.stringify(receipt)

    expect(receipt.projectedFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checksum: expect.stringMatching(/^sha256:/),
        sourceRef: 'descriptor://engine/mcp/codex',
        status: 'projected',
        target: 'codex',
        targetPath: '.codex/config.toml',
      }),
    ]))
    expect(receiptJson).not.toContain('literal-test-secret')
    expect(receiptJson).not.toContain('Full skill body must stay out of receipts')
  })

  test('cleanupReceipt deletes only receipt-owned projected files', async () => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const cleanupReceipt = requireExport<CleanupReceipt>('cleanupReceipt')
    const descriptorRoot = await writeDescriptorAssets(tempRoot('cleanup-descriptor'))
    const workspaceRoot = tempRoot('cleanup-workspace')
    await mkdir(path.join(workspaceRoot, 'business'), { recursive: true })
    await writeFile(path.join(workspaceRoot, 'business', 'case.md'), '# User-owned workspace business file\n')

    const receipt = await projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      target: 'codex',
      workerConfig: workerConfigFor('codex'),
      workspaceRoot,
    })

    await cleanupReceipt({ receipt, workspaceRoot })

    await expect(stat(path.join(workspaceRoot, '.codex', 'config.toml'))).rejects.toThrow()
    await expect(stat(path.join(workspaceRoot, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'))).rejects.toThrow()
    await expect(readFile(path.join(workspaceRoot, 'business', 'case.md'), 'utf8')).resolves.toContain('User-owned')
  })

  test('freshness marker is stable for the same descriptor, worker config, and target', () => {
    const computeProjectionFreshnessMarker = requireExport<ComputeProjectionFreshnessMarker>('computeProjectionFreshnessMarker')
    const descriptor = descriptorFor()
    const workerConfig = workerConfigFor('codex')

    const first = computeProjectionFreshnessMarker({ descriptor, target: 'codex', workerConfig })
    const second = computeProjectionFreshnessMarker({ descriptor, target: 'codex', workerConfig })
    const changedTarget = computeProjectionFreshnessMarker({ descriptor, target: 'claude-code', workerConfig: workerConfigFor('claude-code') })
    const changedOverlay = computeProjectionFreshnessMarker({
      descriptor,
      target: 'codex',
      workerConfig: workerConfigFor('codex', 'sha256:codex-mcp-v2'),
    })

    expect(first).toMatch(/^sha256:/)
    expect(second).toBe(first)
    expect(changedTarget).not.toBe(first)
    expect(changedOverlay).not.toBe(first)
  })
})

function requireExport<T>(name: string): T {
  const value = (engineProjection as Record<string, unknown>)[name]
  expect(typeof value, `packages/engine-projection must export ${name}`).toBe('function')
  return value as T
}

async function writeDescriptorAssets(root: string): Promise<string> {
  await mkdir(path.join(root, 'dist', 'engine-assets', 'workspace', 'templates'), { recursive: true })
  await mkdir(path.join(root, 'dist', 'engine-assets', 'skills', 'freeform-session'), { recursive: true })
  await mkdir(path.join(root, 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await mkdir(path.join(root, 'dist', 'engine-assets', 'mcp', 'claude-code'), { recursive: true })

  await writeFile(path.join(root, 'dist', 'engine-assets', 'workspace', 'AGENTS.md'), '# Freeform workspace instructions\n')
  await writeFile(path.join(root, 'dist', 'engine-assets', 'workspace', 'templates', 'note.md'), '# workspace template\n')
  await writeFile(
    path.join(root, 'dist', 'engine-assets', 'skills', 'freeform-session', 'SKILL.md'),
    '# Freeform Session\n\nFull skill body must stay out of receipts.\n',
  )
  await writeFile(
    path.join(root, 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'),
    '[mcp_servers.local]\ncommand = "node"\nargs = ["server.js"]\napi_key = "literal-test-secret"\n',
  )
  await writeFile(
    path.join(root, 'dist', 'engine-assets', 'mcp', 'claude-code', '.mcp.json'),
    `${JSON.stringify({
      mcpServers: {
        local: {
          args: ['server.js'],
          command: 'node',
          env: { API_KEY: 'literal-test-secret' },
        },
      },
    }, null, 2)}\n`,
  )

  return root
}

function descriptorFor() {
  return {
    engine: {
      assets: {
        mcp: {
          targets: {
            'claude-code': { file: 'dist/engine-assets/mcp/claude-code/.mcp.json' },
            'codex': { file: 'dist/engine-assets/mcp/codex/config.toml' },
          },
        },
        skills: { source: 'dist/engine-assets/skills' },
        workspaceAssets: { source: 'dist/engine-assets/workspace' },
      },
    },
    id: 'aiworker-freeform',
  }
}

function workerConfigFor(target: EngineTarget, mcpChecksum = `sha256:${target}-mcp-v1`) {
  return {
    values: [
      {
        checksum: 'sha256:freeform-session-v1',
        enabled: true,
        kind: 'skill-overlay',
        options: { overrideRef: null },
        sourceRef: 'descriptor://engine/skills/freeform-session',
        target: 'all',
        updatedAt: '2026-05-27T00:00:00.000Z',
        updatedBy: 'cli',
      },
      {
        checksum: mcpChecksum,
        enabled: true,
        kind: 'mcp-overlay',
        options: { serverId: 'local' },
        sourceRef: `descriptor://engine/mcp/${target}`,
        target,
        updatedAt: '2026-05-27T00:00:00.000Z',
        updatedBy: 'web',
      },
    ],
  }
}
