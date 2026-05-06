import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapDotenv } from './dotenv-bootstrap'

const ENV_KEYS = [
  'AIWORKER_HOME',
  'AIWORKER_MASTER_KEY',
  'INTERNAL_SHARED_SECRET',
  'AIWORKER_GATEWAY_URL',
  'AIWORKER_JOIN_TOKEN',
  'AIWORKER_DISPLAY_NAME',
  'AIWORKER_ENROLL_MODE',
] as const

const MASTER_KEY = 'a'.repeat(64)
const SHARED_SECRET = 'b'.repeat(48)

describe('bootstrapDotenv worker-local startup env', () => {
  const savedEnv: Partial<Record<typeof ENV_KEYS[number], string>> = {}
  const tmpRoots: string[] = []

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined)
        delete process.env[key]
      else
        process.env[key] = savedEnv[key]
    }
    while (tmpRoots.length > 0)
      await rm(tmpRoots.pop()!, { recursive: true, force: true })
  })

  it('loads gateway enrollment env from an existing worker-local .env', async () => {
    const home = await makeHome(tmpRoots)
    await writeFile(path.join(home, '.env'), [
      `AIWORKER_MASTER_KEY=${MASTER_KEY}`,
      `INTERNAL_SHARED_SECRET=${SHARED_SECRET}`,
      'AIWORKER_GATEWAY_URL=wss://gateway.example.com/ws',
      'AIWORKER_DISPLAY_NAME=local-worker',
      'AIWORKER_ENROLL_MODE=otp',
      '',
    ].join('\n'), 'utf8')

    const result = bootstrapDotenv({ home, printOnMint: false })

    expect(result.minted).toBe(false)
    expect(process.env.AIWORKER_GATEWAY_URL).toBe('wss://gateway.example.com/ws')
    expect(process.env.AIWORKER_DISPLAY_NAME).toBe('local-worker')
    expect(process.env.AIWORKER_ENROLL_MODE).toBe('otp')
  })

  it('persists explicit process startup env when minting a new .env', async () => {
    const home = await makeHome(tmpRoots)
    process.env.AIWORKER_GATEWAY_URL = 'wss://gateway.example.com/ws'
    process.env.AIWORKER_DISPLAY_NAME = 'project-laptop'
    process.env.AIWORKER_ENROLL_MODE = 'otp'

    const result = bootstrapDotenv({ home, printOnMint: false })
    const text = await readFile(result.envFile, 'utf8')
    const fileMode = (await stat(result.envFile)).mode & 0o777

    expect(result.minted).toBe(true)
    expect(text).toContain('AIWORKER_GATEWAY_URL=wss://gateway.example.com/ws')
    expect(text).toContain('AIWORKER_DISPLAY_NAME=project-laptop')
    expect(text).toContain('AIWORKER_ENROLL_MODE=otp')
    expect(fileMode).toBe(0o600)
  })

  it('updates existing .env startup entries from explicit process env without overriding unset keys', async () => {
    const home = await makeHome(tmpRoots)
    const envFile = path.join(home, '.env')
    await writeFile(envFile, [
      `AIWORKER_MASTER_KEY=${MASTER_KEY}`,
      `INTERNAL_SHARED_SECRET=${SHARED_SECRET}`,
      'AIWORKER_GATEWAY_URL=ws://old.example.com/ws',
      'AIWORKER_DISPLAY_NAME=file-worker',
      '',
    ].join('\n'), 'utf8')
    process.env.AIWORKER_GATEWAY_URL = 'wss://new.example.com/ws'
    process.env.AIWORKER_JOIN_TOKEN = 'join-secret'

    bootstrapDotenv({ home, printOnMint: false })
    const text = await readFile(envFile, 'utf8')

    expect(process.env.AIWORKER_GATEWAY_URL).toBe('wss://new.example.com/ws')
    expect(process.env.AIWORKER_DISPLAY_NAME).toBe('file-worker')
    expect(text).toContain('AIWORKER_GATEWAY_URL=wss://new.example.com/ws')
    expect(text).toContain('AIWORKER_JOIN_TOKEN=join-secret')
    expect(text).toContain('AIWORKER_DISPLAY_NAME=file-worker')
  })
})

async function makeHome(tmpRoots: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'aiworker-dotenv-test-'))
  const home = path.join(root, '.aiworker', 'local')
  tmpRoots.push(root)
  await mkdir(home, { recursive: true })
  return home
}
