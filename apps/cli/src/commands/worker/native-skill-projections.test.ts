import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readNativeSkillProjectionManifest, resolveAllProjectNativeSkillPaths } from '@zonease/aiworker-fs-layout'
import { describe, expect, it } from 'bun:test'

import {
  applyNativeSkillProjectionSync,
  planNativeSkillProjectionSync,
} from './native-skill-projections'

async function makeProject(): Promise<string> {
  const project = await mkdtemp(path.join(tmpdir(), 'aiworker-native-skill-projection-'))
  await mkdir(path.join(project, '.aiworker'), { recursive: true })
  return project
}

async function cleanup(project: string): Promise<void> {
  await rm(project, { force: true, recursive: true })
}

function seed(content: string) {
  return [{
    content,
    logicalId: 'kernel.test-skill',
    sourceKind: 'builtin' as const,
    sourcePath: 'fixtures/kernel.test-skill/SKILL.md',
    sourceVersion: '1.0.0',
  }]
}

describe('native skill projection sync', () => {
  it('applies missing managed projections and records manifest evidence', async () => {
    const project = await makeProject()
    try {
      const first = await applyNativeSkillProjectionSync(project, seed('# v1\n'))
      expect(first.summary.missing).toBe(2)

      const plan = await planNativeSkillProjectionSync({ desiredSeeds: seed('# v1\n'), projectRoot: project })
      expect(plan.summary.active).toBe(2)
      expect(plan.summary.missing).toBe(0)

      const targets = resolveAllProjectNativeSkillPaths(project, 'kernel.test-skill')
      for (const target of targets)
        expect(await readFile(target.path, 'utf8')).toBe('# v1\n')

      const manifest = await readNativeSkillProjectionManifest(project)
      expect(manifest?.projections).toHaveLength(2)
      expect(manifest?.projections[0]?.slug).toBe('aiworker-kernel-test-skill')
      expect(manifest?.projections[0]?.lastAppliedHash).toBe(manifest?.projections[0]?.sourceHash)
    }
    finally {
      await cleanup(project)
    }
  })

  it('updates clean managed copies but leaves drifted files untouched', async () => {
    const project = await makeProject()
    try {
      await applyNativeSkillProjectionSync(project, seed('# v1\n'))
      await applyNativeSkillProjectionSync(project, seed('# v2\n'))

      const [codexTarget, claudeTarget] = resolveAllProjectNativeSkillPaths(project, 'kernel.test-skill')
      await writeFile(codexTarget!.path, '# manual edit\n', 'utf8')

      const plan = await planNativeSkillProjectionSync({ desiredSeeds: seed('# v3\n'), projectRoot: project })
      expect(plan.summary.drifted).toBe(1)
      expect(plan.summary.outdated).toBe(1)

      await applyNativeSkillProjectionSync(project, seed('# v3\n'))
      expect(await readFile(codexTarget!.path, 'utf8')).toBe('# manual edit\n')
      expect(await readFile(claudeTarget!.path, 'utf8')).toBe('# v3\n')

      const after = await planNativeSkillProjectionSync({ desiredSeeds: seed('# v3\n'), projectRoot: project })
      expect(after.summary.drifted).toBe(1)
      expect(after.summary.active).toBe(1)
    }
    finally {
      await cleanup(project)
    }
  })

  it('deprecates undesired managed projections by removing SKILL.md discovery', async () => {
    const project = await makeProject()
    try {
      await applyNativeSkillProjectionSync(project, seed('# v1\n'))

      const plan = await planNativeSkillProjectionSync({ desiredSeeds: [], projectRoot: project })
      expect(plan.summary.deprecated).toBe(2)
      await applyNativeSkillProjectionSync(project, [])

      for (const target of resolveAllProjectNativeSkillPaths(project, 'kernel.test-skill'))
        await expect(readFile(target.path, 'utf8')).rejects.toThrow()

      const manifest = await readNativeSkillProjectionManifest(project)
      expect(manifest?.projections).toHaveLength(0)
      expect(manifest?.tombstones).toHaveLength(2)
      expect(manifest?.tombstones?.[0]?.status).toBe('deprecated')
    }
    finally {
      await cleanup(project)
    }
  })

  it('retains admission-managed projections that are not built-in Soul seeds', async () => {
    const project = await makeProject()
    try {
      await applyNativeSkillProjectionSync(project, [{
        content: '# generated\n',
        logicalId: 'developer.generated-review',
        sourceKind: 'admission',
      }])

      const plan = await planNativeSkillProjectionSync({ desiredSeeds: [], projectRoot: project })
      expect(plan.desiredCount).toBe(2)
      expect(plan.summary.active).toBe(2)
      expect(plan.summary.deprecated).toBe(0)
    }
    finally {
      await cleanup(project)
    }
  })

  it('reports aiworker-prefixed native skill files that are not in the manifest as orphaned', async () => {
    const project = await makeProject()
    try {
      const orphan = path.join(project, '.agents', 'skills', 'aiworker-orphan', 'SKILL.md')
      await mkdir(path.dirname(orphan), { recursive: true })
      await writeFile(orphan, '# orphan\n', 'utf8')

      const plan = await planNativeSkillProjectionSync({ desiredSeeds: [], projectRoot: project })
      expect(plan.summary.orphaned).toBe(1)
      expect(plan.operations[0]?.type).toBe('orphaned')
      expect(plan.operations[0]?.slug).toBe('aiworker-orphan')
    }
    finally {
      await cleanup(project)
    }
  })
})
