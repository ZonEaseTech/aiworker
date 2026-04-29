import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { defaultWorkerMigrationsFolder } from '@zonease/aiworker-storage-sqlite/worker'
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
      'AIWORKER_WORKER_HOST',
      'AIWORKER_ADMIN_EXTERNAL_AUTH',
      'AIWORKER_FORCE_ID',
      'AIWORKER_FORCE_TOKEN',
      'AIWORKER_ADVERTISED_BASE_URL',
      'AIWORKER_GATEWAY_URL',
      'AIWORKER_JOIN_TOKEN',
      'AIWORKER_DISPLAY_NAME',
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

  it('AIWORKER_WORKER_HOST 未设 → 默认 loopback', () => {
    const env = getWorkerEnv()
    expect(env.AIWORKER_WORKER_HOST).toBe('127.0.0.1')
  })

  it('AIWORKER_WORKER_HOST 显式设置 → 保持原值', () => {
    process.env.AIWORKER_WORKER_HOST = '0.0.0.0'
    __resetWorkerEnvCacheForTest()
    const env = getWorkerEnv()
    expect(env.AIWORKER_WORKER_HOST).toBe('0.0.0.0')
  })

  it('AIWORKER_ADMIN_EXTERNAL_AUTH 未设 → 默认 false', () => {
    const env = getWorkerEnv()
    expect(env.AIWORKER_ADMIN_EXTERNAL_AUTH).toBe(false)
  })

  it('AIWORKER_ADMIN_EXTERNAL_AUTH=1 → true', () => {
    process.env.AIWORKER_ADMIN_EXTERNAL_AUTH = '1'
    __resetWorkerEnvCacheForTest()
    const env = getWorkerEnv()
    expect(env.AIWORKER_ADMIN_EXTERNAL_AUTH).toBe(true)
  })
})

/**
 * PLAN-018 / FEAT-024 — worker self-enrollment env 三件套：
 *   - 默认全 undefined（不触发 enroll，零回归）
 *   - 三件套同时设 → 三个字段如实落到 WorkerEnv
 *   - 缺一（DISPLAY_NAME 缺）仍 parse 通过；触发条件由 serve 路径判断
 *   - 非法 URL → schema 直接抛
 */
describe('getWorkerEnv self-enroll env (PLAN-018)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    __resetWorkerEnvCacheForTest()
    for (const k of [
      'AIWORKER_GATEWAY_URL',
      'AIWORKER_JOIN_TOKEN',
      'AIWORKER_DISPLAY_NAME',
      'AIWORKER_WORKER_HOST',
      'AIWORKER_ADMIN_EXTERNAL_AUTH',
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

  it('默认三件套全 undefined（不触发 enroll）', () => {
    const env = getWorkerEnv()
    expect(env.AIWORKER_GATEWAY_URL).toBeUndefined()
    expect(env.AIWORKER_JOIN_TOKEN).toBeUndefined()
    expect(env.AIWORKER_DISPLAY_NAME).toBeUndefined()
  })

  it('三件套同时设 → 全部落到 WorkerEnv', () => {
    process.env.AIWORKER_GATEWAY_URL = 'wss://gw.example.test/ws'
    process.env.AIWORKER_JOIN_TOKEN = 'join-secret-xyz'
    process.env.AIWORKER_DISPLAY_NAME = 'prod-1'
    __resetWorkerEnvCacheForTest()
    const env = getWorkerEnv()
    expect(env.AIWORKER_GATEWAY_URL).toBe('wss://gw.example.test/ws')
    expect(env.AIWORKER_JOIN_TOKEN).toBe('join-secret-xyz')
    expect(env.AIWORKER_DISPLAY_NAME).toBe('prod-1')
  })

  it('只设 JOIN_TOKEN（缺 URL）→ parse 仍通过（触发判断在 serve 层）', () => {
    process.env.AIWORKER_JOIN_TOKEN = 'join-secret-xyz'
    __resetWorkerEnvCacheForTest()
    const env = getWorkerEnv()
    expect(env.AIWORKER_JOIN_TOKEN).toBe('join-secret-xyz')
    expect(env.AIWORKER_GATEWAY_URL).toBeUndefined()
  })

  it('AIWORKER_GATEWAY_URL 非 URL → schema 抛错', () => {
    process.env.AIWORKER_GATEWAY_URL = 'not-a-url'
    __resetWorkerEnvCacheForTest()
    expect(() => getWorkerEnv()).toThrow()
  })
})
