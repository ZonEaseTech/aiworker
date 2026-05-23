import { describe, expect, test } from 'bun:test'
import { sanitizeEngineEnv } from './engine-env'

describe('sanitizeEngineEnv', () => {
  const sample = {
    AIWORKER_LOCAL_TOKEN: 'secret-bearer',
    AIWORKER_MOUNT_TOKEN: 'mount-secret',
    AIWORKER_HOME: '/home/u/.aiworker',
    WORKER_DB_PATH: '/db.sqlite',
    OD_CODEX_DISABLE_PLUGINS: '1',
    PATH: '/usr/bin',
    HOME: '/home/u',
    ANTHROPIC_API_KEY: 'engine-auth',
    LANG: 'en_US.UTF-8',
  }

  test('strips Host-internal namespaces, keeps engine env', () => {
    const result = sanitizeEngineEnv(sample)
    expect(result.AIWORKER_LOCAL_TOKEN).toBeUndefined()
    expect(result.AIWORKER_MOUNT_TOKEN).toBeUndefined()
    expect(result.AIWORKER_HOME).toBeUndefined()
    expect(result.WORKER_DB_PATH).toBeUndefined()
    expect(result.OD_CODEX_DISABLE_PLUGINS).toBeUndefined()
    expect(result.PATH).toBe('/usr/bin')
    expect(result.HOME).toBe('/home/u')
    expect(result.ANTHROPIC_API_KEY).toBe('engine-auth')
    expect(result.LANG).toBe('en_US.UTF-8')
  })

  test('does not mutate the input env', () => {
    const input = { AIWORKER_LOCAL_TOKEN: 'x', PATH: '/bin' }
    sanitizeEngineEnv(input)
    expect(input.AIWORKER_LOCAL_TOKEN).toBe('x')
  })
})
