import type { LocalEngineStatus } from '@zonease/aiworker-soul-descriptor'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'bun:test'

import {
  CREDENTIAL_PROBEABLE_ENGINE_IDS,
  inspectLocalEngineCredential,
  LOCAL_ENGINE_DEFINITIONS,
  LocalEngineResolutionError,
  resolveEngineAuthReadiness,
  resolveLocalCliEngine,
  scanLocalEngines,
  scanLocalEnginesFromCommands,
} from './local-engine-resolver'

describe('local engine resolver', () => {
  it('resolves claude-code engine id to the installed claude command', () => {
    const engine = resolveLocalCliEngine({
      engineId: 'claude-code',
      engines: [{
        command: 'claude',
        id: 'claude-code',
        installed: true,
        name: 'Claude Code',
        path: '/Users/example/.local/bin/claude',
        version: '2.1.148 (Claude Code)',
      }],
    })

    expect(engine).toEqual({
      engineCommand: '/Users/example/.local/bin/claude',
      engineId: 'claude-code',
      engineName: 'Claude Code',
      executionMode: 'local-cli',
    })
  })

  it('rejects unknown engine ids before executor invocation', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [],
    })).toThrow(LocalEngineResolutionError)
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [],
    })).toThrow('Unknown local engine: unknown-engine')
  })

  it('rejects unknown engine ids even when persisted readiness claims installed', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [{
        command: 'echo',
        id: 'unknown-engine',
        installed: true,
        name: 'Unknown Engine',
        path: '/bin/echo',
        version: 'echo 1.0',
      }],
    })).toThrow(LocalEngineResolutionError)
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [{
        command: 'echo',
        id: 'unknown-engine',
        installed: true,
        name: 'Unknown Engine',
        path: '/bin/echo',
        version: 'echo 1.0',
      }],
    })).toThrow('Unknown local engine: unknown-engine')
  })

  it('rejects known but unavailable local engines before executor invocation', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'claude-code',
      engines: [{
        command: 'claude',
        id: 'claude-code',
        installed: false,
        name: 'Claude Code',
        path: null,
        version: null,
      }],
    })).toThrow('Selected local engine is not installed: Claude Code')
  })

  it('scans known command definitions into readiness rows', () => {
    const engines = scanLocalEnginesFromCommands([
      { command: 'codex', id: 'codex', name: 'Codex CLI' },
      { command: 'claude', id: 'claude-code', name: 'Claude Code' },
    ], command => command === 'claude'
      ? { path: '/bin/claude', version: 'Claude 1.0' }
      : null)

    expect(engines).toEqual([
      { command: 'codex', id: 'codex', installed: false, name: 'Codex CLI', path: null, version: null },
      { command: 'claude', id: 'claude-code', installed: true, name: 'Claude Code', path: '/bin/claude', version: 'Claude 1.0' },
    ])
  })

  it('sanitizes Host-internal environment while probing local engine versions', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aiworker-engine-scan-'))
    const binDir = path.join(root, 'bin')
    const envLog = path.join(root, 'env.log')
    const original = {
      aiworkerLocalToken: process.env.AIWORKER_LOCAL_TOKEN,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      odCodexDisablePlugins: process.env.OD_CODEX_DISABLE_PLUGINS,
      path: process.env.PATH,
      testEngineEnvLog: process.env.TEST_ENGINE_ENV_LOG,
      workerDbPath: process.env.WORKER_DB_PATH,
    }
    try {
      mkdirSync(binDir, { recursive: true })
      writeFileSync(path.join(binDir, 'codex'), `#!/bin/sh
{
  printf 'AIWORKER_LOCAL_TOKEN=%s\\n' "\${AIWORKER_LOCAL_TOKEN:-}"
  printf 'WORKER_DB_PATH=%s\\n' "\${WORKER_DB_PATH:-}"
  printf 'OD_CODEX_DISABLE_PLUGINS=%s\\n' "\${OD_CODEX_DISABLE_PLUGINS:-}"
  printf 'ANTHROPIC_API_KEY=%s\\n' "\${ANTHROPIC_API_KEY:-}"
} > "\${TEST_ENGINE_ENV_LOG}"
printf 'codex 1.0\\n'
`)
      chmodSync(path.join(binDir, 'codex'), 0o755)
      process.env.PATH = `${binDir}:/bin:/usr/bin`
      process.env.TEST_ENGINE_ENV_LOG = envLog
      process.env.AIWORKER_LOCAL_TOKEN = 'local-token-secret'
      process.env.WORKER_DB_PATH = '/tmp/aiworker-secret.db'
      process.env.OD_CODEX_DISABLE_PLUGINS = '1'
      process.env.ANTHROPIC_API_KEY = 'engine-auth'

      const engines = scanLocalEngines()

      expect(engines.find(engine => engine.id === 'codex')).toMatchObject({
        id: 'codex',
        installed: true,
        version: 'codex 1.0',
      })
      const captured = readFileSync(envLog, 'utf8')
      expect(captured).not.toContain('local-token-secret')
      expect(captured).not.toContain('/tmp/aiworker-secret.db')
      expect(captured).not.toContain('OD_CODEX_DISABLE_PLUGINS=1')
      expect(captured).toContain('ANTHROPIC_API_KEY=engine-auth')
    }
    finally {
      restoreEnv('PATH', original.path)
      restoreEnv('TEST_ENGINE_ENV_LOG', original.testEngineEnvLog)
      restoreEnv('AIWORKER_LOCAL_TOKEN', original.aiworkerLocalToken)
      restoreEnv('WORKER_DB_PATH', original.workerDbPath)
      restoreEnv('OD_CODEX_DISABLE_PLUGINS', original.odCodexDisablePlugins)
      restoreEnv('ANTHROPIC_API_KEY', original.anthropicApiKey)
      rmSync(root, { force: true, recursive: true })
    }
  })
})

describe('resolveEngineAuthReadiness', () => {
  const codexInstalled: LocalEngineStatus = {
    command: 'codex',
    id: 'codex',
    installed: true,
    name: 'Codex CLI',
    path: '/bin/codex',
    version: 'codex 1.0',
  }
  const claudeInstalled: LocalEngineStatus = {
    command: 'claude',
    id: 'claude-code',
    installed: true,
    name: 'Claude Code',
    path: '/bin/claude',
    version: 'claude 1.0',
  }

  it('reports auth-ready when an installed engine has a valid credential', () => {
    expect(resolveEngineAuthReadiness(codexInstalled, () => true)).toBe(true)
  })

  it('reports not auth-ready when an installed engine has no credential', () => {
    expect(resolveEngineAuthReadiness(codexInstalled, () => false)).toBe(false)
  })

  it('treats uninstalled engines as not auth-ready without probing credentials', () => {
    let probed = false
    const status: LocalEngineStatus = { ...codexInstalled, installed: false, path: null, version: null }
    expect(resolveEngineAuthReadiness(status, () => {
      probed = true
      return true
    })).toBe(false)
    expect(probed).toBe(false)
  })

  it('selects codex before claude-code on definition order when both are auth-ready', () => {
    const ordered = LOCAL_ENGINE_DEFINITIONS.map((definition) => {
      if (definition.id === 'codex')
        return codexInstalled
      if (definition.id === 'claude-code')
        return claudeInstalled
      return {
        command: definition.command,
        id: definition.id,
        installed: false,
        name: definition.name,
        path: null,
        version: null,
      } satisfies LocalEngineStatus
    })
    const firstReady = ordered.find(engine => resolveEngineAuthReadiness(engine, () => true))
    expect(firstReady?.id).toBe('codex')
  })
})

describe('inspectLocalEngineCredential', () => {
  function withHome(run: (home: string) => void): void {
    const original = process.env.HOME
    const home = mkdtempSync(path.join(tmpdir(), 'aiworker-creds-'))
    try {
      process.env.HOME = home
      run(home)
    }
    finally {
      restoreEnv('HOME', original)
      rmSync(home, { force: true, recursive: true })
    }
  }

  it('returns true when the codex auth file holds a non-empty JSON object', () => {
    withHome((home) => {
      mkdirSync(path.join(home, '.codex'), { recursive: true })
      writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'redacted' }))
      expect(inspectLocalEngineCredential('codex')).toBe(true)
    })
  })

  it('returns true when the claude credentials file holds a non-empty JSON object', () => {
    withHome((home) => {
      mkdirSync(path.join(home, '.claude'), { recursive: true })
      writeFileSync(path.join(home, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'redacted' } }))
      expect(inspectLocalEngineCredential('claude-code')).toBe(true)
    })
  })

  it('returns false when the credential file is absent', () => {
    withHome(() => {
      expect(inspectLocalEngineCredential('codex')).toBe(false)
      expect(inspectLocalEngineCredential('claude-code')).toBe(false)
    })
  })

  it('returns false when the credential file is malformed JSON', () => {
    withHome((home) => {
      mkdirSync(path.join(home, '.codex'), { recursive: true })
      writeFileSync(path.join(home, '.codex', 'auth.json'), 'not-json{')
      expect(inspectLocalEngineCredential('codex')).toBe(false)
    })
  })

  it('returns false for an empty credential file', () => {
    withHome((home) => {
      mkdirSync(path.join(home, '.codex'), { recursive: true })
      writeFileSync(path.join(home, '.codex', 'auth.json'), '   ')
      expect(inspectLocalEngineCredential('codex')).toBe(false)
    })
  })

  it('returns false for engines without a known credential location', () => {
    withHome(() => {
      expect(inspectLocalEngineCredential('cursor')).toBe(false)
      expect(inspectLocalEngineCredential('gemini')).toBe(false)
    })
  })
})

describe('CREDENTIAL_PROBEABLE_ENGINE_IDS', () => {
  it('lists exactly the engines inspectLocalEngineCredential has a real probe for', () => {
    expect([...CREDENTIAL_PROBEABLE_ENGINE_IDS].sort()).toEqual(['claude-code', 'codex'])
  })

  it('only names real local engine definitions (no phantom ids)', () => {
    for (const engineId of CREDENTIAL_PROBEABLE_ENGINE_IDS)
      expect(LOCAL_ENGINE_DEFINITIONS.some(definition => definition.id === engineId)).toBe(true)
  })

  it('keeps non-probeable engines unconditionally false so doctor never false-warns them', () => {
    // 不在白名单内的引擎(cursor/gemini/opencode/qwen)没有真凭证探测分支 → inspect 恒
    // false 且不触碰 FS;doctor 据此不再把「无法探测」误判为「未登录」。
    const nonProbeable = LOCAL_ENGINE_DEFINITIONS
      .map(definition => definition.id)
      .filter(engineId => !CREDENTIAL_PROBEABLE_ENGINE_IDS.includes(engineId))
    expect(nonProbeable.length).toBeGreaterThan(0)
    for (const engineId of nonProbeable)
      expect(inspectLocalEngineCredential(engineId)).toBe(false)
  })
})

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined)
    delete process.env[key]
  else
    process.env[key] = value
}
