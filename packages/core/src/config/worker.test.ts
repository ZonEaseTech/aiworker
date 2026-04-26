import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { defaultWorkerMigrationsFolder } from '@aiworker/storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { __resetWorkerEnvCacheForTest, getWorkerEnv } from './worker'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

/**
 * BUG-001: 这两个字段以前硬编码 `/var/lib/aiworker` / `./drizzle/worker`,
 * 裸跑会触发 EACCES 或 "Can't find meta/_journal.json"。fallback 让 dev /
 * systemd --user 形态零配置可起,容器/systemd --system 仍可显式覆盖。
 */
describe('getWorkerEnv 默认 fallback', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    __resetWorkerEnvCacheForTest()
    for (const k of [
      'WORKER_DATA_ROOT',
      'WORKER_MIGRATIONS_FOLDER',
      'AIWORKER_HOME',
      'WORKER_DB_PATH',
      'PORT',
      'AIWORKER_FORCE_ID',
      'AIWORKER_FORCE_TOKEN',
      'AIWORKER_ADVERTISED_BASE_URL',
    ]) {
      delete process.env[k]
    }
    process.env.AIWORKER_MASTER_KEY = MASTER_KEY
  })

  afterEach(() => {
    __resetWorkerEnvCacheForTest()
    for (const k of Object.keys(process.env))
      delete process.env[k]
    Object.assign(process.env, originalEnv)
  })

  it('WORKER_MIGRATIONS_FOLDER 未设 → 回退到 storage-sqlite 内嵌路径', () => {
    const env = getWorkerEnv()
    expect(env.WORKER_MIGRATIONS_FOLDER).toBe(defaultWorkerMigrationsFolder)
    // 必须是绝对路径,否则 drizzle migrate 会按 cwd 解析 → 找不到 _journal.json。
    expect(path.isAbsolute(env.WORKER_MIGRATIONS_FOLDER)).toBe(true)
  })

  it('WORKER_DATA_ROOT 未设 + AIWORKER_HOME 未设 → 派生 ~/.aiworker/data-root', () => {
    const env = getWorkerEnv()
    expect(env.WORKER_DATA_ROOT).toBe(path.resolve(homedir(), '.aiworker', 'data-root'))
    expect(env.WORKER_DATA_ROOT.startsWith('/var/lib/aiworker')).toBe(false)
  })

  it('WORKER_DATA_ROOT 未设 + AIWORKER_HOME 已设 → 派生 <AIWORKER_HOME>/data-root', () => {
    process.env.AIWORKER_HOME = '/tmp/aiworker-home-bug001'
    __resetWorkerEnvCacheForTest()
    const env = getWorkerEnv()
    expect(env.WORKER_DATA_ROOT).toBe('/tmp/aiworker-home-bug001/data-root')
  })

  it('WORKER_DATA_ROOT 显式设置 → 保持原值不被 fallback 覆盖', () => {
    process.env.WORKER_DATA_ROOT = '/var/lib/aiworker'
    __resetWorkerEnvCacheForTest()
    const env = getWorkerEnv()
    // prod 容器(`docker-compose.yml`)显式覆盖必须生效。
    expect(env.WORKER_DATA_ROOT).toBe('/var/lib/aiworker')
  })

  it('WORKER_MIGRATIONS_FOLDER 显式设置 → 保持原值不被 fallback 覆盖', () => {
    process.env.WORKER_MIGRATIONS_FOLDER = '/app/drizzle/worker'
    __resetWorkerEnvCacheForTest()
    const env = getWorkerEnv()
    expect(env.WORKER_MIGRATIONS_FOLDER).toBe('/app/drizzle/worker')
  })
})
