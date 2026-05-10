import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  buildNativeProjectSkillSeedFiles,
  ensureProjectAiworker,
  ensureWorkerHome,
  nativeProjectSkillSlug,
  projectAiworkerExists,
  readNativeSkillProjectionManifest,
  resolveAiworkerHome,
  resolveAiworkerScope,
  resolveAllProjectNativeSkillPaths,
  resolveBrainHome,
  resolveNativeSkillProjectionManifestPath,
  resolveProjectRoot,
  resolveWorkerHome,
  resolveWorkspacesRoot,
} from './index'

const ENV_KEYS = ['AIWORKER_HOME']

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'aiworker-fs-layout-test-'))
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

describe('resolveAiworkerScope priority', () => {
  const originalCwd = process.cwd()
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    process.chdir(originalCwd)
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined)
        delete process.env[k]
      else
        process.env[k] = savedEnv[k]
    }
  })

  it('explicitHome wins over env, project-detect, and user-default', async () => {
    process.env.AIWORKER_HOME = '/tmp/should-be-ignored'
    const tmp = await makeTmpDir()
    try {
      await mkdir(path.join(tmp, '.aiworker'), { recursive: true })
      const result = resolveAiworkerScope({ explicitHome: '/explicit/home', cwd: tmp })
      expect(result.scope).toBe('explicit')
      expect(result.home).toBe('/explicit/home')
      expect(result.source).toBe('cli-flag')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('AIWORKER_HOME env wins over project-detect', async () => {
    process.env.AIWORKER_HOME = '/tmp/env-home'
    const tmp = await makeTmpDir()
    try {
      await mkdir(path.join(tmp, '.aiworker'), { recursive: true })
      const result = resolveAiworkerScope({ cwd: tmp })
      expect(result.scope).toBe('explicit')
      expect(result.home).toBe('/tmp/env-home')
      expect(result.source).toBe('env')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('project-detect wins when no explicit / env, and .aiworker exists', async () => {
    const tmp = await makeTmpDir()
    try {
      await mkdir(path.join(tmp, '.aiworker'), { recursive: true })
      await writeFile(path.join(tmp, '.aiworker', 'SOUL.md'), '# Soul\n', 'utf8')
      const result = resolveAiworkerScope({ cwd: tmp })
      expect(result.scope).toBe('project')
      expect(result.projectRoot).toBe(tmp)
      expect(result.home).toBe(path.join(tmp, '.aiworker', 'runtime'))
      expect(result.source).toBe('project-detect')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('does not treat unmarked HOME .aiworker as project scope', async () => {
    const tmp = await makeTmpDir()
    const savedHome = process.env.HOME
    try {
      process.env.HOME = tmp
      await mkdir(path.join(tmp, '.aiworker'), { recursive: true })

      expect(resolveProjectRoot(tmp)).toBe(null)
      const result = resolveAiworkerScope({ cwd: tmp })
      expect(result.scope).toBe('user')
      expect(result.home).toBe(path.join(tmp, '.aiworker'))
      expect(result.source).toBe('user-default')
    }
    finally {
      if (savedHome === undefined)
        delete process.env.HOME
      else
        process.env.HOME = savedHome
      await cleanup(tmp)
    }
  })

  it('keeps marked HOME .aiworker as project scope', async () => {
    const tmp = await makeTmpDir()
    const savedHome = process.env.HOME
    try {
      process.env.HOME = tmp
      const aiworker = path.join(tmp, '.aiworker')
      await mkdir(aiworker, { recursive: true })
      await writeFile(path.join(aiworker, 'SOUL.md'), '# Soul\n', 'utf8')

      expect(resolveProjectRoot(tmp)).toBe(tmp)
      const result = resolveAiworkerScope({ cwd: tmp })
      expect(result.scope).toBe('project')
      expect(result.projectRoot).toBe(tmp)
      expect(result.home).toBe(path.join(tmp, '.aiworker', 'runtime'))
    }
    finally {
      if (savedHome === undefined)
        delete process.env.HOME
      else
        process.env.HOME = savedHome
      await cleanup(tmp)
    }
  })

  it('disableProjectDetect skips upward search → user-default', async () => {
    const tmp = await makeTmpDir()
    try {
      await mkdir(path.join(tmp, '.aiworker'), { recursive: true })
      const result = resolveAiworkerScope({ cwd: tmp, disableProjectDetect: true })
      expect(result.scope).toBe('user')
      expect(result.home).toBe(path.resolve(homedir(), '.aiworker'))
      expect(result.source).toBe('user-default')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('user-default when nothing matches', () => {
    const tmp = tmpdir()
    const result = resolveAiworkerScope({ cwd: tmp })
    // /tmp itself shouldn't have .aiworker; result is user-default
    expect(result.scope).toBe('user')
    expect(result.home).toBe(path.resolve(homedir(), '.aiworker'))
  })

  it('expands ~ in explicit / env paths', () => {
    const result = resolveAiworkerScope({ explicitHome: '~/custom-aiworker' })
    expect(result.home).toBe(path.join(homedir(), 'custom-aiworker'))
  })
})

describe('resolveProjectRoot upward search', () => {
  it('returns the closest ancestor containing .aiworker/', async () => {
    const tmp = await makeTmpDir()
    try {
      const project = path.join(tmp, 'my-project')
      const sub = path.join(project, 'src', 'deep', 'nested')
      await mkdir(path.join(project, '.aiworker'), { recursive: true })
      await mkdir(sub, { recursive: true })
      expect(resolveProjectRoot(sub)).toBe(project)
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('returns null when nothing found', async () => {
    const tmp = await makeTmpDir()
    try {
      expect(resolveProjectRoot(tmp)).toBe(null)
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('stops at a git boundary (no .aiworker in repo root)', async () => {
    const tmp = await makeTmpDir()
    try {
      const repo = path.join(tmp, 'my-repo')
      const sub = path.join(repo, 'src', 'deep')
      await mkdir(path.join(repo, '.git'), { recursive: true })
      await mkdir(sub, { recursive: true })
      // even if a .aiworker exists ABOVE the repo, walker stops at repo (.git)
      await mkdir(path.join(tmp, '.aiworker'), { recursive: true })
      expect(resolveProjectRoot(sub)).toBe(null)
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('returns repo root when both .git/ AND .aiworker/ exist there', async () => {
    const tmp = await makeTmpDir()
    try {
      const repo = path.join(tmp, 'my-repo')
      const sub = path.join(repo, 'src', 'deep')
      await mkdir(path.join(repo, '.git'), { recursive: true })
      await mkdir(path.join(repo, '.aiworker'), { recursive: true })
      await mkdir(sub, { recursive: true })
      expect(resolveProjectRoot(sub)).toBe(repo)
    }
    finally {
      await cleanup(tmp)
    }
  })
})

describe('worker / brain / workspaces paths in project scope', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined)
        delete process.env[k]
      else
        process.env[k] = savedEnv[k]
    }
  })

  it('resolveWorkerHome → projectRoot/.aiworker (no workers/<id>/ sublevel)', async () => {
    const tmp = await makeTmpDir()
    try {
      await mkdir(path.join(tmp, '.aiworker'), { recursive: true })
      const cwdSave = process.cwd()
      process.chdir(tmp)
      try {
        const canonicalTmp = await realpath(tmp)
        expect(resolveWorkerHome('wkr_xyz')).toBe(path.join(canonicalTmp, '.aiworker'))
        expect(resolveBrainHome('wkr_xyz')).toBe(path.join(canonicalTmp, '.aiworker'))
        expect(resolveWorkspacesRoot('wkr_xyz')).toBe(path.join(canonicalTmp, '.aiworker', 'runtime', 'workspaces'))
        expect(resolveAiworkerHome()).toBe(path.join(canonicalTmp, '.aiworker', 'runtime'))
      }
      finally {
        process.chdir(cwdSave)
      }
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('resolveWorkerHome → <home>/workers/<id>/ in user / explicit scope', () => {
    process.env.AIWORKER_HOME = '/tmp/explicit-home'
    expect(resolveWorkerHome('wkr_abc')).toBe('/tmp/explicit-home/workers/wkr_abc')
    expect(resolveBrainHome('wkr_abc')).toBe('/tmp/explicit-home/workers/wkr_abc/brain')
    expect(resolveWorkspacesRoot('wkr_abc')).toBe('/tmp/explicit-home/workers/wkr_abc/workspaces')
  })
})

describe('ensureProjectAiworker', () => {
  it('seeds product-facing Soul workspace layout idempotently', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp)
      const aiworker = path.join(tmp, '.aiworker')

      // dirs
      for (const d of ['memories', 'projects', 'artifacts']) {
        const s = await stat(path.join(aiworker, d))
        expect(s.isDirectory()).toBe(true)
      }
      await expect(stat(path.join(aiworker, 'skills'))).rejects.toThrow()
      await expect(stat(path.join(aiworker, 'runtime'))).rejects.toThrow()
      await expect(stat(path.join(aiworker, 'local'))).rejects.toThrow()

      // Soul workspace docs
      for (const f of ['SOUL.md', 'DOMAIN.md', 'TEMPLATES.md', 'PROJECTS.md', 'MEMORY.md']) {
        const s = await stat(path.join(aiworker, f))
        expect(s.isFile()).toBe(true)
      }
      for (const f of ['USER.md', 'ROLLUP.md', 'policy.json', 'scope.json', 'brain-capabilities.json', 'executor-capabilities.json']) {
        await expect(stat(path.join(aiworker, f))).rejects.toThrow()
      }

      // .gitignore in .aiworker/ ignores runtime state only.
      const topGitignore = await readFile(path.join(aiworker, '.gitignore'), 'utf8')
      expect(topGitignore).toBe('runtime/\n')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('does not overwrite existing files', async () => {
    const tmp = await makeTmpDir()
    try {
      const aiworker = path.join(tmp, '.aiworker')
      await mkdir(aiworker, { recursive: true })
      await writeFile(path.join(aiworker, 'SOUL.md'), '# Custom soul\n')

      await ensureProjectAiworker(tmp)
      const persisted = await readFile(path.join(aiworker, 'SOUL.md'), 'utf8')
      expect(persisted).toBe('# Custom soul\n')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('writes native project skill seed files and preserves existing skills', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp, {
        nativeSkillFiles: buildNativeProjectSkillSeedFiles({
          'kernel.brain-admission/SKILL.md': '# Brain Admission\n',
        }),
      })
      const targetPaths = resolveAllProjectNativeSkillPaths(tmp, 'kernel.brain-admission')
      expect(targetPaths.map(target => path.relative(tmp, target.path).replace(/\\/g, '/'))).toEqual([
        '.agents/skills/aiworker-kernel-brain-admission/SKILL.md',
        '.claude/skills/aiworker-kernel-brain-admission/SKILL.md',
      ])
      for (const target of targetPaths)
        expect(await readFile(target.path, 'utf8')).toBe('# Brain Admission\n')

      await ensureProjectAiworker(tmp, {
        nativeSkillFiles: buildNativeProjectSkillSeedFiles({
          'kernel.brain-admission/SKILL.md': '# Overwrite Attempt\n',
        }),
      })
      for (const target of targetPaths)
        expect(await readFile(target.path, 'utf8')).toBe('# Brain Admission\n')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('writes managed native projection files with manifest evidence', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp, {
        nativeSkillProjections: [{
          content: '# Brain Admission\n',
          logicalId: 'kernel.brain-admission',
          sourceKind: 'builtin',
          sourcePath: 'packages/shared/src/brain/skills/kernel/brain-admission/SKILL.md',
          sourceVersion: '1.0.0',
        }],
      })

      expect(nativeProjectSkillSlug('kernel.brain-admission')).toBe('aiworker-kernel-brain-admission')
      expect(await readFile(resolveAllProjectNativeSkillPaths(tmp, 'kernel.brain-admission')[0]!.path, 'utf8')).toBe('# Brain Admission\n')

      const manifest = await readNativeSkillProjectionManifest(tmp)
      expect(manifest?.schemaVersion).toBe(1)
      expect(manifest?.projections).toHaveLength(2)
      expect(manifest?.projections.map(record => record.slug)).toEqual([
        'aiworker-kernel-brain-admission',
        'aiworker-kernel-brain-admission',
      ])
      expect(manifest?.projections.map(record => record.status)).toEqual(['active', 'active'])
      expect(manifest?.projections[0]?.targetPath).toMatch(/\/aiworker-kernel-brain-admission\/SKILL\.md$/)
      expect(await readFile(resolveNativeSkillProjectionManifestPath(tmp), 'utf8')).toContain('"sourceVersion": "1.0.0"')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('rejects native project skill seed path escapes', async () => {
    const tmp = await makeTmpDir()
    try {
      await expect(ensureProjectAiworker(tmp, {
        nativeSkillFiles: {
          '../escape/SKILL.md': '# Escape\n',
        },
      })).rejects.toThrow('Invalid native project skill seed path')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('writes worker pack seed files under .aiworker and preserves existing content', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp, {
        workerPackFiles: {
          'domain-systems/developer/DOMAIN.md': '# Developer Domain\n',
          'worker-packs/developer/SKILL.md': '# Developer Skill\n',
        },
      })

      expect(await readFile(path.join(tmp, '.aiworker', 'domain-systems', 'developer', 'DOMAIN.md'), 'utf8')).toBe('# Developer Domain\n')
      expect(await readFile(path.join(tmp, '.aiworker', 'worker-packs', 'developer', 'SKILL.md'), 'utf8')).toBe('# Developer Skill\n')

      await ensureProjectAiworker(tmp, {
        workerPackFiles: {
          'worker-packs/developer/SKILL.md': '# Overwrite Attempt\n',
        },
      })
      expect(await readFile(path.join(tmp, '.aiworker', 'worker-packs', 'developer', 'SKILL.md'), 'utf8')).toBe('# Developer Skill\n')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('rejects worker pack seed path escapes and unsupported asset names', async () => {
    const tmp = await makeTmpDir()
    try {
      await expect(ensureProjectAiworker(tmp, {
        workerPackFiles: {
          '../worker-packs/developer/SKILL.md': '# Escape\n',
        },
      })).rejects.toThrow('Invalid worker pack seed path')
      await expect(ensureProjectAiworker(tmp, {
        workerPackFiles: {
          'worker-packs/developer/README.md': '# Wrong asset\n',
        },
      })).rejects.toThrow('Invalid worker pack seed path')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('keeps explicit fallback brain skill seed support secondary', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp, {
        brainSkillFiles: {
          'fallback.manual/SKILL.md': '# Manual fallback\n',
        },
      })
      expect(await readFile(path.join(tmp, '.aiworker', 'skills', 'fallback.manual', 'SKILL.md'), 'utf8')).toBe('# Manual fallback\n')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('projectAiworkerExists reflects state', async () => {
    const tmp = await makeTmpDir()
    try {
      expect(await projectAiworkerExists(tmp)).toBe(false)
      await ensureProjectAiworker(tmp)
      expect(await projectAiworkerExists(tmp)).toBe(true)
    }
    finally {
      await cleanup(tmp)
    }
  })
})

describe('ensureWorkerHome in project scope is template-no-op', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined)
        delete process.env[k]
      else
        process.env[k] = savedEnv[k]
    }
  })

  it('only ensures workspaces dir, does not seed persona docs (those come from ensureProjectAiworker)', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp)
      // Wipe persona docs to prove ensureWorkerHome doesn't re-seed them.
      await rm(path.join(tmp, '.aiworker', 'SOUL.md'))

      const cwdSave = process.cwd()
      process.chdir(tmp)
      try {
        await ensureWorkerHome('wkr_xyz')
        // runtime workspaces ensured separately from project initialization.
        const ws = await stat(path.join(tmp, '.aiworker', 'runtime', 'workspaces'))
        expect(ws.isDirectory()).toBe(true)
        // SOUL.md NOT re-seeded
        let soulMissing = false
        try {
          await stat(path.join(tmp, '.aiworker', 'SOUL.md'))
        }
        catch {
          soulMissing = true
        }
        expect(soulMissing).toBe(true)
      }
      finally {
        process.chdir(cwdSave)
      }
    }
    finally {
      await cleanup(tmp)
    }
  })
})
