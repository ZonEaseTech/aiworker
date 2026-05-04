import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  ensureProjectAiworker,
  ensureWorkerHome,
  projectAiworkerExists,
  resolveAiworkerHome,
  resolveAiworkerScope,
  resolveBrainHome,
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
      const result = resolveAiworkerScope({ cwd: tmp })
      expect(result.scope).toBe('project')
      expect(result.projectRoot).toBe(tmp)
      expect(result.home).toBe(path.join(tmp, '.aiworker', 'local'))
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
      await writeFile(path.join(aiworker, 'AGENT.md'), '# Agent\n', 'utf8')
      await writeFile(path.join(aiworker, 'SOUL.md'), '# Soul\n', 'utf8')

      expect(resolveProjectRoot(tmp)).toBe(tmp)
      const result = resolveAiworkerScope({ cwd: tmp })
      expect(result.scope).toBe('project')
      expect(result.projectRoot).toBe(tmp)
      expect(result.home).toBe(path.join(tmp, '.aiworker', 'local'))
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
        expect(resolveWorkspacesRoot('wkr_xyz')).toBe(path.join(canonicalTmp, '.aiworker', 'local', 'workspaces'))
        expect(resolveAiworkerHome()).toBe(path.join(canonicalTmp, '.aiworker', 'local'))
      }
      finally {
        process.chdir(cwdSave)
      }
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('resolveWorkerHome → <home>/workers/<id>/ in user / explicit scope (back-compat)', () => {
    process.env.AIWORKER_HOME = '/tmp/explicit-home'
    expect(resolveWorkerHome('wkr_abc')).toBe('/tmp/explicit-home/workers/wkr_abc')
    expect(resolveBrainHome('wkr_abc')).toBe('/tmp/explicit-home/workers/wkr_abc/brain')
    expect(resolveWorkspacesRoot('wkr_abc')).toBe('/tmp/explicit-home/workers/wkr_abc/workspaces')
  })
})

describe('ensureProjectAiworker', () => {
  it('seeds full project layout idempotently', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp)
      const aiworker = path.join(tmp, '.aiworker')

      // dirs
      for (const d of ['skills', 'memories', 'local', 'local/workspaces']) {
        const s = await stat(path.join(aiworker, d))
        expect(s.isDirectory()).toBe(true)
      }

      // persona docs
      for (const f of ['AGENT.md', 'SOUL.md', 'USER.md', 'MEMORY.md', 'ROLLUP.md', 'policy.json', 'toolsets.json', 'capability-packs.json', 'executor-capabilities.json']) {
        const s = await stat(path.join(aiworker, f))
        expect(s.isFile()).toBe(true)
      }

      // mcp.json with empty servers map
      const mcp = JSON.parse(await readFile(path.join(aiworker, 'mcp.json'), 'utf8'))
      expect(mcp).toEqual({ servers: {} })

      const policy = JSON.parse(await readFile(path.join(aiworker, 'policy.json'), 'utf8'))
      expect(policy.status).toBe('draft')
      const toolsets = JSON.parse(await readFile(path.join(aiworker, 'toolsets.json'), 'utf8'))
      expect(toolsets.defaultToolsets).toEqual([])
      const packs = JSON.parse(await readFile(path.join(aiworker, 'capability-packs.json'), 'utf8'))
      expect(packs.packs).toEqual([])
      const executorCapabilities = JSON.parse(await readFile(path.join(aiworker, 'executor-capabilities.json'), 'utf8'))
      expect(executorCapabilities).toEqual({ schemaVersion: 1, engines: {} })

      // .gitignore in .aiworker/ ignores local/
      const topGitignore = await readFile(path.join(aiworker, '.gitignore'), 'utf8')
      expect(topGitignore).toContain('local/')

      // local/.gitignore is the catch-all
      const localGitignore = await readFile(path.join(aiworker, 'local', '.gitignore'), 'utf8')
      expect(localGitignore).toBe('*\n!.gitignore\n')
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
      await writeFile(path.join(aiworker, 'AGENT.md'), '# Custom persona\n')

      await ensureProjectAiworker(tmp)
      const persisted = await readFile(path.join(aiworker, 'AGENT.md'), 'utf8')
      expect(persisted).toBe('# Custom persona\n')
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('does not write scope.json when seed.scopeJson is omitted', async () => {
    const tmp = await makeTmpDir()
    try {
      await ensureProjectAiworker(tmp)
      const scopePath = path.join(tmp, '.aiworker', 'scope.json')
      let exists = true
      try {
        await stat(scopePath)
      }
      catch {
        exists = false
      }
      expect(exists).toBe(false)
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('writes scope.json when seed.scopeJson is provided and preserves existing content on re-run', async () => {
    const tmp = await makeTmpDir()
    try {
      const initial = `${JSON.stringify({
        kind: 'developer-repo',
        primarySoul: 'developer',
        schemaVersion: 1,
      }, null, 2)}\n`

      await ensureProjectAiworker(tmp, { scopeJson: initial })
      const scopePath = path.join(tmp, '.aiworker', 'scope.json')
      const written = await readFile(scopePath, 'utf8')
      expect(written).toBe(initial)

      const overwriteAttempt = `${JSON.stringify({
        kind: 'hiring-pool',
        primarySoul: 'hr-recruiting',
        schemaVersion: 1,
      }, null, 2)}\n`
      await ensureProjectAiworker(tmp, { scopeJson: overwriteAttempt })
      const persisted = await readFile(scopePath, 'utf8')
      expect(persisted).toBe(initial)
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
      await rm(path.join(tmp, '.aiworker', 'AGENT.md'))

      const cwdSave = process.cwd()
      process.chdir(tmp)
      try {
        await ensureWorkerHome('wkr_xyz')
        // workspaces ensured
        const ws = await stat(path.join(tmp, '.aiworker', 'local', 'workspaces'))
        expect(ws.isDirectory()).toBe(true)
        // AGENT.md NOT re-seeded
        let agentMissing = false
        try {
          await stat(path.join(tmp, '.aiworker', 'AGENT.md'))
        }
        catch {
          agentMissing = true
        }
        expect(agentMissing).toBe(true)
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
