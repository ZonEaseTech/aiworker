import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { loadGatewayConfigFromEnv } from '../src/config'

const ENV_KEYS = [
  'AIWORKER_HOME',
  'AIWORKER_FLEET_DB_PATH',
  'AIWORKER_GATEWAY_PORT',
  'AIWORKER_GATEWAY_HOST',
  'AIWORKER_ADMIN_EXTERNAL_AUTH',
  'AIWORKER_GATEWAY_CAN_LAUNCH',
  'AIWORKER_MASTER_KEY',
  'INTERNAL_SHARED_SECRET',
  'NODE_ENV',
]

const savedEnv: Record<string, string | undefined> = {}
const originalCwd = process.cwd()

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  process.chdir(originalCwd)
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined)
      delete process.env[key]
    else
      process.env[key] = savedEnv[key]
  }
})

async function makeTmp(prefix: string): Promise<string> {
  return realpath(await mkdtemp(path.join(tmpdir(), prefix)))
}

describe('loadGatewayConfigFromEnv fleet DB path', () => {
  test('defaults to AIWORKER_HOME/fleet.db', async () => {
    const home = await makeTmp('aiworker-gateway-config-home-')
    try {
      process.env.AIWORKER_HOME = home

      const config = loadGatewayConfigFromEnv()

      expect(config.fleetDbPath).toBe(path.join(home, 'fleet.db'))
    }
    finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('preserves AIWORKER_FLEET_DB_PATH override relative to cwd', async () => {
    const cwd = await makeTmp('aiworker-gateway-config-cwd-')
    try {
      await mkdir(path.join(cwd, 'nested'), { recursive: true })
      process.chdir(cwd)
      process.env.AIWORKER_HOME = '/tmp/ignored-aiworker-home'
      process.env.AIWORKER_FLEET_DB_PATH = 'nested/fleet.db'

      const config = loadGatewayConfigFromEnv()

      expect(config.fleetDbPath).toBe(path.join(cwd, 'nested', 'fleet.db'))
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('defaults admin external auth acknowledgement to false', () => {
    const config = loadGatewayConfigFromEnv()

    expect(config.adminExternalAuthAcknowledged).toBe(false)
  })

  test('parses explicit admin external auth acknowledgement', () => {
    process.env.AIWORKER_ADMIN_EXTERNAL_AUTH = '1'

    const config = loadGatewayConfigFromEnv()

    expect(config.adminExternalAuthAcknowledged).toBe(true)
  })
})
