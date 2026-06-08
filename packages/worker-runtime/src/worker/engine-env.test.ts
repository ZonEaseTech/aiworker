import { describe, expect, test } from 'bun:test'
import { sanitizeEngineEnv, soulAppServiceEnv } from './engine-env'

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

describe('soulAppServiceEnv', () => {
  const sample = {
    PATH: '/usr/bin',
    HOME: '/h',
    ANTHROPIC_API_KEY: 'k',
    OPENAI_API_KEY: 'k',
    AWS_SECRET_ACCESS_KEY: 'k',
    AIWORKER_LOCAL_TOKEN: 't',
    LANG: 'en_US.UTF-8',
    TZ: 'UTC',
    HTTP_PROXY: 'http://proxy.example.com',
  }

  test('keeps allowlisted vars and strips LLM/cloud/Host-internal keys', () => {
    const result = soulAppServiceEnv(sample)
    expect(result.PATH).toBe('/usr/bin')
    expect(result.HOME).toBe('/h')
    expect(result.LANG).toBe('en_US.UTF-8')
    expect(result.TZ).toBe('UTC')
    expect(result.HTTP_PROXY).toBe('http://proxy.example.com')
    expect(result.ANTHROPIC_API_KEY).toBeUndefined()
    expect(result.OPENAI_API_KEY).toBeUndefined()
    expect(result.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(result.AIWORKER_LOCAL_TOKEN).toBeUndefined()
  })

  test('does not mutate the input env', () => {
    const input = { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'secret' }
    soulAppServiceEnv(input)
    expect(input.ANTHROPIC_API_KEY).toBe('secret')
  })
})
