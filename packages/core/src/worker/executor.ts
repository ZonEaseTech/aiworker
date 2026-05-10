import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

export interface LocalExecutorArtifact {
  path: string
  content: string
  kind?: string
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

export interface LocalExecutor {
  invoke: (input: LocalExecutorInput) => Promise<LocalExecutorResult>
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
  if (input.engineId !== 'codex')
    throw new Error(`Local CLI engine is not wired yet: ${input.engineId}. Select Codex CLI or BYOK in Settings.`)

  await mkdir(input.invocationRoot, { recursive: true })
  const outputKind = readString(input.metadata?.outputKind, 'business-artifact')
  const skillName = readString(input.metadata?.skillName, 'Soul artifact')
  const artifactPath = path.posix.join('artifacts', input.sessionId, `${input.turnId}-${sanitizePathPart(outputKind)}.md`)
  const lastMessagePath = path.join(input.invocationRoot, 'last-message.md')
  const enginePrompt = [
    input.prompt,
    '',
    'AIWorker engine contract:',
    `- Current working directory is the AIWorker workspace/project root.`,
    `- Create or update exactly one markdown business artifact at ${artifactPath}.`,
    `- Do not mention internal execution plumbing in the artifact.`,
    `- Keep evidence, assumptions, risks, review notes, and next actions separated.`,
    `- Return a concise final summary after writing the artifact.`,
  ].join('\n')

  await writeFile(path.join(input.invocationRoot, 'prompt.md'), enginePrompt, 'utf8')
  const execution = await execCommand(command, [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '--cd',
    input.workspaceRoot,
    '--output-last-message',
    lastMessagePath,
    '-',
  ], enginePrompt, 300_000)

  await writeFile(path.join(input.invocationRoot, 'stdout.log'), execution.stdout, 'utf8')
  await writeFile(path.join(input.invocationRoot, 'stderr.log'), execution.stderr, 'utf8')
  if (execution.code !== 0)
    throw new Error(`${command} exited with code ${execution.code}: ${execution.stderr || execution.stdout}`)

  const finalMessage = await readTextIfExists(lastMessagePath) || execution.stdout.trim()
  const artifactAbsolute = path.join(input.workspaceRoot, artifactPath)
  let artifact = await readTextIfExists(artifactAbsolute)
  if (!artifact && finalMessage) {
    artifact = finalMessage
    await mkdir(path.dirname(artifactAbsolute), { recursive: true })
    await writeFile(artifactAbsolute, artifact, 'utf8')
  }
  if (!artifact)
    throw new Error(`${command} completed without producing an artifact at ${artifactPath}.`)

  return {
    artifacts: [
      {
        content: artifact,
        kind: outputKind,
        path: artifactPath,
        title: skillName,
      },
    ],
    lessons: [],
    metadata: {
      executionSource: 'local-cli',
      finalMessage,
      processId: randomUUID(),
    },
    review: {
      findings: [{ message: 'External engine artifact generated; human review is required before memory admission.' }],
      risks: [],
      verdict: 'needs_review',
    },
    summary: finalMessage || `Generated ${skillName} with ${command}.`,
  }
}

async function runByokExecutor(input: LocalExecutorInput): Promise<LocalExecutorResult> {
  const byok = isRecord(input.metadata?.byok) ? input.metadata.byok : {}
  const apiKeyRef = readString(byok.apiKeyRef, '')
  const apiKey = resolveApiKey(apiKeyRef)
  const baseUrl = readString(byok.baseUrl, 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = readString(byok.model, 'gpt-4o')
  const artifact = await requestOpenAICompatibleArtifact({ apiKey, baseUrl, input, model })
  const outputKind = readString(input.metadata?.outputKind, 'business-artifact')
  const skillName = readString(input.metadata?.skillName, 'Soul artifact')
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

function execCommand(command: string, args: string[], stdin: string, timeoutMs: number): Promise<{ code: number | null, stderr: string, stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => stdout += chunk)
    child.stderr.on('data', chunk => stderr += chunk)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
    child.stdin.end(stdin)
  })
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return (await readFile(filePath, 'utf8')).trim()
  }
  catch {
    return ''
  }
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
