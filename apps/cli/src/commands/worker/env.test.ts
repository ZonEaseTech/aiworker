import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { runEnvDisplayName, runEnvGatewayUrl } from './env'

const ORIGINAL_CWD = process.cwd()
const ORIGINAL_ENV = { ...process.env }

async function makeProjectEnv(): Promise<{ envFile: string, project: string }> {
  const project = await mkdtemp(path.join(tmpdir(), 'aiworker-env-command-'))
  const aiworker = path.join(project, '.aiworker')
  const local = path.join(aiworker, 'local')
  await mkdir(local, { recursive: true })
  await writeFile(path.join(aiworker, 'SOUL.md'), '# Soul\n', 'utf8')
  const envFile = path.join(local, '.env')
  await writeFile(envFile, 'AIWORKER_MASTER_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nINTERNAL_SHARED_SECRET=bbbbbbbbbbbbbbbb\n', 'utf8')
  return { envFile, project }
}

describe('aiworker env startup shortcuts', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.AIWORKER_HOME
  })

  afterEach(() => {
    process.chdir(ORIGINAL_CWD)
    process.env = { ...ORIGINAL_ENV }
  })

  it('writes gateway URL and display name into the project-local .env', async () => {
    const { envFile, project } = await makeProjectEnv()
    try {
      process.chdir(project)

      expect(await runEnvGatewayUrl('wss://gw.example.test/ws')).toBe(0)
      expect(await runEnvDisplayName('edge laptop')).toBe(0)

      const text = await readFile(envFile, 'utf8')
      expect(text).toContain('AIWORKER_GATEWAY_URL=wss://gw.example.test/ws')
      expect(text).toContain('AIWORKER_DISPLAY_NAME=edge laptop')
    }
    finally {
      await rm(project, { force: true, recursive: true })
    }
  })

  it('updates existing shortcut values without duplicating keys', async () => {
    const { envFile, project } = await makeProjectEnv()
    try {
      process.chdir(project)
      await writeFile(envFile, 'AIWORKER_GATEWAY_URL=wss://old.example.test/ws\nAIWORKER_DISPLAY_NAME=old\n', 'utf8')

      expect(await runEnvGatewayUrl('wss://new.example.test/ws')).toBe(0)
      expect(await runEnvDisplayName('new')).toBe(0)

      const text = await readFile(envFile, 'utf8')
      expect(text.match(/^AIWORKER_GATEWAY_URL=/gm)?.length).toBe(1)
      expect(text.match(/^AIWORKER_DISPLAY_NAME=/gm)?.length).toBe(1)
      expect(text).toContain('AIWORKER_GATEWAY_URL=wss://new.example.test/ws')
      expect(text).toContain('AIWORKER_DISPLAY_NAME=new')
    }
    finally {
      await rm(project, { force: true, recursive: true })
    }
  })

  it('fails without creating .env when the worker has not been initialized', async () => {
    const project = await mkdtemp(path.join(tmpdir(), 'aiworker-env-command-missing-'))
    try {
      await mkdir(path.join(project, '.aiworker'), { recursive: true })
      await writeFile(path.join(project, '.aiworker', 'SOUL.md'), '# Soul\n', 'utf8')
      process.chdir(project)

      expect(await runEnvGatewayUrl('wss://gw.example.test/ws')).toBe(2)
      expect(existsSync(path.join(project, '.aiworker', 'local', '.env'))).toBe(false)
    }
    finally {
      await rm(project, { force: true, recursive: true })
    }
  })

  it('rejects invalid values before touching .env', async () => {
    const { envFile, project } = await makeProjectEnv()
    try {
      process.chdir(project)
      const before = await readFile(envFile, 'utf8')

      expect(await runEnvGatewayUrl('not-a-url')).toBe(2)
      expect(await runEnvDisplayName('x'.repeat(81))).toBe(2)
      expect(await readFile(envFile, 'utf8')).toBe(before)
    }
    finally {
      await rm(project, { force: true, recursive: true })
    }
  })
})
