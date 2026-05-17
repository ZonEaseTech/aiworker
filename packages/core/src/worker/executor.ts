import type { EngineEventParserKind, ParsedEngineEvent } from './engine-stream'

import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createEngineStreamHandler } from './engine-stream'

export interface LocalExecutorArtifact {
  path: string
  content: string
  kind?: string
  metadata?: Record<string, unknown>
  title?: string
}

export interface LocalExecutorReview {
  verdict?: 'pass' | 'warn' | 'fail' | 'needs_review'
  findings?: Record<string, unknown>[]
  risks?: Record<string, unknown>[]
}

export interface LocalExecutorLesson {
  statement: string
  evidence?: Record<string, unknown>[]
}

export interface LocalExecutorInput {
  engineCommand?: string | null
  engineId: string
  invocationId: string
  invocationRoot: string
  onEvent?: (event: LocalExecutorEvent) => void
  prompt: string
  sessionId: string
  turnId: string
  workspaceId: string
  workspaceRoot: string
  metadata?: Record<string, unknown>
}

export interface LocalExecutorResult {
  summary: string
  artifacts?: LocalExecutorArtifact[]
  review?: LocalExecutorReview
  lessons?: LocalExecutorLesson[]
  metadata?: Record<string, unknown>
}

export class LocalExecutorFailure extends Error {
  constructor(message: string, readonly partialResult?: LocalExecutorResult) {
    super(message)
    this.name = 'LocalExecutorFailure'
  }
}

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

interface LocalEngineBuildArgsInput {
  command: string
  input: LocalExecutorInput
  model: string
  reasoning: string
}

interface LocalEngineDefinition {
  buildArgs: (input: LocalEngineBuildArgsInput) => string[]
  env?: Record<string, string>
  name: string
  parser?: EngineEventParserKind
}

const localEngineDefinitions: Record<string, LocalEngineDefinition> = {
  'claude-code': {
    buildArgs({ command, model }) {
      const args = ['-p', '--output-format', 'stream-json', '--verbose']
      if (supportsHelpFlag(command, ['-p', '--help'], '--include-partial-messages'))
        args.push('--include-partial-messages')
      if (model && model !== 'default')
        args.push('--model', model)
      args.push('--permission-mode', 'bypassPermissions')
      return args
    },
    name: 'Claude Code',
    parser: 'claude',
  },
  'codex': {
    buildArgs({ input, model, reasoning }) {
      const args = [
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

export function createExternalEngineExecutor(): LocalExecutor {
  return {
    async invoke(input) {
      const executionMode = readString(input.metadata?.executionMode, 'local-cli')
      if (executionMode === 'byok')
        return runByokExecutor(input)
      return runLocalCliExecutor(input)
    },
  }
}

async function runLocalCliExecutor(input: LocalExecutorInput): Promise<LocalExecutorResult> {
  const command = input.engineCommand || input.engineId
  if (!command || command === 'internal')
    throw new Error('Local CLI execution requires an external engine command.')
  const engine = localEngineDefinitions[input.engineId]
  if (!engine)
    throw new Error(`Local CLI engine is not wired yet: ${input.engineId}. Select a supported local engine or BYOK in Settings.`)

  await mkdir(input.invocationRoot, { recursive: true })
  const outputKind = readString(input.metadata?.outputKind, 'business-artifact')
  const skillName = readString(input.metadata?.skillName, 'Soul artifact')
  const suggestedArtifactPath = path.posix.join('artifacts', input.sessionId, `${input.turnId}-${sanitizePathPart(outputKind)}.md`)
  const enginePrompt = [
    input.prompt,
    '',
    'AIWorker session contract:',
    '- Continue the current AIWorker workspace session as the selected external engine.',
    '- Current working directory is the AIWorker workspace/project root.',
    `- If this turn produces a durable business artifact, write markdown under artifacts/${input.sessionId}/.`,
    `- Prefer ${suggestedArtifactPath} for a new ${outputKind} artifact.`,
    '- Text-only clarification, analysis, or follow-up is allowed; do not create a fake artifact just to satisfy the protocol.',
    '- Keep evidence, assumptions, risks, review notes, and next actions separated in any durable artifact.',
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
  let finalMessage = ''
  const invocationStartedAt = Date.now()
  const parser = engine.parser
    ? createEngineStreamHandler(engine.parser, (event) => {
        const localEvent = toLocalExecutorEvent(event)
        if (localEvent.kind === 'text')
          finalMessage += localEvent.text
        emit(input, localEvent)
      })
    : null

  const execution = await execCommand(command, args, enginePrompt, 300_000, {
    cwd: input.workspaceRoot,
    env: {
      ...process.env,
      ...(engine.env ?? {}),
    },
    onStderr: undefined,
    onStdout: (chunk) => {
      if (parser) {
        parser.feed(chunk)
        return
      }
      finalMessage += chunk
      emit(input, { kind: 'text', text: chunk })
    },
  })
  parser?.flush()

  await writeFile(path.join(input.invocationRoot, 'stdout.log'), execution.stdout, 'utf8')
  await writeFile(path.join(input.invocationRoot, 'stderr.log'), execution.stderr, 'utf8')
  if (execution.code !== 0) {
    const visible = filterVisibleEngineLog(execution.stderr || execution.stdout)
    if (visible.trim())
      emit(input, { chunk: truncate(visible, 8_000), kind: 'log', stream: execution.stderr ? 'stderr' : 'stdout' })
    const artifacts = await discoverInvocationArtifacts({
      fallbackKind: outputKind,
      fallbackTitle: skillName,
      sessionId: input.sessionId,
      sinceMs: invocationStartedAt,
      turnId: input.turnId,
      workspaceRoot: input.workspaceRoot,
    })
    if (artifacts.length > 0) {
      emit(input, {
        kind: 'status',
        label: 'artifact_recovered',
        detail: `${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'} written before failure`,
      })
      throw new LocalExecutorFailure(`${command} exited with code ${execution.code}: ${truncate(visible || execution.stderr || execution.stdout, 2_000)}`, {
        artifacts: artifacts.map(artifact => ({
          ...artifact,
          metadata: {
            ...(artifact.metadata ?? {}),
            engineExitCode: execution.code,
            recoveredAfterFailure: true,
          },
        })),
        lessons: [],
        metadata: {
          engineExitCode: execution.code,
          executionSource: 'local-cli',
          finalMessage: finalMessage.trim(),
          processId: randomUUID(),
          recoveredAfterFailure: true,
          stderrLog: path.join(input.invocationRoot, 'stderr.log'),
          stdoutLog: path.join(input.invocationRoot, 'stdout.log'),
        },
        review: {
          findings: [{ message: 'External engine wrote an artifact before failing; human review is required before promotion.' }],
          risks: [{ message: `External engine failed after writing the artifact: ${truncate(visible || execution.stderr || execution.stdout, 500)}` }],
          verdict: 'needs_review',
        },
        summary: finalMessage.trim() || `${engine.name} failed after writing ${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}.`,
      })
    }
    throw new Error(`${command} exited with code ${execution.code}: ${truncate(visible || execution.stderr || execution.stdout, 2_000)}`)
  }

  finalMessage = finalMessage.trim()
  const artifacts = await discoverInvocationArtifacts({
    fallbackKind: outputKind,
    fallbackTitle: skillName,
    sessionId: input.sessionId,
    sinceMs: invocationStartedAt,
    turnId: input.turnId,
    workspaceRoot: input.workspaceRoot,
  })
  emit(input, {
    kind: 'status',
    label: 'completed',
    detail: artifacts.length > 0 ? `${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}` : 'text response',
  })

  return {
    artifacts,
    lessons: [],
    metadata: {
      executionSource: 'local-cli',
      finalMessage,
      processId: randomUUID(),
      stderrLog: path.join(input.invocationRoot, 'stderr.log'),
      stdoutLog: path.join(input.invocationRoot, 'stdout.log'),
    },
    review: artifacts.length > 0
      ? {
          findings: [{ message: 'External engine artifact generated; human review is required before memory admission.' }],
          risks: [],
          verdict: 'needs_review',
        }
      : undefined,
    summary: finalMessage || `${engine.name} completed without a durable artifact.`,
  }
}

async function runByokExecutor(input: LocalExecutorInput): Promise<LocalExecutorResult> {
  const byok = isRecord(input.metadata?.byok) ? input.metadata.byok : {}
  const apiKeyRef = readString(byok.apiKeyRef, '')
  const apiKey = resolveApiKey(apiKeyRef)
  const baseUrl = readString(byok.baseUrl, 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = readString(byok.model, 'gpt-4o')
  emit(input, { kind: 'status', label: 'requesting', detail: model })
  const artifact = await requestOpenAICompatibleArtifact({ apiKey, baseUrl, input, model })
  const outputKind = readString(input.metadata?.outputKind, 'business-artifact')
  const skillName = readString(input.metadata?.skillName, 'Soul artifact')
  emit(input, { kind: 'text', text: `Generated ${skillName} with BYOK provider ${model}.` })
  emit(input, { kind: 'status', label: 'completed', detail: outputKind })
  return {
    artifacts: [
      {
        content: artifact,
        kind: outputKind,
        path: path.posix.join('artifacts', input.sessionId, `${input.turnId}-${sanitizePathPart(outputKind)}.md`),
        title: skillName,
      },
    ],
    lessons: [],
    metadata: { executionSource: 'byok', model },
    review: {
      findings: [{ message: 'BYOK artifact generated; human review is required before memory admission.' }],
      risks: [],
      verdict: 'needs_review',
    },
    summary: `Generated ${skillName} with BYOK provider ${model}.`,
  }
}

async function requestOpenAICompatibleArtifact({
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
  const skillName = readString(input.metadata?.skillName, 'Soul artifact')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages: [
        {
          content: 'You are AIWorker external engine mode. Return one concise markdown business artifact. Keep evidence, assumptions, risks, review notes, and next actions separated.',
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
    throw new Error(`BYOK provider failed for ${skillName}: HTTP ${response.status}`)
  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content)
    throw new Error(`BYOK provider returned no artifact content for ${skillName}.`)
  return content
}

function execCommand(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    onStderr?: (chunk: string) => void
    onStdout?: (chunk: string) => void
  } = {},
): Promise<{ code: number | null, stderr: string, stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      options.onStdout?.(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      options.onStderr?.(chunk)
    })
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        clearTimeout(timer)
        reject(error)
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (killed)
        stderr += `\nProcess exceeded ${timeoutMs}ms and was terminated.`
      resolve({ code, stdout, stderr })
    })
    child.stdin.end(stdin)
  })
}

function toLocalExecutorEvent(event: ParsedEngineEvent): LocalExecutorEvent {
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

async function discoverInvocationArtifacts({
  fallbackKind,
  fallbackTitle,
  sessionId,
  sinceMs,
  turnId,
  workspaceRoot,
}: {
  fallbackKind: string
  fallbackTitle: string
  sessionId: string
  sinceMs: number
  turnId: string
  workspaceRoot: string
}): Promise<LocalExecutorArtifact[]> {
  const artifactRoot = path.join(workspaceRoot, 'artifacts', sessionId)
  let entries: string[] = []
  try {
    entries = await readdir(artifactRoot)
  }
  catch {
    return []
  }

  const artifacts: LocalExecutorArtifact[] = []
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md') && !entry.endsWith('.markdown'))
      continue
    const absolutePath = path.join(artifactRoot, entry)
    const info = await stat(absolutePath).catch(() => null)
    if (!info?.isFile())
      continue
    const isCurrentTurn = entry.includes(turnId) || info.mtimeMs >= sinceMs - 1_000
    if (!isCurrentTurn)
      continue
    const relativePath = path.posix.join('artifacts', sessionId, entry)
    artifacts.push({
      content: await readFile(absolutePath, 'utf8'),
      kind: fallbackKind,
      path: relativePath,
      title: fallbackTitle,
    })
  }
  return artifacts
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

function resolveApiKey(ref: string): string {
  const normalized = ref.trim()
  if (!normalized)
    throw new Error('BYOK mode requires an API key reference such as env:OPENAI_API_KEY.')
  const envName = normalized.startsWith('env:') ? normalized.slice(4) : normalized
  if (!/^[A-Z_]\w*$/i.test(envName))
    throw new Error('BYOK API key reference must be env:NAME or NAME.')
  const value = process.env[envName]
  if (!value)
    throw new Error(`BYOK API key environment variable is not set: ${envName}.`)
  return value
}

function sanitizePathPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact'
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
