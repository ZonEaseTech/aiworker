import type { LocalEngineStatus } from '@zonease/aiworker-soul-protocol'
import { spawnSync } from 'node:child_process'

import { sanitizeEngineEnv } from './engine-env'

export interface LocalEngineDefinition {
  command: string
  id: string
  name: string
}

export interface ResolvedLocalCliEngine {
  engineCommand: string
  engineId: string
  engineName: string
  executionMode: 'local-cli'
}

export class LocalEngineResolutionError extends Error {
  constructor(
    message: string,
    readonly code: 'engine-not-installed' | 'missing-engine-command' | 'unknown-engine',
  ) {
    super(message)
    this.name = 'LocalEngineResolutionError'
  }
}

export const LOCAL_ENGINE_DEFINITIONS = [
  { id: 'codex', name: 'Codex CLI', command: 'codex' },
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'cursor', name: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen' },
] as const satisfies readonly LocalEngineDefinition[]

export function scanLocalEngines(): LocalEngineStatus[] {
  return scanLocalEnginesFromCommands(LOCAL_ENGINE_DEFINITIONS, (command) => {
    const found = commandOutput('bash', ['-lc', `command -v ${command}`]).trim()
    if (!found)
      return null
    const version = commandOutput(found, ['--version']).split('\n')[0]?.trim() || 'installed'
    return { path: found, version }
  })
}

export function scanLocalEnginesFromCommands(
  definitions: readonly LocalEngineDefinition[],
  inspect: (command: string) => { path: string, version: string } | null,
): LocalEngineStatus[] {
  return definitions.map((engine) => {
    const found = inspect(engine.command)
    if (!found) {
      return {
        command: engine.command,
        id: engine.id,
        installed: false,
        name: engine.name,
        path: null,
        version: null,
      }
    }
    return {
      command: engine.command,
      id: engine.id,
      installed: true,
      name: engine.name,
      path: found.path,
      version: found.version,
    }
  })
}

export function resolveLocalCliEngine(input: {
  engineId: string
  engines: readonly LocalEngineStatus[]
}): ResolvedLocalCliEngine {
  const engineId = input.engineId.trim()
  const definition = LOCAL_ENGINE_DEFINITIONS.find(candidate => candidate.id === engineId)
  if (!definition) {
    throw new LocalEngineResolutionError(
      `Unknown local engine: ${engineId}. Select one of: ${LOCAL_ENGINE_DEFINITIONS.map(item => item.id).join(', ')}.`,
      'unknown-engine',
    )
  }
  const engine = input.engines.find(candidate => candidate.id === definition.id)
    ?? scanLocalEnginesFromCommands([definition], () => null)[0]
  if (!engine) {
    throw new LocalEngineResolutionError(
      `Unknown local engine: ${engineId}. Select one of: ${LOCAL_ENGINE_DEFINITIONS.map(item => item.id).join(', ')}.`,
      'unknown-engine',
    )
  }
  if (!engine.installed) {
    throw new LocalEngineResolutionError(
      `Selected local engine is not installed: ${engine.name}. Run engine readiness rescan after installing ${engine.command}.`,
      'engine-not-installed',
    )
  }
  const engineCommand = engine.path ?? engine.command
  if (!engineCommand) {
    throw new LocalEngineResolutionError(
      `Selected local engine has no executable command: ${engine.name}.`,
      'missing-engine-command',
    )
  }
  return {
    engineCommand,
    engineId: engine.id,
    engineName: engine.name,
    executionMode: 'local-cli',
  }
}

function commandOutput(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', env: sanitizeEngineEnv(), timeout: 2500 })
  if (result.status !== 0)
    return ''
  return result.stdout.toString()
}
