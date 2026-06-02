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
  overlayRoot?: string
  target: EngineTarget
  workerConfig: unknown
  workspaceRoot: string
}) => Promise<ProjectionReceipt>

describe('engine-projection worker-overlay:// scheme', () => {
  const roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { force: true, recursive: true })
    roots.length = 0
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-worker-overlay-${label}-`))
    roots.push(root)
    return root
  }

  test('descriptor:// overlays still resolve from the descriptor root (byte-identical)', async () => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const descriptorRoot = await writeDescriptorAssets(tempRoot('descriptor-root-descriptor'))
    const overlayRoot = await writeOverlayStore(tempRoot('descriptor-root-overlay'))
    const workspaceRoot = tempRoot('descriptor-root-workspace')

    const receipt = await projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      overlayRoot,
      target: 'codex',
      workerConfig: {
        values: [
          {
            checksum: 'sha256:skill-overlay-v1',
            enabled: true,
            kind: 'skill-overlay',
            options: { replaces: 'descriptor://engine/skills/freeform-session' },
            sourceRef: 'descriptor://engine/skills/overlay-session',
            target: 'codex',
            updatedAt: '2026-06-02T00:00:00.000Z',
            updatedBy: 'web',
          },
        ],
      },
      workspaceRoot,
    })

    // Resolved from the descriptor root, NOT the overlay store.
    await expect(readFile(path.join(workspaceRoot, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Descriptor Overlay Session')
    expect(receipt.projectedFiles).toContainEqual(expect.objectContaining({
      kind: 'skill',
      sourceRef: 'descriptor://engine/skills/overlay-session',
      targetPath: '.agents/skills/aiworker-freeform-freeform-session/SKILL.md',
    }))
  })

  test('worker-overlay://skills enabled overlay replaces the baseline skill from the overlay store', async () => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const descriptorRoot = await writeDescriptorAssets(tempRoot('skill-replace-descriptor'))
    const overlayRoot = await writeOverlayStore(tempRoot('skill-replace-overlay'))
    const workspaceRoot = tempRoot('skill-replace-workspace')

    const receipt = await projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      overlayRoot,
      target: 'codex',
      workerConfig: {
        values: [
          {
            checksum: 'sha256:worker-overlay-skill-v1',
            enabled: true,
            kind: 'skill-overlay',
            options: { replaces: 'descriptor://engine/skills/freeform-session' },
            sourceRef: 'worker-overlay://skills/freeform-session/SKILL.md',
            target: 'codex',
            updatedAt: '2026-06-02T00:00:00.000Z',
            updatedBy: 'web',
          },
        ],
      },
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8'))
      .resolves
      .toContain('Worker Overlay Edited Session')
    expect(receipt.projectedFiles).toContainEqual(expect.objectContaining({
      kind: 'skill',
      sourceRef: 'worker-overlay://skills/freeform-session/SKILL.md',
      targetPath: '.agents/skills/aiworker-freeform-freeform-session/SKILL.md',
    }))
    // Content never enters the receipt.
    expect(JSON.stringify(receipt)).not.toContain('Worker Overlay Edited Session')
  })

  test('additive worker-overlay://entry-files overlay projects a new entry file from the overlay store', async () => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const descriptorRoot = await writeDescriptorAssets(tempRoot('entry-add-descriptor'))
    const overlayRoot = await writeOverlayStore(tempRoot('entry-add-overlay'))
    const workspaceRoot = tempRoot('entry-add-workspace')

    const receipt = await projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      overlayRoot,
      target: 'codex',
      workerConfig: {
        values: [
          {
            checksum: 'sha256:worker-overlay-entry-v1',
            enabled: true,
            kind: 'entry-file-overlay',
            options: { targetPath: 'NOTES.md' },
            sourceRef: 'worker-overlay://entry-files/NOTES.md',
            target: 'all',
            updatedAt: '2026-06-02T00:00:00.000Z',
            updatedBy: 'web',
          },
        ],
      },
      workspaceRoot,
    })

    await expect(readFile(path.join(workspaceRoot, 'NOTES.md'), 'utf8'))
      .resolves
      .toContain('Worker overlay notes entry')
    // Baseline AGENTS.md is still projected from the descriptor root.
    await expect(readFile(path.join(workspaceRoot, 'AGENTS.md'), 'utf8'))
      .resolves
      .toContain('Freeform workspace instructions')
    expect(receipt.projectedFiles).toContainEqual(expect.objectContaining({
      kind: 'workspace-asset',
      sourceRef: 'worker-overlay://entry-files/NOTES.md',
      targetPath: 'NOTES.md',
    }))
    expect(JSON.stringify(receipt)).not.toContain('Worker overlay notes entry')
  })

  test('receipt records overlay-projected files so cleanup removes only receipt-owned files', async () => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const cleanupReceipt = requireExport<(input: { receipt: ProjectionReceipt, workspaceRoot: string }) => Promise<void>>('cleanupReceipt')
    const descriptorRoot = await writeDescriptorAssets(tempRoot('cleanup-descriptor'))
    const overlayRoot = await writeOverlayStore(tempRoot('cleanup-overlay'))
    const workspaceRoot = tempRoot('cleanup-workspace')
    await mkdir(path.join(workspaceRoot, 'business'), { recursive: true })
    await writeFile(path.join(workspaceRoot, 'business', 'case.md'), '# User-owned workspace business file\n')

    const receipt = await projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      overlayRoot,
      target: 'codex',
      workerConfig: {
        values: [
          {
            checksum: 'sha256:worker-overlay-skill-v1',
            enabled: true,
            kind: 'skill-overlay',
            options: { replaces: 'descriptor://engine/skills/freeform-session' },
            sourceRef: 'worker-overlay://skills/freeform-session/SKILL.md',
            target: 'codex',
            updatedAt: '2026-06-02T00:00:00.000Z',
            updatedBy: 'web',
          },
          {
            checksum: 'sha256:worker-overlay-entry-v1',
            enabled: true,
            kind: 'entry-file-overlay',
            options: { targetPath: 'NOTES.md' },
            sourceRef: 'worker-overlay://entry-files/NOTES.md',
            target: 'all',
            updatedAt: '2026-06-02T00:00:00.000Z',
            updatedBy: 'web',
          },
        ],
      },
      workspaceRoot,
    })

    // Both overlay-projected files are recorded in the receipt.
    expect(receipt.projectedFiles).toContainEqual(expect.objectContaining({
      sourceRef: 'worker-overlay://skills/freeform-session/SKILL.md',
      targetPath: '.agents/skills/aiworker-freeform-freeform-session/SKILL.md',
    }))
    expect(receipt.projectedFiles).toContainEqual(expect.objectContaining({
      sourceRef: 'worker-overlay://entry-files/NOTES.md',
      targetPath: 'NOTES.md',
    }))

    await cleanupReceipt({ receipt, workspaceRoot })

    await expect(stat(path.join(workspaceRoot, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'))).rejects.toThrow()
    await expect(stat(path.join(workspaceRoot, 'NOTES.md'))).rejects.toThrow()
    // User-owned business files are untouched.
    await expect(readFile(path.join(workspaceRoot, 'business', 'case.md'), 'utf8')).resolves.toContain('User-owned')
  })

  test('worker-overlay:// sourceRef rejects path traversal out of the overlay store', async () => {
    const projectEngineAssets = requireExport<ProjectEngineAssets>('projectEngineAssets')
    const descriptorRoot = await writeDescriptorAssets(tempRoot('traversal-descriptor'))
    const overlayRoot = await writeOverlayStore(tempRoot('traversal-overlay'))
    const workspaceRoot = tempRoot('traversal-workspace')

    await expect(projectEngineAssets({
      descriptor: descriptorFor(),
      descriptorRoot,
      overlayRoot,
      target: 'codex',
      workerConfig: {
        values: [
          {
            checksum: 'sha256:worker-overlay-traversal',
            enabled: true,
            kind: 'skill-overlay',
            options: { replaces: 'descriptor://engine/skills/freeform-session' },
            sourceRef: 'worker-overlay://skills/../../etc/passwd',
            target: 'codex',
            updatedAt: '2026-06-02T00:00:00.000Z',
            updatedBy: 'web',
          },
        ],
      },
      workspaceRoot,
    })).rejects.toThrow('Invalid worker-overlay sourceRef')
  })
})

function requireExport<T>(name: string): T {
  const value = (engineProjection as Record<string, unknown>)[name]
  expect(typeof value, `packages/engine-projection must export ${name}`).toBe('function')
  return value as T
}

async function writeDescriptorAssets(root: string): Promise<string> {
  await mkdir(path.join(root, 'dist', 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(root, 'dist', 'engine-assets', 'skills', 'freeform-session'), { recursive: true })
  await mkdir(path.join(root, 'dist', 'engine-assets', 'skills', 'overlay-session'), { recursive: true })
  await mkdir(path.join(root, 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })

  await writeFile(path.join(root, 'dist', 'engine-assets', 'workspace', 'AGENTS.md'), '# Freeform workspace instructions\n')
  await writeFile(
    path.join(root, 'dist', 'engine-assets', 'skills', 'freeform-session', 'SKILL.md'),
    '# Freeform Session\n\nBaseline skill body.\n',
  )
  await writeFile(
    path.join(root, 'dist', 'engine-assets', 'skills', 'overlay-session', 'SKILL.md'),
    '# Descriptor Overlay Session\n\nDescriptor overlay skill body.\n',
  )
  await writeFile(
    path.join(root, 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'),
    '[mcp_servers.local]\ncommand = "node"\nargs = ["server.js"]\n',
  )

  return root
}

async function writeOverlayStore(root: string): Promise<string> {
  await mkdir(path.join(root, 'skills', 'freeform-session'), { recursive: true })
  await mkdir(path.join(root, 'entry-files'), { recursive: true })

  await writeFile(
    path.join(root, 'skills', 'freeform-session', 'SKILL.md'),
    '# Worker Overlay Edited Session\n\nWorker-edited skill body.\n',
  )
  await writeFile(path.join(root, 'entry-files', 'NOTES.md'), '# Worker overlay notes entry\n')

  return root
}

function descriptorFor() {
  return {
    engine: {
      assets: {
        mcp: {
          targets: {
            codex: { file: 'dist/engine-assets/mcp/codex/config.toml' },
          },
        },
        skills: { source: 'dist/engine-assets/skills' },
        workspaceAssets: { source: 'dist/engine-assets/workspace' },
      },
    },
    identity: { id: 'aiworker-freeform', name: 'AIWorker Freeform' },
  }
}
