import type { EngineEventParserKind, ParsedEngineEvent } from './engine-stream'
import type { LocalEngineProcessHandle } from './process-manager'

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { redactEngineBridgeValue } from '@zonease/aiworker-engine-bridge'
import { sanitizeEngineEnv } from './engine-env'
import { createEngineStreamHandler } from './engine-stream'
import { LocalEngineProcessManager } from './process-manager'

export interface LocalExecutorInput {
  engineCommand?: string | null
  engineId: string
  invocationId: string
  invocationRoot: string
  onProcessHandle?: (handle: LocalExecutorProcessHandle) => void
  onEvent?: (event: LocalExecutorEvent) => void
  prompt: string
  /** Opaque external session ref captured from a prior invocation, used to resume the native engine session. */
  resumeRef?: Record<string, unknown> | null
  signal?: AbortSignal
  sessionId: string
  workspaceId: string
  workspaceRoot: string
  metadata?: Record<string, unknown>
}

export interface LocalExecutorResult {
  eventLogRef?: string | null
  externalSessionRef?: string | null
  metadata?: Record<string, unknown>
  projectionReceiptId?: string | null
  rawLogRef?: string | null
  summary: string
}

export class LocalExecutorFailure extends Error {
  constructor(message: string, readonly partialResult?: LocalExecutorResult) {
    super(message)
    this.name = 'LocalExecutorFailure'
  }
}

export type LocalExecutorProcessHandle = LocalEngineProcessHandle

export type LocalExecutorEvent
  = | { kind: 'status', label: string, detail?: string }
    | { kind: 'text', text: string }
    | { kind: 'thinking', text: string }
    | { kind: 'tool_use', id: string, input: Record<string, unknown>, name: string }
    | { kind: 'tool_result', id: string, content: string, isError?: boolean, name?: string }
    | { kind: 'usage', costUsd?: number, inputTokens?: number, outputTokens?: number }
    | { kind: 'log', chunk: string, stream: 'stderr' | 'stdout' }
    | { kind: 'raw', line: string }

export interface LocalExecutor {
  invoke: (input: LocalExecutorInput) => Promise<LocalExecutorResult>
}

export const DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS = 300_000

const DEFAULT_LOCAL_CLI_ENGINE_LOG_BUFFER_LIMIT_CHARS = 1_000_000
const DEFAULT_LOCAL_CLI_ENGINE_SUMMARY_LIMIT_CHARS = 64_000

export interface ExternalEngineExecutorOptions {
  maxBufferedLogChars?: number
  maxSummaryChars?: number
  processManager?: LocalEngineProcessManager
  timeoutMs?: number
}

interface BoundedTextBuffer {
  text: string
  truncatedChars: number
}

interface LocalEngineBuildArgsInput {
  command: string
  input: LocalExecutorInput
  model: string
  reasoning: string
}

/** Extract the opaque native-session id from a captured resume ref, '' when absent. */
function readResumeId(resumeRef: Record<string, unknown> | null | undefined): string {
  return resumeRef ? readString(resumeRef.id, '') : ''
}

interface LocalEngineDefinition {
  buildArgs: (input: LocalEngineBuildArgsInput) => string[]
  env?: Record<string, string>
  name: string
  parser?: EngineEventParserKind
}

const localEngineDefinitions: Record<string, LocalEngineDefinition> = {
  'claude-code': {
    buildArgs({ command, input, model }) {
      const args = ['-p', '--output-format', 'stream-json', '--verbose']
      if (supportsHelpFlag(command, ['-p', '--help'], '--include-partial-messages'))
        args.push('--include-partial-messages')
      if (model && model !== 'default')
        args.push('--model', model)
      args.push('--permission-mode', 'bypassPermissions')
      const resumeId = readResumeId(input.resumeRef)
      if (resumeId)
        args.push('--resume', resumeId)
      return args
    },
    name: 'Claude Code',
    parser: 'claude',
  },
  'codex': {
    buildArgs({ input, model, reasoning }) {
      const resumeId = readResumeId(input.resumeRef)
      // `codex exec resume <id>` does not accept --sandbox/-C; sandbox is set via
      // `-c sandbox_mode=...` and the working dir comes from the process cwd (workspaceRoot).
      // `codex exec resume` needs an explicit trailing `-` to read the prompt from stdin
      // (unlike `codex exec`, which defaults to stdin when no positional prompt is given).
      const args = resumeId
        ? [
            'exec',
            'resume',
            resumeId,
            '--json',
            '--skip-git-repo-check',
            '-c',
            'sandbox_mode=workspace-write',
            '-c',
            'sandbox_workspace_write.network_access=true',
          ]
        : [
            'exec',
            '--json',
            '--skip-git-repo-check',
            '--sandbox',
            'workspace-write',
            '-c',
            'sandbox_workspace_write.network_access=true',
            '-C',
            input.workspaceRoot,
          ]
      if (process.env.AIWORKER_CODEX_DISABLE_PLUGINS === '1' || process.env.OD_CODEX_DISABLE_PLUGINS === '1')
        args.push('--disable', 'plugins')
      if (process.env.AIWORKER_CODEX_IGNORE_USER_CONFIG === '1')
        args.push('--ignore-user-config')
      if (model && model !== 'default')
        args.push('--model', model)
      if (reasoning && reasoning !== 'default')
        args.push('-c', `model_reasoning_effort="${clampCodexReasoning(model, reasoning)}"`)
      if (resumeId)
        args.push('-')
      return args
    },
    name: 'Codex CLI',
    parser: 'codex',
  },
  'cursor': {
    buildArgs({ input, model }) {
      const args = [
        '--print',
        '--output-format',
        'stream-json',
        '--stream-partial-output',
        '--force',
        '--trust',
        '--workspace',
        input.workspaceRoot,
      ]
      if (model && model !== 'default')
        args.push('--model', model)
      return args
    },
    name: 'Cursor Agent',
    parser: 'cursor-agent',
  },
  'gemini': {
    buildArgs({ model }) {
      const args = ['--output-format', 'stream-json', '--yolo']
      if (model && model !== 'default')
        args.push('--model', model)
      return args
    },
    env: { GEMINI_CLI_TRUST_WORKSPACE: 'true' },
    name: 'Gemini CLI',
    parser: 'gemini',
  },
  'opencode': {
    buildArgs({ model }) {
      const args = ['run', '--format', 'json', '--dangerously-skip-permissions']
      if (model && model !== 'default')
        args.push('--model', model)
      args.push('-')
      return args
    },
    name: 'OpenCode',
    parser: 'opencode',
  },
  'qwen': {
    buildArgs({ model }) {
      const args = ['--yolo']
      if (model && model !== 'default')
        args.push('--model', model)
      args.push('-')
      return args
    },
    name: 'Qwen Code',
  },
}

export function createExternalEngineExecutor(options: ExternalEngineExecutorOptions = {}): LocalExecutor {
  const processManager = options.processManager ?? new LocalEngineProcessManager()
  return {
    async invoke(input) {
      const executionMode = readString(input.metadata?.executionMode, 'local-cli')
      if (executionMode === 'byok')
        return runByokExecutor(input)
      return runLocalCliExecutor(input, { ...options, processManager })
    },
  }
}

async function runLocalCliExecutor(input: LocalExecutorInput, options: ExternalEngineExecutorOptions & { processManager: LocalEngineProcessManager }): Promise<LocalExecutorResult> {
  const command = input.engineCommand || input.engineId
  if (!command || command === 'internal')
    throw new Error('Local CLI execution requires an external engine command.')
  const engine = localEngineDefinitions[input.engineId]
  if (!engine)
    throw new Error(`Local CLI engine is not wired yet: ${input.engineId}. Select a supported local engine or BYOK in Settings.`)

  await mkdir(input.invocationRoot, { recursive: true })
  const enginePrompt = [
    input.prompt,
    '',
    'AIWorker session contract:',
    '- Continue the current AIWorker workspace session as the selected external engine.',
    '- Current working directory is the AIWorker workspace/project root.',
    '- Return a concise assistant message for the session timeline.',
  ].join('\n')

  await writeFile(path.join(input.invocationRoot, 'prompt.md'), enginePrompt, 'utf8')
  emit(input, { kind: 'status', label: 'initializing', detail: `${engine.name} via local CLI` })

  const args = engine.buildArgs({
    command,
    input,
    model: readString(input.metadata?.model, ''),
    reasoning: readString(input.metadata?.reasoning, ''),
  })
  const timeoutMs = resolveLocalCliEngineTimeoutMs(options)
  const maxSummaryChars = options.maxSummaryChars ?? DEFAULT_LOCAL_CLI_ENGINE_SUMMARY_LIMIT_CHARS
  const finalMessage = createBoundedTextBuffer()
  let externalSessionRef: Record<string, unknown> | null = null
  const parser = engine.parser
    ? createEngineStreamHandler(engine.parser, (event) => {
        if (event.type === 'external_session_ref') {
          externalSessionRef = event.ref
          return
        }
        const localEvent = toLocalExecutorEvent(event)
        if (localEvent.kind === 'text')
          appendBoundedText(finalMessage, localEvent.text, maxSummaryChars)
        emit(input, localEvent)
      })
    : null

  const execution = await options.processManager.runProcess(command, args, enginePrompt, timeoutMs, {
    cwd: input.workspaceRoot,
    env: {
      ...sanitizeEngineEnv(),
      ...(engine.env ?? {}),
    },
    invocationId: input.invocationId,
    maxBufferedLogChars: options.maxBufferedLogChars ?? DEFAULT_LOCAL_CLI_ENGINE_LOG_BUFFER_LIMIT_CHARS,
    onProcessHandle: input.onProcessHandle,
    onStderr: undefined,
    onStdout: (chunk) => {
      if (parser) {
        parser.feed(chunk)
        return
      }
      appendBoundedText(finalMessage, chunk, maxSummaryChars)
      emit(input, { kind: 'text', text: chunk })
    },
    signal: input.signal,
  })
  parser?.flush()
  const summary = boundedTextValue(finalMessage, 'engine response').trim()

  await writeFile(path.join(input.invocationRoot, 'stdout.log'), redactEngineLog(execution.stdout), 'utf8')
  await writeFile(path.join(input.invocationRoot, 'stderr.log'), redactEngineLog(execution.stderr), 'utf8')
  if (execution.code !== 0) {
    const visible = filterVisibleEngineLog(execution.stderr || execution.stdout)
    if (visible.trim())
      emit(input, { chunk: truncate(visible, 8_000), kind: 'log', stream: execution.stderr ? 'stderr' : 'stdout' })
    // 优雅失败 backstop:auth-aware 默认引擎(1b-1)是主修;此处仅在保守锚点命中「未登录」
    // 信号时,给一条可操作引导(指向 `codex login`/`claude login` 与 `aiworker config`)。
    // 引导文案是固定字符串、不回显 stderr,故不泄露 secret;未命中则走原通用失败路径。
    const authGuidance = detectEngineAuthFailureGuidance(input.engineId, execution.stderr, execution.stdout)
    if (authGuidance)
      emit(input, { kind: 'status', label: 'engine-auth-required', detail: authGuidance })
    const failureMessage = authGuidance
      ? `${authGuidance} (${command} exited with code ${execution.code}.)`
      : `${command} exited with code ${execution.code}: ${truncate(visible || execution.stderr || execution.stdout, 2_000)}`
    throw new LocalExecutorFailure(failureMessage, {
      metadata: {
        engineExitCode: execution.code,
        executionSource: 'local-cli',
        ...(externalSessionRef ? { externalSessionRef } : {}),
        finalMessage: summary,
        processId: randomUUID(),
        stderrLog: path.join(input.invocationRoot, 'stderr.log'),
        stdoutLog: path.join(input.invocationRoot, 'stdout.log'),
      },
      externalSessionRef: encodeLocalExternalSessionRef(externalSessionRef),
      summary: authGuidance ?? (summary || `${engine.name} exited with code ${execution.code}.`),
    })
  }

  emit(input, {
    kind: 'status',
    label: 'completed',
    detail: 'text response',
  })

  return {
    metadata: {
      executionSource: 'local-cli',
      ...(externalSessionRef ? { externalSessionRef } : {}),
      finalMessage: summary,
      processId: randomUUID(),
      stderrLog: path.join(input.invocationRoot, 'stderr.log'),
      stdoutLog: path.join(input.invocationRoot, 'stdout.log'),
    },
    externalSessionRef: encodeLocalExternalSessionRef(externalSessionRef),
    summary: summary || `${engine.name} completed.`,
  }
}

function resolveLocalCliEngineTimeoutMs(options: ExternalEngineExecutorOptions): number {
  if (options.timeoutMs !== undefined)
    return options.timeoutMs

  const raw = process.env.AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS?.trim()
  if (!raw)
    return DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS
}

async function runByokExecutor(input: LocalExecutorInput): Promise<LocalExecutorResult> {
  const byok = isRecord(input.metadata?.byok) ? input.metadata.byok : {}
  const apiKeyRef = readString(byok.apiKeyRef, '')
  const apiKey = resolveApiKey(apiKeyRef)
  const baseUrl = readString(byok.baseUrl, 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = readString(byok.model, 'gpt-4o')
  emit(input, { kind: 'status', label: 'requesting', detail: model })
  const content = await requestOpenAICompatibleContent({ apiKey, baseUrl, input, model })
  emit(input, { kind: 'text', text: 'Generated response with BYOK provider.' })
  emit(input, { kind: 'status', label: 'completed', detail: 'byok response' })
  return {
    metadata: { executionSource: 'byok', model },
    summary: content,
  }
}

async function requestOpenAICompatibleContent({
  apiKey,
  baseUrl,
  input,
  model,
}: {
  apiKey: string
  baseUrl: string
  input: LocalExecutorInput
  model: string
}): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages: [
        {
          content: 'You are AIWorker external engine mode. Return a concise response.',
          role: 'system',
        },
        {
          content: input.prompt,
          role: 'user',
        },
      ],
      model,
      temperature: 0.2,
    }),
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`BYOK provider failed: HTTP ${response.status}`)
  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content)
    throw new Error('BYOK provider returned no content.')
  return content
}

function createBoundedTextBuffer(): BoundedTextBuffer {
  return { text: '', truncatedChars: 0 }
}

function appendBoundedText(buffer: BoundedTextBuffer, chunk: string, maxChars: number): void {
  if (!chunk)
    return
  if (maxChars <= 0) {
    buffer.truncatedChars += buffer.text.length + chunk.length
    buffer.text = ''
    return
  }
  const next = buffer.text + chunk
  if (next.length <= maxChars) {
    buffer.text = next
    return
  }
  const overflow = next.length - maxChars
  buffer.truncatedChars += overflow
  buffer.text = next.slice(overflow)
}

function boundedTextValue(buffer: BoundedTextBuffer, label: string): string {
  if (buffer.truncatedChars <= 0)
    return buffer.text
  return `[AIWorker truncated ${buffer.truncatedChars} earlier characters from ${label}.]\n${buffer.text}`
}

function toLocalExecutorEvent(event: ParsedEngineEvent): LocalExecutorEvent {
  if (event.type === 'external_session_ref')
    return { kind: 'raw', line: JSON.stringify({ externalSessionRef: event.ref }) }
  if (event.type === 'status')
    return { detail: event.detail, kind: 'status', label: event.label }
  if (event.type === 'text_delta')
    return { kind: 'text', text: event.delta }
  if (event.type === 'thinking_delta')
    return { kind: 'thinking', text: event.delta }
  if (event.type === 'thinking_start')
    return { detail: 'external engine reasoning started', kind: 'status', label: 'thinking' }
  if (event.type === 'file_change')
    return { detail: `${event.action} ${event.path}${event.status ? ` (${event.status})` : ''}`, kind: 'status', label: 'file_change' }
  if (event.type === 'tool_use')
    return { id: event.id, input: isRecord(event.input) ? event.input : { value: event.input }, kind: 'tool_use', name: event.name }
  if (event.type === 'tool_result')
    return { content: event.content, id: event.toolUseId, isError: event.isError, kind: 'tool_result' }
  if (event.type === 'usage')
    return { costUsd: event.costUsd, inputTokens: event.inputTokens, kind: 'usage', outputTokens: event.outputTokens }
  return { kind: 'raw', line: event.line }
}

function encodeLocalExternalSessionRef(value: Record<string, unknown> | null): string | null {
  return value ? JSON.stringify(value) : null
}

const helpFlagCache = new Map<string, boolean>()

function supportsHelpFlag(command: string, args: string[], flag: string): boolean {
  const key = `${command}\0${args.join('\0')}\0${flag}`
  const cached = helpFlagCache.get(key)
  if (cached !== undefined)
    return cached
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 5_000,
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const supported = result.status === 0 && output.includes(flag)
  helpFlagCache.set(key, supported)
  return supported
}

function clampCodexReasoning(modelId: string, effort: string): string {
  const id = modelId.includes('/') ? modelId.split('/').at(-1) ?? modelId : modelId
  const lateGpt5 = !id || id === 'default' || id.startsWith('gpt-5.2') || id.startsWith('gpt-5.3') || id.startsWith('gpt-5.4') || id.startsWith('gpt-5.5')
  if (lateGpt5 && effort === 'minimal')
    return 'low'
  if (id === 'gpt-5.1' && effort === 'xhigh')
    return 'high'
  if (id === 'gpt-5.1-codex-mini')
    return effort === 'high' || effort === 'xhigh' ? 'high' : 'medium'
  return effort
}

function emit(input: LocalExecutorInput, event: LocalExecutorEvent): void {
  input.onEvent?.(event)
}

function truncate(value: string, max: number): string {
  if (value.length <= max)
    return value
  return `${value.slice(0, max)}\n...[truncated]`
}

function filterVisibleEngineLog(value: string): string {
  if (value.includes('failed to warm featured plugin ids cache') && value.includes('/backend-api/plugins/featured')) {
    const transcriptStart = value.indexOf('OpenAI Codex v')
    return transcriptStart === -1 ? '' : value.slice(transcriptStart)
  }
  return value
}

// (N3)保守的「未登录」锚点白名单 + 固定可操作引导文案,按 engineId 划分。
// 锚点随原生 CLI 版本可能漂移 → 只在命中这些锚点时判「未登录」,其余非 0 退出走通用路径。
// guidance 是固定字符串,绝不回显 stderr/stdout,故引导本身不泄露 secret。
const ENGINE_AUTH_FAILURE_PROFILES: Record<string, { anchor: RegExp, guidance: string }> = {
  'claude-code': {
    anchor: /not authenticated|credentials|claude login/i,
    guidance: 'Claude Code is not signed in. Run `claude login` to authenticate, then retry — or run `aiworker config` to switch engine or BYOK mode.',
  },
  'codex': {
    anchor: /OPENAI_API_KEY|not logged in|codex login|codex logout/i,
    guidance: 'Codex CLI is not signed in. Run `codex login` to authenticate, then retry — or run `aiworker config` to switch engine or BYOK mode.',
  },
}

function detectEngineAuthFailureGuidance(engineId: string, stderr: string, stdout: string): string | null {
  const profile = ENGINE_AUTH_FAILURE_PROFILES[engineId]
  if (!profile)
    return null
  return profile.anchor.test(`${stderr}\n${stdout}`) ? profile.guidance : null
}

function redactEngineLog(value: string): string {
  const redacted = redactEngineBridgeValue(value)
  return typeof redacted === 'string' ? redacted : ''
}

// 与 BYOK 写守卫 isSafeSecretReference（worker-daemon settings.ts，前缀集 $/env:/secretref:）保持一致：
// $NAME / env:NAME / 裸 NAME 均解析为 process.env[NAME]；secretref: 通过写守卫但 v1 无 secret manager
// 后端，故诚实抛「暂不支持」而非旧的误导性 must-be-env 错误（消除 validator/resolver 发散）。
export function resolveApiKey(ref: string): string {
  const normalized = ref.trim()
  if (!normalized)
    throw new Error('BYOK mode requires an API key reference such as env:OPENAI_API_KEY.')
  if (normalized.startsWith('secretref:'))
    throw new Error('BYOK secretref: resolution is not supported yet; use env:NAME or $NAME.')
  const envName = normalized.startsWith('env:')
    ? normalized.slice(4)
    : normalized.startsWith('$') ? normalized.slice(1) : normalized
  if (!/^[A-Z_]\w*$/i.test(envName))
    throw new Error('BYOK API key reference must be env:NAME, $NAME, or NAME.')
  const value = process.env[envName]
  if (!value)
    throw new Error(`BYOK API key environment variable is not set: ${envName}.`)
  return value
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
