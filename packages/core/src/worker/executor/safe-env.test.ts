import { describe, expect, it } from 'bun:test'

import { buildSafeChildEnv } from './safe-env'

describe('buildSafeChildEnv', () => {
  it('passes through canonical locale + shell context vars', () => {
    const env = buildSafeChildEnv(undefined, {
      PATH: '/usr/bin',
      HOME: '/home/worker',
      USER: 'worker',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      TZ: 'UTC',
      TERM: 'xterm-256color',
    })
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/worker',
      USER: 'worker',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      TZ: 'UTC',
      TERM: 'xterm-256color',
    })
  })

  it('passes through CLI-engine-specific prefixes', () => {
    const env = buildSafeChildEnv(undefined, {
      CLAUDE_BIN: '/usr/local/bin/claude',
      CODEX_CLI_VERSION: '0.121.0',
      CURSOR_CONFIG_DIR: '/etc/cursor',
      GEMINI_CLI_VERSION: '1.0.0',
      QWEN_API_BASE: 'https://example.com',
      NODE_OPTIONS: '--max-old-space-size=4096',
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
      XDG_CONFIG_HOME: '/home/worker/.config',
    })
    expect(env).toEqual({
      CLAUDE_BIN: '/usr/local/bin/claude',
      CODEX_CLI_VERSION: '0.121.0',
      CURSOR_CONFIG_DIR: '/etc/cursor',
      GEMINI_CLI_VERSION: '1.0.0',
      QWEN_API_BASE: 'https://example.com',
      NODE_OPTIONS: '--max-old-space-size=4096',
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
      XDG_CONFIG_HOME: '/home/worker/.config',
    })
  })

  it('strips AIWORKER / INTERNAL / WORKER prefix vars even when they look benign', () => {
    const env = buildSafeChildEnv(undefined, {
      PATH: '/usr/bin',
      AIWORKER_MASTER_KEY: 'deadbeef'.repeat(8),
      AIWORKER_JOIN_TOKEN: 'join-token',
      AIWORKER_HOME: '/var/lib/aiworker',
      INTERNAL_SHARED_SECRET: 'shared-secret',
      WORKER_DB_PATH: '/var/lib/aiworker/worker.db',
    })
    expect(env).toEqual({ PATH: '/usr/bin' })
    expect(env.AIWORKER_MASTER_KEY).toBeUndefined()
    expect(env.AIWORKER_JOIN_TOKEN).toBeUndefined()
    expect(env.AIWORKER_HOME).toBeUndefined()
    expect(env.INTERNAL_SHARED_SECRET).toBeUndefined()
    expect(env.WORKER_DB_PATH).toBeUndefined()
  })

  it('strips arbitrary *_TOKEN / *_SECRET / *_API_KEY suffix vars from process.env', () => {
    const env = buildSafeChildEnv(undefined, {
      PATH: '/usr/bin',
      GITHUB_TOKEN: 'gh-token',
      ANTHROPIC_API_KEY: 'sk-ant-redacted',
      OPENAI_SECRET: 'openai-secret',
      DATABASE_PASSWORD: 'pgpw',
      SSH_PRIVATE_KEY: 'pem-content',
    })
    expect(env).toEqual({ PATH: '/usr/bin' })
  })

  it('drops vars that match neither the passthrough nor block lists', () => {
    const env = buildSafeChildEnv(undefined, {
      PATH: '/usr/bin',
      RANDOM_INTERNAL_VAR: 'something',
      AWS_REGION: 'us-east-1',
    })
    expect(env).toEqual({ PATH: '/usr/bin' })
  })

  it('layers extra on top, allowing operator-supplied secret-shaped names', () => {
    const env = buildSafeChildEnv(
      {
        ANTHROPIC_API_KEY: 'sk-from-worker-config',
        CLAUDE_BIN: '/opt/claude',
      },
      {
        PATH: '/usr/bin',
        ANTHROPIC_API_KEY: 'sk-from-process-env-should-be-stripped',
        CLAUDE_BIN: '/usr/bin/claude',
      },
    )
    expect(env.PATH).toBe('/usr/bin')
    expect(env.ANTHROPIC_API_KEY).toBe('sk-from-worker-config')
    expect(env.CLAUDE_BIN).toBe('/opt/claude')
  })

  it('skips env values that are undefined', () => {
    const env = buildSafeChildEnv(undefined, {
      PATH: '/usr/bin',
      HOME: undefined,
    } as NodeJS.ProcessEnv)
    expect(env).toEqual({ PATH: '/usr/bin' })
  })
})
