import type { LocalEngineStatus } from '@zonease/aiworker-soul-descriptor'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { sanitizeEngineEnv } from './engine-env'

export interface LocalEngineDefinition {
  command: string
  id: string
  name: string
}

/**
 * 注入式凭证探测:给定 engineId,返回该引擎是否有正向凭证证据(已登录)。
 * 镜像 scanLocalEnginesFromCommands 的 DI 缝,测试注入 fake 即可不真读凭证文件。
 */
export type InspectEngineCredential = (engineId: string) => boolean

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

/**
 * 单一 canonical「保守可用」口径:引擎已安装 *且* 有正向凭证证据 → authReady。
 * defaultLocalSettings 的引擎选择点与 doctor 的严重度判定点都调它,绝不各自重算口径
 * (防口径漂移:malformed creds → doctor warn 但 default 仍选它之类的不一致)。
 * authReady 是瞬时计算值,不落 LocalEngineStatus / local-settings schema。
 */
export function resolveEngineAuthReadiness(
  engineStatus: LocalEngineStatus,
  inspectCredential: InspectEngineCredential,
): boolean {
  if (!engineStatus.installed)
    return false
  return inspectCredential(engineStatus.id)
}

// 凭证文件位置:engineId → 相对 HOME 的凭证文件路径段。这是「哪些引擎可探测凭证」的
// 单一事实源 —— CREDENTIAL_PROBEABLE_ENGINE_IDS 与 inspectLocalEngineCredential 都从它派生,
// 绝不漂移;将来加引擎只需在此 map 加一条即可,两处自动同步。
const CREDENTIAL_FILE_SEGMENTS_BY_ENGINE_ID: Record<string, readonly string[]> = {
  'claude-code': ['.claude', '.credentials.json'],
  'codex': ['.codex', 'auth.json'],
}

/**
 * 单一事实源:inspectLocalEngineCredential 真正拥有凭证探测分支的引擎集
 * (= 上述 map 的键)。doctor 据此区分「可探测但未登录」(warn)与「无法探测」
 * (不 false-warn);不可探测引擎(cursor/gemini/opencode/qwen)绝不被误判为未登录。
 */
export const CREDENTIAL_PROBEABLE_ENGINE_IDS: readonly string[]
  = Object.keys(CREDENTIAL_FILE_SEGMENTS_BY_ENGINE_ID)

/**
 * 真实保守凭证探测:仅 CREDENTIAL_FILE_SEGMENTS_BY_ENGINE_ID 有条目的引擎可探测
 * (codex 看 ~/.codex/auth.json、claude 看 ~/.claude/.credentials.json),其余引擎一律返回
 * false(无正向凭证证据 → 不判 authReady,但仍可经 installed fallback 被选中)。
 * 文件不存在 / 空 / 非法 JSON / 空对象一律保守判 false。绝不抛、绝不读出或泄露凭证内容。
 */
export function inspectLocalEngineCredential(engineId: string): boolean {
  const segments = CREDENTIAL_FILE_SEGMENTS_BY_ENGINE_ID[engineId]
  if (!segments)
    return false
  // 经 HOME 解析凭证目录(原生引擎 codex/claude 自身也按 HOME 定位配置),
  // HOME 缺失时回退 os.homedir()。
  const home = process.env.HOME ?? homedir()
  return hasNonEmptyJsonCredential(path.join(home, ...segments))
}

function hasNonEmptyJsonCredential(filePath: string): boolean {
  try {
    if (!existsSync(filePath))
      return false
    const raw = readFileSync(filePath, 'utf8').trim()
    if (!raw)
      return false
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object')
      return false
    return Object.keys(parsed as Record<string, unknown>).length > 0
  }
  catch {
    return false
  }
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
